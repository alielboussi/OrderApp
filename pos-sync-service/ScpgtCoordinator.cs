using System;
using System.Globalization;
using System.Linq;
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
    private string? _warehouseId;
    private string? _warehouseName;
    private bool _closingRequested;
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
            return BuildSnapshot("Outlet Id is not configured.", "Update Outlet:Id in appsettings.txt.", null, false, false, false, false);
        }

        var linked = await _supabase.GetOutletWarehouseIdsAsync(_outlet.Id, cancellationToken);
        if (linked.Length == 0)
        {
            return BuildSnapshot("No warehouse linked to this outlet.", "Check outlet_warehouses mapping.", null, false, false, false, false);
        }

        if (linked.Length > 1)
        {
            _logger.LogInformation("Multiple warehouses linked to outlet {OutletId}; using {WarehouseId}", _outlet.Id, linked[0]);
        }

        _warehouseId = linked[0];
        var warehouse = await _supabase.GetWarehouseAsync(_warehouseId, cancellationToken);
        _warehouseName = warehouse?.Name ?? _warehouseId;

        return await GetStatusAsync(cancellationToken, "Ready", "Warehouse linked and ready.");
    }

    public void RequestClosing()
    {
        _closingRequested = true;
    }

    public async Task<ScpgtActionResult> StartPeriodAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_warehouseId))
        {
            return new ScpgtActionResult(false, "No warehouse mapping found for this outlet.");
        }

        var result = await _supabase.StartStockPeriodAsync(_warehouseId, cancellationToken);
        return result.IsSuccess
            ? new ScpgtActionResult(true, "Opening period started. Enter opening counts.")
            : new ScpgtActionResult(false, result.ErrorMessage ?? "Unable to start period.");
    }

    public async Task<ScpgtUiSnapshot> RunManualSyncAsync(CancellationToken cancellationToken)
    {
        var syncResult = await _syncRunner.RunOnceAsync(cancellationToken);
        _lastSyncAt = DateTimeOffset.UtcNow;
        _lastProcessed = syncResult.ProcessedCount;
        _lastFailures = syncResult.Failures.Count;

        var status = _lastFailures > 0 ? "Sync completed with issues." : "Sync completed.";
        var detail = $"Processed {_lastProcessed} orders. Failures {_lastFailures}.";

        return await GetStatusAsync(cancellationToken, status, detail);
    }

    public async Task<ScpgtUiSnapshot> GetStatusAsync(CancellationToken cancellationToken)
    {
        return await GetStatusAsync(cancellationToken, null, null);
    }

    private async Task<ScpgtUiSnapshot> GetStatusAsync(CancellationToken cancellationToken, string? overrideTitle, string? overrideDetail)
    {
        if (string.IsNullOrWhiteSpace(_warehouseId))
        {
            return BuildSnapshot("No warehouse mapping found.", "Configure outlet warehouse mapping.", null, false, false, false, _closingRequested);
        }

        var openPeriod = await _supabase.GetOpenStockPeriodAsync(_warehouseId, cancellationToken);
        if (openPeriod == null)
        {
            return BuildSnapshot(overrideTitle ?? "No open period.", overrideDetail ?? "Use Open Period to begin.", openPeriod, false, false, false, _closingRequested);
        }

        var hasOpening = await _supabase.HasStockCountsAsync(openPeriod.Id, "opening", cancellationToken);
        var hasClosing = await _supabase.HasStockCountsAsync(openPeriod.Id, "closing", cancellationToken);

        if (_closingRequested && hasClosing)
        {
            var closeResult = await _supabase.CloseStockPeriodAsync(openPeriod.Id, cancellationToken);
            if (!closeResult.IsSuccess)
            {
                return BuildSnapshot(
                    overrideTitle ?? "Close period failed.",
                    overrideDetail ?? (closeResult.ErrorMessage ?? "Unable to close period."),
                    openPeriod,
                    false,
                    hasOpening,
                    true,
                    _closingRequested
                );
            }

            var startResult = await _supabase.StartStockPeriodAsync(_warehouseId, cancellationToken);
            _closingRequested = false;

            if (!startResult.IsSuccess)
            {
                return BuildSnapshot(
                    overrideTitle ?? "Next period start failed.",
                    overrideDetail ?? (startResult.ErrorMessage ?? "Unable to start next period."),
                    openPeriod,
                    false,
                    true,
                    true,
                    _closingRequested
                );
            }

            return BuildSnapshot(
                overrideTitle ?? "Closing saved. Next period opened.",
                overrideDetail ?? "Opening counts are required for the new period.",
                openPeriod,
                true,
                true,
                true,
                _closingRequested
            );
        }

        if (_closingRequested)
        {
            return BuildSnapshot(
                overrideTitle ?? "Waiting for closing counts.",
                overrideDetail ?? "Enter closing counts, then wait for sync.",
                openPeriod,
                false,
                hasOpening,
                hasClosing,
                _closingRequested
            );
        }

        if (hasOpening)
        {
            return BuildSnapshot(
                overrideTitle ?? "Opening counts saved.",
                overrideDetail ?? "Sync is active.",
                openPeriod,
                true,
                true,
                hasClosing,
                _closingRequested
            );
        }

        return BuildSnapshot(
            overrideTitle ?? "Opening counts pending.",
            overrideDetail ?? "Enter opening counts to begin sync.",
            openPeriod,
            false,
            false,
            hasClosing,
            _closingRequested
        );
    }

    private ScpgtUiSnapshot BuildSnapshot(
        string title,
        string detail,
        WarehousePeriodRow? period,
        bool shouldHideUi,
        bool hasOpening,
        bool hasClosing,
        bool closingRequested)
    {
        var warehouseLabel = string.IsNullOrWhiteSpace(_warehouseName) ? "Warehouse: Unknown" : "Warehouse: " + _warehouseName;
        var periodLabel = period == null
            ? "Period: None"
            : "Period: Open since " + period.OpenedAt.ToLocalTime().ToString("g", CultureInfo.CurrentCulture);

        var openingLabel = hasOpening ? "Opening counts: Saved" : "Opening counts: Pending";
        var closingLabel = hasClosing ? "Closing counts: Saved" : "Closing counts: Pending";
        var closingLabelStatus = closingRequested ? "Closing requested: Yes" : "Closing requested: No";

        var minUtc = ConfigStore.LoadMinSaleDateUtc(_contentRoot);
        var maxUtc = ConfigStore.LoadMaxSaleDateUtc(_contentRoot);
        var syncWindowLabel = BuildSyncWindowLabel(minUtc, maxUtc);

        var lastSyncLabel = "Last sync: Not yet";
        if (_lastSyncAt.HasValue)
        {
            var local = _lastSyncAt.Value.ToLocalTime().ToString("g", CultureInfo.CurrentCulture);
            lastSyncLabel = $"Last sync: {local} | Processed {_lastProcessed} | Failures {_lastFailures}";
        }

        var canOpen = period == null;
        var canClose = period != null;

        return new ScpgtUiSnapshot(
            title,
            detail,
            warehouseLabel,
            periodLabel,
            openingLabel,
            closingLabel,
            closingLabelStatus,
            syncWindowLabel,
            lastSyncLabel,
            shouldHideUi,
            canOpen,
            canClose
        );
    }

    private static string BuildSyncWindowLabel(DateTime? minUtc, DateTime? maxUtc)
    {
        if (!minUtc.HasValue && !maxUtc.HasValue)
        {
            return "Sync window: All sales";
        }

        var minLabel = minUtc.HasValue
            ? DateTime.SpecifyKind(minUtc.Value, DateTimeKind.Utc).ToLocalTime().ToString("g", CultureInfo.CurrentCulture)
            : "Beginning";
        var maxLabel = maxUtc.HasValue
            ? DateTime.SpecifyKind(maxUtc.Value, DateTimeKind.Utc).ToLocalTime().ToString("g", CultureInfo.CurrentCulture)
            : "Now";

        return $"Sync window: {minLabel} - {maxLabel}";
    }
}

public sealed record ScpgtUiSnapshot(
    string Title,
    string Detail,
    string WarehouseLabel,
    string PeriodLabel,
    string OpeningLabel,
    string ClosingLabel,
    string ClosingRequestedLabel,
    string SyncWindowLabel,
    string LastSyncLabel,
    bool ShouldHideUi,
    bool CanOpenPeriod,
    bool CanClosePeriod
);

public sealed record ScpgtActionResult(bool Ok, string Message);
