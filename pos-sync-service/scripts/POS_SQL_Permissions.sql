-- Run in SQL Server Management Studio against the POS database.
-- Change @Principal if your SQL login/user is not named "mint".
USE [MINTPOS];
GO

DECLARE @Principal sysname = N'mint';
DECLARE @sql nvarchar(max);

-- Ensure DB user exists for the login.
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @Principal)
BEGIN
    SET @sql = N'CREATE USER ' + QUOTENAME(@Principal) + N' FOR LOGIN ' + QUOTENAME(@Principal) + N';';
    EXEC sp_executesql @sql;
END
GO

DECLARE @Principal sysname = N'mint';
DECLARE @sql nvarchar(max);

-- Sales read + processed marking
SET @sql = N'GRANT SELECT, UPDATE ON dbo.Sale TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
SET @sql = N'GRANT SELECT, UPDATE ON dbo.BillType TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
SET @sql = N'GRANT SELECT, UPDATE ON dbo.SaleDetails TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
SET @sql = N'GRANT SELECT, UPDATE ON dbo.InventoryConsumed TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;

-- Catalog read + update/delete operations
SET @sql = N'GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.MenuItem TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
SET @sql = N'GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.ModifierFlavour TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
SET @sql = N'GRANT SELECT, INSERT, UPDATE ON dbo.MenuGroup TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
SET @sql = N'GRANT SELECT, UPDATE, DELETE ON dbo.SaleDetails TO ' + QUOTENAME(@Principal) + N';';
EXEC sp_executesql @sql;
GO
