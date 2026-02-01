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

    public async Task<IReadOnlyList<PosOrder>> ReadPendingOrdersAsync(int batchSize, CancellationToken cancellationToken)
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
    s.branchid    AS BranchId
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s    WITH (NOLOCK) ON s.Id = bt.saleid
WHERE (bt.uploadStatus IS NULL OR bt.uploadStatus = 'Pending')
    AND (@MinOccurredAt IS NULL OR (CASE WHEN s.time IS NULL THEN s.Date ELSE DATEADD(SECOND, DATEDIFF(SECOND, 0, CAST(s.time AS time)), s.Date) END) >= @MinOccurredAt)
    AND (@MaxOccurredAt IS NULL OR (CASE WHEN s.time IS NULL THEN s.Date ELSE DATEADD(SECOND, DATEDIFF(SECOND, 0, CAST(s.time AS time)), s.Date) END) <= @MaxOccurredAt)
ORDER BY bt.id ASC;";

        var orders = new List<PosOrder>();

        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(headerSql, conn)
        {
            CommandType = CommandType.Text
        };
        cmd.Parameters.AddWithValue("@Batch", batchSize);
        var minOccurredAt = _syncOptions.CurrentValue.MinSaleDateUtc;
        var maxOccurredAt = _syncOptions.CurrentValue.MaxSaleDateUtc;
        cmd.Parameters.AddWithValue("@MinOccurredAt", (object?)minOccurredAt ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@MaxOccurredAt", (object?)maxOccurredAt ?? DBNull.Value);

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
                Inventory: inventory
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

        await using var conn = new SqlConnection(_options.ConnectionString);
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
        const string sql = @"
    UPDATE dbo.BillType    SET uploadStatus = 'Processed' WHERE id = @BillId;
    UPDATE dbo.Sale        SET uploadstatus = 'Processed' WHERE Id = @SaleId;
    UPDATE dbo.Saledetails SET uploadstatus = 'Processed' WHERE saleid = @SaleId;";

        await using var conn = new SqlConnection(_options.ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand(sql, conn)
        {
            CommandType = CommandType.Text
        };

        cmd.Parameters.AddWithValue("@BillId", billId);
        cmd.Parameters.AddWithValue("@SaleId", saleId);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
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

        await using var conn = new SqlConnection(_options.ConnectionString);
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

    private async Task<IReadOnlyList<PosLineItem>> LoadLineItemsAsync(string saleId, CancellationToken cancellationToken)
    {
        const string lineSql = @"
    SELECT sd.saleid AS SaleId,
           sd.MenuItemId AS ItemId,
           mi.Name AS ItemName,
           sd.Quantity AS Qty,
           sd.Price AS UnitPrice,
           sd.Itemdiscount AS Discount,
           sd.ItemGst AS Tax,
            sd.FlavourId AS FlavourId,
            sd.ModifierId AS ModifierId
    FROM dbo.Saledetails sd WITH (NOLOCK)
    LEFT JOIN dbo.MenuItem mi WITH (NOLOCK) ON mi.Id = sd.MenuItemId
    WHERE sd.saleid = @SaleId;";

        var items = new List<PosLineItem>();

        await using var conn = new SqlConnection(_options.ConnectionString);
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

            items.Add(new PosLineItem(
                PosItemId: reader["ItemId"].ToString() ?? string.Empty,
                Name: reader["ItemName"].ToString() ?? string.Empty,
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

        await using var conn = new SqlConnection(_options.ConnectionString);
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
