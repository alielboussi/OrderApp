namespace PosSyncService.Models;

public sealed record OutletSyncContext(
    bool HasPosMiddleware,
    bool UsesOrdersApp,
    DateTime? SyncOpeningUtc,
    DateTime? SyncCutoffUtc,
    string? WarehouseId,
    string? WarehouseName
);
