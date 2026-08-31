/*
  MintPOS → Supabase catalog export (SSMS, database MINTPOS)

  1. Run this script
  2. One row appears — click the cell, Ctrl+A, Ctrl+C
  3. Paste into Notepad → Save As mintpos-catalog-export.json
  4. On dev PC:
       node firebase/scripts/mintpos-catalog-import-supabase.cjs --from-json exports/mintpos/catalog.json
*/

SET NOCOUNT ON;

SELECT
  JSON_QUERY((
    SELECT
      mg.Id AS pos_menu_group_id,
      LTRIM(RTRIM(mg.Name)) AS group_name
    FROM dbo.MenuGroup mg WITH (NOLOCK)
    WHERE NULLIF(LTRIM(RTRIM(mg.Name)), '') IS NOT NULL
    ORDER BY mg.Id
    FOR JSON PATH
  )) AS menu_groups,
  JSON_QUERY((
    SELECT
      mi.Id AS pos_item_id,
      LTRIM(RTRIM(mi.Code)) AS item_sku,
      LTRIM(RTRIM(mi.Name)) AS item_name,
      mi.MenuGroupId AS pos_menu_group_id,
      COALESCE(
        NULLIF(mi.GrossPrice, 0),
        CASE WHEN mi.Price IS NOT NULL AND mi.Price > 0 THEN ROUND(mi.Price * 1.16, 2) ELSE NULL END,
        0
      ) AS selling_price,
      COALESCE(mi.Status, 'Active') AS item_status,
      mf.Id AS pos_flavour_id,
      LTRIM(RTRIM(mf.Name)) AS variant_name,
      COALESCE(NULLIF(LTRIM(RTRIM(mf.Name2)), ''), CAST(mf.Id AS nvarchar(100))) AS variant_sku,
      COALESCE(
        NULLIF(mf.GrossPrice, 0),
        CASE WHEN mf.Price IS NOT NULL AND mf.Price > 0 THEN ROUND(mf.Price * 1.16, 2) ELSE NULL END,
        NULL
      ) AS variant_selling_price,
      COALESCE(mf.Status, 'Active') AS variant_status
    FROM dbo.MenuItem mi WITH (NOLOCK)
    LEFT JOIN dbo.ModifierFlavour mf WITH (NOLOCK) ON mf.MenuItemId = mi.Id
    WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
      AND COALESCE(mi.Status, 'Active') = 'Active'
      AND (mf.Id IS NULL OR COALESCE(mf.Status, 'Active') = 'Active')
    ORDER BY mi.Id, mf.Id
    FOR JSON PATH
  )) AS catalog_rows
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
