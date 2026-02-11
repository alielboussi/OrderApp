-- POS (SQL Server) health checks for uploadstatus and sales detail coverage
-- Adjust @Start as needed.

DECLARE @Start datetime2 = DATEADD(day, -7, SYSUTCDATETIME());

-- 1) Pending vs processed in POS tables (last 7 days)
SELECT
  SUM(CASE WHEN bt.uploadstatus IS NULL OR bt.uploadstatus = 'Pending' THEN 1 ELSE 0 END) AS BillTypePending,
  SUM(CASE WHEN bt.uploadstatus = 'Processed' THEN 1 ELSE 0 END) AS BillTypeProcessed
FROM dbo.BillType bt
JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE s.Date >= CAST(@Start AS date);

SELECT
  SUM(CASE WHEN s.uploadstatus IS NULL OR s.uploadstatus = 'Pending' THEN 1 ELSE 0 END) AS SalePending,
  SUM(CASE WHEN s.uploadstatus = 'Processed' THEN 1 ELSE 0 END) AS SaleProcessed
FROM dbo.Sale s
WHERE s.Date >= CAST(@Start AS date);

SELECT
  SUM(CASE WHEN sd.uploadstatus IS NULL OR sd.uploadstatus = 'Pending' THEN 1 ELSE 0 END) AS SaleDetailsPending,
  SUM(CASE WHEN sd.uploadstatus = 'Processed' THEN 1 ELSE 0 END) AS SaleDetailsProcessed
FROM dbo.Saledetails sd
JOIN dbo.Sale s ON s.Id = sd.saleid
WHERE s.Date >= CAST(@Start AS date);

-- 2) Sales detail coverage by MenuItem + Flavour (last 7 days)
SELECT
  sd.MenuItemId,
  sd.FlavourId,
  COUNT(*) AS line_count,
  SUM(sd.Quantity) AS qty
FROM dbo.Saledetails sd
JOIN dbo.Sale s ON s.Id = sd.saleid
WHERE s.Date >= CAST(@Start AS date)
GROUP BY sd.MenuItemId, sd.FlavourId
ORDER BY qty DESC;

-- 3) POS sales lines missing MenuItem/Flavour IDs
SELECT
  COUNT(*) AS MissingItemOrFlavour
FROM dbo.Saledetails sd
JOIN dbo.Sale s ON s.Id = sd.saleid
WHERE s.Date >= CAST(@Start AS date)
  AND (sd.MenuItemId IS NULL OR sd.FlavourId IS NULL);
