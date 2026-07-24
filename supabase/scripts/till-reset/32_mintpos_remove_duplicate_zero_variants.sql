-- =============================================================================
-- 32 — MintPOS: remove duplicate zero-price variants created by catalog push
-- =============================================================================
-- WHERE: SSMS on Quick Corner PC (or any till with duplicate flavours)
-- WHEN:  Catalog push inserted new ModifierFlavour rows with Name2 = short SKU
--        (e.g. 95, 96) and price/GrossPrice = 0, while the original row still
--        exists with barcode Name2 and correct prices.
--
-- BEFORE RUNNING:
--   1. Stop SCPGT on this till.
--   2. Run the PREVIEW query and confirm rows marked duplicate_zero are junk.
--   3. Run DELETE only when preview looks correct.
-- =============================================================================

USE [MINTPOS];
GO

DECLARE @outlet_label varchar(50) = 'Quick Corner';  -- ← change per PC

-- PREVIEW: zero-price rows that duplicate a priced flavour on the same product
SELECT
  @outlet_label AS outlet,
  mi.Code AS parent_sku,
  mi.Name AS parent_name,
  mf_dup.Id AS duplicate_id,
  mf_dup.name AS duplicate_name,
  mf_dup.Name2 AS duplicate_name2,
  mf_dup.price AS duplicate_net,
  mf_dup.GrossPrice AS duplicate_gross,
  mf_keep.Id AS keep_id,
  mf_keep.Name2 AS keep_name2,
  mf_keep.price AS keep_net,
  mf_keep.GrossPrice AS keep_gross
FROM dbo.ModifierFlavour mf_dup
INNER JOIN dbo.MenuItem mi ON mi.Id = mf_dup.MenuItemId
INNER JOIN dbo.ModifierFlavour mf_keep
  ON mf_keep.MenuItemId = mf_dup.MenuItemId
 AND mf_keep.Id <> mf_dup.Id
 AND LTRIM(RTRIM(mf_keep.name)) = LTRIM(RTRIM(mf_dup.name))
 AND COALESCE(mf_keep.GrossPrice, mf_keep.price, 0) > 0
WHERE COALESCE(mf_dup.GrossPrice, 0) <= 0
  AND COALESCE(mf_dup.price, 0) <= 0
  AND COALESCE(mf_dup.Status, 'Active') = 'Active'
  AND COALESCE(mi.Status, 'Active') = 'Active'
ORDER BY mi.Code, mf_dup.name, mf_dup.Id;

-- DELETE duplicate zero-price rows (uncomment after preview)
/*
DELETE mf_dup
FROM dbo.ModifierFlavour mf_dup
INNER JOIN dbo.MenuItem mi ON mi.Id = mf_dup.MenuItemId
INNER JOIN dbo.ModifierFlavour mf_keep
  ON mf_keep.MenuItemId = mf_dup.MenuItemId
 AND mf_keep.Id <> mf_dup.Id
 AND LTRIM(RTRIM(mf_keep.name)) = LTRIM(RTRIM(mf_dup.name))
 AND COALESCE(mf_keep.GrossPrice, mf_keep.price, 0) > 0
WHERE COALESCE(mf_dup.GrossPrice, 0) <= 0
  AND COALESCE(mf_dup.price, 0) <= 0
  AND COALESCE(mf_dup.Status, 'Active') = 'Active'
  AND COALESCE(mi.Status, 'Active') = 'Active';

SELECT @@ROWCOUNT AS duplicate_variants_deleted;
*/

GO
