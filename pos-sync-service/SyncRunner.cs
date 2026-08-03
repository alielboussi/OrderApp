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
    private readonly PosCashierRepository _cashierRepository;
    private readonly IOutletCloudClient _cloudClient;
    private readonly ILogger<SyncRunner> _logger;
    private DateTimeOffset? _lastPosCatalogSyncUtc;
    private string? _lastSyncError;
    private DateTimeOffset? _lastSaleUploadedUtc;
    private string? _blockedBillId;
    private string? _blockedSourceEventId;
    private string? _blockedSyncError;
    private string? _reclaimAfterBillId;

    public SyncRunner(IOptionsMonitor<SyncOptions> syncOptions,
                      IOptions<OutletOptions> outlet,
                      PosRepository repository,
                      PosCatalogRepository catalogRepository,
                      PosCashierRepository cashierRepository,
                      IOutletCloudClient cloudClient,
                      ILogger<SyncRunner> logger)
    {
        _syncOptions = syncOptions;
        _outlet = outlet.Value;
        _repository = repository;
        _catalogRepository = catalogRepository;
        _cashierRepository = cashierRepository;
        _cloudClient = cloudClient;
        _logger = logger;
    }

    public async Task<SyncRunResult> RunOnceAsync(CancellationToken cancellationToken)
    {
        var failures = new List<SyncFailure>();

        var pendingSales = await _repository.CountUnsyncedSalesAsync(cancellationToken);
        await _cloudClient.SendHeartbeatAsync(
            new HeartbeatMetrics(
                PendingSalesCount: pendingSales,
                LastSyncError: _blockedSyncError ?? _lastSyncError,
                LastSaleUploadedUtc: _lastSaleUploadedUtc,
                BlockedBillId: _blockedBillId,
                BlockedSourceEventId: _blockedSourceEventId),
            cancellationToken);

        await TrySyncPosCatalogMapAsync(force: false, syncOptions: null, cancellationToken);
        await ApplyCatalogSyncAsync(cancellationToken);
        await ApplyCashierSyncAsync(cancellationToken);

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

        var syncContext = await _cloudClient.GetOutletSyncContextAsync(cancellationToken);
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
            _logger.LogInformation(
                "No pos_sync_opening counter — uploading Pending sales without a sync window filter.");
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
        var queueBlocked = false;

        if (!string.IsNullOrWhiteSpace(_blockedBillId))
        {
            _logger.LogWarning(
                "Sales sync queue blocked on bill={BillId} source={SourceEventId} — will retry head before newer pending bills. Error={Error}",
                _blockedBillId,
                _blockedSourceEventId,
                _blockedSyncError ?? "Unknown error");
        }

        for (var batchIndex = 0; batchIndex < maxBatches && !queueBlocked; batchIndex++)
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

            var batchResult = await ProcessPendingSalesBatchAsync(pending, failures, cancellationToken);
            processed += batchResult.Processed;
            reconciled += batchResult.Reconciled;
            queueBlocked = batchResult.QueueBlocked;

            if (pending.Count < batchSize)
            {
                break;
            }
        }

        var shiftBackfilled = await BackfillMissingShiftsAsync(cancellationToken);

        var reclaimed = await ReclaimProcessedMissingFromCloudAsync(
            syncContext.SyncOpeningUtc,
            cancellationToken);
        if (reclaimed > 0 && !queueBlocked)
        {
            // Pull reclaimed bills in the same cycle when possible.
            for (var batchIndex = 0; batchIndex < maxBatches && reclaimed > 0 && !queueBlocked; batchIndex++)
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

                var batchResult = await ProcessPendingSalesBatchAsync(pending, failures, cancellationToken);
                processed += batchResult.Processed;
                reconciled += batchResult.Reconciled;
                queueBlocked = batchResult.QueueBlocked;

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
            "Sales sync cycle finished: uploaded={UploadedCount} reconciled={ReconciledCount} shift_backfilled={ShiftBackfilled} reclaimed={ReclaimedCount} failures={FailureCount} lines_repaired={LinesRepaired} unsynced_remaining={UnsyncedRemaining} queue_blocked={QueueBlocked} blocked_bill={BlockedBillId}",
            processed,
            reconciled,
            shiftBackfilled,
            reclaimed,
            failures.Count,
            linesRepaired,
            unsyncedAfter,
            queueBlocked,
            _blockedBillId ?? "(none)");

        return new SyncRunResult(processed, reconciled, linesRepaired, failures);
    }

    private sealed record OrderProcessOutcome(int Processed, int Reconciled, SyncFailure? Failure);

    private sealed record PendingSalesBatchResult(int Processed, int Reconciled, bool QueueBlocked);

    private async Task<PendingSalesBatchResult> ProcessPendingSalesBatchAsync(
        IReadOnlyList<PosOrder> pending,
        List<SyncFailure> failures,
        CancellationToken cancellationToken)
    {
        var processed = 0;
        var reconciled = 0;
        var syncStates = await _cloudClient.GetOrderSyncStatesAsync(
            pending.Select(order => order.SourceEventId).ToArray(),
            cancellationToken);

        foreach (var order in pending)
        {
            try
            {
                syncStates.TryGetValue(order.SourceEventId, out var state);
                state ??= new PosOrderSyncState(false, false);

                var outcome = await ProcessOrderWithRetriesAsync(order, state, cancellationToken);
                if (outcome.Failure is not null)
                {
                    failures.Add(outcome.Failure);
                }

                processed += outcome.Processed;
                reconciled += outcome.Reconciled;

                if (outcome.Processed > 0 || outcome.Reconciled > 0)
                {
                    ClearBlockedSaleHead();
                }

                if (ShouldBlockQueueOnFailure(outcome.Failure))
                {
                    SetBlockedSaleHead(order, outcome.Failure!.Error);
                    return new PendingSalesBatchResult(processed, reconciled, true);
                }
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
                await _cloudClient.LogFailureAsync(order, "exception", ex.Message, new { ex.StackTrace }, cancellationToken);

                if (ShouldBlockQueueOnFailure(failure))
                {
                    SetBlockedSaleHead(order, ex.Message);
                    return new PendingSalesBatchResult(processed, reconciled, true);
                }
            }
        }

        return new PendingSalesBatchResult(processed, reconciled, false);
    }

    private async Task<OrderProcessOutcome> ProcessOrderWithRetriesAsync(
        PosOrder order,
        PosOrderSyncState state,
        CancellationToken cancellationToken)
    {
        var options = _syncOptions.CurrentValue;
        var maxAttempts = Math.Max(1, options.SaleSyncFailureRetries + 1);
        var delayMs = Math.Max(0, options.SaleSyncFailureRetryDelayMs);

        OrderProcessOutcome last = new(0, 0, null);
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            last = await ProcessOrderAsync(order, state, cancellationToken);
            if (last.Failure is null || last.Processed > 0 || last.Reconciled > 0)
            {
                return last;
            }

            if (attempt >= maxAttempts)
            {
                break;
            }

            _logger.LogWarning(
                "Sale upload retry {Attempt}/{MaxRetries} bill={BillId} source={SourceEventId}: {Error}",
                attempt,
                options.SaleSyncFailureRetries,
                order.PosOrderId,
                order.SourceEventId,
                last.Failure.Error ?? "Unknown error");

            if (delayMs > 0)
            {
                await Task.Delay(delayMs, cancellationToken);
            }
        }

        return last;
    }

    private bool ShouldBlockQueueOnFailure(SyncFailure? failure) =>
        failure is not null && _syncOptions.CurrentValue.BlockOnSaleSyncFailure;

    private void SetBlockedSaleHead(PosOrder order, string? error)
    {
        _blockedBillId = order.PosOrderId;
        _blockedSourceEventId = order.SourceEventId;
        _blockedSyncError = error;
        _lastSyncError = error;
        _logger.LogError(
            "Sales sync blocked on bill={BillId} source={SourceEventId} — fix error before newer pending bills upload. Error={Error}",
            order.PosOrderId,
            order.SourceEventId,
            error ?? "Unknown error");
    }

    private void ClearBlockedSaleHead()
    {
        _blockedBillId = null;
        _blockedSourceEventId = null;
        _blockedSyncError = null;
    }

    private async Task<OrderProcessOutcome> ProcessOrderAsync(
        PosOrder order,
        PosOrderSyncState state,
        CancellationToken cancellationToken)
    {
        if (order.Items.Count == 0)
        {
            if (!await _repository.MarkOrderProcessedAsync(
                    order.PosOrderId,
                    order.PosSaleId,
                    cancellationToken,
                    allowZeroLines: true))
            {
                return new OrderProcessOutcome(
                    0,
                    0,
                    new SyncFailure(order.PosOrderId, "zero_line_mark_failed"));
            }

            await _cloudClient.ClearSyncFailureAsync(order, cancellationToken);
            _logger.LogInformation(
                "Zero-line bill marked Processed bill={BillId} source={SourceEventId}",
                order.PosOrderId,
                order.SourceEventId);
            return new OrderProcessOutcome(0, 0, null);
        }

        // Never trust a cached "complete" flag across shift open/close — re-verify outlet_sales.
        if (state.IsComplete)
        {
            if (await _cloudClient.HasOutletSalesAsync(order.SourceEventId, cancellationToken))
            {
                return await ReconcileAndMarkProcessedAsync(order, cancellationToken);
            }

            _logger.LogWarning(
                "Sale looked complete but outlet_sales missing — forcing re-upload bill={BillId} source={SourceEventId}",
                order.PosOrderId,
                order.SourceEventId);
            var hasOrder = await _cloudClient.OrderExistsAsync(order.SourceEventId, cancellationToken);
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

        var validation = await _cloudClient.ValidateOrderAsync(order, cancellationToken);
        if (!validation.IsSuccess)
        {
            if (validation.ErrorMessage?.Contains("no_mappable_items", StringComparison.OrdinalIgnoreCase) == true)
            {
                _logger.LogWarning(
                    "Sale has no mappable catalog SKUs bill={BillId} sale={SaleId} source={SourceEventId} — fix MenuItem.Code / catalog mapping; leaving Pending.",
                    order.PosOrderId,
                    order.PosSaleId,
                    order.SourceEventId);
                await _cloudClient.LogFailureAsync(
                    order,
                    "validation",
                    validation.ErrorMessage ?? "no_mappable_items",
                    null,
                    cancellationToken);
                return new OrderProcessOutcome(
                    0,
                    0,
                    new SyncFailure(order.PosOrderId, validation.ErrorMessage ?? "no_mappable_items"));
            }

            if (!ShouldAttemptUploadDespiteValidation(validation.ErrorMessage))
            {
                _logger.LogWarning(
                    "Sale validation failed bill={BillId} sale={SaleId} source={SourceEventId}: {Error}",
                    order.PosOrderId,
                    order.PosSaleId,
                    order.SourceEventId,
                    validation.ErrorMessage ?? "Unknown error");
                await _cloudClient.LogFailureAsync(
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

        var syncResult = await _cloudClient.SendOrderAsync(order, cancellationToken);
        if (!syncResult.IsSuccess && !IsDuplicateSourceEventError(syncResult.ErrorMessage))
        {
            _logger.LogWarning(
                "Sale upload failed bill={BillId} sale={SaleId} source={SourceEventId}: {Error}",
                order.PosOrderId,
                order.PosSaleId,
                order.SourceEventId,
                syncResult.ErrorMessage ?? "Unknown error");
            await _cloudClient.LogFailureAsync(
                order,
                "sync",
                syncResult.ErrorMessage ?? "Sync failed",
                null,
                cancellationToken);
            return new OrderProcessOutcome(0, 0, new SyncFailure(order.PosOrderId, syncResult.ErrorMessage));
        }

        if (!await TryMarkProcessedOnlyIfInCloudAsync(order, cancellationToken))
        {
            await _cloudClient.LogFailureAsync(
                order,
                "verify",
                "rpc_ok_but_no_outlet_sales",
                null,
                cancellationToken);
            return new OrderProcessOutcome(
                0,
                0,
                new SyncFailure(order.PosOrderId, "verify_failed_no_outlet_sales"));
        }

        var patchResult = await _cloudClient.PatchOrderPayloadAsync(order, cancellationToken);
        if (!patchResult.IsSuccess)
        {
            _logger.LogWarning(
                "Sale metadata patch failed bill={BillId} source={SourceEventId}: {Error}",
                order.PosOrderId,
                order.SourceEventId,
                patchResult.ErrorMessage ?? "Unknown error");
        }

        await _cloudClient.ClearSyncFailureAsync(order, cancellationToken);

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
        // Hard gate: never mark Processed on reconcile unless lines exist in the cloud.
        if (!await TryMarkProcessedOnlyIfInCloudAsync(order, cancellationToken))
        {
            return new OrderProcessOutcome(0, 0, null);
        }

        var patchResult = await _cloudClient.PatchOrderPayloadAsync(order, cancellationToken);
        if (!patchResult.IsSuccess)
        {
            _logger.LogWarning(
                "Sale metadata patch failed bill={BillId} source={SourceEventId}: {Error}",
                order.PosOrderId,
                order.SourceEventId,
                patchResult.ErrorMessage ?? "Unknown error");
        }

        await _cloudClient.ClearSyncFailureAsync(order, cancellationToken);

        _logger.LogInformation(
            "Sale reconciled (cloud complete) bill={BillId} sale={SaleId} source={SourceEventId} patched={Patched}",
            order.PosOrderId,
            order.PosSaleId,
            order.SourceEventId,
            patchResult.IsSuccess);
        return new OrderProcessOutcome(0, 1, null);
    }

    /// <summary>
    /// Marks MintPOS Processed only after a live cloud outlet_sales check, then re-verifies and rolls back on failure.
    /// </summary>
    private async Task<bool> TryMarkProcessedOnlyIfInCloudAsync(
        PosOrder order,
        CancellationToken cancellationToken)
    {
        if (!await VerifyOutletSalesWithRetryAsync(order.SourceEventId, cancellationToken))
        {
            _logger.LogWarning(
                "Refusing Processed flag — no outlet_sales in cloud bill={BillId} source={SourceEventId}",
                order.PosOrderId,
                order.SourceEventId);
            return false;
        }

        if (!await _repository.MarkOrderProcessedAsync(order.PosOrderId, order.PosSaleId, cancellationToken))
        {
            return false;
        }

        if (await VerifyOutletSalesWithRetryAsync(order.SourceEventId, cancellationToken))
        {
            return true;
        }

        var rolledBack = await _repository.RequeueBillsAsPendingAsync(
            new[] { order.PosOrderId },
            cancellationToken);
        _logger.LogError(
            "Rolled back Processed flag after post-mark cloud verify failed bill={BillId} source={SourceEventId} rows={Rows}",
            order.PosOrderId,
            order.SourceEventId,
            rolledBack);
        return false;
    }

    private async Task<bool> VerifyOutletSalesWithRetryAsync(
        string sourceEventId,
        CancellationToken cancellationToken)
    {
        var options = _syncOptions.CurrentValue;
        var attempts = Math.Max(1, options.PostMarkVerifyRetries);
        var delayMs = Math.Max(0, options.PostMarkVerifyRetryDelayMs);

        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            if (await _cloudClient.HasOutletSalesAsync(sourceEventId, cancellationToken))
            {
                return true;
            }

            if (attempt < attempts && delayMs > 0)
            {
                await Task.Delay(delayMs, cancellationToken);
            }
        }

        return false;
    }

    /// <summary>
    /// Finds MintPOS Processed bills missing from the cloud and re-queues them as Pending.
    /// Scans the full Processed queue in batches (oldest-first cursor) every sync cycle.
    /// </summary>
    private async Task<int> ReclaimProcessedMissingFromCloudAsync(
        DateTime? syncOpeningUtc,
        CancellationToken cancellationToken)
    {
        var options = _syncOptions.CurrentValue;
        var batchSize = Math.Max(1, options.ReclaimProcessedBatchSize);
        var maxPasses = Math.Max(1, options.ReclaimProcessedMaxPassesPerCycle);
        var minDate = ResolveReclaimMinDate(syncOpeningUtc, options.ReclaimProcessedLookbackDays);
        var totalReclaimed = 0;

        for (var pass = 0; pass < maxPasses; pass++)
        {
            var candidates = await _repository.ReadProcessedBillsForReclaimAsync(
                minDate,
                batchSize,
                _reclaimAfterBillId,
                cancellationToken);
            if (candidates.Count == 0)
            {
                _reclaimAfterBillId = null;
                break;
            }

            var sourceByBill = candidates.ToDictionary(
                row => $"{_outlet.Id}-{row.BillId}",
                row => row.BillId,
                StringComparer.OrdinalIgnoreCase);

            var present = await _cloudClient.GetSourceEventIdsWithOutletSalesAsync(
                sourceByBill.Keys.ToArray(),
                cancellationToken);

            var missingBillIds = sourceByBill
                .Where(pair => !present.Contains(pair.Key))
                .Select(pair => pair.Value)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (missingBillIds.Length > 0)
            {
                var affected = await _repository.RequeueBillsAsPendingAsync(missingBillIds, cancellationToken);
                totalReclaimed += missingBillIds.Length;
                _logger.LogWarning(
                    "Reclaimed {MissingCount} Processed bills missing from cloud (MintPOS rows touched={AffectedRows}). Sample bill_ids={Sample}",
                    missingBillIds.Length,
                    affected,
                    string.Join(",", missingBillIds.Take(10)));
            }

            _reclaimAfterBillId = candidates[^1].BillId;
            if (candidates.Count < batchSize)
            {
                _reclaimAfterBillId = null;
                break;
            }
        }

        return totalReclaimed;
    }

    private static DateTime? ResolveReclaimMinDate(DateTime? syncOpeningUtc, int lookbackDays)
    {
        if (lookbackDays > 0)
        {
            var minDate = DateTime.UtcNow.Date.AddDays(-lookbackDays);
            if (syncOpeningUtc.HasValue && syncOpeningUtc.Value.Date > minDate)
            {
                return syncOpeningUtc.Value.Date;
            }

            return minDate;
        }

        return syncOpeningUtc?.Date;
    }

    private async Task<int> BackfillMissingShiftsAsync(CancellationToken cancellationToken)
    {
        var batchSize = Math.Max(1, _syncOptions.CurrentValue.BatchSize);
        var missing = await _cloudClient.FetchOrdersMissingShiftAsync(batchSize, cancellationToken);
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

            var patchResult = await _cloudClient.PatchOrderPayloadAsync(order, cancellationToken);
            if (patchResult.IsSuccess)
            {
                patched++;
                await _cloudClient.ClearSyncFailureAsync(order, cancellationToken);
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
        var events = await _cloudClient.FetchPendingCatalogSyncAsync(cancellationToken);
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
            await _cloudClient.MarkCatalogSyncDeliveredAsync(delivered, cancellationToken);
        }
    }

    private async Task ApplyCashierSyncAsync(CancellationToken cancellationToken)
    {
        var events = await _cloudClient.FetchPendingCashierSyncAsync(cancellationToken);
        if (events.Count == 0)
        {
            return;
        }

        var delivered = new List<Guid>();
        foreach (var evt in events)
        {
            try
            {
                var action = evt.Action?.Trim().ToLowerInvariant() ?? string.Empty;
                switch (action)
                {
                    case "insert":
                        await ApplyCashierInsertAsync(evt, cancellationToken);
                        break;
                    case "delete":
                        await ApplyCashierDeleteAsync(evt, cancellationToken);
                        break;
                    case "pull":
                        await ApplyCashierPullAsync(evt, cancellationToken);
                        break;
                    default:
                        _logger.LogWarning("Unknown cashier sync action: {Action}", evt.Action);
                        break;
                }

                delivered.Add(evt.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to apply cashier sync event {EventId}", evt.Id);
                await _cloudClient.MarkCashierSyncFailedAsync(evt.Id, ex.Message, cancellationToken);
            }
        }

        if (delivered.Count > 0)
        {
            await _cloudClient.MarkCashierSyncDeliveredAsync(delivered, cancellationToken);
        }
    }

    private async Task ApplyCashierInsertAsync(CashierSyncEvent evt, CancellationToken cancellationToken)
    {
        if (evt.CashierId is null || evt.CashierId == Guid.Empty)
        {
            throw new InvalidOperationException("Cashier insert event is missing cashier_id.");
        }

        var name = evt.Payload.Name?.Trim();
        var username = evt.Payload.Username?.Trim();
        var password = evt.Payload.Password;
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("Cashier insert event is missing name.");
        }

        if (string.IsNullOrWhiteSpace(username))
        {
            throw new InvalidOperationException("Cashier insert event is missing username.");
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Cashier insert event is missing password.");
        }

        var posUserId = await _cashierRepository.InsertCashierAsync(name, username, password, cancellationToken);
        var result = await _cloudClient.CompleteCashierInsertSyncAsync(evt.CashierId.Value, posUserId, cancellationToken);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(result.ErrorMessage ?? "Failed to mark cashier insert as synced.");
        }
    }

    private async Task ApplyCashierDeleteAsync(CashierSyncEvent evt, CancellationToken cancellationToken)
    {
        if (evt.CashierId is null || evt.CashierId == Guid.Empty)
        {
            throw new InvalidOperationException("Cashier delete event is missing cashier_id.");
        }

        var posUserId = evt.Payload.PosUserId;
        if (!posUserId.HasValue || posUserId.Value <= 0)
        {
            throw new InvalidOperationException("Cashier delete event is missing pos_user_id.");
        }

        await _cashierRepository.DeleteCashierAsync(posUserId.Value, cancellationToken);
        var result = await _cloudClient.CompleteCashierDeleteSyncAsync(evt.CashierId.Value, cancellationToken);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(result.ErrorMessage ?? "Failed to mark cashier delete as synced.");
        }
    }

    private async Task ApplyCashierPullAsync(CashierSyncEvent evt, CancellationToken cancellationToken)
    {
        var rows = await _cashierRepository.ListCashiersAsync(cancellationToken);
        var result = await _cloudClient.UpsertOutletCashiersFromPosAsync(rows, cancellationToken);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(result.ErrorMessage ?? "Failed to upsert cashiers pulled from MintPOS.");
        }

        _logger.LogInformation("Pulled {Count} cashier(s) from MintPOS into portal.", rows.Count);
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
                    var result = await _cloudClient.SyncPosCatalogSkuMapAsync(rows, syncProducts, syncVariants, cancellationToken);
                    if (!result.IsSuccess)
                    {
                        _logger.LogError("POS catalog SKU sync failed: {Error}", result.ErrorMessage ?? "Unknown error");
                        return;
                    }

                    var bindingResult = await _cloudClient.SyncOutletPosCatalogBindingsAsync(rows, cancellationToken);
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
                    var groupResult = await _cloudClient.SyncPosMenuGroupsAsync(groupRows, cancellationToken);
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
