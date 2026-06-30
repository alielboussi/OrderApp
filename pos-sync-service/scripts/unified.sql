-- Afterten SCPGT middleware — MintPOS SQL grants (Till 2 / outlet POS)
-- Run once in SQL Server Management Studio against the outlet MintPOS database.
--
-- Grants the middleware SQL login permission to:
--   • read pending sales and mark them Processed (BillType, Sale, Saledetails, InventoryConsumed)
--   • read shift metadata (Shifts, ShiftStart, Users)
--   • push/pull catalog (MenuGroup, MenuItem, ModifierFlavour)
--
-- 1) Change @Principal if your SQL login/user is not named "mint".
-- 2) Change USE [MINTPOS] if your database name differs.
-- 3) Safe to re-run: grants are idempotent.

USE [MINTPOS];
GO

DECLARE @Principal sysname = N'mint';
DECLARE @sql nvarchar(max);

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @Principal)
BEGIN
    SET @sql = N'CREATE USER ' + QUOTENAME(@Principal) + N' FOR LOGIN ' + QUOTENAME(@Principal) + N';';
    EXEC sp_executesql @sql;
END
GO

DECLARE @Principal sysname = N'mint';
DECLARE @sql nvarchar(max);

-- Sales sync: read pending rows + mark uploadStatus/uploadstatus = 'Processed'
-- Middleware queues on Sale.uploadstatus (Pending); BillType may be Processed before upload completes.
SET @sql = N'GRANT SELECT, UPDATE ON dbo.BillType TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT, UPDATE ON dbo.Sale TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

-- MintPOS schema uses dbo.Saledetails (lowercase "d"); some installs may be SaleDetails.
IF OBJECT_ID(N'dbo.Saledetails', N'U') IS NOT NULL
BEGIN
    SET @sql = N'GRANT SELECT, UPDATE ON dbo.Saledetails TO ' + QUOTENAME(@Principal) + N';';
    EXEC sp_executesql @sql;
END
ELSE IF OBJECT_ID(N'dbo.SaleDetails', N'U') IS NOT NULL
BEGIN
    SET @sql = N'GRANT SELECT, UPDATE ON dbo.SaleDetails TO ' + QUOTENAME(@Principal) + N';';
    EXEC sp_executesql @sql;
END
ELSE
BEGIN
    RAISERROR('Neither dbo.Saledetails nor dbo.SaleDetails exists.', 16, 1);
END

SET @sql = N'GRANT SELECT, UPDATE ON dbo.InventoryConsumed TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

-- Shift metadata (read only)
SET @sql = N'GRANT SELECT ON dbo.Shifts TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT ON dbo.ShiftStart TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT ON dbo.Users TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

-- Catalog push/pull (menu groups, products, variants)
SET @sql = N'GRANT SELECT, INSERT, UPDATE ON dbo.MenuGroup TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.MenuItem TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.ModifierFlavour TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
GO

-- Verify grants (optional)
SELECT
    dp.name AS principal_name,
    o.name AS object_name,
    p.permission_name,
    p.state_desc
FROM sys.database_permissions p
JOIN sys.database_principals dp ON p.grantee_principal_id = dp.principal_id
JOIN sys.objects o ON p.major_id = o.object_id
WHERE dp.name = N'mint'
  AND o.name IN (
      'BillType', 'Sale', 'Saledetails', 'SaleDetails', 'InventoryConsumed',
      'Shifts', 'ShiftStart', 'Users',
      'MenuGroup', 'MenuItem', 'ModifierFlavour'
  )
ORDER BY o.name, p.permission_name;
