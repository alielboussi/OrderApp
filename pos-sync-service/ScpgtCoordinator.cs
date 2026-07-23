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
            return BuildSnapshot("Outlet Id is not configured.", "Update Outlet:Id in appsettings.json.", null, false, null);
        }

        var context = await _supabase.GetOutletSyncContextAsync(cancellationToken);
        if (context is null)
        {
            return BuildSnapshot("Unable to load outlet.", "Check Supabase URL/key and outlet id.", null, false, null);
        }

        if (string.IsNullOrWhiteSpace(context.WarehouseId))
        {
            return BuildSnapshot("No warehouse linked to this outlet.", "Check outlet_warehouses mapping.", context, false, null);
        }

        return await GetStatusAsync(cancellationToken, "Ready", "POS sync service is running.", context);
    }

    public async Task<ScpgtUiSnapshot> RunManualSyncAsync(CancellationToken cancellationToken)
    {
        var syncResult = await _syncRunner.RunOnceAsync(cancellationToken);
        var status = syncResult.Failures.Count > 0 ? "Sync completed with issues." : "Sync completed.";
        var detail =
            $"Uploaded {syncResult.ProcessedCount}, reconciled {syncResult.ReconciledCount}, lines repaired {syncResult.LinesRepairedCount}. Failures {syncResult.Failures.Count}.";

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
                false,
                null);
        }

        if (!context.HasPosMiddleware)
        {
            return BuildSnapshot(
                overrideTitle ?? "Middleware disabled.",
                overrideDetail ?? "Enable has_pos_middleware on this outlet in Supabase.",
                context,
                false,
                null);
        }

        var lastHeartbeatUtc = await _supabase.GetLastHeartbeatUtcAsync(cancellationToken);

        var syncActive = true;
        return BuildSnapshot(
            overrideTitle ?? "Sync active.",
            overrideDetail ?? "POS sales upload to Supabase (no stocktake window required).",
            context,
            overrideTitle is null,
            lastHeartbeatUtc);
    }

    private ScpgtUiSnapshot BuildSnapshot(
        string title,
        string detail,
        OutletSyncContext? context,
        bool shouldHideUi,
        DateTime? lastHeartbeatUtc)
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
            ? "Orders app outlet: Yes"
            : "Orders app outlet: No (sales audit only)";

        var minUtc = ConfigStore.LoadMinSaleDateUtc(_contentRoot);
        var maxUtc = ConfigStore.LoadMaxSaleDateUtc(_contentRoot);
        var syncWindowLabel = BuildConfiguredWindowLabel(context, minUtc, maxUtc);

        var lastSyncLabel = "Last website/supabase sync: Not yet";
        if (lastHeartbeatUtc.HasValue)
        {
            var local = DateTime.SpecifyKind(lastHeartbeatUtc.Value, DateTimeKind.Utc).ToLocalTime().ToString("g", CultureInfo.CurrentCulture);
            lastSyncLabel = $"Last website/supabase sync: {local}";
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
            return "Effective window: All pending sales";
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
