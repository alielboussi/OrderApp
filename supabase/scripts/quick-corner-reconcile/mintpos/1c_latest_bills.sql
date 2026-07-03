-- MintPOS monitor 1c — latest 10 bills (SSMS → MINTPOS)

USE [MINTPOS];
GO

DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

SELECT TOP 10
  bt.id AS pos_bill_id,
  @OutletUuid + '-' + CAST(bt.id AS varchar(20)) AS source_event_id,
  s.Date AS sale_date,
  s.time AS sale_time,
  s.uploadstatus AS sale_uploadstatus,
  bt.uploadStatus AS bill_uploadstatus
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
ORDER BY bt.id DESC;
