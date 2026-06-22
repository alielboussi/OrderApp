-- Unified MintPOS permissions for Afterten SCPGT middleware
-- Run in SQL Server Management Studio against the outlet POS database.
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

-- Sales sync (read + mark processed)
SET @sql = N'GRANT SELECT, UPDATE ON dbo.Sale TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT, UPDATE ON dbo.BillType TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT, UPDATE ON dbo.SaleDetails TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

SET @sql = N'GRANT SELECT, UPDATE ON dbo.InventoryConsumed TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

-- Shift sync (read only)
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
      'Sale', 'BillType', 'SaleDetails', 'InventoryConsumed',
      'Shifts', 'ShiftStart', 'Users',
      'MenuGroup', 'MenuItem', 'ModifierFlavour'
  )
ORDER BY o.name, p.permission_name;
