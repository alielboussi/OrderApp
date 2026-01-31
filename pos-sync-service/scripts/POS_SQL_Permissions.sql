-- Run in SQL Server (MINTPOS)
USE [MINTPOS];
GO

-- Ensure user exists for login
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mint')
BEGIN
  CREATE USER [mint] FOR LOGIN [mint];
END
GO

-- Grant rights needed for POS sync to mark processed
GRANT SELECT, UPDATE ON dbo.Sale TO [mint];
GRANT SELECT, UPDATE ON dbo.Saledetails TO [mint];
GRANT SELECT, UPDATE ON dbo.BillType TO [mint];
