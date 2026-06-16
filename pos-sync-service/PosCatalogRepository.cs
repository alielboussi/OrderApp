using System.Data;
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
            default:
                _logger.LogWarning("Unknown catalog sync entity type: {Type}", evt.EntityType);
                break;
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

        await using var conn = new SqlConnection(_options.ConnectionString);
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

        await using var conn = new SqlConnection(_options.ConnectionString);
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
}
