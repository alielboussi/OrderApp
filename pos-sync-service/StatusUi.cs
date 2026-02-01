using System;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class StatusUi
{
    private readonly SyncRunner _syncRunner;
    private readonly PosRepository _repository;
    private readonly SyncOptions _syncOptions;

    public StatusUi(SyncRunner syncRunner,
                    PosRepository repository,
                    IOptions<SyncOptions> syncOptions,
                    ILogger<StatusUi> logger)
    {
        _syncRunner = syncRunner;
        _repository = repository;
        _syncOptions = syncOptions.Value;
        _ = logger;
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        Console.WriteLine("XtZ POS -> Supabase sync status");
        Console.WriteLine(new string('-', 38));
        Console.WriteLine($"Syncing pending sales (up to {_syncOptions.BatchSize})...");

        var syncResult = await _syncRunner.RunOnceAsync(cancellationToken);
        Console.WriteLine($"Synced {syncResult.ProcessedCount} sale(s).");

        if (syncResult.Failures.Count > 0)
        {
            Console.WriteLine("Failures:");
            foreach (var failure in syncResult.Failures.Take(5))
            {
                Console.WriteLine($" - {failure.PosOrderId}: {failure.Error ?? "Unknown error"}");
            }
        }
        else
        {
            Console.WriteLine("No failures detected during this run.");
        }

        Console.WriteLine();
        Console.WriteLine("Last 5 sent sales:");

        var recent = await _repository.ReadRecentProcessedAsync(5, cancellationToken);
        if (recent.Count == 0)
        {
            Console.WriteLine("No processed sales found yet.");
            return;
        }

        foreach (var sale in recent)
        {
            var amount = sale.PaymentAmount.HasValue
                ? sale.PaymentAmount.Value.ToString("0.00", CultureInfo.InvariantCulture)
                : "-";
            var occurred = sale.OccurredAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
            var type = string.IsNullOrWhiteSpace(sale.PaymentType) ? "Unknown" : sale.PaymentType;

            Console.WriteLine($"{occurred} • Sale {sale.SaleId} (Bill {sale.BillId}) • {type} • {amount}");
        }

        Console.WriteLine();
        Console.WriteLine("Done.");
        Console.WriteLine("Press Enter to close...");
        Console.ReadLine();
    }
}
