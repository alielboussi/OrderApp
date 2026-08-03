using PosSyncService.Models;

namespace PosSyncService;

/// <summary>
/// Cloud backend for SCPGT — Firebase/Firestore.
/// </summary>
public interface IOutletCloudClient
{
    Task<PosValidationResult> ValidateOrderAsync(PosOrder order, CancellationToken cancellationToken);

    Task LogFailureAsync(
        PosOrder order,
        string stage,
        string errorMessage,
        object? details,
        CancellationToken cancellationToken);

    Task ClearSyncFailureAsync(PosOrder order, CancellationToken cancellationToken);

    Task<bool> HasOutletSalesAsync(string sourceEventId, CancellationToken cancellationToken);

    Task<bool> OrderExistsAsync(string sourceEventId, CancellationToken cancellationToken);

    Task<Dictionary<string, PosOrderSyncState>> GetOrderSyncStatesAsync(
        IReadOnlyCollection<string> sourceEventIds,
        CancellationToken cancellationToken);

    Task<HashSet<string>> GetSourceEventIdsWithOutletSalesAsync(
        IReadOnlyCollection<string> sourceEventIds,
        CancellationToken cancellationToken);

    Task<HashSet<string>> GetExistingSourceEventIdsAsync(
        IReadOnlyCollection<string> sourceEventIds,
        CancellationToken cancellationToken);

    Task<CloudSyncResult> SendOrderAsync(PosOrder order, CancellationToken cancellationToken);

    Task<string[]> GetOutletWarehouseIdsAsync(Guid outletId, CancellationToken cancellationToken);

    Task<WarehouseRow?> GetWarehouseAsync(string warehouseId, CancellationToken cancellationToken);

    Task<OutletSyncContext?> GetOutletSyncContextAsync(CancellationToken cancellationToken);

    Task<DateTime?> GetPosSyncCutoffUtcAsync(CancellationToken cancellationToken);

    Task<DateTime?> GetPosSyncOpeningUtcAsync(CancellationToken cancellationToken);

    Task<DateTime?> GetLastHeartbeatUtcAsync(CancellationToken cancellationToken);

    Task<CloudSyncResult> PatchOrderPayloadAsync(PosOrder order, CancellationToken cancellationToken);

    Task SendHeartbeatAsync(HeartbeatMetrics? metrics, CancellationToken cancellationToken);

    Task<IReadOnlyList<CatalogSyncEvent>> FetchPendingCatalogSyncAsync(CancellationToken cancellationToken);

    Task MarkCatalogSyncDeliveredAsync(IEnumerable<Guid> eventIds, CancellationToken cancellationToken);

    Task<CloudSyncResult> SyncPosCatalogSkuMapAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        bool syncProducts,
        bool syncVariants,
        CancellationToken cancellationToken);

    Task<CloudSyncResult> SyncOutletPosCatalogBindingsAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        CancellationToken cancellationToken);

    Task<CloudSyncResult> SyncPosMenuGroupsAsync(
        IReadOnlyList<PosMenuGroupMapRow> rows,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<string>> FetchOrdersMissingShiftAsync(int limit, CancellationToken cancellationToken);

    Task<IReadOnlyList<CashierSyncEvent>> FetchPendingCashierSyncAsync(CancellationToken cancellationToken);

    Task MarkCashierSyncDeliveredAsync(IEnumerable<Guid> eventIds, CancellationToken cancellationToken);

    Task MarkCashierSyncFailedAsync(Guid eventId, string errorMessage, CancellationToken cancellationToken);

    Task<CloudSyncResult> CompleteCashierInsertSyncAsync(Guid cashierId, int posUserId, CancellationToken cancellationToken);

    Task<CloudSyncResult> CompleteCashierDeleteSyncAsync(Guid cashierId, CancellationToken cancellationToken);

    Task<CloudSyncResult> UpsertOutletCashiersFromPosAsync(
        IReadOnlyList<PosCashierRow> rows,
        CancellationToken cancellationToken);
}
