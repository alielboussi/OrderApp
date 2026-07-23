-- =============================================================================
-- 26b — Till 2 MintPOS: remove orphan products without SKU
-- =============================================================================
-- WHERE: SSMS → MINTPOS on Till 2 PC
-- WHEN:  After Till 1 orphan cleanup (script 26) and catalog sync verified
--
-- Discovers and removes every active MenuItem with no Code (SKU).
-- Till 1 had Id 351 (Slush With Icecream) and 353 (Medium Paper Packers).
-- Till 2 may use the same or different Ids — this script finds them automatically.
--
-- IMPORTANT: Press F5 on the WHOLE file (do not run a highlighted section).
--
-- PASS: section A shows orphans with sale_lines = 0
--       section C returns 0 rows
--       script 20 (@outlet_label = 'Till 2') → products_missing_sku = 0
-- =============================================================================

USE [MINTPOS];
GO

-- A) Preflight — review before delete (expect same 2 orphans as Till 1)
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
WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL
  AND COALESCE(mi.Status, 'Active') = 'Active'
ORDER BY mi.MenuGroupId, mi.Name;
GO

-- B) Delete orphans (single batch — do not split on GO)
BEGIN TRANSACTION;

IF OBJECT_ID('tempdb..#orphans') IS NOT NULL
  DROP TABLE #orphans;

SELECT mi.Id
INTO #orphans
FROM dbo.MenuItem mi
WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL
  AND COALESCE(mi.Status, 'Active') = 'Active';

IF EXISTS (
  SELECT 1
  FROM #orphans o
  WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.MenuItemId = o.Id)
     OR EXISTS (
       SELECT 1
       FROM dbo.Saledetails sd
       INNER JOIN dbo.ModifierFlavour mf ON mf.Id = sd.FlavourId
       WHERE mf.MenuItemId = o.Id
     )
)
BEGIN
  ROLLBACK TRANSACTION;
  RAISERROR('Abort: orphan product(s) have sale history — review section A before deleting.', 16, 1);
END
ELSE
BEGIN
  DELETE sd
  FROM dbo.Saledetails sd
  INNER JOIN dbo.ModifierFlavour mf ON mf.Id = sd.FlavourId
  WHERE mf.MenuItemId IN (SELECT Id FROM #orphans);

  DELETE sd
  FROM dbo.Saledetails sd
  WHERE sd.MenuItemId IN (SELECT Id FROM #orphans);

  DELETE mf
  FROM dbo.ModifierFlavour mf
  WHERE mf.MenuItemId IN (SELECT Id FROM #orphans);

  DELETE mi
  FROM dbo.MenuItem mi
  WHERE mi.Id IN (SELECT Id FROM #orphans)
    AND NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL;

  COMMIT TRANSACTION;
END;
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
