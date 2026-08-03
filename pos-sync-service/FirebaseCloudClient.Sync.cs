using System.Text.Json;
using System.Text.Json.Serialization;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Logging;
using PosSyncService.Models;

namespace PosSyncService;

public sealed partial class FirebaseCloudClient
{
    private static readonly JsonSerializerOptions FirestoreJsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private async Task<DateTime?> ReadCounterUtcAsync(string fieldName, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return null;
        }

        var snapshot = await _firestore.Database
            .Collection("outlet_counters")
            .Document(_outlet.Id.ToString())
            .GetSnapshotAsync(cancellationToken);

        if (!snapshot.Exists || !snapshot.ContainsField(fieldName))
        {
            return null;
        }

        var lastValue = snapshot.GetValue<long?>(fieldName);
        if (!lastValue.HasValue || lastValue.Value < 0)
        {
            return null;
        }

        return DateTimeOffset.FromUnixTimeSeconds(lastValue.Value).UtcDateTime;
    }

    public Task<DateTime?> GetPosSyncCutoffUtcAsync(CancellationToken cancellationToken) =>
        ReadCounterUtcAsync("posSyncCutoffLastValue", cancellationToken);

    public Task<DateTime?> GetPosSyncOpeningUtcAsync(CancellationToken cancellationToken) =>
        ReadCounterUtcAsync("posSyncOpeningLastValue", cancellationToken);

    public async Task<IReadOnlyList<CatalogSyncEvent>> FetchPendingCatalogSyncAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return Array.Empty<CatalogSyncEvent>();
        }

        try
        {
            var outletId = _outlet.Id.ToString();
            var snapshot = await _firestore.Database
                .Collection("outlet_catalog_sync_events")
                .WhereEqualTo("outletId", outletId)
                .WhereEqualTo("status", "pending")
                .OrderBy("createdAt")
                .Limit(200)
                .GetSnapshotAsync(cancellationToken);

            var events = new List<CatalogSyncEvent>();
            foreach (var doc in snapshot.Documents)
            {
                if (!Guid.TryParse(doc.Id, out var eventId))
                {
                    continue;
                }

                var entityType = doc.ContainsField("entityType") ? doc.GetValue<string>("entityType") : null;
                var entityId = doc.ContainsField("entityId") ? doc.GetValue<string>("entityId") ?? string.Empty : string.Empty;
                var payload = doc.ContainsField("payload")
                    ? PayloadFromFirestore<CatalogSyncPayload>(doc.GetValue<Dictionary<string, object>>("payload"))
                    : new CatalogSyncPayload();

                events.Add(new CatalogSyncEvent(eventId, entityType, entityId, payload));
            }

            return events;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch catalog sync events from Firestore");
            return Array.Empty<CatalogSyncEvent>();
        }
    }

    public async Task MarkCatalogSyncDeliveredAsync(IEnumerable<Guid> eventIds, CancellationToken cancellationToken)
    {
        var ids = eventIds.ToArray();
        if (ids.Length == 0)
        {
            return;
        }

        var now = Timestamp.FromDateTime(DateTime.UtcNow);
        var batch = _firestore.Database.StartBatch();
        foreach (var id in ids)
        {
            var docRef = _firestore.Database.Collection("outlet_catalog_sync_events").Document(id.ToString());
            batch.Set(
                docRef,
                new Dictionary<string, object>
                {
                    ["status"] = "delivered",
                    ["deliveredAt"] = now,
                    ["errorMessage"] = FieldValue.Delete,
                },
                SetOptions.MergeAll);
        }

        await batch.CommitAsync(cancellationToken);
    }

    public async Task<SupabaseResult> SyncPosCatalogSkuMapAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        bool syncProducts,
        bool syncVariants,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0)
        {
            return new SupabaseResult(true);
        }

        try
        {
            var now = Timestamp.FromDateTime(DateTime.UtcNow);
            var batch = _firestore.Database.StartBatch();
            var itemRefs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var row in rows)
            {
                if (syncProducts && !string.IsNullOrWhiteSpace(row.ItemSku))
                {
                    var itemRef = _firestore.Database.Collection("catalog_items").Document(row.ItemSku.Trim());
                    if (itemRefs.Add(itemRef.Id))
                    {
                        batch.Set(
                            itemRef,
                            new Dictionary<string, object>
                            {
                                ["itemSku"] = row.ItemSku.Trim(),
                                ["name"] = row.ItemName.Trim(),
                                ["active"] = true,
                                ["updatedAt"] = now,
                            },
                            SetOptions.MergeAll);
                    }
                }

                if (syncVariants && !string.IsNullOrWhiteSpace(row.VariantSku))
                {
                    var variantRef = _firestore.Database.Collection("catalog_variants").Document(row.VariantSku.Trim());
                    batch.Set(
                        variantRef,
                        new Dictionary<string, object>
                        {
                            ["variantSku"] = row.VariantSku.Trim(),
                            ["itemSku"] = row.ItemSku.Trim(),
                            ["name"] = row.VariantName.Trim(),
                            ["active"] = true,
                            ["updatedAt"] = now,
                        },
                        SetOptions.MergeAll);
                }
            }

            await batch.CommitAsync(cancellationToken);
            return new SupabaseResult(true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync POS catalog SKU map to Firestore");
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task<SupabaseResult> SyncOutletPosCatalogBindingsAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0 || _outlet.Id == Guid.Empty)
        {
            return new SupabaseResult(true);
        }

        try
        {
            var outletId = _outlet.Id.ToString();
            var now = Timestamp.FromDateTime(DateTime.UtcNow);
            var batch = _firestore.Database.StartBatch();

            foreach (var row in rows)
            {
                if (string.IsNullOrWhiteSpace(row.ItemSku))
                {
                    continue;
                }

                var variantPart = string.IsNullOrWhiteSpace(row.VariantSku) ? "base" : row.VariantSku.Trim();
                var bindingId = $"{row.ItemSku.Trim()}__{variantPart}";
                var bindingRef = _firestore.Database
                    .Collection("outlet_catalog_bindings")
                    .Document(outletId)
                    .Collection("skus")
                    .Document(bindingId);

                batch.Set(
                    bindingRef,
                    new Dictionary<string, object>
                    {
                        ["outletId"] = outletId,
                        ["itemSku"] = row.ItemSku.Trim(),
                        ["variantSku"] = row.VariantSku?.Trim() ?? "",
                        ["posItemName"] = row.ItemName.Trim(),
                        ["posVariantName"] = row.VariantName.Trim(),
                        ["updatedAt"] = now,
                    },
                    SetOptions.MergeAll);
            }

            await batch.CommitAsync(cancellationToken);
            return new SupabaseResult(true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync outlet catalog bindings to Firestore");
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task<SupabaseResult> SyncPosMenuGroupsAsync(
        IReadOnlyList<PosMenuGroupMapRow> rows,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0)
        {
            return new SupabaseResult(true);
        }

        try
        {
            var now = Timestamp.FromDateTime(DateTime.UtcNow);
            var batch = _firestore.Database.StartBatch();
            var seen = new HashSet<int>();

            foreach (var row in rows)
            {
                if (!seen.Add(row.PosMenuGroupId))
                {
                    continue;
                }

                var groupRef = _firestore.Database
                    .Collection("catalog_menu_groups")
                    .Document(row.PosMenuGroupId.ToString());

                var data = new Dictionary<string, object>
                {
                    ["posMenuGroupId"] = row.PosMenuGroupId,
                    ["name"] = row.GroupName.Trim(),
                    ["updatedAt"] = now,
                };

                if (!string.IsNullOrWhiteSpace(row.ItemSku))
                {
                    data["itemSku"] = row.ItemSku.Trim();
                }

                batch.Set(groupRef, data, SetOptions.MergeAll);
            }

            await batch.CommitAsync(cancellationToken);
            return new SupabaseResult(true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync menu groups to Firestore");
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task<IReadOnlyList<CashierSyncEvent>> FetchPendingCashierSyncAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return Array.Empty<CashierSyncEvent>();
        }

        try
        {
            var outletId = _outlet.Id.ToString();
            var snapshot = await _firestore.Database
                .Collection("outlet_cashier_sync_events")
                .WhereEqualTo("outletId", outletId)
                .WhereEqualTo("status", "pending")
                .OrderBy("createdAt")
                .Limit(100)
                .GetSnapshotAsync(cancellationToken);

            var events = new List<CashierSyncEvent>();
            foreach (var doc in snapshot.Documents)
            {
                if (!Guid.TryParse(doc.Id, out var eventId))
                {
                    continue;
                }

                Guid? cashierId = null;
                if (doc.ContainsField("cashierId"))
                {
                    var cashierIdText = doc.GetValue<string>("cashierId");
                    if (Guid.TryParse(cashierIdText, out var parsedCashierId))
                    {
                        cashierId = parsedCashierId;
                    }
                }

                var action = doc.ContainsField("action") ? doc.GetValue<string>("action") ?? string.Empty : string.Empty;
                var payload = doc.ContainsField("payload")
                    ? PayloadFromFirestore<CashierSyncPayload>(doc.GetValue<Dictionary<string, object>>("payload"))
                    : new CashierSyncPayload();

                events.Add(new CashierSyncEvent(eventId, cashierId, action, payload));
            }

            return events;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch cashier sync events from Firestore");
            return Array.Empty<CashierSyncEvent>();
        }
    }

    public async Task MarkCashierSyncDeliveredAsync(IEnumerable<Guid> eventIds, CancellationToken cancellationToken)
    {
        var ids = eventIds.ToArray();
        if (ids.Length == 0)
        {
            return;
        }

        var now = Timestamp.FromDateTime(DateTime.UtcNow);
        var batch = _firestore.Database.StartBatch();
        foreach (var id in ids)
        {
            var docRef = _firestore.Database.Collection("outlet_cashier_sync_events").Document(id.ToString());
            batch.Set(
                docRef,
                new Dictionary<string, object>
                {
                    ["status"] = "delivered",
                    ["deliveredAt"] = now,
                    ["errorMessage"] = FieldValue.Delete,
                },
                SetOptions.MergeAll);
        }

        await batch.CommitAsync(cancellationToken);
    }

    public async Task MarkCashierSyncFailedAsync(Guid eventId, string errorMessage, CancellationToken cancellationToken)
    {
        var docRef = _firestore.Database.Collection("outlet_cashier_sync_events").Document(eventId.ToString());
        await docRef.SetAsync(
            new Dictionary<string, object>
            {
                ["status"] = "failed",
                ["errorMessage"] = errorMessage.Length > 2000 ? errorMessage[..2000] : errorMessage,
            },
            SetOptions.MergeAll,
            cancellationToken);
    }

    public async Task<SupabaseResult> CompleteCashierInsertSyncAsync(
        Guid cashierId,
        int posUserId,
        CancellationToken cancellationToken)
    {
        try
        {
            var now = Timestamp.FromDateTime(DateTime.UtcNow);
            await _firestore.Database
                .Collection("outlet_cashiers")
                .Document(cashierId.ToString())
                .SetAsync(
                    new Dictionary<string, object>
                    {
                        ["posUserId"] = posUserId,
                        ["syncStatus"] = "synced",
                        ["lastSyncedAt"] = now,
                        ["updatedAt"] = now,
                    },
                    SetOptions.MergeAll,
                    cancellationToken);
            return new SupabaseResult(true);
        }
        catch (Exception ex)
        {
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task<SupabaseResult> CompleteCashierDeleteSyncAsync(Guid cashierId, CancellationToken cancellationToken)
    {
        try
        {
            var now = Timestamp.FromDateTime(DateTime.UtcNow);
            await _firestore.Database
                .Collection("outlet_cashiers")
                .Document(cashierId.ToString())
                .SetAsync(
                    new Dictionary<string, object>
                    {
                        ["active"] = false,
                        ["syncStatus"] = "deleted",
                        ["lastSyncedAt"] = now,
                        ["updatedAt"] = now,
                    },
                    SetOptions.MergeAll,
                    cancellationToken);
            return new SupabaseResult(true);
        }
        catch (Exception ex)
        {
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task<SupabaseResult> UpsertOutletCashiersFromPosAsync(
        IReadOnlyList<PosCashierRow> rows,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0 || _outlet.Id == Guid.Empty)
        {
            return new SupabaseResult(true);
        }

        try
        {
            var outletId = _outlet.Id.ToString();
            var now = Timestamp.FromDateTime(DateTime.UtcNow);
            var batch = _firestore.Database.StartBatch();

            foreach (var row in rows)
            {
                var docId = $"{outletId}_{row.PosUserId}";
                batch.Set(
                    _firestore.Database.Collection("outlet_cashiers").Document(docId),
                    new Dictionary<string, object>
                    {
                        ["outletId"] = outletId,
                        ["name"] = row.Name,
                        ["username"] = row.Username,
                        ["userType"] = row.UserType,
                        ["posUserId"] = row.PosUserId,
                        ["syncStatus"] = "synced",
                        ["active"] = true,
                        ["lastSyncedAt"] = now,
                        ["updatedAt"] = now,
                    },
                    SetOptions.MergeAll);
            }

            await batch.CommitAsync(cancellationToken);
            return new SupabaseResult(true);
        }
        catch (Exception ex)
        {
            return new SupabaseResult(false, ex.Message);
        }
    }

    private static T PayloadFromFirestore<T>(Dictionary<string, object> payload) where T : new()
    {
        if (payload.Count == 0)
        {
            return new T();
        }

        var json = JsonSerializer.Serialize(payload, FirestoreJsonOptions);
        return JsonSerializer.Deserialize<T>(json, FirestoreJsonOptions) ?? new T();
    }
}
