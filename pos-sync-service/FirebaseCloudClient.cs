using Google.Cloud.Firestore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

/// <summary>
/// Firestore / Cloud Functions backend for SCPGT (phased migration).
/// Step 3: heartbeat + outlet context implemented; sales sync follows in later steps.
/// </summary>
public sealed partial class FirebaseCloudClient : IOutletCloudClient
{
    private readonly FirebaseFirestoreAccess _firestore;
    private readonly OutletOptions _outlet;
    private readonly ILogger<FirebaseCloudClient> _logger;

    public FirebaseCloudClient(
        FirebaseFirestoreAccess firestore,
        IOptions<OutletOptions> outlet,
        ILogger<FirebaseCloudClient> logger)
    {
        _firestore = firestore;
        _outlet = outlet.Value;
        _logger = logger;
    }

    public async Task SendHeartbeatAsync(HeartbeatMetrics? metrics, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return;
        }

        var outletId = _outlet.Id.ToString();
        var now = Timestamp.FromDateTime(DateTime.UtcNow);
        var middlewareVersion = typeof(FirebaseCloudClient).Assembly.GetName().Version?.ToString() ?? "1.0";

        var heartbeat = new Dictionary<string, object>
        {
            ["outletId"] = outletId,
            ["lastSeenAt"] = now,
            ["middlewareVersion"] = middlewareVersion,
            ["hostName"] = Environment.MachineName,
            ["updatedAt"] = now,
        };

        if (metrics is not null)
        {
            heartbeat["pendingSalesCount"] = metrics.PendingSalesCount;
            if (!string.IsNullOrWhiteSpace(metrics.LastSyncError))
            {
                heartbeat["lastSyncError"] = metrics.LastSyncError;
            }
            else
            {
                heartbeat["lastSyncError"] = FieldValue.Delete;
            }

            if (metrics.LastSaleUploadedUtc.HasValue)
            {
                heartbeat["lastSaleUploadedAt"] = Timestamp.FromDateTime(metrics.LastSaleUploadedUtc.Value.UtcDateTime);
            }

            if (!string.IsNullOrWhiteSpace(metrics.BlockedBillId))
            {
                heartbeat["blockedBillId"] = metrics.BlockedBillId;
                heartbeat["blockedSourceEventId"] = metrics.BlockedSourceEventId ?? "";
            }
            else
            {
                heartbeat["blockedBillId"] = FieldValue.Delete;
                heartbeat["blockedSourceEventId"] = FieldValue.Delete;
            }
        }

        try
        {
            await _firestore.Database
                .Collection("outlet_heartbeats")
                .Document(outletId)
                .SetAsync(heartbeat, SetOptions.MergeAll, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send outlet heartbeat to Firestore for outlet {OutletId}", outletId);
        }
    }

    public async Task<OutletSyncContext?> GetOutletSyncContextAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return null;
        }

        var outletId = _outlet.Id.ToString();
        var snapshot = await _firestore.Database
            .Collection("outlets")
            .Document(outletId)
            .GetSnapshotAsync(cancellationToken);

        if (!snapshot.Exists)
        {
            _logger.LogWarning("Outlet {OutletId} not found in Firestore outlets collection.", outletId);
            return null;
        }

        var hasPosMiddleware = snapshot.ContainsField("hasPosMiddleware")
            && snapshot.GetValue<bool>("hasPosMiddleware");
        var usesOrdersApp = snapshot.ContainsField("usesOrdersApp")
            && snapshot.GetValue<bool>("usesOrdersApp");

        string? warehouseId = null;
        string? warehouseName = null;
        if (snapshot.ContainsField("warehouseIds"))
        {
            var warehouseIds = snapshot.GetValue<List<object>>("warehouseIds");
            warehouseId = warehouseIds?.FirstOrDefault()?.ToString();
        }

        if (!string.IsNullOrWhiteSpace(warehouseId) && snapshot.ContainsField("warehouseName"))
        {
            warehouseName = snapshot.GetValue<string>("warehouseName");
        }

        var opening = await GetPosSyncOpeningUtcAsync(cancellationToken);
        var cutoff = await GetPosSyncCutoffUtcAsync(cancellationToken);

        return new OutletSyncContext(
            HasPosMiddleware: hasPosMiddleware,
            UsesOrdersApp: usesOrdersApp,
            SyncOpeningUtc: opening,
            SyncCutoffUtc: cutoff,
            WarehouseId: warehouseId,
            WarehouseName: warehouseName);
    }

    private CollectionReference BillsCollection =>
        _firestore.Database.Collection("pos_sales").Document(_outlet.Id.ToString()).Collection("bills");

    private DocumentReference BillDocument(string sourceEventId) =>
        BillsCollection.Document(sourceEventId);

    public async Task<PosValidationResult> ValidateOrderAsync(PosOrder order, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return new PosValidationResult(false, "Outlet Id is not configured");
        }

        if (string.IsNullOrWhiteSpace(order.SourceEventId))
        {
            return new PosValidationResult(false, "source_event_id is required");
        }

        var states = await GetOrderSyncStatesAsync(new[] { order.SourceEventId }, cancellationToken);
        var state = states.GetValueOrDefault(order.SourceEventId);
        if (state is { HasOrderRow: true, HasOutletSales: true })
        {
            return new PosValidationResult(true, IsDuplicate: true);
        }

        if (order.Items.Count == 0)
        {
            return new PosValidationResult(true, IsEmptyBill: true);
        }

        return new PosValidationResult(true);
    }

    public async Task LogFailureAsync(
        PosOrder order,
        string stage,
        string errorMessage,
        object? details,
        CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return;
        }

        var docId = $"{_outlet.Id:N}_{order.SourceEventId}";
        var now = Timestamp.FromDateTime(DateTime.UtcNow);
        try
        {
            await _firestore.Database.Collection("pos_sync_failures").Document(docId).SetAsync(
                new Dictionary<string, object>
                {
                    ["outletId"] = _outlet.Id.ToString(),
                    ["sourceEventId"] = order.SourceEventId,
                    ["stage"] = stage,
                    ["errorMessage"] = errorMessage,
                    ["createdAt"] = now,
                },
                SetOptions.MergeAll,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to log sync failure to Firestore");
        }
    }

    public Task ClearSyncFailureAsync(PosOrder order, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return Task.CompletedTask;
        }

        var docId = $"{_outlet.Id:N}_{order.SourceEventId}";
        return _firestore.Database.Collection("pos_sync_failures").Document(docId)
            .DeleteAsync(cancellationToken: cancellationToken);
    }

    public async Task<bool> HasOutletSalesAsync(string sourceEventId, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty || string.IsNullOrWhiteSpace(sourceEventId))
        {
            return false;
        }

        var existing = await GetSourceEventIdsWithOutletSalesAsync(new[] { sourceEventId }, cancellationToken);
        return existing.Contains(sourceEventId);
    }

    public async Task<bool> OrderExistsAsync(string sourceEventId, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty || string.IsNullOrWhiteSpace(sourceEventId))
        {
            return false;
        }

        var existing = await GetExistingSourceEventIdsAsync(new[] { sourceEventId }, cancellationToken);
        return existing.Contains(sourceEventId);
    }

    public async Task<Dictionary<string, PosOrderSyncState>> GetOrderSyncStatesAsync(
        IReadOnlyCollection<string> sourceEventIds,
        CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, PosOrderSyncState>(StringComparer.OrdinalIgnoreCase);
        if (_outlet.Id == Guid.Empty || sourceEventIds.Count == 0)
        {
            return result;
        }

        var withLines = await GetSourceEventIdsWithOutletSalesAsync(sourceEventIds, cancellationToken);
        var withOrders = await GetExistingSourceEventIdsAsync(sourceEventIds, cancellationToken);

        foreach (var id in sourceEventIds.Where(id => !string.IsNullOrWhiteSpace(id)))
        {
            result[id] = new PosOrderSyncState(
                withOrders.Contains(id),
                withLines.Contains(id));
        }

        return result;
    }

    public async Task<HashSet<string>> GetSourceEventIdsWithOutletSalesAsync(
        IReadOnlyCollection<string> sourceEventIds,
        CancellationToken cancellationToken)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (_outlet.Id == Guid.Empty || sourceEventIds.Count == 0)
        {
            return result;
        }

        var distinct = sourceEventIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var chunk in Chunk(distinct, 100))
        {
            var refs = chunk.Select(id => BillDocument(id)).ToList();
            var snapshots = await _firestore.Database.GetAllSnapshotsAsync(refs, cancellationToken);
            foreach (var snapshot in snapshots)
            {
                if (!snapshot.Exists)
                {
                    continue;
                }

                var hasLines = snapshot.ContainsField("hasOutletSales") && snapshot.GetValue<bool>("hasOutletSales");
                if (!hasLines && snapshot.ContainsField("itemCount"))
                {
                    hasLines = snapshot.GetValue<int>("itemCount") > 0;
                }

                if (hasLines && snapshot.ContainsField("sourceEventId"))
                {
                    var id = snapshot.GetValue<string>("sourceEventId");
                    if (!string.IsNullOrWhiteSpace(id))
                    {
                        result.Add(id);
                    }
                }
            }
        }

        return result;
    }

    public async Task<HashSet<string>> GetExistingSourceEventIdsAsync(
        IReadOnlyCollection<string> sourceEventIds,
        CancellationToken cancellationToken)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (_outlet.Id == Guid.Empty || sourceEventIds.Count == 0)
        {
            return result;
        }

        var distinct = sourceEventIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var chunk in Chunk(distinct, 100))
        {
            var refs = chunk.Select(id => BillDocument(id)).ToList();
            var snapshots = await _firestore.Database.GetAllSnapshotsAsync(refs, cancellationToken);
            foreach (var snapshot in snapshots)
            {
                if (!snapshot.Exists)
                {
                    continue;
                }

                var id = snapshot.ContainsField("sourceEventId")
                    ? snapshot.GetValue<string>("sourceEventId")
                    : snapshot.Id;
                if (!string.IsNullOrWhiteSpace(id))
                {
                    result.Add(id);
                }
            }
        }

        return result;
    }

    public async Task<CloudSyncResult> SendOrderAsync(PosOrder order, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return new CloudSyncResult(false, "Outlet Id is not configured");
        }

        try
        {
            var outletId = _outlet.Id.ToString();
            var now = Timestamp.FromDateTime(DateTime.UtcNow);
            var rawPayload = FirebaseOrderPayload.BuildRawPayload(order, _outlet.Id);
            var billRef = BillDocument(order.SourceEventId);

            var billData = new Dictionary<string, object>
            {
                ["outletId"] = outletId,
                ["sourceEventId"] = order.SourceEventId,
                ["saleId"] = order.PosSaleId,
                ["posOrderId"] = order.PosOrderId,
                ["occurredAt"] = Timestamp.FromDateTime(order.OccurredAt.UtcDateTime),
                ["status"] = "synced",
                ["rawPayload"] = rawPayload,
                ["itemCount"] = order.Items.Count,
                ["hasOutletSales"] = order.Items.Count > 0,
                ["updatedAt"] = now,
            };

            if (order.Shift?.ShiftId is int shiftId)
            {
                billData["shiftId"] = shiftId;
            }
            else
            {
                billData["shiftId"] = FieldValue.Delete;
            }

            if (!string.IsNullOrWhiteSpace(order.Shift?.Terminal))
            {
                billData["terminalId"] = order.Shift!.Terminal!;
            }

            var batch = _firestore.Database.StartBatch();
            batch.Set(billRef, billData, SetOptions.MergeAll);

            foreach (var item in order.Items)
            {
                var lineId = string.IsNullOrWhiteSpace(item.PosItemId)
                    ? Guid.NewGuid().ToString("N")
                    : item.PosItemId;
                batch.Set(
                    billRef.Collection("lines").Document(lineId),
                    FirebaseOrderPayload.BuildLineDocument(item),
                    SetOptions.MergeAll);
            }

            await batch.CommitAsync(cancellationToken);
            return new CloudSyncResult(true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync order {SourceEventId} to Firestore", order.SourceEventId);
            return new CloudSyncResult(false, ex.Message);
        }
    }

    public async Task<string[]> GetOutletWarehouseIdsAsync(Guid outletId, CancellationToken cancellationToken)
    {
        var snapshot = await _firestore.Database
            .Collection("outlets")
            .Document(outletId.ToString())
            .GetSnapshotAsync(cancellationToken);
        if (!snapshot.Exists || !snapshot.ContainsField("warehouseIds"))
        {
            return Array.Empty<string>();
        }

        var ids = snapshot.GetValue<List<object>>("warehouseIds");
        return ids?.Select(id => id.ToString() ?? string.Empty).Where(id => id.Length > 0).ToArray()
            ?? Array.Empty<string>();
    }

    public Task<WarehouseRow?> GetWarehouseAsync(string warehouseId, CancellationToken cancellationToken) =>
        PilotNotReady<WarehouseRow?>(null);

    public async Task<DateTime?> GetLastHeartbeatUtcAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return null;
        }

        var snapshot = await _firestore.Database
            .Collection("outlet_heartbeats")
            .Document(_outlet.Id.ToString())
            .GetSnapshotAsync(cancellationToken);
        if (!snapshot.Exists || !snapshot.ContainsField("lastSeenAt"))
        {
            return null;
        }

        return snapshot.GetValue<Timestamp>("lastSeenAt").ToDateTime();
    }

    public async Task<CloudSyncResult> PatchOrderPayloadAsync(PosOrder order, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return new CloudSyncResult(false, "Outlet Id is not configured");
        }

        try
        {
            var billRef = BillDocument(order.SourceEventId);
            var snapshot = await billRef.GetSnapshotAsync(cancellationToken);
            if (!snapshot.Exists)
            {
                return new CloudSyncResult(true);
            }

            var rawPayload = FirebaseOrderPayload.BuildRawPayload(order, _outlet.Id);
            var updates = new Dictionary<string, object>
            {
                ["rawPayload"] = rawPayload,
                ["updatedAt"] = Timestamp.FromDateTime(DateTime.UtcNow),
            };

            if (order.Shift?.ShiftId is int shiftId)
            {
                updates["shiftId"] = shiftId;
            }

            if (!string.IsNullOrWhiteSpace(order.Shift?.Terminal))
            {
                updates["terminalId"] = order.Shift!.Terminal!;
            }

            await billRef.SetAsync(updates, SetOptions.MergeAll, cancellationToken);
            return new CloudSyncResult(true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to patch order payload for {SourceEventId}", order.SourceEventId);
            return new CloudSyncResult(false, ex.Message);
        }
    }

    public async Task<IReadOnlyList<string>> FetchOrdersMissingShiftAsync(int limit, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty || limit <= 0)
        {
            return Array.Empty<string>();
        }

        try
        {
            var fetchLimit = Math.Min(Math.Max(limit * 4, limit), 500);
            var snapshot = await BillsCollection
                .OrderByDescending("occurredAt")
                .Limit(fetchLimit)
                .GetSnapshotAsync(cancellationToken);

            var missing = new List<string>();
            foreach (var doc in snapshot.Documents)
            {
                var hasShift = doc.ContainsField("shiftId") && doc.GetValue<int?>("shiftId").HasValue;
                if (!hasShift)
                {
                    var sourceEventId = doc.ContainsField("sourceEventId")
                        ? doc.GetValue<string>("sourceEventId")
                        : doc.Id;
                    if (!string.IsNullOrWhiteSpace(sourceEventId))
                    {
                        missing.Add(sourceEventId);
                    }
                }

                if (missing.Count >= limit)
                {
                    break;
                }
            }

            return missing;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch orders missing shift from Firestore");
            return Array.Empty<string>();
        }
    }

    private static IEnumerable<T[]> Chunk<T>(IReadOnlyList<T> items, int size)
    {
        for (var i = 0; i < items.Count; i += size)
        {
            var length = Math.Min(size, items.Count - i);
            var chunk = new T[length];
            for (var j = 0; j < length; j++)
            {
                chunk[j] = items[i + j];
            }

            yield return chunk;
        }
    }

    private static Task<T> PilotNotReady<T>(T value) =>
        Task.FromResult(value);
}
