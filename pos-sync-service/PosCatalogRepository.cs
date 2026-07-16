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
            case "menu_group":
                await UpsertMenuGroupAsync(evt, cancellationToken);
                break;
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

        if (deleteType != "variant" && deleteType != "item" && deleteType != "menu_group")
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

            // Match upsert keys: ModifierFlavour.Name2 (SKU), not identity Id.
            await ExecuteDeleteBySkusAsync(
                conn,
                tx,
                @"DELETE sd
FROM dbo.SaleDetails sd
INNER JOIN dbo.ModifierFlavour mf ON mf.Id = sd.FlavourId
WHERE mf.Name2 IN ({0});",
                "@flavourSku",
                variantSkus,
                cancellationToken
            );

            await ExecuteDeleteBySkusAsync(
                conn,
                tx,
                "DELETE FROM dbo.ModifierFlavour WHERE Name2 IN ({0});",
                "@variantSku",
                variantSkus,
                cancellationToken
            );
        }
        else if (deleteType == "menu_group")
        {
            var groupName = evt.Payload.MenuGroupName ?? evt.Payload.Name;
            var posMenuGroupId = evt.Payload.PosMenuGroupId;
            if (!posMenuGroupId.HasValue && string.IsNullOrWhiteSpace(groupName))
            {
                _logger.LogWarning("Delete menu group event {EventId} has no group id or name.", evt.Id);
                await tx.CommitAsync(cancellationToken);
                return;
            }

            const string deleteGroupSql = @"
DELETE FROM dbo.MenuGroup
WHERE (@PosMenuGroupId IS NOT NULL AND Id = @PosMenuGroupId)
   OR (@GroupName IS NOT NULL AND LTRIM(RTRIM(Name)) = LTRIM(RTRIM(@GroupName)));";

            await using var deleteGroupCmd = new SqlCommand(deleteGroupSql, conn, tx);
            deleteGroupCmd.Parameters.AddWithValue(
                "@PosMenuGroupId",
                posMenuGroupId.HasValue ? posMenuGroupId.Value : DBNull.Value
            );
            deleteGroupCmd.Parameters.AddWithValue(
                "@GroupName",
                string.IsNullOrWhiteSpace(groupName) ? DBNull.Value : groupName.Trim()
            );
            await deleteGroupCmd.ExecuteNonQueryAsync(cancellationToken);
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
                        @"DELETE sd
FROM dbo.SaleDetails sd
INNER JOIN dbo.ModifierFlavour mf ON mf.Id = sd.FlavourId
WHERE mf.Name2 IN ({0});",
                        "@flavourSku",
                        variantSkus,
                        cancellationToken
                    );

                    await ExecuteDeleteBySkusAsync(
                        conn,
                        tx,
                        "DELETE FROM dbo.ModifierFlavour WHERE Name2 IN ({0});",
                        "@variantSku",
                        variantSkus,
                        cancellationToken
                    );
                }
                else
                {
                    // Match upsert keys: MenuItem.Code (SKU).
                    await ExecuteDeleteBySkusAsync(
                        conn,
                        tx,
                        @"DELETE sd
FROM dbo.SaleDetails sd
INNER JOIN dbo.MenuItem mi ON mi.Id = sd.MenuItemId
WHERE mi.Code IN ({0});",
                        "@itemSku",
                        itemSkus,
                        cancellationToken
                    );

                    await ExecuteDeleteBySkusAsync(
                        conn,
                        tx,
                        @"DELETE mf
FROM dbo.ModifierFlavour mf
INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
WHERE mi.Code IN ({0});",
                        "@itemFlavourSku",
                        itemSkus,
                        cancellationToken
                    );
                }

                await ExecuteDeleteBySkusAsync(
                    conn,
                    tx,
                    "DELETE FROM dbo.MenuItem WHERE Code IN ({0});",
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

    private async Task UpsertMenuGroupAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        var name = evt.Payload.MenuGroupName ?? evt.Payload.Name;
        if (string.IsNullOrWhiteSpace(name))
        {
            return;
        }

        const string updateSql = @"
UPDATE dbo.MenuGroup
SET Name = @Name,
    Status = COALESCE(Status, 'Active'),
    uploadstatus = 'Pending'
WHERE Id = TRY_CAST(@PosMenuGroupId AS int)
   OR LTRIM(RTRIM(Name)) = LTRIM(RTRIM(@Name));";

        const string insertSql = @"
INSERT INTO dbo.MenuGroup (Name, Status, uploadstatus)
VALUES (@Name, 'Active', 'Pending');";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        if (evt.Payload.IsInsertOnly)
        {
            var existingGroupId = await ResolveMenuGroupIdAsync(conn, evt.Payload, cancellationToken);
            if (existingGroupId.HasValue)
            {
                return;
            }

            await using var insertCmd = new SqlCommand(insertSql, conn);
            insertCmd.Parameters.AddWithValue("@Name", name.Trim());
            await insertCmd.ExecuteNonQueryAsync(cancellationToken);
            return;
        }

        await using var updateCmd = new SqlCommand(updateSql, conn);
        updateCmd.Parameters.AddWithValue("@Name", name.Trim());
        updateCmd.Parameters.AddWithValue("@PosMenuGroupId", (object?)evt.Payload.PosMenuGroupId?.ToString() ?? DBNull.Value);
        var updated = await updateCmd.ExecuteNonQueryAsync(cancellationToken);

        if (updated == 0)
        {
            await using var insertCmd = new SqlCommand(insertSql, conn);
            insertCmd.Parameters.AddWithValue("@Name", name.Trim());
            await insertCmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private async Task<int?> ResolveMenuGroupIdAsync(SqlConnection conn, CatalogSyncPayload payload, CancellationToken cancellationToken)
    {
        if (payload.PosMenuGroupId.HasValue)
        {
            const string byIdSql = "SELECT TOP 1 Id FROM dbo.MenuGroup WITH (NOLOCK) WHERE Id = @Id;";
            await using var byIdCmd = new SqlCommand(byIdSql, conn);
            byIdCmd.Parameters.AddWithValue("@Id", payload.PosMenuGroupId.Value);
            var byId = await byIdCmd.ExecuteScalarAsync(cancellationToken);
            if (byId is not null && byId != DBNull.Value)
            {
                return Convert.ToInt32(byId);
            }
        }

        var groupName = payload.MenuGroupName;
        if (string.IsNullOrWhiteSpace(groupName))
        {
            return null;
        }

        const string byNameSql = "SELECT TOP 1 Id FROM dbo.MenuGroup WITH (NOLOCK) WHERE LTRIM(RTRIM(Name)) = LTRIM(RTRIM(@Name));";
        await using var byNameCmd = new SqlCommand(byNameSql, conn);
        byNameCmd.Parameters.AddWithValue("@Name", groupName.Trim());
        var byName = await byNameCmd.ExecuteScalarAsync(cancellationToken);
        if (byName is null || byName == DBNull.Value)
        {
            return null;
        }

        return Convert.ToInt32(byName);
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
    Price = COALESCE(@NetPrice, Price),
    GrossPrice = COALESCE(@GrossPrice, GrossPrice),
    MenuGroupId = COALESCE(@MenuGroupId, MenuGroupId),
    uploadstatus = 'Pending'
WHERE Code = @Sku OR Id = TRY_CAST(@PosItemId AS int);";

        // MintPOS MenuItem.Id is NOT NULL and not always IDENTITY — use numeric POS id / SKU.
        const string insertSql = @"
INSERT INTO dbo.MenuItem (Id, Code, Name, Price, GrossPrice, Status, uploadstatus, MenuGroupId)
VALUES (
  COALESCE(TRY_CAST(@PosItemId AS int), TRY_CAST(@Sku AS int)),
  @Sku,
  @Name,
  @NetPrice,
  @GrossPrice,
  'Active',
  'Pending',
  @MenuGroupId
);";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        var menuGroupId = await ResolveMenuGroupIdAsync(conn, evt.Payload, cancellationToken);

        if (evt.Payload.IsInsertOnly)
        {
            if (await MenuItemExistsByCodeAsync(conn, sku, cancellationToken))
            {
                _logger.LogInformation(
                    "Catalog item SKU {Sku} already exists on till; insert_only skipped item upsert.",
                    sku);
                await EnsureDefaultFlavourForItemAsync(conn, sku, evt.Payload, menuGroupId, cancellationToken);
                return;
            }

            if (string.IsNullOrWhiteSpace(evt.Payload.Name))
            {
                _logger.LogWarning("Catalog item SKU {Sku} skipped: name is required.", sku);
                return;
            }

            if (!TryResolveMenuItemId(evt.Payload.PosItemId, sku, out _))
            {
                _logger.LogWarning(
                    "Catalog item SKU {Sku} skipped: MenuItem.Id requires a numeric PosItemId or SKU.",
                    sku);
                return;
            }

            await using var insertCmd = new SqlCommand(insertSql, conn);
            BindItemParams(insertCmd, evt, sku, menuGroupId);
            var inserted = await insertCmd.ExecuteNonQueryAsync(cancellationToken);
            if (inserted == 0)
            {
                _logger.LogWarning("Catalog item SKU {Sku} insert affected 0 rows.", sku);
            }
            else
            {
                await EnsureDefaultFlavourForItemAsync(conn, sku, evt.Payload, menuGroupId, cancellationToken);
            }

            return;
        }

        await using var updateCmd = new SqlCommand(updateSql, conn);
        BindItemParams(updateCmd, evt, sku, menuGroupId);
        var updated = await updateCmd.ExecuteNonQueryAsync(cancellationToken);

        if (updated == 0 && !string.IsNullOrWhiteSpace(evt.Payload.Name))
        {
            if (!TryResolveMenuItemId(evt.Payload.PosItemId, sku, out _))
            {
                _logger.LogWarning(
                    "Catalog item SKU {Sku} insert skipped: MenuItem.Id requires a numeric PosItemId or SKU.",
                    sku);
            }
            else
            {
                await using var insertCmd = new SqlCommand(insertSql, conn);
                BindItemParams(insertCmd, evt, sku, menuGroupId);
                await insertCmd.ExecuteNonQueryAsync(cancellationToken);
            }
        }

        await EnsureDefaultFlavourForItemAsync(conn, sku, evt.Payload, menuGroupId, cancellationToken);
    }

    private async Task UpsertVariantAsync(CatalogSyncEvent evt, CancellationToken cancellationToken)
    {
        var variantSku = evt.Payload.VariantSku ?? evt.EntityId;
        var itemSku = evt.Payload.ItemSku;
        if (string.IsNullOrWhiteSpace(variantSku) || string.IsNullOrWhiteSpace(itemSku))
        {
            return;
        }

        const string updateSql = @"
UPDATE mf
SET mf.name = COALESCE(@VariantName, mf.name),
    mf.Name2 = @VariantSku,
    mf.price = COALESCE(@NetPrice, mf.price),
    mf.GrossPrice = COALESCE(@GrossPrice, mf.GrossPrice),
    mf.MenuGroupId = COALESCE(@MenuGroupId, mf.MenuGroupId, mi.MenuGroupId),
    mf.UploadStatus = 'Pending'
FROM dbo.ModifierFlavour mf
JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
WHERE mi.Code = @ItemSku AND (mf.Name2 = @VariantSku OR mf.Id = TRY_CAST(@PosFlavourId AS int));";

        // Include Id when MintPOS ModifierFlavour.Id is NOT NULL / non-identity.
        const string insertSql = @"
INSERT INTO dbo.ModifierFlavour (Id, MenuItemId, MenuGroupId, name, Name2, price, GrossPrice, Status, UploadStatus)
SELECT
  COALESCE(TRY_CAST(@PosFlavourId AS int), TRY_CAST(@VariantSku AS int), mi.Id),
  mi.Id,
  COALESCE(@MenuGroupId, mi.MenuGroupId),
  @VariantName,
  @VariantSku,
  @NetPrice,
  @GrossPrice,
  'Active',
  'Pending'
FROM dbo.MenuItem mi
WHERE mi.Code = @ItemSku
  AND COALESCE(TRY_CAST(@PosFlavourId AS int), TRY_CAST(@VariantSku AS int), mi.Id) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.ModifierFlavour mf
      WHERE mf.MenuItemId = mi.Id
        AND (mf.Name2 = @VariantSku OR mf.Id = TRY_CAST(@PosFlavourId AS int))
  );";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        var menuGroupId = await ResolveMenuGroupIdAsync(conn, evt.Payload, cancellationToken);

        if (evt.Payload.IsInsertOnly)
        {
            if (await VariantExistsBySkuAsync(conn, itemSku, variantSku, evt.Payload.PosFlavourId, cancellationToken))
            {
                _logger.LogInformation(
                    "Catalog variant SKU {VariantSku} for item {ItemSku} already exists; insert_only skipped.",
                    variantSku,
                    itemSku);
                return;
            }

            if (string.IsNullOrWhiteSpace(evt.Payload.VariantName))
            {
                _logger.LogWarning(
                    "Catalog variant SKU {VariantSku} for item {ItemSku} skipped: variant name is required.",
                    variantSku,
                    itemSku);
                return;
            }

            await using var insertCmd = new SqlCommand(insertSql, conn);
            insertCmd.Parameters.AddWithValue("@ItemSku", itemSku);
            insertCmd.Parameters.AddWithValue("@VariantSku", variantSku);
            insertCmd.Parameters.AddWithValue("@VariantName", evt.Payload.VariantName.Trim());
            BindVariantPriceParams(insertCmd, evt.Payload);
            insertCmd.Parameters.AddWithValue("@PosFlavourId", (object?)evt.Payload.PosFlavourId ?? DBNull.Value);
            insertCmd.Parameters.AddWithValue("@MenuGroupId", (object?)menuGroupId ?? DBNull.Value);
            var inserted = await insertCmd.ExecuteNonQueryAsync(cancellationToken);
            if (inserted == 0)
            {
                _logger.LogWarning(
                    "Catalog variant SKU {VariantSku} for item {ItemSku} insert affected 0 rows; parent item may be missing on till.",
                    variantSku,
                    itemSku);
            }

            return;
        }

        await using var cmd = new SqlCommand(updateSql, conn);
        cmd.Parameters.AddWithValue("@ItemSku", itemSku);
        cmd.Parameters.AddWithValue("@VariantSku", variantSku);
        cmd.Parameters.AddWithValue("@VariantName", (object?)evt.Payload.VariantName ?? DBNull.Value);
        BindVariantPriceParams(cmd, evt.Payload);
        cmd.Parameters.AddWithValue("@PosFlavourId", (object?)evt.Payload.PosFlavourId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@MenuGroupId", (object?)menuGroupId ?? DBNull.Value);

        var updated = await cmd.ExecuteNonQueryAsync(cancellationToken);
        if (updated == 0 && !string.IsNullOrWhiteSpace(evt.Payload.VariantName))
        {
            await using var insertCmd = new SqlCommand(insertSql, conn);
            insertCmd.Parameters.AddWithValue("@ItemSku", itemSku);
            insertCmd.Parameters.AddWithValue("@VariantSku", variantSku);
            insertCmd.Parameters.AddWithValue("@VariantName", evt.Payload.VariantName.Trim());
            BindVariantPriceParams(insertCmd, evt.Payload);
            insertCmd.Parameters.AddWithValue("@PosFlavourId", (object?)evt.Payload.PosFlavourId ?? DBNull.Value);
            insertCmd.Parameters.AddWithValue("@MenuGroupId", (object?)menuGroupId ?? DBNull.Value);
            await insertCmd.ExecuteNonQueryAsync(cancellationToken);
        }
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

    private static (decimal? NetPrice, decimal? GrossPrice) ResolveItemPosPrices(CatalogSyncPayload payload)
    {
        decimal? gross = payload.Price is > 0 ? payload.Price : null;
        decimal? net = payload.VatExcPrice is > 0 ? payload.VatExcPrice : null;

        if (net is null && gross is > 0)
        {
            net = Math.Round(gross.Value / 1.16m, 2, MidpointRounding.AwayFromZero);
        }

        if (gross is null && net is > 0)
        {
            gross = Math.Round(net.Value * 1.16m, 2, MidpointRounding.AwayFromZero);
        }

        return (net, gross);
    }

    private static (decimal? NetPrice, decimal? GrossPrice) ResolveVariantPosPrices(CatalogSyncPayload payload)
    {
        return ResolveItemPosPrices(payload);
    }

    private static void BindItemParams(SqlCommand cmd, CatalogSyncEvent evt, string sku, int? menuGroupId)
    {
        var prices = ResolveItemPosPrices(evt.Payload);
        cmd.Parameters.AddWithValue("@Sku", sku);
        cmd.Parameters.AddWithValue("@Name", (object?)evt.Payload.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@NetPrice", (object?)prices.NetPrice ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@GrossPrice", (object?)prices.GrossPrice ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@PosItemId", (object?)evt.Payload.PosItemId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@MenuGroupId", (object?)menuGroupId ?? DBNull.Value);
    }

    /// <summary>
    /// MintPOS MenuItem.Id is required and usually equals the numeric POS code/SKU.
    /// </summary>
    private static bool TryResolveMenuItemId(string? posItemId, string sku, out int menuItemId)
    {
        if (!string.IsNullOrWhiteSpace(posItemId) && int.TryParse(posItemId.Trim(), out menuItemId) && menuItemId > 0)
        {
            return true;
        }

        if (int.TryParse(sku.Trim(), out menuItemId) && menuItemId > 0)
        {
            return true;
        }

        menuItemId = 0;
        return false;
    }

    private static void BindVariantPriceParams(SqlCommand cmd, CatalogSyncPayload payload)
    {
        var prices = ResolveVariantPosPrices(payload);
        cmd.Parameters.AddWithValue("@NetPrice", (object?)prices.NetPrice ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@GrossPrice", (object?)prices.GrossPrice ?? DBNull.Value);
    }

    private async Task EnsureDefaultFlavourForItemAsync(
        SqlConnection conn,
        string itemSku,
        CatalogSyncPayload payload,
        int? menuGroupId,
        CancellationToken cancellationToken)
    {
        const string sql = @"
INSERT INTO dbo.ModifierFlavour (Id, MenuItemId, MenuGroupId, name, Name2, price, GrossPrice, Status, UploadStatus)
SELECT
    COALESCE(TRY_CAST(@VariantSku AS int), mi.Id),
    mi.Id,
    COALESCE(@MenuGroupId, mi.MenuGroupId),
    COALESCE(@VariantName, mi.Name),
    COALESCE(NULLIF(LTRIM(RTRIM(@VariantSku)), ''), mi.Code),
    COALESCE(@NetPrice, mi.Price),
    COALESCE(@GrossPrice, mi.GrossPrice),
    'Active',
    'Pending'
FROM dbo.MenuItem mi
WHERE mi.Code = @ItemSku
  AND COALESCE(TRY_CAST(@VariantSku AS int), mi.Id) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.ModifierFlavour mf
      WHERE mf.MenuItemId = mi.Id
  );";

        var prices = ResolveItemPosPrices(payload);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ItemSku", itemSku.Trim());
        cmd.Parameters.AddWithValue("@VariantSku", itemSku.Trim());
        cmd.Parameters.AddWithValue("@VariantName", (object?)payload.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@NetPrice", (object?)prices.NetPrice ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@GrossPrice", (object?)prices.GrossPrice ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@MenuGroupId", (object?)menuGroupId ?? DBNull.Value);
        var inserted = await cmd.ExecuteNonQueryAsync(cancellationToken);
        if (inserted > 0)
        {
            _logger.LogInformation(
                "Created default ModifierFlavour for item SKU {ItemSku} so it is sellable on till.",
                itemSku);
        }
    }

    private static async Task<bool> MenuItemExistsByCodeAsync(
        SqlConnection conn,
        string sku,
        CancellationToken cancellationToken)
    {
        const string sql = "SELECT TOP 1 1 FROM dbo.MenuItem WITH (NOLOCK) WHERE Code = @Sku;";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@Sku", sku.Trim());
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        return result is not null && result != DBNull.Value;
    }

    private static async Task<bool> VariantExistsBySkuAsync(
        SqlConnection conn,
        string itemSku,
        string variantSku,
        string? posFlavourId,
        CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT TOP 1 1
FROM dbo.ModifierFlavour mf WITH (NOLOCK)
JOIN dbo.MenuItem mi WITH (NOLOCK) ON mi.Id = mf.MenuItemId
WHERE mi.Code = @ItemSku
  AND (mf.Name2 = @VariantSku OR mf.Id = TRY_CAST(@PosFlavourId AS int));";

        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ItemSku", itemSku.Trim());
        cmd.Parameters.AddWithValue("@VariantSku", variantSku.Trim());
        cmd.Parameters.AddWithValue("@PosFlavourId", (object?)posFlavourId ?? DBNull.Value);
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        return result is not null && result != DBNull.Value;
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

    [JsonPropertyName("vat_exc_price")]
    public decimal? VatExcPrice { get; init; }

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

    [JsonPropertyName("command")]
    public string? Command { get; init; }

    [JsonPropertyName("menu_group_id")]
    public string? MenuGroupId { get; init; }

    [JsonPropertyName("menu_group_name")]
    public string? MenuGroupName { get; init; }

    [JsonPropertyName("pos_menu_group_id")]
    public int? PosMenuGroupId { get; init; }

    [JsonPropertyName("sync_products")]
    public bool? SyncProducts { get; init; }

    [JsonPropertyName("sync_variants")]
    public bool? SyncVariants { get; init; }

    [JsonPropertyName("sync_menu_groups")]
    public bool? SyncMenuGroups { get; init; }

    [JsonPropertyName("exclude_item_skus")]
    public string[]? ExcludeItemSkus { get; init; }

    [JsonPropertyName("exclude_variant_skus")]
    public string[]? ExcludeVariantSkus { get; init; }

    [JsonPropertyName("sync_mode")]
    public string? SyncMode { get; init; }

    public bool IsInsertOnly => string.Equals(SyncMode, "insert_only", StringComparison.OrdinalIgnoreCase);

    public bool ShouldSyncProducts => SyncProducts is not false;

    public bool ShouldSyncVariants => SyncVariants is not false;

    public bool ShouldSyncMenuGroups => SyncMenuGroups is not false;
}
