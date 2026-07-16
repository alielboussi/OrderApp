using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class SyncRunner
{
    private readonly IOptionsMonitor<SyncOptions> _syncOptions;
    private readonly OutletOptions _outlet;
    private readonly PosRepository _repository;
    private readonly PosCatalogRepository _catalogRepository;
    private readonly SupabaseClient _supabaseClient;
    private readonly ILogger<SyncRunner> _logger;
    private DateTimeOffset? _lastPosCatalogSyncUtc;
    private string? _lastSyncError;
    private DateTimeOffset? _lastSaleUploadedUtc;

    public SyncRunner(IOptionsMonitor<SyncOptions> syncOptions,
                      IOptions<OutletOptions> outlet,
                      PosRepository repository,
                      PosCatalogRepository catalogRepository,
                      SupabaseClient supabaseClient,
                      ILogger<SyncRunner> logger)
    {
        _syncOptions = syncOptions;
        _outlet = outlet.Value;
        _repository = repository;
        _catalogRepository = catalogRepository;
        _supabaseClient = supabaseClient;
        _logger = logger;
    }

    public async Task<SyncRunResult> RunOnceAsync(CancellationToken cancellationToken)
    {
        var failures = new List<SyncFailure>();

        var pendingSales = await _repository.CountUnsyncedSalesAsync(cancellationToken);
        await _supabaseClient.SendHeartbeatAsync(
            new HeartbeatMetrics(
                PendingSalesCount: pendingSales,
                LastSyncError: _lastSyncError,
                LastSaleUploadedUtc: _lastSaleUploadedUtc),
            cancellationToken);

        await TrySyncPosCatalogMapAsync(force: false, syncOptions: null, cancellationToken);
        await ApplyCatalogSyncAsync(cancellationToken);

        var salesResult = await SyncSalesAsync(cancellationToken);
        failures.AddRange(salesResult.Failures);
        if (salesResult.Failures.Count > 0)
        {
            _lastSyncError = salesResult.Failures[^1].Error;
        }
        else if (salesResult.ProcessedCount > 0)
        {
            _lastSyncError = null;
            _lastSaleUploadedUtc = DateTimeOffset.UtcNow;
        }

        return new SyncRunResult(
            salesResult.ProcessedCount,
            salesResult.ReconciledCount,
            salesResult.LinesRepairedCount,
            failures);
    }

    private async Task<SyncRunResult> SyncSalesAsync(CancellationToken cancellationToken)
    {
        var failures = new List<SyncFailure>();
        var processed = 0;
        var reconciled = 0;

        var syncContext = await _supabaseClient.GetOutletSyncContextAsync(cancellationToken);
        if (syncContext is null)
        {
            _logger.LogWarning("Unable to load outlet sync context; skipping POS sales this cycle.");
            return new SyncRunResult(0, 0, 0, failures);
        }

        if (!syncContext.HasPosMiddleware)
        {
            _logger.LogInformation("Sales sync skipped: has_pos_middleware is false for this outlet.");
            return new SyncRunResult(0, 0, 0, failures);
        }

        if (!syncContext.SyncOpeningUtc.HasValue)
        {
            _logger.LogWarning(
                "No pos_sync_opening counter — uploading Pending sales anyway (open a stocktake period for inventory deduction).");
        }

        var syncOptions = _syncOptions.CurrentValue;
        var (minUtc, maxUtc) = PosSyncWindow.ComputePendingQueue(
            syncContext.SyncOpeningUtc,
            syncContext.SyncCutoffUtc,
            syncOptions.MinSaleDateUtc,
            syncOptions.MaxSaleDateUtc);

        var zeroLineClosed = await _repository.AutoMarkZeroLinePendingProcessedAsync(cancellationToken);
        if (zeroLineClosed > 0)
        {
            _logger.LogInformation("Auto-marked {Count} zero-line pending bills Processed.", zeroLineClosed);
        }

        var unsyncedBefore = await _repository.CountExportableUnsyncedSalesAsync(cancellationToken);
        var maxBatches = Math.Max(1, syncOptions.MaxBatchesPerCycle);
        var batchSize = Math.Max(1, syncOptions.BatchSize);

        for (var batchIndex = 0; batchIndex < maxBatches; batchIndex++)
        {
            var pending = await _repository.ReadPendingOrdersAsync(
                batchSize,
                minUtc,
                maxUtc,
                cancellationToken);

            if (pending.Count == 0)
            {
                break;
            }

            _logger.LogInformation(
                "Sales sync batch {BatchIndex}/{MaxBatches}: opening={OpeningUtc:o} cutoff={CutoffUtc} window_min={MinUtc:o} window_max={MaxUtc} unsynced_before={UnsyncedBefore} pending_in_batch={PendingCount}",
                batchIndex + 1,
                maxBatches,
                syncContext.SyncOpeningUtc,
                syncContext.SyncCutoffUtc,
                minUtc,
                maxUtc,
                unsyncedBefore,
                pending.Count);

            var syncStates = await _supabaseClient.GetOrderSyncStatesAsync(
                pending.Select(order => order.SourceEventId).ToArray(),
                cancellationToken);

            foreach (var order in pending)
            {
                try
                {
                    syncStates.TryGetValue(order.SourceEventId, out var state);
                    state ??= new PosOrderSyncState(false, false);

                    var outcome = await ProcessOrderAsync(order, state, cancellationToken);
                    if (outcome.Failure is not null)
                    {
                        failures.Add(outcome.Failure);
                    }

                    processed += outcome.Processed;
                    reconciled += outcome.Reconciled;
                }
                catch (Exception ex)
                {
                    var failure = new SyncFailure(order.PosOrderId, ex.Message);
                    failures.Add(failure);
                    _logger.LogError(
                        ex,
                        "Sale upload exception bill={BillId} sale={SaleId} source={SourceEventId}",
                        order.PosOrderId,
                        order.PosSaleId,
                        order.SourceEventId);
                    await _supabaseClient.LogFailureAsync(order, "exception", ex.Message, new { ex.StackTrace }, cancellationToken);
                }
            }

            if (pending.Count < batchSize)
            {
                break;
            }
        }

        var shiftBackfilled = await BackfillMissingShiftsAsync(cancellationToken);

        var reclaimed = await ReclaimProcessedMissingFromSupabaseAsync(
            syncContext.SyncOpeningUtc,
            cancellationToken);
        if (reclaimed > 0)
        {
            // Pull reclaimed bills in the same cycle when possible.
            for (var batchIndex = 0; batchIndex < maxBatches && reclaimed > 0; batchIndex++)
            {
                var pending = await _repository.ReadPendingOrdersAsync(
                    batchSize,
                    minUtc,
                    maxUtc,
                    cancellationToken);
                if (pending.Count == 0)
                {
                    break;
                }

                var syncStates = await _supabaseClient.GetOrderSyncStatesAsync(
                    pending.Select(order => order.SourceEventId).ToArray(),
                    cancellationToken);

                foreach (var order in pending)
                {
                    try
                    {
                        syncStates.TryGetValue(order.SourceEventId, out var state);
                        state ??= new PosOrderSyncState(false, false);
                        var outcome = await ProcessOrderAsync(order, state, cancellationToken);
                        if (outcome.Failure is not null)
                        {
                            failures.Add(outcome.Failure);
                        }

                        processed += outcome.Processed;
                        reconciled += outcome.Reconciled;
                    }
                    catch (Exception ex)
                    {
                        failures.Add(new SyncFailure(order.PosOrderId, ex.Message));
                        _logger.LogError(
                            ex,
                            "Sale reclaim upload exception bill={BillId} sale={SaleId} source={SourceEventId}",
                            order.PosOrderId,
                            order.PosSaleId,
                            order.SourceEventId);
                    }
                }

                if (pending.Count < batchSize)
                {
                    break;
                }
            }
        }

        var linesRepaired = await _repository.RepairConsistentProcessedFlagsAsync(cancellationToken);
        if (linesRepaired > 0)
        {
            _logger.LogInformation("Repaired {Count} stale MintPOS upload flags (Sale already Processed).", linesRepaired);
        }

        var unsyncedAfter = await _repository.CountExportableUnsyncedSalesAsync(cancellationToken);
        _logger.LogInformation(
            "Sales sync cycle finished: uploaded={UploadedCount} reconciled={ReconciledCount} shift_backfilled={ShiftBackfilled} reclaimed={ReclaimedCount} failures={FailureCount} lines_repaired={LinesRepaired} unsynced_remaining={UnsyncedRemaining}",
            processed,
            reconciled,
            shiftBackfilled,
            reclaimed,
            failures.Count,
            linesRepaired,
            unsyncedAfter);

        return new SyncRunResult(processed, reconciled, linesRepaired, failures);
    }

    private sealed record OrderProcessOutcome(int Processed, int Reconciled, SyncFailure? Failure);

    private async Task<OrderProcessOutcome> ProcessOrderAsync(
        PosOrder order,
        PosOrderSyncState state,
        CancellationToken cancellationToken)
    {
        if (order.Items.Count == 0)
        {
            await _repository.MarkOrderProcessedAsync(
                order.PosOrderId,
                order.PosSaleId,
                cancellationToken,
                allowZeroLines: true);
            await _supabaseClient.ClearSyncFailureAsync(order, cancellationToken);
            _logger.LogInformation(
                "Zero-line bill marked Processed bill={BillId} source={SourceEventId}",
                order.PosOrderId,
                order.SourceEventId);
            return new OrderProcessOutcome(0, 0, null);
        }

        // Never trust a cached "complete" flag across shift open/close — re-verify outlet_sales.
        if (state.IsComplete)
        {
            if (await _supabaseClient.HasOutletSalesAsync(order.SourceEventId, cancellationToken))
            {
                return await ReconcileAndMarkProcessedAsync(order, cancellationToken);
            }

            _logger.LogWarning(
                "Sale looked complete but outlet_sales missing — forcing re-upload bill={BillId} source={SourceEventId}",
                order.PosOrderId,
                order.SourceEventId);
            var hasOrder = await _supabaseClient.OrderExistsAsync(order.SourceEventId, cancellationToken);
            state = new PosOrderSyncState(hasOrder, false);
        }

        if (state.NeedsLineBackfill)
        {
            _logger.LogInformation(
                "Backfilling outlet_sales for existing order bill={BillId} source={SourceEventId}",
                order.PosOrderId,
                order.SourceEventId);
        }
        else
        {
            LogSaleUploadAttempt(order);
        }

        var validation = await _supabaseClient.ValidateOrderAsync(order, cancellationToken);
        if (!validation.IsSuccess)
        {
            if (validation.ErrorMessage?.Contains("no_mappable_items", StringComparison.OrdinalIgnoreCase) == true)
            {
                _logger.LogWarning(
                    "Sale has no mappable catalog SKUs bill={BillId} sale={SaleId} source={SourceEventId} — fix MenuItem.Code / catalog mapping; leaving Pending.",
                    order.PosOrderId,
                    order.PosSaleId,
                    order.SourceEventId);
                await _supabaseClient.LogFailureAsync(
                    order,
                    "validation",
                    validation.ErrorMessage ?? "no_mappable_items",
                    null,
                    cancellationToken);
                return new OrderProcessOutcome(0, 0, null);
            }

            if (!ShouldAttemptUploadDespiteValidation(validation.ErrorMessage))
            {
                _logger.LogWarning(
                    "Sale validation failed bill={BillId} sale={SaleId} source={SourceEventId}: {Error}",
                    order.PosOrderId,
                    order.PosSaleId,
                    order.SourceEventId,
                    validation.ErrorMessage ?? "Unknown error");
                await _supabaseClient.LogFailureAsync(
                    order,
                    "validation",
                    validation.ErrorMessage ?? "Validation failed",
                    null,
                    cancellationToken);
                return new OrderProcessOutcome(0, 0, new SyncFailure(order.PosOrderId, validation.ErrorMessage));
            }

            _logger.LogInformation(
                "Validation reported sync window issue bill={BillId} source={SourceEventId}; attempting sync anyway.",
                order.PosOrderId,
                order.SourceEventId);
        }

        var syncResult = await _supabaseClient.SendOrderAsync(order, cancellationToken);
        if (!syncResult.IsSuccess && !IsDuplicateSourceEventError(syncResult.ErrorMessage))
        {
            _logger.LogWarning(
                "Sale upload failed bill={BillId} sale={SaleId} source={SourceEventId}: {Error}",
                order.PosOrderId,
                order.PosSaleId,
                order.SourceEventId,
                syncResult.ErrorMessage ?? "Unknown error");
            await _supabaseClient.LogFailureAsync(
                order,
                "sync",
                syncResult.ErrorMessage ?? "Sync failed",
                null,
                cancellationToken);
            return new OrderProcessOutcome(0, 0, new SyncFailure(order.PosOrderId, syncResult.ErrorMessage));
        }

        if (!await TryMarkProcessedOnlyIfInSupabaseAsync(order, cancellationToken))
        {
            await _supabaseClient.LogFailureAsync(
                order,
                "verify",
                "rpc_ok_but_no_outlet_sales",
                null,
                cancellationToken);
            return new OrderProcessOutcome(0, 0, null);
        }

        var patchResult = await _supabaseClient.PatchOrderPayloadAsync(order, cancellationToken);
        if (!patchResult.IsSuccess)
        {
            _logger.LogWarning(
                "Sale metadata patch failed bill={BillId} source={SourceEventId}: {Error}",
                order.PosOrderId,
                order.SourceEventId,
                patchResult.ErrorMessage ?? "Unknown error");
        }

        await _supabaseClient.ClearSyncFailureAsync(order, cancellationToken);

        var inventoryIds = order.Inventory.Select(ic => ic.PosId).ToArray();
        if (inventoryIds.Length > 0)
        {
            await _repository.MarkInventoryProcessedAsync(inventoryIds, cancellationToken);
        }

        if (state.NeedsLineBackfill || validation.IsDuplicate || IsDuplicateSourceEventError(syncResult.ErrorMessage))
        {
            _logger.LogInformation(
                "Sale reconciled bill={BillId} sale={SaleId} source={SourceEventId} patched={Patched}",
                order.PosOrderId,
                order.PosSaleId,
                order.SourceEventId,
                patchResult.IsSuccess);
            return new OrderProcessOutcome(0, 1, null);
        }

        _logger.LogInformation(
            "Sale uploaded bill={BillId} sale={SaleId} source={SourceEventId} occurred={OccurredAt:o} lines={LineCount}",
            order.PosOrderId,
            order.PosSaleId,
            order.SourceEventId,
            order.OccurredAt,
            order.Items.Count);
        return new OrderProcessOutcome(1, 0, null);
    }

    private async Task<OrderProcessOutcome> ReconcileAndMarkProcessedAsync(
        PosOrder order,
        CancellationToken cancellationToken)
    {
        // Hard gate: never mark Processed on reconcile unless lines exist in Supabase.
        if (!await TryMarkProcessedOnlyIfInSupabaseAsync(order, cancellationToken))
        {
            return new OrderProcessOutcome(0, 0, null);
        }

        var patchResult = await _supabaseClient.PatchOrderPayloadAsync(order, cancellationToken);
        if (!patchResult.IsSuccess)
        {
            _logger.LogWarning(
                "Sale metadata patch failed bill={BillId} source={SourceEventId}: {Error}",
                order.PosOrderId,
                order.SourceEventId,
                patchResult.ErrorMessage ?? "Unknown error");
        }

        await _supabaseClient.ClearSyncFailureAsync(order, cancellationToken);

        _logger.LogInformation(
            "Sale reconciled (Supabase complete) bill={BillId} sale={SaleId} source={SourceEventId} patched={Patched}",
            order.PosOrderId,
            order.PosSaleId,
            order.SourceEventId,
            patchResult.IsSuccess);
        return new OrderProcessOutcome(0, 1, null);
    }

    /// <summary>
    /// Marks MintPOS Processed only after a live Supabase outlet_sales check.
    /// Shift start/stop must never bypass this.
    /// </summary>
    private async Task<bool> TryMarkProcessedOnlyIfInSupabaseAsync(
        PosOrder order,
        CancellationToken cancellationToken)
    {
        if (!await _supabaseClient.HasOutletSalesAsync(order.SourceEventId, cancellationToken))
        {
            _logger.LogWarning(
                "Refusing Processed flag — no outlet_sales in Supabase bill={BillId} source={SourceEventId}",
                order.PosOrderId,
                order.SourceEventId);
            return false;
        }

        await _repository.MarkOrderProcessedAsync(order.PosOrderId, order.PosSaleId, cancellationToken);
        return true;
    }

    /// <summary>
    /// Finds MintPOS Processed bills missing from Supabase and re-queues them as Pending.
    /// </summary>
    private async Task<int> ReclaimProcessedMissingFromSupabaseAsync(
        DateTime? syncOpeningUtc,
        CancellationToken cancellationToken)
    {
        var options = _syncOptions.CurrentValue;
        var lookbackDays = Math.Max(1, options.ReclaimProcessedLookbackDays);
        var batchSize = Math.Max(1, options.ReclaimProcessedBatchSize);

        var minDate = DateTime.UtcNow.Date.AddDays(-lookbackDays);
        if (syncOpeningUtc.HasValue && syncOpeningUtc.Value.Date < minDate)
        {
            minDate = syncOpeningUtc.Value.Date;
        }

        var candidates = await _repository.ReadRecentProcessedBillsAsync(minDate, batchSize, cancellationToken);
        if (candidates.Count == 0)
        {
            return 0;
        }

        var sourceByBill = candidates.ToDictionary(
            row => $"{_outlet.Id}-{row.BillId}",
            row => row.BillId,
            StringComparer.OrdinalIgnoreCase);

        var present = await _supabaseClient.GetSourceEventIdsWithOutletSalesAsync(
            sourceByBill.Keys.ToArray(),
            cancellationToken);

        var missingBillIds = sourceByBill
            .Where(pair => !present.Contains(pair.Key))
            .Select(pair => pair.Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (missingBillIds.Length == 0)
        {
            return 0;
        }

        var affected = await _repository.RequeueBillsAsPendingAsync(missingBillIds, cancellationToken);
        _logger.LogWarning(
            "Reclaimed {MissingCount} Processed bills missing from Supabase (MintPOS rows touched={AffectedRows}). Sample bill_ids={Sample}",
            missingBillIds.Length,
            affected,
            string.Join(",", missingBillIds.Take(10)));
        return missingBillIds.Length;
    }

    private async Task<int> BackfillMissingShiftsAsync(CancellationToken cancellationToken)
    {
        var batchSize = Math.Max(1, _syncOptions.CurrentValue.BatchSize);
        var missing = await _supabaseClient.FetchOrdersMissingShiftAsync(batchSize, cancellationToken);
        if (missing.Count == 0)
        {
            return 0;
        }

        var outletPrefix = $"{_outlet.Id}-";
        var billIds = missing
            .Select(source =>
                source.StartsWith(outletPrefix, StringComparison.OrdinalIgnoreCase)
                    ? source[outletPrefix.Length..]
                    : null)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (billIds.Length == 0)
        {
            return 0;
        }

        var orders = await _repository.ReadOrdersByBillIdsAsync(billIds, cancellationToken);
        var patched = 0;

        foreach (var order in orders)
        {
            if (order.Shift is null)
            {
                continue;
            }

            var patchResult = await _supabaseClient.PatchOrderPayloadAsync(order, cancellationToken);
            if (patchResult.IsSuccess)
            {
                patched++;
                await _supabaseClient.ClearSyncFailureAsync(order, cancellationToken);
            }
        }

        if (patched > 0)
        {
            _logger.LogInformation("Shift backfill patched {Count}/{Total} orders missing shift metadata.", patched, missing.Count);
        }

        return patched;
    }

    private async Task ApplyCatalogSyncAsync(CancellationToken cancellationToken)
    {
        var events = await _supabaseClient.FetchPendingCatalogSyncAsync(cancellationToken);
        if (events.Count == 0)
        {
            return;
        }

        var orderedEvents = events
            .OrderBy(evt => CatalogEntityOrder(evt))
            .ThenBy(evt => evt.Id)
            .ToList();

        var delivered = new List<Guid>();
        foreach (var evt in orderedEvents)
        {
            if (evt.Payload.ScheduledAt.HasValue && evt.Payload.ScheduledAt.Value > DateTimeOffset.UtcNow)
            {
                continue;
            }

            try
            {
                var isPosCatalogSync =
                    string.Equals(evt.EntityType, "sync_pos_catalog", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(evt.Payload.Command, "sync_pos_catalog", StringComparison.OrdinalIgnoreCase);
                if (isPosCatalogSync)
                {
                    await TrySyncPosCatalogMapAsync(force: true, evt.Payload, cancellationToken);
                }
                else
                {
                    await _catalogRepository.ApplyCatalogEventAsync(evt, cancellationToken);
                }
                delivered.Add(evt.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to apply catalog sync event {EventId}", evt.Id);
            }
        }

        if (delivered.Count > 0)
        {
            await _supabaseClient.MarkCatalogSyncDeliveredAsync(delivered, cancellationToken);
        }
    }

    private void LogSaleUploadAttempt(PosOrder order)
    {
        _logger.LogInformation(
            "Uploading sale bill={BillId} sale={SaleId} source={SourceEventId} occurred={OccurredAt:o} lines={LineCount}",
            order.PosOrderId,
            order.PosSaleId,
            order.SourceEventId,
            order.OccurredAt,
            order.Items.Count);

        foreach (var item in order.Items)
        {
            _logger.LogInformation(
                "  line pos_item={PosItemId} sku={ItemSku} variant_sku={VariantSku} qty={Quantity} price={SalePrice} name={Name}",
                item.PosItemId,
                item.ItemSku ?? "",
                item.VariantSku ?? "",
                item.Quantity,
                item.SalePrice,
                item.Name);
        }
    }

    private static bool ShouldAttemptUploadDespiteValidation(string? errorMessage)
    {
        if (string.IsNullOrWhiteSpace(errorMessage))
        {
            return false;
        }

        return errorMessage.Contains("outside_sync_window", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsDuplicateSourceEventError(string? errorMessage)
    {
        if (string.IsNullOrWhiteSpace(errorMessage))
        {
            return false;
        }

        return errorMessage.Contains("23505", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("already exists", StringComparison.OrdinalIgnoreCase);
    }

    private async Task TrySyncPosCatalogMapAsync(bool force, CatalogSyncPayload? syncOptions, CancellationToken cancellationToken)
    {
        var syncMinutes = Math.Max(1, _syncOptions.CurrentValue.PosCatalogSyncMinutes);
        var now = DateTimeOffset.UtcNow;
        if (!force && _lastPosCatalogSyncUtc.HasValue && (now - _lastPosCatalogSyncUtc.Value).TotalMinutes < syncMinutes)
        {
            return;
        }

        var syncProducts = syncOptions?.ShouldSyncProducts ?? true;
        var syncVariants = syncOptions?.ShouldSyncVariants ?? true;
        var syncMenuGroups = syncOptions?.ShouldSyncMenuGroups ?? true;
        var excludeItemSkus = new HashSet<string>(
            syncOptions?.ExcludeItemSkus ?? Array.Empty<string>(),
            StringComparer.OrdinalIgnoreCase);
        var excludeVariantSkus = new HashSet<string>(
            syncOptions?.ExcludeVariantSkus ?? Array.Empty<string>(),
            StringComparer.OrdinalIgnoreCase);

        try
        {
            if (syncProducts || syncVariants)
            {
                var rows = await _repository.ReadPosCatalogSkuMapAsync(cancellationToken);
                rows = rows
                    .Where(row =>
                        !excludeItemSkus.Contains(row.ItemSku)
                        && !excludeVariantSkus.Contains(row.VariantSku))
                    .ToArray();

                if (rows.Count > 0)
                {
                    var result = await _supabaseClient.SyncPosCatalogSkuMapAsync(rows, syncProducts, syncVariants, cancellationToken);
                    if (!result.IsSuccess)
                    {
                        _logger.LogError("POS catalog SKU sync failed: {Error}", result.ErrorMessage ?? "Unknown error");
                        return;
                    }

                    var bindingResult = await _supabaseClient.SyncOutletPosCatalogBindingsAsync(rows, cancellationToken);
                    if (!bindingResult.IsSuccess)
                    {
                        _logger.LogWarning(
                            "Outlet catalog binding sync failed: {Error}",
                            bindingResult.ErrorMessage ?? "Unknown error");
                    }

                    _logger.LogInformation(
                        "POS catalog SKU sync completed with {Count} mapped variants (products={SyncProducts}, variants={SyncVariants}).",
                        rows.Count,
                        syncProducts,
                        syncVariants);
                }
            }

            if (syncMenuGroups)
            {
                var groupRows = await _repository.ReadPosMenuGroupMapAsync(cancellationToken);
                if (excludeItemSkus.Count > 0)
                {
                    groupRows = groupRows
                        .Where(row => string.IsNullOrWhiteSpace(row.ItemSku) || !excludeItemSkus.Contains(row.ItemSku))
                        .ToArray();
                }

                if (groupRows.Count > 0)
                {
                    var groupResult = await _supabaseClient.SyncPosMenuGroupsAsync(groupRows, cancellationToken);
                    if (!groupResult.IsSuccess)
                    {
                        _logger.LogError("POS menu group sync failed: {Error}", groupResult.ErrorMessage ?? "Unknown error");
                    }
                    else
                    {
                        _logger.LogInformation("POS menu group sync completed with {Count} rows.", groupRows.Count);
                    }
                }
            }

            _lastPosCatalogSyncUtc = now;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "POS catalog SKU sync crashed.");
        }
    }

    private static int CatalogEntityOrder(CatalogSyncEvent evt)
    {
        var entityType = evt.EntityType?.ToLowerInvariant();
        if (entityType == "delete")
        {
            return (evt.Payload.DeleteType ?? string.Empty).Trim().ToLowerInvariant() switch
            {
                "variant" => 0,
                "item" => 1,
                "menu_group" => 2,
                _ => 3
            };
        }

        return entityType switch
        {
            "menu_group" => 0,
            "item" => 1,
            "variant" => 2,
            _ => 3
        };
    }
}
