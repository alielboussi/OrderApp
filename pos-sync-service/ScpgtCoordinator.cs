using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class ScpgtCoordinator
{
    private readonly SupabaseClient _supabase;
    private readonly SyncRunner _syncRunner;
    private readonly OutletOptions _outlet;
    private readonly ILogger<ScpgtCoordinator> _logger;
    private readonly string _contentRoot;
    private DateTimeOffset? _lastSyncAt;
    private int _lastProcessed;
    private int _lastFailures;

    public ScpgtCoordinator(SupabaseClient supabase,
                             SyncRunner syncRunner,
                             IOptions<OutletOptions> outlet,
                             IHostEnvironment hostEnvironment,
                             ILogger<ScpgtCoordinator> logger)
    {
        _supabase = supabase;
        _syncRunner = syncRunner;
        _outlet = outlet.Value;
        _contentRoot = hostEnvironment.ContentRootPath;
        _logger = logger;
    }

    public async Task<ScpgtUiSnapshot> InitializeAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return BuildSnapshot("Outlet Id is not configured.", "Update Outlet:Id in appsettings.json.", null, false);
        }

        var context = await _supabase.GetOutletSyncContextAsync(cancellationToken);
        if (context is null)
        {
            return BuildSnapshot("Unable to load outlet.", "Check Supabase URL/key and outlet id.", null, false);
        }

        if (string.IsNullOrWhiteSpace(context.WarehouseId))
        {
            return BuildSnapshot("No warehouse linked to this outlet.", "Check outlet_warehouses mapping.", context, false);
        }

        return await GetStatusAsync(cancellationToken, "Ready", "POS sync service is running.", context);
    }

    public async Task<ScpgtUiSnapshot> RunManualSyncAsync(CancellationToken cancellationToken)
    {
        var syncResult = await _syncRunner.RunOnceAsync(cancellationToken);
        _lastSyncAt = DateTimeOffset.UtcNow;
        _lastProcessed = syncResult.ProcessedCount;
        _lastFailures = syncResult.Failures.Count;

        var status = _lastFailures > 0 ? "Sync completed with issues." : "Sync completed.";
        var detail = $"Processed {_lastProcessed} orders. Failures {_lastFailures}.";

        return await GetStatusAsync(cancellationToken, status, detail, null);
    }

    public async Task<ScpgtUiSnapshot> GetStatusAsync(CancellationToken cancellationToken)
    {
        return await GetStatusAsync(cancellationToken, null, null, null);
    }

    private async Task<ScpgtUiSnapshot> GetStatusAsync(
        CancellationToken cancellationToken,
        string? overrideTitle,
        string? overrideDetail,
        OutletSyncContext? cachedContext)
    {
        var context = cachedContext ?? await _supabase.GetOutletSyncContextAsync(cancellationToken);
        if (context is null)
        {
            return BuildSnapshot(
                overrideTitle ?? "Unable to load outlet.",
                overrideDetail ?? "Check Supabase configuration.",
                null,
                false);
        }

        if (!context.HasPosMiddleware)
        {
            return BuildSnapshot(
                overrideTitle ?? "Middleware disabled.",
                overrideDetail ?? "Enable has_pos_middleware on this outlet in Supabase.",
                context,
                false);
        }

        if (!context.SyncOpeningUtc.HasValue)
        {
            return BuildSnapshot(
                overrideTitle ?? "Waiting for stocktake period.",
                overrideDetail ?? "Open a period in Afterten Orders → Outlet Stocktake.",
                context,
                false);
        }

        SupabaseClient.WarehousePeriodRow? openPeriod = null;
        if (!string.IsNullOrWhiteSpace(context.WarehouseId))
        {
            openPeriod = await _supabase.GetOpenStockPeriodAsync(context.WarehouseId, cancellationToken);
        }

        var syncActive = openPeriod is not null;
        return BuildSnapshot(
            overrideTitle ?? (syncActive ? "Sync active." : "No open stocktake period."),
            overrideDetail ?? (syncActive
                ? "Sales upload uses the POS sync window from stocktake open/close."
                : "Start Outlet Stocktake in the Android app."),
            context,
            syncActive && overrideTitle is null);
    }

    private ScpgtUiSnapshot BuildSnapshot(
        string title,
        string detail,
        OutletSyncContext? context,
        bool shouldHideUi)
    {
        var warehouseLabel = context?.WarehouseName is { Length: > 0 } name
            ? "Warehouse: " + name
            : "Warehouse: Unknown";

        var periodLabel = context?.SyncOpeningUtc is { } opening
            ? "POS sync from: " + DateTime.SpecifyKind(opening, DateTimeKind.Utc).ToLocalTime().ToString("g", CultureInfo.CurrentCulture)
            : "POS sync from: Not set";

        var cutoffLabel = context?.SyncCutoffUtc is { } cutoff
            ? "Last cutoff: " + DateTime.SpecifyKind(cutoff, DateTimeKind.Utc).ToLocalTime().ToString("g", CultureInfo.CurrentCulture)
            : "Last cutoff: None";

        var ordersAppLabel = context?.UsesOrdersApp == true
            ? "Orders app outlet: Yes (POS deductions enabled)"
            : "Orders app outlet: No (sales audit only)";

        var minUtc = ConfigStore.LoadMinSaleDateUtc(_contentRoot);
        var maxUtc = ConfigStore.LoadMaxSaleDateUtc(_contentRoot);
        var syncWindowLabel = BuildConfiguredWindowLabel(context, minUtc, maxUtc);

        var lastSyncLabel = "Last sync: Not yet";
        if (_lastSyncAt.HasValue)
        {
            var local = _lastSyncAt.Value.ToLocalTime().ToString("g", CultureInfo.CurrentCulture);
            lastSyncLabel = $"Last sync: {local} | Processed {_lastProcessed} | Failures {_lastFailures}";
        }

        return new ScpgtUiSnapshot(
            title,
            detail,
            warehouseLabel,
            periodLabel,
            cutoffLabel,
            ordersAppLabel,
            syncWindowLabel,
            lastSyncLabel,
            shouldHideUi
        );
    }

    private static string BuildConfiguredWindowLabel(OutletSyncContext? context, DateTime? minUtc, DateTime? maxUtc)
    {
        var (effectiveMin, effectiveMax) = PosSyncWindow.Compute(
            context?.SyncOpeningUtc,
            context?.SyncCutoffUtc,
            minUtc,
            maxUtc);

        if (!effectiveMin.HasValue && !effectiveMax.HasValue)
        {
            return "Effective window: Waiting for stocktake open";
        }

        var minLabel = effectiveMin.HasValue
            ? DateTime.SpecifyKind(effectiveMin.Value, DateTimeKind.Utc).ToLocalTime().ToString("g", CultureInfo.CurrentCulture)
            : "Beginning";
        var maxLabel = effectiveMax.HasValue
            ? DateTime.SpecifyKind(effectiveMax.Value, DateTimeKind.Utc).ToLocalTime().ToString("g", CultureInfo.CurrentCulture)
            : "Now";

        return $"Effective window: {minLabel} – {maxLabel}";
    }
}

public sealed record ScpgtUiSnapshot(
    string Title,
    string Detail,
    string WarehouseLabel,
    string PeriodLabel,
    string CutoffLabel,
    string OrdersAppLabel,
    string SyncWindowLabel,
    string LastSyncLabel,
    bool ShouldHideUi
);
