using System.Data;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class PosCatalogRepository
{
    private readonly PosDbOptions _options;
    private readonly ILogger<PosCatalogRepository> _logger;

    public PosCatalogRepository(IOptions<PosDbOptions> options, ILogger<PosCatalogRepository> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    private string ConnectionString => _options.GetEffectiveConnectionString();

    public async Task ApplyCatalogEventAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        switch (evt.EntityType?.ToLowerInvariant())
        {
            case "item":
                await UpsertMenuItemAsync(evt, cancellationToken);
                break;
            case "variant":
                await UpsertVariantAsync(evt, cancellationToken);
                break;
            case "price":
                await UpdatePriceAsync(evt, cancellationToken);
                break;
            case "delete":
                await DeleteCatalogEntityAsync(evt, cancellationToken);
                break;
            default:
                _logger.LogWarning("Unknown catalog sync entity type: {Type}", evt.EntityType);
                break;
        }
    }

    private Task DeleteCatalogEntityAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        return DeleteCatalogEntityCoreAsync(evt, cancellationToken);
    }

    private async Task DeleteCatalogEntityCoreAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        var deleteType = (evt.Payload.DeleteType ?? string.Empty).Trim().ToLowerInvariant();
        var itemSkus = NormalizeSkus(evt.Payload.ItemSkus, null, evt.Payload.ItemSku, evt.Payload.Sku);
        var variantSkus = NormalizeSkus(evt.Payload.VariantSkus, evt.Payload.AllVariantSkus, evt.Payload.VariantSku);

        if (deleteType != "variant" && deleteType != "item")
        {
            deleteType = variantSkus.Count > 0 && itemSkus.Count == 0 ? "variant" : "item";
        }

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(cancellationToken);

        try
        {
            if (deleteType == "variant")
            {
                if (variantSkus.Count == 0)
                {
                    _logger.LogWarning("Delete variant event {EventId} has no variant SKUs.", evt.Id);
                    await tx.CommitAsync(cancellationToken);
                    return;
                }

                await ExecuteDeleteBySkusAsync(
                    conn,
                    tx,
                    "DELETE FROM dbo.SaleDetails WHERE FlavourId IN ({0});",
                    "@flavourSku",
                    variantSkus,
                    cancellationToken
                );

                await ExecuteDeleteBySkusAsync(
                    conn,
                    tx,
                    "DELETE FROM dbo.ModifierFlavour WHERE Id IN ({0});",
                    "@variantSku",
                    variantSkus,
                    cancellationToken
                );
            }
            else
            {
                if (itemSkus.Count == 0)
                {
                    _logger.LogWarning("Delete item event {EventId} has no item SKUs.", evt.Id);
                    await tx.CommitAsync(cancellationToken);
                    return;
                }

                if (variantSkus.Count > 0)
                {
                    await ExecuteDeleteBySkusAsync(
                        conn,
                        tx,
                        "DELETE FROM dbo.SaleDetails WHERE FlavourId IN ({0});",
                        "@flavourSku",
                        variantSkus,
                        cancellationToken
                    );

                    await ExecuteDeleteBySkusAsync(
                        conn,
                        tx,
                        "DELETE FROM dbo.ModifierFlavour WHERE Id IN ({0});",
                        "@variantSku",
                        variantSkus,
                        cancellationToken
                    );
                }
                else
                {
                    await ExecuteDeleteBySkusAsync(
                        conn,
                        tx,
                        "DELETE FROM dbo.SaleDetails WHERE MenuItemId IN ({0});",
                        "@itemSku",
                        itemSkus,
                        cancellationToken
                    );
                }

                await ExecuteDeleteBySkusAsync(
                    conn,
                    tx,
                    "DELETE FROM dbo.MenuItem WHERE Id IN ({0});",
                    "@menuItemSku",
                    itemSkus,
                    cancellationToken
                );
            }

            await tx.CommitAsync(cancellationToken);
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private async Task UpsertMenuItemAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        var sku = evt.Payload.Sku ?? evt.EntityId;
        if (string.IsNullOrWhiteSpace(sku))
        {
            return;
        }

        const string updateSql = @"
UPDATE dbo.MenuItem
SET Name = COALESCE(@Name, Name),
    Code = @Sku,
    Price = COALESCE(@Price, Price),
    uploadstatus = 'Pending'
WHERE Code = @Sku OR Id = TRY_CAST(@PosItemId AS int);";

        const string insertSql = @"
INSERT INTO dbo.MenuItem (Code, Name, Price, Status, uploadstatus)
VALUES (@Sku, @Name, @Price, 'Active', 'Pending');";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var updateCmd = new SqlCommand(updateSql, conn);
        BindItemParams(updateCmd, evt, sku);
        var updated = await updateCmd.ExecuteNonQueryAsync(cancellationToken);

        if (updated == 0 && !string.IsNullOrWhiteSpace(evt.Payload.Name))
        {
            await using var insertCmd = new SqlCommand(insertSql, conn);
            BindItemParams(insertCmd, evt, sku);
            await insertCmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private async Task UpsertVariantAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        var variantSku = evt.Payload.VariantSku ?? evt.EntityId;
        var itemSku = evt.Payload.ItemSku;
        if (string.IsNullOrWhiteSpace(variantSku) || string.IsNullOrWhiteSpace(itemSku))
        {
            return;
        }

        const string sql = @"
UPDATE mf
SET mf.name = COALESCE(@VariantName, mf.name),
    mf.Name2 = @VariantSku,
    mf.price = COALESCE(@Price, mf.price),
    mf.UploadStatus = 'Pending'
FROM dbo.ModifierFlavour mf
JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
WHERE mi.Code = @ItemSku AND (mf.Name2 = @VariantSku OR mf.Id = TRY_CAST(@PosFlavourId AS int));";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ItemSku", itemSku);
        cmd.Parameters.AddWithValue("@VariantSku", variantSku);
        cmd.Parameters.AddWithValue("@VariantName", (object?)evt.Payload.VariantName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@Price", (object?)evt.Payload.Price ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@PosFlavourId", (object?)evt.Payload.PosFlavourId ?? DBNull.Value);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task UpdatePriceAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        if (evt.Payload.Price is null)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(evt.Payload.VariantSku) && !string.IsNullOrWhiteSpace(evt.Payload.ItemSku))
        {
            await UpsertVariantAsync(evt, cancellationToken);
            return;
        }

        await UpsertMenuItemAsync(evt, cancellationToken);
    }

    private static void BindItemParams(SqlCommand cmd, CatalogSyncEvent evt, string sku)
    {
        cmd.Parameters.AddWithValue("@Sku", sku);
        cmd.Parameters.AddWithValue("@Name", (object?)evt.Payload.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@Price", (object?)evt.Payload.Price ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@PosItemId", (object?)evt.Payload.PosItemId ?? DBNull.Value);
    }

    private static List<string> NormalizeSkus(IEnumerable<string?>? first, IEnumerable<string?>? second, params string?[] singletons)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        static void AddRange(HashSet<string> target, IEnumerable<string?>? source)
        {
            if (source is null) return;
            foreach (var entry in source)
            {
                if (string.IsNullOrWhiteSpace(entry)) continue;
                target.Add(entry.Trim());
            }
        }

        AddRange(set, first);
        AddRange(set, second);
        foreach (var single in singletons)
        {
            if (string.IsNullOrWhiteSpace(single)) continue;
            set.Add(single.Trim());
        }

        return set.ToList();
    }

    private static async Task ExecuteDeleteBySkusAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string sqlTemplate,
        string parameterPrefix,
        IReadOnlyList<string> skus,
        CancellationToken cancellationToken)
    {
        if (skus.Count == 0)
        {
            return;
        }

        var parameterNames = new string[skus.Count];
        await using var cmd = new SqlCommand(string.Empty, connection, transaction);
        for (var i = 0; i < skus.Count; i++)
        {
            var parameterName = $"{parameterPrefix}{i}";
            parameterNames[i] = parameterName;
            cmd.Parameters.Add(parameterName, SqlDbType.NVarChar, 128).Value = skus[i];
        }

        cmd.CommandText = string.Format(sqlTemplate, string.Join(", ", parameterNames));
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }
}

public sealed record CatalogSyncEvent(
    Guid Id,
    string? EntityType,
    string EntityId,
    CatalogSyncPayload Payload
);

public sealed class CatalogSyncPayload
{
    [JsonPropertyName("sku")]
    public string? Sku { get; init; }

    [JsonPropertyName("item_sku")]
    public string? ItemSku { get; init; }

    [JsonPropertyName("variant_sku")]
    public string? VariantSku { get; init; }

    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("variant_name")]
    public string? VariantName { get; init; }

    [JsonPropertyName("price")]
    public decimal? Price { get; init; }

    [JsonPropertyName("pos_item_id")]
    public string? PosItemId { get; init; }

    [JsonPropertyName("pos_flavour_id")]
    public string? PosFlavourId { get; init; }

    [JsonPropertyName("scheduled_at")]
    public DateTimeOffset? ScheduledAt { get; init; }

    [JsonPropertyName("delete_type")]
    public string? DeleteType { get; init; }

    [JsonPropertyName("item_skus")]
    public string[]? ItemSkus { get; init; }

    [JsonPropertyName("variant_skus")]
    public string[]? VariantSkus { get; init; }

    [JsonPropertyName("all_variant_skus")]
    public string[]? AllVariantSkus { get; init; }
}
