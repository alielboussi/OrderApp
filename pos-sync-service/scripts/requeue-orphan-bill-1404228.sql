-- Quick Corner: false Processed bill missing from Supabase
-- bill_id 1404228 / sale_id 1402265 (Chicken Donner Kebab Day 14 Jul)
-- Run on MintPOS Quick Corner DB, then let SCPGT poll (or restart service).

UPDATE dbo.Sale
SET uploadstatus = 'Pending'
WHERE Id = 1402265;

UPDATE dbo.BillType
SET uploadStatus = 'Pending'
WHERE id = 1404228;

UPDATE dbo.Saledetails
SET uploadstatus = 'Pending'
WHERE saleid = 1402265;

-- Verify
SELECT
  bt.id AS bill_id,
  s.Id AS sale_id,
  s.uploadstatus AS sale_upload,
  bt.uploadStatus AS bill_upload,
  s.Date,
  s.time,
  s.Shiftid
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE bt.id = 1404228;
