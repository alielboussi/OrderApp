-- =============================================================================
-- 30b — MintPOS: check bill 1689770 upload status (Till 2 PC)
-- =============================================================================
-- WHERE: SSMS on Till 2 → database MINTPOS
--
-- Bill 1689770 failed with RPC 520 at 20:55. Upload failures leave the sale
-- Pending — SCPGT retries on the next sync cycle when it reaches that bill again.
-- =============================================================================

USE [MINTPOS];
GO

SET NOCOUNT ON;

DECLARE @BillId int = 1689770;

-- Sale / bill upload status
SELECT
  bt.id AS bill_id,
  s.Id AS sale_id,
  s.uploadstatus AS sale_upload_status,
  bt.uploadStatus AS bill_upload_status,
  s.Date AS sale_date
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE bt.id = @BillId;

-- Line items (should all map: 217, 104, 72 variants, 184)
SELECT
  sd.id AS line_id,
  mi.Code AS item_sku,
  mi.Name AS item_name,
  mf.Name2 AS variant_sku,
  mf.Name AS variant_name,
  sd.Quantity AS qty,
  sd.Price AS unit_price,
  sd.uploadstatus AS line_upload_status
FROM dbo.Saledetails sd WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = sd.saleid
JOIN dbo.BillType bt WITH (NOLOCK) ON bt.saleid = s.Id
JOIN dbo.MenuItem mi WITH (NOLOCK) ON mi.Id = sd.MenuItemId
LEFT JOIN dbo.ModifierFlavour mf WITH (NOLOCK) ON mf.Id = sd.FlavourId
WHERE bt.id = @BillId
ORDER BY sd.id;

-- Also check the two mapping-blocked bills
SELECT
  bt.id AS bill_id,
  s.Id AS sale_id,
  s.uploadstatus AS sale_upload_status,
  bt.uploadStatus AS bill_upload_status
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE bt.id IN (1680370, 1680866, 1689770)
ORDER BY bt.id;
