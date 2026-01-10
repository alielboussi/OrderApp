using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;
using System.Linq;

namespace PosSyncService;

public sealed class PosSyncWorker(IOptions<SyncOptions> syncOptions,
                                  PosRepository repository,
                                  SupabaseClient supabaseClient,
                                  ILogger<PosSyncWorker> logger) : BackgroundService
{
    private readonly SyncOptions _syncOptions = syncOptions.Value;
    private readonly PosRepository _repository = repository;
    private readonly SupabaseClient _supabaseClient = supabaseClient;
    private readonly ILogger<PosSyncWorker> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("POS sync worker starting with poll interval {PollSeconds}s", _syncOptions.PollSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var pending = await _repository.ReadPendingOrdersAsync(_syncOptions.BatchSize, stoppingToken);
                if (pending.Count == 0)
                {
                    await Task.Delay(TimeSpan.FromSeconds(_syncOptions.PollSeconds), stoppingToken);
                    continue;
                }

                foreach (var order in pending)
                {
                    var result = await _supabaseClient.SendOrderAsync(order, stoppingToken);
                    if (result.IsSuccess)
                    {
                        await _repository.MarkOrderProcessedAsync(order.PosOrderId, order.PosSaleId, stoppingToken);
                        var inventoryIds = order.Inventory.Select(ic => ic.PosId).ToArray();
                        if (inventoryIds.Length > 0)
                        {
                            await _repository.MarkInventoryProcessedAsync(inventoryIds, stoppingToken);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("Failed to sync order {OrderId}: {Error}", order.PosOrderId, result.ErrorMessage);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during sync loop");
            }

            await Task.Delay(TimeSpan.FromSeconds(_syncOptions.PollSeconds), stoppingToken);
        }

        _logger.LogInformation("POS sync worker stopping");
    }
}
