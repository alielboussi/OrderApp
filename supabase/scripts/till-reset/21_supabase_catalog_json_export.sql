-- =============================================================================
-- 21 — Supabase catalog JSON export (single string — copy/paste to compare)
-- =============================================================================
-- WHERE: Supabase SQL Editor
--
-- OUTPUT: One row, one column: catalog_json (copy the full cell value)
--
-- Compare with script 20 outputs:
--   Till 1 / Till 2  → should match Supabase exactly
--   Quick Corner     → should be a subset of Supabase (same group IDs + SKUs)
-- =============================================================================

SELECT jsonb_build_object(
  'outlet', 'Supabase',
  'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'summary', jsonb_build_object(
    'menu_groups', (
      SELECT COUNT(DISTINCT g.pos_menu_group_id)
      FROM public.catalog_menu_groups g
      WHERE g.active
        AND g.pos_menu_group_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.catalog_items ci
          WHERE ci.menu_group_id = g.id
            AND ci.active
            AND NULLIF(btrim(ci.sku), '') IS NOT NULL
        )
    ),
    'products_with_sku', (
      SELECT COUNT(*)
      FROM public.catalog_items ci
      WHERE ci.active
        AND NULLIF(btrim(ci.sku), '') IS NOT NULL
    ),
    'variants_with_sku', (
      SELECT COUNT(*)
      FROM public.catalog_variants cv
      JOIN public.catalog_items ci ON ci.id = cv.item_id
      WHERE cv.active
        AND ci.active
        AND NULLIF(btrim(cv.sku), '') IS NOT NULL
    ),
    'products_missing_sku', (
      SELECT COUNT(*)
      FROM public.catalog_items ci
      WHERE ci.active
        AND NULLIF(btrim(ci.sku), '') IS NULL
    )
  ),
  'menu_groups', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'group_id', g.pos_menu_group_id,
        'group_name', g.name,
        'products', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'product_sku', btrim(ci.sku),
              'product_name', ci.name,
              'variants', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'variant_sku', btrim(cv.sku),
                    'variant_name', cv.name
                  )
                  ORDER BY btrim(cv.sku), cv.name
                )
                FROM public.catalog_variants cv
                WHERE cv.item_id = ci.id
                  AND cv.active
                  AND NULLIF(btrim(cv.sku), '') IS NOT NULL
              ), '[]'::jsonb)
            )
            ORDER BY btrim(ci.sku), ci.name
          )
          FROM public.catalog_items ci
          WHERE ci.menu_group_id = g.id
            AND ci.active
            AND NULLIF(btrim(ci.sku), '') IS NOT NULL
        ), '[]'::jsonb)
      )
      ORDER BY g.pos_menu_group_id
    )
    FROM public.catalog_menu_groups g
    WHERE g.active
      AND g.pos_menu_group_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.catalog_items ci
        WHERE ci.menu_group_id = g.id
          AND ci.active
          AND NULLIF(btrim(ci.sku), '') IS NOT NULL
      )
  ), '[]'::jsonb),
  'products_missing_sku', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'catalog_item_id', ci.id,
        'group_id', g.pos_menu_group_id,
        'group_name', g.name,
        'product_name', ci.name,
        'item_kind', ci.item_kind
      )
      ORDER BY g.pos_menu_group_id, ci.name
    )
    FROM public.catalog_items ci
    LEFT JOIN public.catalog_menu_groups g ON g.id = ci.menu_group_id
    WHERE ci.active
      AND NULLIF(btrim(ci.sku), '') IS NULL
  ), '[]'::jsonb)
)::text AS catalog_json;
