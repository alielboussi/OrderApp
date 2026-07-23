-- =============================================================================
-- 20 — MintPOS catalog JSON export (single string — copy/paste to compare)
-- =============================================================================
-- WHERE: SSMS → MINTPOS database
--
-- Change @outlet_label before each run:
--   Till 1 PC        → 'Till 1'
--   Till 2 PC        → 'Till 2'
--   Quick Corner PC  → 'Quick Corner'
--
-- OUTPUT: One row, one column: catalog_json (copy the full cell value)
-- =============================================================================

DECLARE @outlet_label varchar(50) = 'Till 1';  -- ← CHANGE THIS

SELECT (
  SELECT
    @outlet_label AS outlet,
    CONVERT(varchar(33), GETDATE(), 126) AS generated_at,
    JSON_QUERY((
      SELECT
        COUNT(DISTINCT mg.Id) AS menu_groups,
        (
          SELECT COUNT(*)
          FROM dbo.MenuItem mi
          WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
        ) AS products_with_sku,
        (
          SELECT COUNT(*)
          FROM dbo.ModifierFlavour mf
          WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
        ) AS variants_with_sku,
        (
          SELECT COUNT(*)
          FROM dbo.MenuItem mi
          WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL
        ) AS products_missing_sku
      FROM dbo.MenuGroup mg
      WHERE EXISTS (
        SELECT 1 FROM dbo.MenuItem mi WHERE mi.MenuGroupId = mg.Id
      )
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )) AS summary,
    JSON_QUERY((
      SELECT
        mg.Id AS group_id,
        LTRIM(RTRIM(mg.Name)) AS group_name,
        JSON_QUERY((
          SELECT
            LTRIM(RTRIM(mi.Code)) AS product_sku,
            LTRIM(RTRIM(mi.Name)) AS product_name,
            JSON_QUERY(ISNULL((
              SELECT
                LTRIM(RTRIM(mf.Name2)) AS variant_sku,
                LTRIM(RTRIM(mf.name)) AS variant_name
              FROM dbo.ModifierFlavour mf
              WHERE mf.MenuItemId = mi.Id
                AND NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
              ORDER BY LTRIM(RTRIM(mf.Name2)), LTRIM(RTRIM(mf.name))
              FOR JSON PATH
            ), '[]')) AS variants
          FROM dbo.MenuItem mi
          WHERE mi.MenuGroupId = mg.Id
            AND NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
          ORDER BY LTRIM(RTRIM(mi.Code)), LTRIM(RTRIM(mi.Name))
          FOR JSON PATH
        )) AS products
      FROM dbo.MenuGroup mg
      WHERE EXISTS (
        SELECT 1 FROM dbo.MenuItem mi WHERE mi.MenuGroupId = mg.Id
      )
      ORDER BY mg.Id
      FOR JSON PATH
    )) AS menu_groups,
    JSON_QUERY(ISNULL((
      SELECT
        mi.Id AS mintpos_item_id,
        mi.MenuGroupId AS group_id,
        LTRIM(RTRIM(mg.Name)) AS group_name,
        LTRIM(RTRIM(mi.Name)) AS product_name
      FROM dbo.MenuItem mi
      LEFT JOIN dbo.MenuGroup mg ON mg.Id = mi.MenuGroupId
      WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL
      ORDER BY mi.MenuGroupId, mi.Name
      FOR JSON PATH
    ), '[]')) AS products_missing_sku
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
) AS catalog_json;
