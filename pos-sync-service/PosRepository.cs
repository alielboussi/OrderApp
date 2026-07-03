using System.Data;
using System.Linq;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class PosRepository
{
    private readonly PosDbOptions _options;
    private readonly OutletOptions _outlet;
    private readonly IOptionsMonitor<SyncOptions> _syncOptions;
    private readonly ILogger<PosRepository> _logger;

    public PosRepository(IOptions<PosDbOptions> options,
                         IOptions<OutletOptions> outlet,
                         IOptionsMonitor<SyncOptions> syncOptions,
                         ILogger<PosRepository> logger)
    {
        _options = options.Value;
        _outlet = outlet.Value;
        _syncOptions = syncOptions;
        _logger = logger;
    }

    private string ConnectionString => _options.GetEffectiveConnectionString();

    public async Task<IReadOnlyList<PosOrder>> ReadPendingOrdersAsync(
        int batchSize,
        DateTime? minOccurredAtUtc,
        DateTime? maxOccurredAtUtc,
        CancellationToken cancellationToken)
    {
        // Uses actual POS schema: BillType (header/payment), Sale (date/time), Saledetails (lines), MenuItem (names).
        const string headerSql = @"
SELECT TOP (@Batch)
    bt.id         AS BillId,
    bt.saleid     AS SaleId,
    bt.type       AS PaymentType,
    bt.Amount     AS PaymentAmount,
    s.Date        AS SaleDate,
    s.time        AS SaleTime,
    s.OrderType   AS OrderType,
    s.BillType    AS BillType,
    s.Discount    AS SaleDiscount,
    s.DiscountAmount AS SaleDiscountAmount,
    s.GST         AS SaleGst,
    s.servicecharges AS ServiceCharges,
    s.DeliveryCharges AS DeliveryCharges,
    s.Tip         AS Tip,
    s.POSFee      AS PosFee,
    s.PriceType   AS PriceType,
    s.Customer    AS CustomerName,
    s.phone       AS CustomerPhone,
    s.branchid    AS BranchId,
    s.Terminal    AS Terminal
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s    WITH (NOLOCK) ON s.Id = bt.saleid
WHERE (
    -- Sale.uploadstatus is the middleware source of truth (BillType may be Processed before upload).
    s.uploadstatus IS NULL
    OR s.uploadstatus IN ('Pending', 'pending')
    OR (@IncludeProcessed = 1 AND s.uploadstatus = 'Processed')
)
    AND (
        @MinOccurredAt IS NULL
        OR DATEADD(
            millisecond,
            DATEDIFF(millisecond, CAST(CAST(s.time AS date) AS datetime), CAST(s.time AS datetime)),
            CAST(s.Date AS datetime)
        ) >= @MinOccurredAt
    )
    AND (
        @MaxOccurredAt IS NULL
        OR DATEADD(
            millisecond,
            DATEDIFF(millisecond, CAST(CAST(s.time AS date) AS datetime), CAST(s.time AS datetime)),
            CAST(s.Date AS datetime)
        ) <= @MaxOccurredAt
    )
ORDER BY bt.id ASC;";

        var orders = new List<PosOrder>();

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(headerSql, conn)
        {
            CommandType = CommandType.Text
        };
        cmd.Parameters.AddWithValue("@Batch", batchSize);
        cmd.Parameters.AddWithValue("@MinOccurredAt", (object?)minOccurredAtUtc ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@MaxOccurredAt", (object?)maxOccurredAtUtc ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@IncludeProcessed", _syncOptions.CurrentValue.IncludeProcessed ? 1 : 0);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var billId = reader["BillId"].ToString() ?? string.Empty;
            var saleId = reader["SaleId"].ToString() ?? string.Empty;

            var saleDate = reader.IsDBNull(reader.GetOrdinal("SaleDate"))
                ? DateTime.UtcNow
                : reader.GetDateTime(reader.GetOrdinal("SaleDate"));

            int? branchId = null;
            if (!reader.IsDBNull(reader.GetOrdinal("BranchId")))
            {
                branchId = reader.GetInt32(reader.GetOrdinal("BranchId"));
            }

            DateTime occurredAt;
            if (!reader.IsDBNull(reader.GetOrdinal("SaleTime")))
            {
                var saleTime = reader.GetDateTime(reader.GetOrdinal("SaleTime"));
                occurredAt = saleDate.Date + saleTime.TimeOfDay;
            }
            else
            {
                occurredAt = saleDate;
            }

            var items = await LoadLineItemsAsync(saleId, cancellationToken);
            var inventory = await LoadInventoryConsumedAsync(saleDate.Date, branchId, billId, saleId, cancellationToken);

            var payments = new List<PosPayment>();
            if (!reader.IsDBNull(reader.GetOrdinal("PaymentAmount")))
            {
                var paymentAmount = Convert.ToDecimal(reader["PaymentAmount"]);
                payments.Add(new PosPayment(Method: reader["PaymentType"]?.ToString() ?? "Unknown", Amount: paymentAmount));
            }

            var order = new PosOrder(
                PosOrderId: billId,
                PosSaleId: saleId,
                OccurredAt: occurredAt,
                OutletId: _outlet.Id,
                SourceEventId: $"{_outlet.Id}-{billId}",
                OrderType: reader["OrderType"]?.ToString(),
                BillType: reader["BillType"]?.ToString(),
                TotalDiscount: reader.IsDBNull(reader.GetOrdinal("SaleDiscount")) ? null : Convert.ToDecimal(reader["SaleDiscount"]),
                TotalDiscountAmount: reader.IsDBNull(reader.GetOrdinal("SaleDiscountAmount")) ? null : Convert.ToDecimal(reader["SaleDiscountAmount"]),
                TotalGst: reader.IsDBNull(reader.GetOrdinal("SaleGst")) ? null : Convert.ToDecimal(reader["SaleGst"]),
                ServiceCharges: reader.IsDBNull(reader.GetOrdinal("ServiceCharges")) ? null : Convert.ToDecimal(reader["ServiceCharges"]),
                DeliveryCharges: reader.IsDBNull(reader.GetOrdinal("DeliveryCharges")) ? null : Convert.ToDecimal(reader["DeliveryCharges"]),
                Tip: reader.IsDBNull(reader.GetOrdinal("Tip")) ? null : Convert.ToDecimal(reader["Tip"]),
                PosFee: reader.IsDBNull(reader.GetOrdinal("PosFee")) ? null : Convert.ToDecimal(reader["PosFee"]),
                PriceType: reader["PriceType"]?.ToString(),
                BranchId: branchId,
                Items: items,
                Payments: payments,
                Customer: BuildCustomer(reader),
                Inventory: inventory,
                Terminal: TryGetString(reader, "Terminal")
            );

            orders.Add(order);
        }

        return orders;
    }

    public async Task<IReadOnlyList<PosSentSummary>> ReadRecentProcessedAsync(int take, CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT TOP (@Take)
    bt.id     AS BillId,
    bt.saleid AS SaleId,
    bt.Amount AS PaymentAmount,
    bt.type   AS PaymentType,
    s.Date    AS SaleDate,
    s.time    AS SaleTime
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s    WITH (NOLOCK) ON s.Id = bt.saleid
WHERE bt.uploadStatus = 'Processed'
ORDER BY bt.id DESC;";

        var recent = new List<PosSentSummary>();

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(sql, conn)
        {
            CommandType = CommandType.Text
        };
        cmd.Parameters.AddWithValue("@Take", take);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var saleDate = reader.IsDBNull(reader.GetOrdinal("SaleDate"))
                ? DateTime.UtcNow
                : reader.GetDateTime(reader.GetOrdinal("SaleDate"));

            DateTimeOffset occurredAt;
            if (!reader.IsDBNull(reader.GetOrdinal("SaleTime")))
            {
                var saleTime = reader.GetDateTime(reader.GetOrdinal("SaleTime"));
                occurredAt = saleDate.Date + saleTime.TimeOfDay;
            }
            else
            {
                occurredAt = saleDate;
            }

            decimal? amount = reader.IsDBNull(reader.GetOrdinal("PaymentAmount"))
                ? null
                : Convert.ToDecimal(reader["PaymentAmount"]);

            recent.Add(new PosSentSummary(
                BillId: reader["BillId"].ToString() ?? string.Empty,
                SaleId: reader["SaleId"].ToString() ?? string.Empty,
                OccurredAt: occurredAt,
                PaymentAmount: amount,
                PaymentType: reader["PaymentType"]?.ToString()
            ));
        }

        return recent;
    }

    public async Task MarkOrderProcessedAsync(string billId, string saleId, CancellationToken cancellationToken)
    {
        const string billSql = "UPDATE dbo.BillType SET uploadStatus = 'Processed' WHERE id = @BillId;";
        const string saleSql = "UPDATE dbo.Sale SET uploadstatus = 'Processed' WHERE Id = @SaleId;";
        const string linesSql = "UPDATE dbo.Saledetails SET uploadstatus = 'Processed' WHERE saleid = @SaleId;";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var transaction = (SqlTransaction)await conn.BeginTransactionAsync(cancellationToken);
        try
        {
            var billRows = await ExecuteProcessedUpdateAsync(conn, transaction, billSql, billId, saleId, cancellationToken);
            var saleRows = await ExecuteProcessedUpdateAsync(conn, transaction, saleSql, billId, saleId, cancellationToken);
            var lineRows = await ExecuteProcessedUpdateAsync(conn, transaction, linesSql, billId, saleId, cancellationToken);

            await transaction.CommitAsync(cancellationToken);

            if (saleRows == 0 || lineRows == 0)
            {
                _logger.LogWarning(
                    "Processed flags incomplete after upload bill={BillId} sale={SaleId}: billRows={BillRows} saleRows={SaleRows} lineRows={LineRows}",
                    billId,
                    saleId,
                    billRows,
                    saleRows,
                    lineRows);
            }
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<int> ExecuteProcessedUpdateAsync(
        SqlConnection conn,
        SqlTransaction transaction,
        string sql,
        string billId,
        string saleId,
        CancellationToken cancellationToken)
    {
        await using var cmd = new SqlCommand(sql, conn, transaction)
        {
            CommandType = CommandType.Text
        };
        cmd.Parameters.AddWithValue("@BillId", billId);
        cmd.Parameters.AddWithValue("@SaleId", saleId);
        return await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<int> CountUnsyncedSalesAsync(CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT COUNT(*) AS Cnt
FROM dbo.Sale s WITH (NOLOCK)
WHERE s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending');";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn);
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result);
    }

    /// <summary>
    /// Align MintPOS upload flags when Supabase already has the sale (Sale Processed) but lines/BillType lag.
    /// </summary>
    public async Task<int> RepairConsistentProcessedFlagsAsync(CancellationToken cancellationToken)
    {
        const string sql = @"
UPDATE sd
SET sd.uploadstatus = 'Processed'
FROM dbo.Saledetails sd
INNER JOIN dbo.Sale s ON s.Id = sd.saleid
WHERE s.uploadstatus = 'Processed'
  AND (sd.uploadstatus IS NULL OR sd.uploadstatus IN ('Pending', 'pending'));

UPDATE bt
SET bt.uploadStatus = 'Processed'
FROM dbo.BillType bt
INNER JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE s.uploadstatus = 'Processed'
  AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'));";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn);
        return await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task MarkInventoryProcessedAsync(IEnumerable<string> inventoryIds, CancellationToken cancellationToken)
    {
        var idList = inventoryIds
            .Select(id => int.TryParse(id, out var parsed) ? parsed : (int?)null)
            .Where(v => v.HasValue)
            .Select(v => v!.Value)
            .ToList();

        if (idList.Count == 0)
        {
            return;
        }

        var paramNames = idList.Select((_, idx) => "@p" + idx).ToArray();
        var sql = $"UPDATE dbo.InventoryConsumed SET uploadstatus = 'Processed' WHERE Id IN ({string.Join(",", paramNames)})";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(sql, conn)
        {
            CommandType = CommandType.Text
        };

        for (var i = 0; i < idList.Count; i++)
        {
            cmd.Parameters.AddWithValue(paramNames[i], idList[i]);
        }

        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PosCatalogSkuMapRow>> ReadPosCatalogSkuMapAsync(CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT
    LTRIM(RTRIM(mi.Code)) AS ItemSku,
    LTRIM(RTRIM(mi.Name)) AS ItemName,
    LTRIM(RTRIM(mf.Name)) AS VariantName,
    COALESCE(NULLIF(LTRIM(RTRIM(mf.Name2)), ''), CAST(mf.Id AS nvarchar(100))) AS VariantSku
FROM dbo.ModifierFlavour mf WITH (NOLOCK)
JOIN dbo.MenuItem mi WITH (NOLOCK) ON mi.Id = mf.MenuItemId
WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(mf.Name)), '') IS NOT NULL
  AND COALESCE(mi.Status, 'Active') = 'Active'
  AND COALESCE(mf.Status, 'Active') = 'Active';";

        var rows = new List<PosCatalogSkuMapRow>();
        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn)
        {
            CommandType = CommandType.Text
        };

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var itemSku = reader["ItemSku"]?.ToString()?.Trim();
            var itemName = reader["ItemName"]?.ToString()?.Trim();
            var variantName = reader["VariantName"]?.ToString()?.Trim();
            var variantSku = reader["VariantSku"]?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(itemSku) || string.IsNullOrWhiteSpace(itemName) || string.IsNullOrWhiteSpace(variantName) || string.IsNullOrWhiteSpace(variantSku))
            {
                continue;
            }

            rows.Add(new PosCatalogSkuMapRow(
                itemSku,
                itemName,
                variantName,
                variantSku
            ));
        }

        return rows;
    }

    public async Task<IReadOnlyList<PosMenuGroupMapRow>> ReadPosMenuGroupMapAsync(CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT
    mg.Id AS PosMenuGroupId,
    LTRIM(RTRIM(mg.Name)) AS GroupName,
    NULLIF(LTRIM(RTRIM(mi.Code)), '') AS ItemSku
FROM dbo.MenuGroup mg WITH (NOLOCK)
LEFT JOIN dbo.MenuItem mi WITH (NOLOCK) ON mi.MenuGroupId = mg.Id
WHERE NULLIF(LTRIM(RTRIM(mg.Name)), '') IS NOT NULL;";

        var rows = new List<PosMenuGroupMapRow>();
        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn)
        {
            CommandType = CommandType.Text
        };

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (reader.IsDBNull(reader.GetOrdinal("PosMenuGroupId")))
            {
                continue;
            }

            var groupName = reader["GroupName"]?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(groupName))
            {
                continue;
            }

            rows.Add(new PosMenuGroupMapRow(
                PosMenuGroupId: Convert.ToInt32(reader["PosMenuGroupId"]),
                GroupName: groupName,
                ItemSku: reader["ItemSku"]?.ToString()?.Trim()
            ));
        }

        return rows;
    }

    private async Task<IReadOnlyList<PosLineItem>> LoadLineItemsAsync(string saleId, CancellationToken cancellationToken)
    {
        const string lineSql = @"
    SELECT sd.saleid AS SaleId,
           sd.MenuItemId AS ItemId,
           mi.Name AS ItemName,
           mi.Code AS ItemSku,
           mf.Name AS FlavourName,
           mf.Name2 AS VariantSku,
           sd.Quantity AS Qty,
           sd.Price AS UnitPrice,
           sd.Itemdiscount AS Discount,
           sd.ItemGst AS Tax,
           sd.FlavourId AS FlavourId,
           sd.ModifierId AS ModifierId
    FROM dbo.Saledetails sd WITH (NOLOCK)
    LEFT JOIN dbo.MenuItem mi WITH (NOLOCK) ON mi.Id = sd.MenuItemId
    LEFT JOIN dbo.ModifierFlavour mf WITH (NOLOCK) ON mf.Id = sd.FlavourId
    WHERE sd.saleid = @SaleId;";

        var items = new List<PosLineItem>();

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(lineSql, conn)
        {
            CommandType = CommandType.Text
        };
        cmd.Parameters.AddWithValue("@SaleId", saleId);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var unitPrice = Convert.ToDecimal(reader["UnitPrice"]);
            var salePrice = unitPrice; // POS sends price tax-inclusive; treat as sale price entered by customer.
            var vatExcPrice = Math.Round(salePrice / 1.16m, 2, MidpointRounding.AwayFromZero);
            var flavourOrdinal = TryGetOrdinal(reader, "FlavourId");
            var flavourId = flavourOrdinal is null || reader.IsDBNull(flavourOrdinal.Value)
                ? null
                : reader.GetValue(flavourOrdinal.Value)?.ToString();
            var modifierOrdinal = TryGetOrdinal(reader, "ModifierId");
            var modifierId = modifierOrdinal is null || reader.IsDBNull(modifierOrdinal.Value)
                ? null
                : reader.GetValue(modifierOrdinal.Value)?.ToString();

            var itemSkuOrdinal = TryGetOrdinal(reader, "ItemSku");
            var variantSkuOrdinal = TryGetOrdinal(reader, "VariantSku");
            var flavourNameOrdinal = TryGetOrdinal(reader, "FlavourName");

            items.Add(new PosLineItem(
                PosItemId: reader["ItemId"].ToString() ?? string.Empty,
                Name: reader["ItemName"].ToString() ?? string.Empty,
                ItemSku: itemSkuOrdinal is null || reader.IsDBNull(itemSkuOrdinal.Value)
                    ? null
                    : reader.GetValue(itemSkuOrdinal.Value)?.ToString(),
                VariantSku: variantSkuOrdinal is null || reader.IsDBNull(variantSkuOrdinal.Value)
                    ? null
                    : reader.GetValue(variantSkuOrdinal.Value)?.ToString(),
                FlavourName: flavourNameOrdinal is null || reader.IsDBNull(flavourNameOrdinal.Value)
                    ? null
                    : reader.GetValue(flavourNameOrdinal.Value)?.ToString(),
                Quantity: Convert.ToDecimal(reader["Qty"]),
                UnitPrice: unitPrice,
                SalePrice: salePrice,
                VatExclusivePrice: vatExcPrice,
                FlavourPrice: vatExcPrice,
                Discount: reader.IsDBNull(reader.GetOrdinal("Discount")) ? 0 : Convert.ToDecimal(reader["Discount"]),
                Tax: reader.IsDBNull(reader.GetOrdinal("Tax")) ? 0 : Convert.ToDecimal(reader["Tax"]),
                FlavourId: flavourId,
                ModifierId: modifierId,
                VariantId: null,
                VariantKey: null
            ));
        }

        return items;
    }

    private async Task<IReadOnlyList<PosInventoryConsumed>> LoadInventoryConsumedAsync(DateTime saleDate, int? branchId, string billId, string saleId, CancellationToken cancellationToken)
    {
        // Heuristic match: same sale date + pending, optionally narrowed by branchid if present.
        const string sql = @"
SELECT Id,
       RawItemId,
       QuantityConsumed,
       RemainingQuantity,
       Date,
       kdsid,
       typec,
       uploadstatus
FROM dbo.InventoryConsumed WITH (NOLOCK)
WHERE (uploadstatus IS NULL OR uploadstatus = 'Pending')
  AND Date = @SaleDate
  AND (@BranchId IS NULL OR branchid = @BranchId);";

        var rows = new List<PosInventoryConsumed>();

        var branchMissingNote = branchId is null ? $"Branch missing for sale {saleId} (bill {billId})" : null;
        if (branchMissingNote is not null)
        {
            _logger.LogWarning("Inventory match using date-only; branchid missing for sale on {SaleDate}", saleDate.Date);
        }

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(sql, conn)
        {
            CommandType = CommandType.Text
        };
        cmd.Parameters.AddWithValue("@SaleDate", saleDate);
        cmd.Parameters.AddWithValue("@BranchId", (object?)branchId ?? DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new PosInventoryConsumed(
                PosId: reader["Id"].ToString() ?? string.Empty,
                RawItemId: reader["RawItemId"].ToString() ?? string.Empty,
                QuantityConsumed: Convert.ToDecimal(reader["QuantityConsumed"]),
                RemainingQuantity: reader.IsDBNull(reader.GetOrdinal("RemainingQuantity")) ? null : Convert.ToDecimal(reader["RemainingQuantity"]),
                PosDate: reader.IsDBNull(reader.GetOrdinal("Date")) ? null : reader.GetDateTime(reader.GetOrdinal("Date")),
                KdsId: reader["kdsid"]?.ToString(),
                Typec: reader["typec"]?.ToString(),
                BranchId: branchId,
                BranchMissingNote: branchMissingNote
            ));
        }

        return rows;
    }

    private PosCustomer? BuildCustomer(SqlDataReader reader)
    {
        var name = reader["CustomerName"]?.ToString();
        var phone = reader["CustomerPhone"]?.ToString();

        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(phone))
        {
            return null;
        }

        return new PosCustomer(Name: string.IsNullOrWhiteSpace(name) ? null : name,
                               Phone: string.IsNullOrWhiteSpace(phone) ? null : phone,
                               Email: null);
    }

    private static string? TryGetString(SqlDataReader reader, string columnName)
    {
        var ordinal = TryGetOrdinal(reader, columnName);
        if (ordinal is null || reader.IsDBNull(ordinal.Value))
        {
            return null;
        }

        var value = reader.GetValue(ordinal.Value)?.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static int? TryGetOrdinal(SqlDataReader reader, string columnName)
    {
        try
        {
            return reader.GetOrdinal(columnName);
        }
        catch (IndexOutOfRangeException)
        {
            return null;
        }
    }
}
