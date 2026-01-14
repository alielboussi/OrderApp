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
    private readonly SyncOptions _syncOptions;
    private readonly PosRepository _repository;
    private readonly SupabaseClient _supabaseClient;
    private readonly ILogger<SyncRunner> _logger;

    public SyncRunner(IOptions<SyncOptions> syncOptions,
                      PosRepository repository,
                      SupabaseClient supabaseClient,
                      ILogger<SyncRunner> logger)
    {
        _syncOptions = syncOptions.Value;
        _repository = repository;
        _supabaseClient = supabaseClient;
        _logger = logger;
    }

    public async Task<SyncRunResult> RunOnceAsync(CancellationToken cancellationToken)
    {
        var failures = new List<SyncFailure>();
        var processed = 0;

        var pending = await _repository.ReadPendingOrdersAsync(_syncOptions.BatchSize, cancellationToken);
        if (pending.Count == 0)
        {
            return new SyncRunResult(0, failures);
        }

        foreach (var order in pending)
        {
            try
            {
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
                }
            }
            catch (Exception ex)
            {
                var failure = new SyncFailure(order.PosOrderId, ex.Message);
                failures.Add(failure);
                _logger.LogError(ex, "Unexpected error syncing order {OrderId}", order.PosOrderId);
            }
        }

        return new SyncRunResult(processed, failures);
    }
}
