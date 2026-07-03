-- MintPOS monitor 1d — oldest pending bills (SSMS → MINTPOS)

USE [MINTPOS];
GO

DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

SELECT TOP 20
  bt.id AS pos_bill_id,
  @OutletUuid + '-' + CAST(bt.id AS varchar(20)) AS source_event_id,
  s.uploadstatus,
  bt.uploadStatus,
  s.Date AS sale_date
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
   OR (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
ORDER BY bt.id ASC;
