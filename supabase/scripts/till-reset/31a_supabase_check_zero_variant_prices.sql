-- =============================================================================
-- 31a — Supabase: find finished variants with missing/zero selling_price
-- =============================================================================
-- WHERE: Supabase SQL Editor
-- USE:   Run after a catalog push if till prices disappeared — check whether
--        Supabase still has the prices (MintPOS-only issue) or both are zero.
-- =============================================================================

SELECT
  ci.sku AS parent_sku,
  ci.name AS parent_name,
  cv.sku AS variant_sku,
  cv.name AS variant_name,
  cv.selling_price,
  cv.updated_at
FROM public.catalog_variants cv
INNER JOIN public.catalog_items ci ON ci.id = cv.item_id
WHERE ci.item_kind = 'finished'
  AND cv.active IS DISTINCT FROM false
  AND (cv.selling_price IS NULL OR cv.selling_price <= 0)
ORDER BY ci.sku, cv.sku;

SELECT
  COUNT(*) FILTER (WHERE cv.selling_price IS NULL OR cv.selling_price <= 0) AS zero_or_null_variants,
  COUNT(*) AS total_active_finished_variants
FROM public.catalog_variants cv
INNER JOIN public.catalog_items ci ON ci.id = cv.item_id
WHERE ci.item_kind = 'finished'
  AND cv.active IS DISTINCT FROM false;
