-- =============================================================================
-- 26 — Till 1 MintPOS: remove orphan products without SKU
-- =============================================================================
-- WHERE: SSMS → MINTPOS on Till 1 PC
-- WHEN:  After catalog sync verified (script 20 export)
--
-- Removes:
--   • Id 351 — Slush With Icecream (no SKU)
--   • Id 353 — Medium Paper Packers (no SKU)
--
-- IMPORTANT: Press F5 on the WHOLE file (do not run a highlighted section).
--
-- PASS: final verify query returns 0 rows; script 20 → products_missing_sku = 0
-- =============================================================================

USE [MINTPOS];
GO

-- A) Preflight — expect 2 rows, sale_lines = 0
SELECT
  mi.Id AS MenuItemId,
  mi.Name AS ItemName,
  mi.MenuGroupId,
  mg.Name AS menu_group_name,
  (SELECT COUNT(*) FROM dbo.Saledetails sd WHERE sd.MenuItemId = mi.Id) AS sale_lines_direct,
  (SELECT COUNT(*)
   FROM dbo.Saledetails sd
   INNER JOIN dbo.ModifierFlavour mf ON mf.Id = sd.FlavourId
   WHERE mf.MenuItemId = mi.Id) AS sale_lines_via_variant
FROM dbo.MenuItem mi
LEFT JOIN dbo.MenuGroup mg ON mg.Id = mi.MenuGroupId
WHERE mi.Id IN (351, 353)
  AND NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL;
GO

-- B) Delete orphans
BEGIN TRANSACTION;

DELETE sd
FROM dbo.Saledetails sd
INNER JOIN dbo.ModifierFlavour mf ON mf.Id = sd.FlavourId
WHERE mf.MenuItemId IN (351, 353);

DELETE sd
FROM dbo.Saledetails sd
WHERE sd.MenuItemId IN (351, 353);

DELETE mf
FROM dbo.ModifierFlavour mf
WHERE mf.MenuItemId IN (351, 353);

DELETE mi
FROM dbo.MenuItem mi
WHERE mi.Id IN (351, 353)
  AND NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL;

COMMIT TRANSACTION;
GO

-- C) Verify — must return 0 rows
SELECT
  mi.Id AS mintpos_item_id,
  mi.Name AS product_name,
  mi.MenuGroupId,
  mg.Name AS menu_group_name
FROM dbo.MenuItem mi
LEFT JOIN dbo.MenuGroup mg ON mg.Id = mi.MenuGroupId
WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL
  AND COALESCE(mi.Status, 'Active') = 'Active'
ORDER BY mi.MenuGroupId, mi.Name;
GO
