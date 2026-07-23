-- =============================================================================
-- 28 — MintPOS catalog selling prices export (GrossPrice)
-- =============================================================================
-- WHERE: SSMS → MINTPOS on each outlet PC
-- RUN:   Till 1, Till 2, Quick Corner (change @outlet_label each time)
--
-- Maps to Supabase:
--   dbo.MenuItem.Code              → catalog_items.sku        → selling_price
--   dbo.ModifierFlavour.Name2      → catalog_variants.sku     → selling_price
--   dbo.*.GrossPrice (tax-inclusive) → catalog_items / catalog_variants.selling_price
--
-- OUTPUT:
--   A) Summary counts
--   B) Products — copy grid if needed
--   C) Variants — copy grid if needed
--   D) price_json — copy full cell for script 29 (Supabase import)
-- =============================================================================

USE [MINTPOS];
GO

DECLARE @outlet_label varchar(50) = 'Till 1';  -- ← Till 1 | Till 2 | Quick Corner

-- A) Summary
SELECT
  @outlet_label AS outlet,
  (
    SELECT COUNT(*)
    FROM dbo.MenuItem mi
    WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
      AND COALESCE(mi.Status, 'Active') = 'Active'
  ) AS active_products_with_sku,
  (
    SELECT COUNT(*)
    FROM dbo.MenuItem mi
    WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
      AND COALESCE(mi.Status, 'Active') = 'Active'
      AND mi.GrossPrice IS NOT NULL
      AND mi.GrossPrice > 0
  ) AS products_with_gross_price,
  (
    SELECT COUNT(*)
    FROM dbo.ModifierFlavour mf
    INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
    WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
      AND COALESCE(mf.Status, 'Active') = 'Active'
      AND COALESCE(mi.Status, 'Active') = 'Active'
  ) AS active_variants_with_sku,
  (
    SELECT COUNT(*)
    FROM dbo.ModifierFlavour mf
    INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
    WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
      AND COALESCE(mf.Status, 'Active') = 'Active'
      AND COALESCE(mi.Status, 'Active') = 'Active'
      AND mf.GrossPrice IS NOT NULL
      AND mf.GrossPrice > 0
  ) AS variants_with_gross_price;
GO

-- B) Products
DECLARE @outlet_label varchar(50) = 'Till 1';  -- ← keep in sync with section D

SELECT
  @outlet_label AS outlet,
  LTRIM(RTRIM(mi.Code)) AS product_sku,
  LTRIM(RTRIM(mi.Name)) AS product_name,
  mg.Id AS menu_group_id,
  LTRIM(RTRIM(mg.Name)) AS menu_group_name,
  CAST(mi.Price AS decimal(18, 2)) AS net_price,
  CAST(mi.GrossPrice AS decimal(18, 2)) AS gross_price,
  (
    SELECT COUNT(*)
    FROM dbo.ModifierFlavour mf
    WHERE mf.MenuItemId = mi.Id
      AND NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
      AND COALESCE(mf.Status, 'Active') = 'Active'
  ) AS variant_count
FROM dbo.MenuItem mi
LEFT JOIN dbo.MenuGroup mg ON mg.Id = mi.MenuGroupId
WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
  AND COALESCE(mi.Status, 'Active') = 'Active'
ORDER BY mg.Id, LTRIM(RTRIM(mi.Code)), LTRIM(RTRIM(mi.Name));
GO

-- C) Variants
DECLARE @outlet_label varchar(50) = 'Till 1';  -- ← keep in sync with section D

SELECT
  @outlet_label AS outlet,
  LTRIM(RTRIM(mi.Code)) AS parent_sku,
  LTRIM(RTRIM(mi.Name)) AS parent_name,
  LTRIM(RTRIM(mf.Name2)) AS variant_sku,
  LTRIM(RTRIM(mf.name)) AS variant_name,
  CAST(mf.price AS decimal(18, 2)) AS net_price,
  CAST(mf.GrossPrice AS decimal(18, 2)) AS gross_price
FROM dbo.ModifierFlavour mf
INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
  AND COALESCE(mf.Status, 'Active') = 'Active'
  AND COALESCE(mi.Status, 'Active') = 'Active'
ORDER BY LTRIM(RTRIM(mi.Code)), LTRIM(RTRIM(mf.Name2)), LTRIM(RTRIM(mf.name));
GO

-- D) JSON export — copy the full price_json cell into script 29
DECLARE @outlet_label varchar(50) = 'Till 1';  -- ← CHANGE THIS per PC

SELECT (
  SELECT
    @outlet_label AS outlet,
    CONVERT(varchar(33), GETDATE(), 126) AS generated_at,
    JSON_QUERY((
      SELECT
        COUNT(*) AS active_products_with_sku,
        SUM(CASE WHEN mi.GrossPrice IS NOT NULL AND mi.GrossPrice > 0 THEN 1 ELSE 0 END) AS products_with_gross_price,
        (
          SELECT COUNT(*)
          FROM dbo.ModifierFlavour mf
          INNER JOIN dbo.MenuItem mi2 ON mi2.Id = mf.MenuItemId
          WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
            AND COALESCE(mf.Status, 'Active') = 'Active'
            AND COALESCE(mi2.Status, 'Active') = 'Active'
        ) AS active_variants_with_sku,
        (
          SELECT COUNT(*)
          FROM dbo.ModifierFlavour mf
          INNER JOIN dbo.MenuItem mi2 ON mi2.Id = mf.MenuItemId
          WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
            AND COALESCE(mf.Status, 'Active') = 'Active'
            AND COALESCE(mi2.Status, 'Active') = 'Active'
            AND mf.GrossPrice IS NOT NULL
            AND mf.GrossPrice > 0
        ) AS variants_with_gross_price
      FROM dbo.MenuItem mi
      WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
        AND COALESCE(mi.Status, 'Active') = 'Active'
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )) AS summary,
    JSON_QUERY((
      SELECT
        LTRIM(RTRIM(mi.Code)) AS product_sku,
        LTRIM(RTRIM(mi.Name)) AS product_name,
        CAST(mi.Price AS decimal(18, 2)) AS net_price,
        CAST(mi.GrossPrice AS decimal(18, 2)) AS gross_price
      FROM dbo.MenuItem mi
      WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
        AND COALESCE(mi.Status, 'Active') = 'Active'
      ORDER BY LTRIM(RTRIM(mi.Code))
      FOR JSON PATH
    )) AS products,
    JSON_QUERY((
      SELECT
        LTRIM(RTRIM(mi.Code)) AS parent_sku,
        LTRIM(RTRIM(mi.Name)) AS parent_name,
        LTRIM(RTRIM(mf.Name2)) AS variant_sku,
        LTRIM(RTRIM(mf.name)) AS variant_name,
        CAST(mf.price AS decimal(18, 2)) AS net_price,
        CAST(mf.GrossPrice AS decimal(18, 2)) AS gross_price
      FROM dbo.ModifierFlavour mf
      INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
      WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
        AND COALESCE(mf.Status, 'Active') = 'Active'
        AND COALESCE(mi.Status, 'Active') = 'Active'
      ORDER BY LTRIM(RTRIM(mi.Code)), LTRIM(RTRIM(mf.Name2))
      FOR JSON PATH
    )) AS variants
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
) AS price_json;
GO
