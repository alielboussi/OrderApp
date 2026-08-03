using PosSyncService.Models;

namespace PosSyncService;

/// <summary>
/// Cloud backend for SCPGT — Supabase RPCs today, Firebase/Firestore in phased migration.
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

    Task<SupabaseResult> SendOrderAsync(PosOrder order, CancellationToken cancellationToken);

    Task<string[]> GetOutletWarehouseIdsAsync(Guid outletId, CancellationToken cancellationToken);

    Task<SupabaseClient.WarehouseRow?> GetWarehouseAsync(string warehouseId, CancellationToken cancellationToken);

    Task<OutletSyncContext?> GetOutletSyncContextAsync(CancellationToken cancellationToken);

    Task<DateTime?> GetPosSyncCutoffUtcAsync(CancellationToken cancellationToken);

    Task<DateTime?> GetPosSyncOpeningUtcAsync(CancellationToken cancellationToken);

    Task<DateTime?> GetLastHeartbeatUtcAsync(CancellationToken cancellationToken);

    Task<SupabaseResult> PatchOrderPayloadAsync(PosOrder order, CancellationToken cancellationToken);

    Task SendHeartbeatAsync(HeartbeatMetrics? metrics, CancellationToken cancellationToken);

    Task<IReadOnlyList<CatalogSyncEvent>> FetchPendingCatalogSyncAsync(CancellationToken cancellationToken);

    Task MarkCatalogSyncDeliveredAsync(IEnumerable<Guid> eventIds, CancellationToken cancellationToken);

    Task<SupabaseResult> SyncPosCatalogSkuMapAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        bool syncProducts,
        bool syncVariants,
        CancellationToken cancellationToken);

    Task<SupabaseResult> SyncOutletPosCatalogBindingsAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        CancellationToken cancellationToken);

    Task<SupabaseResult> SyncPosMenuGroupsAsync(
        IReadOnlyList<PosMenuGroupMapRow> rows,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<string>> FetchOrdersMissingShiftAsync(int limit, CancellationToken cancellationToken);

    Task<IReadOnlyList<CashierSyncEvent>> FetchPendingCashierSyncAsync(CancellationToken cancellationToken);

    Task MarkCashierSyncDeliveredAsync(IEnumerable<Guid> eventIds, CancellationToken cancellationToken);

    Task MarkCashierSyncFailedAsync(Guid eventId, string errorMessage, CancellationToken cancellationToken);

    Task<SupabaseResult> CompleteCashierInsertSyncAsync(Guid cashierId, int posUserId, CancellationToken cancellationToken);

    Task<SupabaseResult> CompleteCashierDeleteSyncAsync(Guid cashierId, CancellationToken cancellationToken);

    Task<SupabaseResult> UpsertOutletCashiersFromPosAsync(
        IReadOnlyList<PosCashierRow> rows,
        CancellationToken cancellationToken);
}
