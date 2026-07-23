-- =============================================================================
-- 29 — Supabase: import MintPOS GrossPrice → catalog selling_price
-- =============================================================================
-- WHERE: Supabase SQL Editor
-- WHEN:  After running script 28 on Till 1, Till 2, and Quick Corner
--
-- STEPS:
--   1. Run 28 on each MintPOS PC (sections A–D). Copy each price_json cell.
--   2. Paste the three JSON blobs into till1_json / till2_json / qc_json below.
--   3. Run this whole script (F5).
--
-- MERGE RULE (same SKU from multiple outlets):
--   Till 1 wins, then Till 2, then Quick Corner (case-insensitive outlet name).
--   Rows with gross_price <= 0 are ignored (variant parents often show 0 on MintPOS).
--
-- PASS:
--   • apply section reports products_updated + variants_updated > 0
--   • verify section: large unmatched counts only for warehouse-only rows
-- =============================================================================

BEGIN;

-- ── 1) Paste outlet JSON exports from script 28 section D ───────────────────

CREATE TEMP TABLE mintpos_price_staging (
  outlet text NOT NULL,
  row_kind text NOT NULL CHECK (row_kind IN ('product', 'variant')),
  product_sku text NOT NULL,
  variant_sku text,
  product_name text,
  variant_name text,
  gross_price numeric,
  net_price numeric
) ON COMMIT DROP;

DO $import$
DECLARE
  till1_json jsonb := $t1$
{"outlet":"Till 1","products":[],"variants":[]}
$t1$::jsonb;

  till2_json jsonb := $t2$
{"outlet":"Till 2","products":[],"variants":[]}
$t2$::jsonb;

  qc_json jsonb := $t3$
{"outlet":"Quick Corner","products":[],"variants":[]}
$t3$::jsonb;

  payload jsonb;
  outlet_name text;
BEGIN
  FOREACH payload IN ARRAY ARRAY[till1_json, till2_json, qc_json]
  LOOP
    IF payload IS NULL OR payload = 'null'::jsonb OR jsonb_typeof(payload) <> 'object' THEN
      CONTINUE;
    END IF;

    outlet_name := COALESCE(NULLIF(BTRIM(payload->>'outlet'), ''), 'unknown');

    INSERT INTO mintpos_price_staging (
      outlet, row_kind, product_sku, variant_sku, product_name, variant_name, gross_price, net_price
    )
    SELECT
      outlet_name,
      'product',
      NULLIF(BTRIM(p.product_sku), ''),
      NULL,
      NULLIF(BTRIM(p.product_name), ''),
      NULL,
      p.gross_price,
      p.net_price
    FROM jsonb_to_recordset(COALESCE(payload->'products', '[]'::jsonb)) AS p(
      product_sku text,
      product_name text,
      net_price numeric,
      gross_price numeric
    )
    WHERE NULLIF(BTRIM(p.product_sku), '') IS NOT NULL;

    INSERT INTO mintpos_price_staging (
      outlet, row_kind, product_sku, variant_sku, product_name, variant_name, gross_price, net_price
    )
    SELECT
      outlet_name,
      'variant',
      NULLIF(BTRIM(v.parent_sku), ''),
      NULLIF(BTRIM(v.variant_sku), ''),
      NULLIF(BTRIM(v.parent_name), ''),
      NULLIF(BTRIM(v.variant_name), ''),
      v.gross_price,
      v.net_price
    FROM jsonb_to_recordset(COALESCE(payload->'variants', '[]'::jsonb)) AS v(
      parent_sku text,
      parent_name text,
      variant_sku text,
      variant_name text,
      net_price numeric,
      gross_price numeric
    )
    WHERE NULLIF(BTRIM(v.parent_sku), '') IS NOT NULL
      AND NULLIF(BTRIM(v.variant_sku), '') IS NOT NULL;
  END LOOP;
END
$import$;

-- ── 2) Preflight — rows loaded + cross-outlet price conflicts ─────────────────

SELECT outlet, row_kind, COUNT(*) AS row_count
FROM mintpos_price_staging
GROUP BY outlet, row_kind
ORDER BY outlet, row_kind;

WITH ranked AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY s.row_kind, LOWER(BTRIM(s.product_sku)), LOWER(COALESCE(BTRIM(s.variant_sku), ''))
      ORDER BY
        CASE UPPER(BTRIM(s.outlet))
          WHEN 'TILL 1' THEN 1
          WHEN 'TILL 2' THEN 2
          WHEN 'QUICK CORNER' THEN 3
          ELSE 9
        END,
        s.outlet
    ) AS pick_rank
  FROM mintpos_price_staging s
  WHERE s.gross_price IS NOT NULL
    AND s.gross_price > 0
)
SELECT
  r.row_kind,
  r.product_sku,
  r.variant_sku,
  MIN(r.gross_price) AS min_gross_price,
  MAX(r.gross_price) AS max_gross_price,
  STRING_AGG(DISTINCT r.outlet || '=' || r.gross_price::text, ' | ' ORDER BY r.outlet || '=' || r.gross_price::text) AS outlet_prices
FROM ranked r
GROUP BY r.row_kind, r.product_sku, r.variant_sku
HAVING COUNT(DISTINCT r.gross_price) > 1
ORDER BY r.row_kind, r.product_sku, r.variant_sku;

-- ── 3) Apply — chosen price per SKU (Till 1 > Till 2 > Quick Corner) ──────────

WITH ranked AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY s.row_kind, LOWER(BTRIM(s.product_sku)), LOWER(COALESCE(BTRIM(s.variant_sku), ''))
      ORDER BY
        CASE UPPER(BTRIM(s.outlet))
          WHEN 'TILL 1' THEN 1
          WHEN 'TILL 2' THEN 2
          WHEN 'QUICK CORNER' THEN 3
          ELSE 9
        END,
        s.outlet
    ) AS pick_rank
  FROM mintpos_price_staging s
  WHERE s.gross_price IS NOT NULL
    AND s.gross_price > 0
),
chosen AS (
  SELECT *
  FROM ranked
  WHERE pick_rank = 1
),
updated_products AS (
  UPDATE public.catalog_items ci
  SET
    selling_price = ROUND(c.gross_price, 2),
    updated_at = NOW()
  FROM chosen c
  WHERE c.row_kind = 'product'
    AND LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(c.product_sku))
    AND ci.sku IS NOT NULL
    AND (ci.selling_price IS DISTINCT FROM ROUND(c.gross_price, 2))
  RETURNING ci.id, ci.sku, ci.name, ci.selling_price
),
updated_variants AS (
  UPDATE public.catalog_variants cv
  SET
    selling_price = ROUND(c.gross_price, 2),
    updated_at = NOW()
  FROM chosen c
  INNER JOIN public.catalog_items ci ON LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(c.product_sku))
  WHERE c.row_kind = 'variant'
    AND cv.item_id = ci.id
    AND cv.sku IS NOT NULL
    AND LOWER(BTRIM(cv.sku)) = LOWER(BTRIM(c.variant_sku))
    AND (cv.selling_price IS DISTINCT FROM ROUND(c.gross_price, 2))
  RETURNING cv.id, cv.sku, cv.name, cv.selling_price, ci.sku AS parent_sku
)
SELECT
  (SELECT COUNT(*) FROM updated_products) AS products_updated,
  (SELECT COUNT(*) FROM updated_variants) AS variants_updated;

-- ── 4) Verify — MintPOS rows that did not match Supabase catalog SKUs ─────────

WITH ranked AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY s.row_kind, LOWER(BTRIM(s.product_sku)), LOWER(COALESCE(BTRIM(s.variant_sku), ''))
      ORDER BY
        CASE UPPER(BTRIM(s.outlet))
          WHEN 'TILL 1' THEN 1
          WHEN 'TILL 2' THEN 2
          WHEN 'QUICK CORNER' THEN 3
          ELSE 9
        END
    ) AS pick_rank
  FROM mintpos_price_staging s
  WHERE s.gross_price IS NOT NULL
    AND s.gross_price > 0
),
chosen AS (
  SELECT *
  FROM ranked
  WHERE pick_rank = 1
)
SELECT
  c.row_kind,
  c.product_sku,
  c.variant_sku,
  c.product_name,
  c.variant_name,
  c.gross_price,
  c.outlet AS price_source
FROM chosen c
WHERE (
  c.row_kind = 'product'
  AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_items ci
    WHERE LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(c.product_sku))
  )
)
OR (
  c.row_kind = 'variant'
  AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_items ci
    INNER JOIN public.catalog_variants cv ON cv.item_id = ci.id
    WHERE LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(c.product_sku))
      AND LOWER(BTRIM(cv.sku)) = LOWER(BTRIM(c.variant_sku))
  )
)
ORDER BY c.row_kind, c.product_sku, c.variant_sku;

-- ── 5) Sample — finished products with selling_price set ────────────────────

SELECT
  ci.sku AS product_sku,
  ci.name AS product_name,
  ci.selling_price AS product_selling_price,
  cv.sku AS variant_sku,
  cv.name AS variant_name,
  cv.selling_price AS variant_selling_price
FROM public.catalog_items ci
LEFT JOIN public.catalog_variants cv ON cv.item_id = ci.id AND cv.active IS DISTINCT FROM false
WHERE ci.item_kind = 'finished'
  AND ci.sku IS NOT NULL
  AND (
    ci.selling_price IS NOT NULL
    OR cv.selling_price IS NOT NULL
  )
ORDER BY ci.sku, cv.sku NULLS FIRST
LIMIT 50;

COMMIT;
