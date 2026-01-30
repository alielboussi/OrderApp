using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class SyncRunner
{
    private readonly IOptionsMonitor<SyncOptions> _syncOptions;
    private readonly PosRepository _repository;
    private readonly SupabaseClient _supabaseClient;
    private readonly string _contentRoot;
    private readonly ILogger<SyncRunner> _logger;

    public SyncRunner(IOptionsMonitor<SyncOptions> syncOptions,
                      PosRepository repository,
                      SupabaseClient supabaseClient,
                      IHostEnvironment hostEnvironment,
                      ILogger<SyncRunner> logger)
    {
        _syncOptions = syncOptions;
        _repository = repository;
        _supabaseClient = supabaseClient;
        _contentRoot = hostEnvironment.ContentRootPath;
        _logger = logger;
    }

    public async Task<SyncRunResult> RunOnceAsync(CancellationToken cancellationToken)
    {
        var failures = new List<SyncFailure>();
        var processed = 0;

        await ApplyRemoteCutoffAsync(cancellationToken);

        var isPaused = await _supabaseClient.IsSyncPausedAsync(cancellationToken);
        if (isPaused)
        {
            _logger.LogInformation("POS sync paused via Warehouse Backoffice toggle.");
            return new SyncRunResult(0, failures);
        }

        var pending = await _repository.ReadPendingOrdersAsync(_syncOptions.CurrentValue.BatchSize, cancellationToken);
        if (pending.Count == 0)
        {
            return new SyncRunResult(0, failures);
        }

        foreach (var order in pending)
        {
            var pausedMidRun = await _supabaseClient.IsSyncPausedAsync(cancellationToken);
            if (pausedMidRun)
            {
                _logger.LogInformation("POS sync paused mid-run; stopping current batch.");
                break;
            }

            try
            {
                var validation = await _supabaseClient.ValidateOrderAsync(order, cancellationToken);
                if (!validation.IsSuccess)
                {
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

    private async Task ApplyRemoteCutoffAsync(CancellationToken cancellationToken)
    {
        try
        {
            var remoteCutoffUtc = await _supabaseClient.GetPosSyncCutoffUtcAsync(cancellationToken);
            if (!remoteCutoffUtc.HasValue)
            {
                return;
            }

            var current = _syncOptions.CurrentValue.MinSaleDateUtc;
            if (current.HasValue && current.Value.ToUniversalTime() >= remoteCutoffUtc.Value)
            {
                return;
            }

            ConfigStore.SaveMinSaleDateUtc(_contentRoot, remoteCutoffUtc.Value);
            _logger.LogInformation("Updated POS sync cutoff from stocktake to {CutoffUtc:O}", remoteCutoffUtc.Value);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to apply remote POS sync cutoff");
        }
    }
}
