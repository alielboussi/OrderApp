-- MintPOS monitor 1e — bills with product lines (SSMS → MINTPOS)

USE [MINTPOS];
GO

SELECT COUNT(DISTINCT bt.id) AS bills_with_lines
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id);
