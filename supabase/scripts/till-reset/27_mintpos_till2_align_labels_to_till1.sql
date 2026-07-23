-- =============================================================================
-- 27 — Till 2 MintPOS: align product labels to Till 1 (cosmetic)
-- =============================================================================
-- WHERE: SSMS → MINTPOS on Till 2 PC
-- WHEN:  After catalog sync verified
--
-- SKU keys already match Till 1. This only fixes display names for parity.
-- =============================================================================

BEGIN TRANSACTION;

-- A) Raw Chicken Giblets — Till 1 canonical unit label
UPDATE mi
SET Name = 'Raw Chicken Giblets(/500g)',
    uploadstatus = 0
FROM dbo.MenuItem mi
WHERE LTRIM(RTRIM(mi.Code)) = '282'
  AND LTRIM(RTRIM(mi.Name)) <> 'Raw Chicken Giblets(/500g)';

-- B) Cake variant labels on parent 243 — match Till 1
DECLARE @cake_labels TABLE (
  VariantSku varchar(50) NOT NULL PRIMARY KEY,
  Till1Name nvarchar(200) NOT NULL
);

INSERT INTO @cake_labels (VariantSku, Till1Name) VALUES
  ('100', 'Cake 60*60'),
  ('95',  'Cake 19cm'),
  ('96',  'Cake 25cm'),
  ('97',  'Cake 30*30'),
  ('98',  'Cake 40*40'),
  ('99',  'Cake 50*50');

UPDATE mf
SET name = cl.Till1Name,
    UploadStatus = 'Pending'
FROM dbo.ModifierFlavour mf
INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
INNER JOIN @cake_labels cl ON LTRIM(RTRIM(mf.Name2)) = cl.VariantSku
WHERE LTRIM(RTRIM(mi.Code)) = '243'
  AND LTRIM(RTRIM(mf.name)) <> cl.Till1Name;

COMMIT TRANSACTION;

-- C) Verify label diffs vs Till 1 (should be 0 rows for these SKUs)
SELECT
  LTRIM(RTRIM(mi.Code)) AS parent_sku,
  LTRIM(RTRIM(mf.Name2)) AS variant_sku,
  mf.name AS till2_variant_name
FROM dbo.ModifierFlavour mf
INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
WHERE LTRIM(RTRIM(mi.Code)) = '243'
  AND LTRIM(RTRIM(mf.Name2)) IN ('100', '95', '96', '97', '98', '99')
  AND LTRIM(RTRIM(mf.name)) NOT IN (
    'Cake 60*60', 'Cake 19cm', 'Cake 25cm', 'Cake 30*30', 'Cake 40*40', 'Cake 50*50'
  )
ORDER BY mf.Name2;

SELECT
  LTRIM(RTRIM(mi.Code)) AS item_sku,
  mi.Name AS item_name
FROM dbo.MenuItem mi
WHERE LTRIM(RTRIM(mi.Code)) = '282'
  AND LTRIM(RTRIM(mi.Name)) <> 'Raw Chicken Giblets(/500g)';
