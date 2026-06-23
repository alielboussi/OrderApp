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
    private readonly PosRepository _repository;
    private readonly PosCatalogRepository _catalogRepository;
    private readonly SupabaseClient _supabaseClient;
    private readonly ILogger<SyncRunner> _logger;
    private DateTimeOffset? _lastPosCatalogSyncUtc;

    public SyncRunner(IOptionsMonitor<SyncOptions> syncOptions,
                      PosRepository repository,
                      PosCatalogRepository catalogRepository,
                      SupabaseClient supabaseClient,
                      ILogger<SyncRunner> logger)
    {
        _syncOptions = syncOptions;
        _repository = repository;
        _catalogRepository = catalogRepository;
        _supabaseClient = supabaseClient;
        _logger = logger;
    }

    public async Task<SyncRunResult> RunOnceAsync(CancellationToken cancellationToken)
    {
        var failures = new List<SyncFailure>();
        var processed = 0;

        await _supabaseClient.SendHeartbeatAsync(cancellationToken);
        await TrySyncPosCatalogMapAsync(force: false, syncOptions: null, cancellationToken);
        await ApplyCatalogSyncAsync(cancellationToken);

        var syncContext = await _supabaseClient.GetOutletSyncContextAsync(cancellationToken);
        if (syncContext is null)
        {
            _logger.LogWarning("Unable to load outlet sync context; skipping POS sales this cycle.");
            return new SyncRunResult(0, failures);
        }

        if (!syncContext.HasPosMiddleware)
        {
            _logger.LogInformation("Sales sync skipped: has_pos_middleware is false for this outlet.");
            return new SyncRunResult(0, failures);
        }

        if (!syncContext.SyncOpeningUtc.HasValue)
        {
            _logger.LogInformation(
                "Sales sync skipped: no pos_sync_opening counter — open a stocktake period or set counter_values in Supabase.");
            return new SyncRunResult(0, failures);
        }

        var syncOptions = _syncOptions.CurrentValue;
        var (minUtc, maxUtc) = PosSyncWindow.Compute(
            syncContext.SyncOpeningUtc,
            syncContext.SyncCutoffUtc,
            syncOptions.MinSaleDateUtc,
            syncOptions.MaxSaleDateUtc);

        var pending = await _repository.ReadPendingOrdersAsync(
            syncOptions.BatchSize,
            minUtc,
            maxUtc,
            cancellationToken);

        _logger.LogInformation(
            "Sales sync cycle: opening={OpeningUtc:o} cutoff={CutoffUtc} window_min={MinUtc:o} window_max={MaxUtc} include_processed={IncludeProcessed} pending={PendingCount}",
            syncContext.SyncOpeningUtc,
            syncContext.SyncCutoffUtc,
            minUtc,
            maxUtc,
            syncOptions.IncludeProcessed,
            pending.Count);

        if (pending.Count == 0)
        {
            return new SyncRunResult(0, failures);
        }

        foreach (var order in pending)
        {
            try
            {
                LogSaleUploadAttempt(order);

                var validation = await _supabaseClient.ValidateOrderAsync(order, cancellationToken);
                if (!validation.IsSuccess)
                {
                    if (IsIgnorableValidationFailure(validation.ErrorMessage))
                    {
                        if (validation.ErrorMessage?.Contains("no_mappable_items", StringComparison.OrdinalIgnoreCase) == true)
                        {
                            _logger.LogInformation(
                                "Sale skipped bill={BillId} sale={SaleId} source={SourceEventId}: no mappable POS SKUs.",
                                order.PosOrderId,
                                order.PosSaleId,
                                order.SourceEventId);
                            await _repository.MarkOrderProcessedAsync(order.PosOrderId, order.PosSaleId, cancellationToken);
                            processed++;
                        }
                        else
                        {
                            _logger.LogInformation(
                                "Sale deferred bill={BillId} sale={SaleId} source={SourceEventId}: {Error}",
                                order.PosOrderId,
                                order.PosSaleId,
                                order.SourceEventId,
                                validation.ErrorMessage ?? "Outside sync window");
                        }

                        continue;
                    }

                    var failure = new SyncFailure(order.PosOrderId, validation.ErrorMessage);
                    failures.Add(failure);
                    _logger.LogWarning(
                        "Sale validation failed bill={BillId} sale={SaleId} source={SourceEventId}: {Error}",
                        order.PosOrderId,
                        order.PosSaleId,
                        order.SourceEventId,
                        validation.ErrorMessage ?? "Unknown error");
                    await _supabaseClient.LogFailureAsync(order, "validation", validation.ErrorMessage ?? "Validation failed", null, cancellationToken);
                    continue;
                }

                var result = await _supabaseClient.SendOrderAsync(order, cancellationToken);
                if (result.IsSuccess)
                {
                    await _repository.MarkOrderProcessedAsync(order.PosOrderId, order.PosSaleId, cancellationToken);

                    var inventoryIds = order.Inventory.Select(ic => ic.PosId).ToArray();
                    if (inventoryIds.Length > 0)
                    {
                        await _repository.MarkInventoryProcessedAsync(inventoryIds, cancellationToken);
                    }

                    _logger.LogInformation(
                        "Sale uploaded bill={BillId} sale={SaleId} source={SourceEventId} occurred={OccurredAt:o} lines={LineCount}",
                        order.PosOrderId,
                        order.PosSaleId,
                        order.SourceEventId,
                        order.OccurredAt,
                        order.Items.Count);

                    processed++;
                }
                else
                {
                    var failure = new SyncFailure(order.PosOrderId, result.ErrorMessage);
                    failures.Add(failure);
                    _logger.LogWarning(
                        "Sale upload failed bill={BillId} sale={SaleId} source={SourceEventId}: {Error}",
                        order.PosOrderId,
                        order.PosSaleId,
                        order.SourceEventId,
                        result.ErrorMessage ?? "Unknown error");
                    await _supabaseClient.LogFailureAsync(order, "sync", result.ErrorMessage ?? "Sync failed", null, cancellationToken);
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
                await _supabaseClient.LogFailureAsync(order, "exception", ex.Message, new { ex.StackTrace }, cancellationToken);
            }
        }

        _logger.LogInformation("Sales sync cycle finished: uploaded={UploadedCount} failures={FailureCount}", processed, failures.Count);
        return new SyncRunResult(processed, failures);
    }

    private async Task ApplyCatalogSyncAsync(CancellationToken cancellationToken)
    {
        var events = await _supabaseClient.FetchPendingCatalogSyncAsync(cancellationToken);
        if (events.Count == 0)
        {
            return;
        }

        var orderedEvents = events
            .OrderBy(evt => CatalogEntityOrder(evt.EntityType))
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

    private static bool IsIgnorableValidationFailure(string? errorMessage)
    {
        if (string.IsNullOrWhiteSpace(errorMessage))
        {
            return false;
        }

        return errorMessage.Contains("no_mappable_items", StringComparison.OrdinalIgnoreCase)
            || errorMessage.Contains("outside_sync_window", StringComparison.OrdinalIgnoreCase);
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

    private static int CatalogEntityOrder(string? entityType)
    {
        return entityType?.ToLowerInvariant() switch
        {
            "menu_group" => 0,
            "item" => 1,
            "variant" => 2,
            _ => 3
        };
    }
}
