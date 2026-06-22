using System.IO;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class PosSyncWorker(IOptions<SyncOptions> syncOptions,
                                  SyncRunner syncRunner,
                                  IHostEnvironment hostEnvironment,
                                  ILogger<PosSyncWorker> logger) : BackgroundService
{
    private readonly SyncOptions _syncOptions = syncOptions.Value;
    private readonly SyncRunner _syncRunner = syncRunner;
    private readonly ILogger<PosSyncWorker> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var logPath = Path.Combine(hostEnvironment.ContentRootPath, "log.txt");
        _logger.LogInformation(
            "POS sync worker starting with poll interval {PollSeconds}s; log file {LogPath}",
            _syncOptions.PollSeconds,
            logPath);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var result = await _syncRunner.RunOnceAsync(stoppingToken);
                if (result.Failures.Count > 0)
                {
                    foreach (var failure in result.Failures)
                    {
                        _logger.LogError(
                            "Sync failure order={OrderId}: {Error}",
                            failure.PosOrderId,
                            failure.Error ?? "Unknown error");
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
