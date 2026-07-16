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
    s.Shiftid     AS SaleShiftId,
    s.Terminal    AS Terminal,
    sess.id         AS ShiftSessionId,
    sess.shiftid    AS SessionShiftId,
    sess.status     AS ShiftSessionStatus,
    sess.Starttime  AS ShiftSessionStart,
    sess.EndTime    AS ShiftSessionEnd,
    sh.Id           AS ResolvedShiftId,
    sh.Name         AS ShiftName,
    uStart.Name     AS ShiftOpenedBy
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s    WITH (NOLOCK) ON s.Id = bt.saleid
OUTER APPLY (
    SELECT TOP 1
        ss2.id,
        ss2.shiftid,
        ss2.status,
        ss2.Starttime,
        ss2.EndTime,
        ss2.useridstart
    FROM dbo.ShiftStart ss2 WITH (NOLOCK)
    WHERE ss2.Date = s.Date
      AND (ss2.Terminal = s.Terminal OR ss2.Terminal IS NULL OR s.Terminal IS NULL)
      AND s.time >= ss2.Starttime
      AND (ss2.EndTime IS NULL OR s.time <= ss2.EndTime)
    ORDER BY ss2.Starttime DESC
) sess
LEFT JOIN dbo.Shifts sh WITH (NOLOCK) ON sh.Id = COALESCE(s.Shiftid, sess.shiftid)
LEFT JOIN dbo.Users uStart WITH (NOLOCK) ON uStart.Id = sess.useridstart
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
                Shift: BuildShift(reader)
            );

            orders.Add(order);
        }

        return orders;
    }

    public async Task<IReadOnlyList<PosOrder>> ReadOrdersByBillIdsAsync(
        IReadOnlyCollection<string> billIds,
        CancellationToken cancellationToken)
    {
        if (billIds.Count == 0)
        {
            return Array.Empty<PosOrder>();
        }

        const string headerSql = @"
SELECT
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
    s.Shiftid     AS SaleShiftId,
    s.Terminal    AS Terminal,
    sess.id         AS ShiftSessionId,
    sess.shiftid    AS SessionShiftId,
    sess.status     AS ShiftSessionStatus,
    sess.Starttime  AS ShiftSessionStart,
    sess.EndTime    AS ShiftSessionEnd,
    sh.Id           AS ResolvedShiftId,
    sh.Name         AS ShiftName,
    uStart.Name     AS ShiftOpenedBy
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s    WITH (NOLOCK) ON s.Id = bt.saleid
OUTER APPLY (
    SELECT TOP 1
        ss2.id,
        ss2.shiftid,
        ss2.status,
        ss2.Starttime,
        ss2.EndTime,
        ss2.useridstart
    FROM dbo.ShiftStart ss2 WITH (NOLOCK)
    WHERE ss2.Date = s.Date
      AND (ss2.Terminal = s.Terminal OR ss2.Terminal IS NULL OR s.Terminal IS NULL)
      AND s.time >= ss2.Starttime
      AND (ss2.EndTime IS NULL OR s.time <= ss2.EndTime)
    ORDER BY ss2.Starttime DESC
) sess
LEFT JOIN dbo.Shifts sh WITH (NOLOCK) ON sh.Id = COALESCE(s.Shiftid, sess.shiftid)
LEFT JOIN dbo.Users uStart WITH (NOLOCK) ON uStart.Id = sess.useridstart
WHERE bt.id IN ({0});";

        var paramNames = billIds.Select((_, idx) => "@b" + idx).ToArray();
        var sql = string.Format(headerSql, string.Join(",", paramNames));
        var orders = new List<PosOrder>();

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn) { CommandType = CommandType.Text };
        var index = 0;
        foreach (var billId in billIds)
        {
            cmd.Parameters.AddWithValue(paramNames[index++], billId);
        }

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

            var payments = new List<PosPayment>();
            if (!reader.IsDBNull(reader.GetOrdinal("PaymentAmount")))
            {
                var paymentAmount = Convert.ToDecimal(reader["PaymentAmount"]);
                payments.Add(new PosPayment(Method: reader["PaymentType"]?.ToString() ?? "Unknown", Amount: paymentAmount));
            }

            orders.Add(new PosOrder(
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
                Items: Array.Empty<PosLineItem>(),
                Payments: payments,
                Customer: BuildCustomer(reader),
                Inventory: Array.Empty<PosInventoryConsumed>(),
                Shift: BuildShift(reader)
            ));
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

    public async Task MarkOrderProcessedAsync(
        string billId,
        string saleId,
        CancellationToken cancellationToken,
        bool allowZeroLines = false)
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

            if (saleRows == 0 || (!allowZeroLines && lineRows == 0))
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
        return await CountExportableUnsyncedSalesAsync(cancellationToken);
    }

    /// <summary>
    /// Pending bills that have at least one Saledetails row (excludes zero-line noise).
    /// </summary>
    public async Task<int> CountExportableUnsyncedSalesAsync(CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT COUNT(DISTINCT s.Id) AS Cnt
FROM dbo.Sale s WITH (NOLOCK)
INNER JOIN dbo.BillType bt WITH (NOLOCK) ON bt.saleid = s.Id
WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
  AND EXISTS (
    SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id
  );";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn);
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result);
    }

    /// <summary>
    /// Zero-line pending bills cannot sync outlet_sales; mark Processed so the queue drains.
    /// </summary>
    public async Task<int> AutoMarkZeroLinePendingProcessedAsync(CancellationToken cancellationToken)
    {
        const string sql = @"
UPDATE s
SET s.uploadstatus = 'Processed'
FROM dbo.Sale s
WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
  AND NOT EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);

UPDATE bt
SET bt.uploadStatus = 'Processed'
FROM dbo.BillType bt
INNER JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE s.uploadstatus = 'Processed'
  AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
  AND NOT EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn);
        return await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public sealed record ProcessedBillRef(string BillId, string SaleId);

    /// <summary>
    /// Recent Processed bills that have product lines — candidates for Supabase orphan reclaim.
    /// </summary>
    public async Task<IReadOnlyList<ProcessedBillRef>> ReadRecentProcessedBillsAsync(
        DateTime? minSaleDate,
        int limit,
        CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT TOP (@Limit)
    CAST(bt.id AS nvarchar(64)) AS BillId,
    CAST(s.Id AS nvarchar(64)) AS SaleId
FROM dbo.Sale s WITH (NOLOCK)
INNER JOIN dbo.BillType bt WITH (NOLOCK) ON bt.saleid = s.Id
WHERE s.uploadstatus = 'Processed'
  AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
  AND (@MinSaleDate IS NULL OR CAST(s.Date AS date) >= CAST(@MinSaleDate AS date))
ORDER BY s.Date DESC, s.Id DESC;";

        var rows = new List<ProcessedBillRef>();
        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@Limit", Math.Max(1, limit));
        cmd.Parameters.AddWithValue("@MinSaleDate", (object?)minSaleDate?.Date ?? DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var billId = reader["BillId"]?.ToString();
            var saleId = reader["SaleId"]?.ToString();
            if (string.IsNullOrWhiteSpace(billId) || string.IsNullOrWhiteSpace(saleId))
            {
                continue;
            }

            rows.Add(new ProcessedBillRef(billId, saleId));
        }

        return rows;
    }

    /// <summary>
    /// Force-requeue Processed bills as Pending so they upload again (orphan reclaim).
    /// </summary>
    public async Task<int> RequeueBillsAsPendingAsync(
        IReadOnlyCollection<string> billIds,
        CancellationToken cancellationToken)
    {
        var ids = billIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (ids.Length == 0)
        {
            return 0;
        }

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(cancellationToken);
        try
        {
            var affected = 0;
            foreach (var chunk in ids.Chunk(50))
            {
                var paramNames = new string[chunk.Length];
                await using var saleCmd = new SqlCommand(string.Empty, conn, tx);
                await using var billCmd = new SqlCommand(string.Empty, conn, tx);
                await using var lineCmd = new SqlCommand(string.Empty, conn, tx);

                for (var i = 0; i < chunk.Length; i++)
                {
                    var name = $"@b{i}";
                    paramNames[i] = name;
                    saleCmd.Parameters.Add(name, SqlDbType.NVarChar, 64).Value = chunk[i];
                    billCmd.Parameters.Add(name, SqlDbType.NVarChar, 64).Value = chunk[i];
                    lineCmd.Parameters.Add(name, SqlDbType.NVarChar, 64).Value = chunk[i];
                }

                var inList = string.Join(", ", paramNames);
                saleCmd.CommandText = $@"
UPDATE s
SET s.uploadstatus = 'Pending'
FROM dbo.Sale s
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
WHERE CAST(bt.id AS nvarchar(64)) IN ({inList});";
                billCmd.CommandText = $@"
UPDATE dbo.BillType
SET uploadStatus = 'Pending'
WHERE CAST(id AS nvarchar(64)) IN ({inList});";
                lineCmd.CommandText = $@"
UPDATE sd
SET sd.uploadstatus = 'Pending'
FROM dbo.Saledetails sd
INNER JOIN dbo.BillType bt ON bt.saleid = sd.saleid
WHERE CAST(bt.id AS nvarchar(64)) IN ({inList});";

                affected += await saleCmd.ExecuteNonQueryAsync(cancellationToken);
                affected += await billCmd.ExecuteNonQueryAsync(cancellationToken);
                affected += await lineCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            await tx.CommitAsync(cancellationToken);
            return affected;
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
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

    private static readonly IReadOnlyDictionary<int, string> MintPosShiftNames =
        new Dictionary<int, string>
        {
            [1] = "Day",
            [2] = "Night",
            [3] = "Midnight",
        };

    private static string? ResolveShiftName(int? shiftId, string? shiftName)
    {
        if (!string.IsNullOrWhiteSpace(shiftName))
        {
            return shiftName;
        }

        if (shiftId.HasValue && MintPosShiftNames.TryGetValue(shiftId.Value, out var fallback))
        {
            return fallback;
        }

        return null;
    }

    private static PosShift? BuildShift(SqlDataReader reader)
    {
        var sessionShiftId = TryGetInt32(reader, "SessionShiftId");
        var saleShiftId = TryGetInt32(reader, "SaleShiftId");
        var shiftId = TryGetInt32(reader, "SaleShiftId")
            ?? TryGetInt32(reader, "SessionShiftId")
            ?? TryGetInt32(reader, "ResolvedShiftId");
        var shiftName = ResolveShiftName(shiftId, TryGetString(reader, "ShiftName"));
        var terminal = TryGetString(reader, "Terminal");
        var sessionId = TryGetInt32(reader, "ShiftSessionId");
        var sessionStatus = TryGetString(reader, "ShiftSessionStatus");
        var sessionStart = TryGetDateTimeOffset(reader, "ShiftSessionStart");
        var sessionEnd = TryGetDateTimeOffset(reader, "ShiftSessionEnd");
        var openedBy = TryGetString(reader, "ShiftOpenedBy");

        if (shiftId is null
            && string.IsNullOrWhiteSpace(shiftName)
            && string.IsNullOrWhiteSpace(terminal)
            && sessionId is null)
        {
            return null;
        }

        var shiftSource = saleShiftId.HasValue
            ? "sale_shift_id"
            : sessionShiftId.HasValue
                ? "shift_start_session"
                : null;

        return new PosShift(
            ShiftId: shiftId,
            ShiftName: shiftName,
            Terminal: terminal,
            SessionId: sessionId,
            SessionStatus: sessionStatus,
            SessionStart: sessionStart,
            SessionEnd: sessionEnd,
            OpenedBy: openedBy,
            ShiftSource: shiftSource
        );
    }

    private static int? TryGetInt32(SqlDataReader reader, string columnName)
    {
        var ordinal = TryGetOrdinal(reader, columnName);
        if (ordinal is null || reader.IsDBNull(ordinal.Value))
        {
            return null;
        }

        return Convert.ToInt32(reader.GetValue(ordinal.Value));
    }

    private static DateTimeOffset? TryGetDateTimeOffset(SqlDataReader reader, string columnName)
    {
        var ordinal = TryGetOrdinal(reader, columnName);
        if (ordinal is null || reader.IsDBNull(ordinal.Value))
        {
            return null;
        }

        var value = reader.GetDateTime(ordinal.Value);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Unspecified), TimeSpan.Zero);
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
