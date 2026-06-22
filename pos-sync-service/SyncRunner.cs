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
        await TrySyncPosCatalogMapAsync(force: false, cancellationToken);
        await ApplyCatalogSyncAsync(cancellationToken);

        var syncContext = await _supabaseClient.GetOutletSyncContextAsync(cancellationToken);
        if (syncContext is null)
        {
            _logger.LogWarning("Unable to load outlet sync context; skipping POS sales this cycle.");
            return new SyncRunResult(0, failures);
        }

        if (!syncContext.HasPosMiddleware)
        {
            _logger.LogDebug("Outlet has POS middleware disabled; skipping sales upload.");
            return new SyncRunResult(0, failures);
        }

        if (!syncContext.SyncOpeningUtc.HasValue)
        {
            _logger.LogInformation(
                "No pos_sync_opening counter — start an outlet stocktake period in the Afterten Orders app before syncing sales.");
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
        if (pending.Count == 0)
        {
            return new SyncRunResult(0, failures);
        }

        foreach (var order in pending)
        {
            try
            {
                var validation = await _supabaseClient.ValidateOrderAsync(order, cancellationToken);
                if (!validation.IsSuccess)
                {
                    if (IsIgnorableValidationFailure(validation.ErrorMessage))
                    {
                        if (validation.ErrorMessage?.Contains("no_mappable_items", StringComparison.OrdinalIgnoreCase) == true)
                        {
                            _logger.LogInformation("Skipping order {OrderId}: no mappable POS items.", order.PosOrderId);
                            await _repository.MarkOrderProcessedAsync(order.PosOrderId, order.PosSaleId, cancellationToken);
                            processed++;
                        }
                        else
                        {
                            _logger.LogDebug(
                                "Deferring order {OrderId}: {Error}",
                                order.PosOrderId,
                                validation.ErrorMessage ?? "Outside sync window");
                        }

                        continue;
                    }

                    var failure = new SyncFailure(order.PosOrderId, validation.ErrorMessage);
                    failures.Add(failure);
                    _logger.LogWarning("Validation failed for order {OrderId}: {Error}", order.PosOrderId, validation.ErrorMessage ?? "Unknown error");
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

                    processed++;
                }
                else
                {
                    var failure = new SyncFailure(order.PosOrderId, result.ErrorMessage);
                    failures.Add(failure);
                    _logger.LogWarning("Failed to sync order {OrderId}: {Error}", order.PosOrderId, result.ErrorMessage ?? "Unknown error");
                    await _supabaseClient.LogFailureAsync(order, "sync", result.ErrorMessage ?? "Sync failed", null, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                var failure = new SyncFailure(order.PosOrderId, ex.Message);
                failures.Add(failure);
                _logger.LogError(ex, "Unexpected error syncing order {OrderId}", order.PosOrderId);
                await _supabaseClient.LogFailureAsync(order, "exception", ex.Message, new { ex.StackTrace }, cancellationToken);
            }
        }

        return new SyncRunResult(processed, failures);
    }

    private async Task ApplyCatalogSyncAsync(CancellationToken cancellationToken)
    {
        var events = await _supabaseClient.FetchPendingCatalogSyncAsync(cancellationToken);
        if (events.Count == 0)
        {
            return;
        }

        var delivered = new List<Guid>();
        foreach (var evt in events)
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
                    await TrySyncPosCatalogMapAsync(force: true, cancellationToken);
                }
                else
                {
                    await _catalogRepository.ApplyCatalogEventAsync(evt, cancellationToken);
                }
                delivered.Add(evt.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to apply catalog sync event {EventId}", evt.Id);
            }
        }

        if (delivered.Count > 0)
        {
            await _supabaseClient.MarkCatalogSyncDeliveredAsync(delivered, cancellationToken);
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

    private async Task TrySyncPosCatalogMapAsync(bool force, CancellationToken cancellationToken)
    {
        var syncMinutes = Math.Max(1, _syncOptions.CurrentValue.PosCatalogSyncMinutes);
        var now = DateTimeOffset.UtcNow;
        if (!force && _lastPosCatalogSyncUtc.HasValue && (now - _lastPosCatalogSyncUtc.Value).TotalMinutes < syncMinutes)
        {
            return;
        }

        try
        {
            var rows = await _repository.ReadPosCatalogSkuMapAsync(cancellationToken);
            if (rows.Count == 0)
            {
                _lastPosCatalogSyncUtc = now;
                return;
            }

            var result = await _supabaseClient.SyncPosCatalogSkuMapAsync(rows, cancellationToken);
            if (!result.IsSuccess)
            {
                _logger.LogWarning("POS catalog SKU sync failed: {Error}", result.ErrorMessage ?? "Unknown error");
                return;
            }

            _lastPosCatalogSyncUtc = now;
            _logger.LogInformation("POS catalog SKU sync completed with {Count} mapped variants.", rows.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "POS catalog SKU sync crashed.");
        }
    }
}
