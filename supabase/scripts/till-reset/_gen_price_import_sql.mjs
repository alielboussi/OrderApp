import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TILL1_PRODUCTS = {
  "103": 15, "104": 8, "105": 200, "149": 70, "150": 85, "151": 15, "152": 15,
  "153": 35, "154": 35, "155": 50, "156": 40, "157": 25, "158": 35, "159": 30,
  "160": 55, "162": 120, "176": 25, "179": 35, "220": 20, "299": 60, "337": 12,
  "39": 60, "44": 40, "45": 75, "258": 3, "259": 3, "260": 5, "261": 5, "17": 35,
  "18": 75, "19": 50, "20": 35, "241": 65, "242": 45, "38": 35, "121": 5, "123": 60,
  "41": 80, "300": 9, "301": 9, "302": 22, "303": 122, "304": 50, "305": 17,
  "306": 19, "307": 15, "308": 20, "309": 200, "310": 72, "311": 27, "312": 27,
  "313": 152, "314": 10, "315": 22, "316": 72, "317": 72, "319": 42, "320": 40,
  "321": 132, "322": 11, "323": 12, "324": 25, "325": 12, "326": 45, "327": 24,
  "328": 16, "329": 162, "330": 42, "331": 60, "332": 57, "333": 162, "334": 400,
  "335": 100, "336": 60, "343": 35, "344": 65, "345": 85, "346": 15, "62": 5,
  "66": 15, "68": 25, "70": 15, "72": 15, "119": 30, "120": 30, "355": 20, "200": 50,
  "202": 40, "204": 30, "205": 30, "206": 45, "207": 45, "208": 45, "209": 35,
  "210": 60, "211": 60, "212": 60, "213": 60, "214": 60, "215": 45, "216": 60,
  "217": 90, "218": 60, "219": 60, "231": 7, "228": 7, "229": 8, "230": 7, "232": 7,
  "233": 10, "234": 7, "235": 7, "237": 7, "238": 7, "226": 40, "227": 20, "256": 20,
  "257": 20, "262": 12, "263": 8, "264": 8, "265": 8, "266": 17, "267": 62, "268": 12,
  "269": 9, "270": 122, "340": 12, "341": 10, "342": 45, "271": 10, "272": 75,
  "273": 105, "274": 100, "275": 50, "276": 50, "277": 100, "278": 80, "279": 110,
  "280": 110, "281": 100, "282": 20, "283": 15, "284": 10, "285": 80, "339": 88,
  "286": 110, "287": 140, "288": 140, "289": 100, "290": 100, "291": 110, "292": 140,
  "293": 140, "294": 120, "295": 140, "296": 70, "297": 150, "357": 70, "184": 1,
};

const QC_ONLY_PRODUCTS = {
  "360": 30, "362": 20, "363": 20, "366": 25, "367": 25, "67": 15, "111": 50,
  "112": 50, "117": 10, "351": 30, "356": 15, "358": 7, "361": 30, "365": 10,
};

const TILL1_VARIANTS = [
  ["177", "39", 140], ["177", "40", 160], ["177", "41", 7], ["177", "42", 70],
  ["177", "43", 90], ["177", "44", 120], ["177", "45", 140],
  ["243", "100", 900], ["243", "29", 120], ["243", "30", 220], ["243", "34", 500],
  ["243", "35", 600], ["243", "95", 220], ["243", "96", 350], ["243", "97", 500],
  ["243", "98", 600], ["243", "99", 800],
  ["244", "47", 55], ["244", "49", 45], ["244", "52", 12],
  ["245", "6001108028044", 35], ["245", "6001108055187", 35],
  ["245", "6003326015721", 25], ["245", "6003326015790", 25],
  ["245", "6009801472102", 30], ["245", "88", 35],
  ["255", "23", 45], ["255", "24", 40], ["255", "25", 15], ["255", "26", 40],
  ["255", "27", 25], ["255", "28", 10], ["255", "98", 10],
  ["357", "53", 70], ["357", "54", 70], ["357", "55", 70],
  ["364", "81", 15], ["364", "82", 15], ["364", "89", 6], ["364", "90", 15],
  ["364", "94", 15], ["364", "95", 15],
  ["62", "92", 5], ["62", "93", 5],
  ["66", "71", 15], ["66", "72", 15], ["66", "73", 15], ["66", "74", 15],
  ["66", "75", 15], ["66", "76", 15], ["66", "77", 15], ["66", "78", 15],
  ["70", "79", 15], ["70", "80", 15],
  ["72", "56", 15], ["72", "57", 15], ["72", "58", 15], ["72", "59", 15],
  ["72", "60", 15], ["72", "61", 15], ["72", "62", 15], ["72", "63", 15],
  ["72", "64", 15], ["72", "65", 15], ["72", "66", 15], ["72", "67", 15],
  ["72", "68", 15], ["72", "69", 15], ["72", "70", 15], ["72", "91", 20],
];

const products = { ...TILL1_PRODUCTS, ...QC_ONLY_PRODUCTS };
const productLines = Object.keys(products)
  .sort((a, b) => a.length - b.length || a.localeCompare(b))
  .map((sku) => `  ('${sku}', ${products[sku].toFixed(2)})`)
  .join(",\n");

const variantLines = TILL1_VARIANTS.map(
  ([parent, variant, price]) => `  ('${parent}', '${variant}', ${price.toFixed(2)})`,
).join(",\n");

const sql = `-- =============================================================================
-- 29b — Supabase: apply MintPOS GrossPrice → catalog selling_price (fixed data)
-- =============================================================================
-- WHERE: Supabase SQL Editor
-- SOURCE: Till 1 export (script 28) + Quick Corner QC-only products
--         Shared SKUs use Till 1; QC-only: 360,362,363,366,367,67,111,112,117,
--         351,356,358,361,365
--
-- Sets catalog_items.selling_price and catalog_variants.selling_price only.
-- VAT-exclusive is derived elsewhere in the portal — not stored here.
--
-- READ RESULTS:
--   1) product_summary  → matched / already_correct / need_update / unmatched
--   2) products_updated → rows actually changed (can be low if already correct)
--   3) variant_summary + variants_updated
--   4) *_mismatch rows should be 0 after a successful run
--
-- NOTE: SKUs 256–346 are warehouse items (raw/ingredient in Supabase) that also
--       carry MintPOS selling prices — they are included here on purpose.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE product_prices (
  sku text PRIMARY KEY,
  selling_price numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO product_prices (sku, selling_price) VALUES
${productLines};

CREATE TEMP TABLE variant_prices (
  parent_sku text NOT NULL,
  variant_sku text NOT NULL,
  selling_price numeric NOT NULL,
  PRIMARY KEY (parent_sku, variant_sku)
) ON COMMIT DROP;

INSERT INTO variant_prices (parent_sku, variant_sku, selling_price) VALUES
${variantLines};

-- ── 1) Product pre-check ──────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM product_prices) AS script_products,
  COUNT(*) FILTER (WHERE ci.id IS NOT NULL) AS matched,
  COUNT(*) FILTER (
    WHERE ci.id IS NOT NULL
      AND ci.selling_price IS NOT DISTINCT FROM pp.selling_price
  ) AS already_correct,
  COUNT(*) FILTER (
    WHERE ci.id IS NOT NULL
      AND ci.selling_price IS DISTINCT FROM pp.selling_price
  ) AS need_update,
  COUNT(*) FILTER (WHERE ci.id IS NULL) AS unmatched
FROM product_prices pp
LEFT JOIN public.catalog_items ci
  ON LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(pp.sku))
  AND ci.item_kind IN ('finished', 'raw', 'ingredient');

-- ── 2) Apply product prices ───────────────────────────────────────────────────

WITH updated_products AS (
  UPDATE public.catalog_items ci
  SET
    selling_price = pp.selling_price,
    updated_at = NOW()
  FROM product_prices pp
  WHERE LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(pp.sku))
    AND ci.item_kind IN ('finished', 'raw', 'ingredient')
    AND ci.sku IS NOT NULL
    AND (ci.selling_price IS DISTINCT FROM pp.selling_price)
  RETURNING ci.sku
)
SELECT COUNT(*) AS products_updated FROM updated_products;

-- ── 3) Variant pre-check ────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM variant_prices) AS script_variants,
  COUNT(*) FILTER (WHERE cv.id IS NOT NULL) AS matched,
  COUNT(*) FILTER (
    WHERE cv.id IS NOT NULL
      AND cv.selling_price IS NOT DISTINCT FROM vp.selling_price
  ) AS already_correct,
  COUNT(*) FILTER (
    WHERE cv.id IS NOT NULL
      AND cv.selling_price IS DISTINCT FROM vp.selling_price
  ) AS need_update,
  COUNT(*) FILTER (WHERE cv.id IS NULL) AS unmatched
FROM variant_prices vp
LEFT JOIN public.catalog_items ci
  ON LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(vp.parent_sku))
  AND ci.item_kind = 'finished'
LEFT JOIN public.catalog_variants cv
  ON cv.item_id = ci.id
  AND cv.sku IS NOT NULL
  AND LOWER(BTRIM(cv.sku)) = LOWER(BTRIM(vp.variant_sku));

-- ── 4) Apply variant prices ───────────────────────────────────────────────────

WITH updated_variants AS (
  UPDATE public.catalog_variants cv
  SET
    selling_price = vp.selling_price,
    updated_at = NOW()
  FROM variant_prices vp
  INNER JOIN public.catalog_items ci
    ON LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(vp.parent_sku))
    AND ci.item_kind = 'finished'
  WHERE cv.item_id = ci.id
    AND cv.sku IS NOT NULL
    AND LOWER(BTRIM(cv.sku)) = LOWER(BTRIM(vp.variant_sku))
    AND (cv.selling_price IS DISTINCT FROM vp.selling_price)
  RETURNING cv.sku, ci.sku AS parent_sku
)
SELECT COUNT(*) AS variants_updated FROM updated_variants;

-- ── 5) Post-run verification (should all be empty) ────────────────────────────

SELECT
  'product_mismatch' AS check_name,
  pp.sku,
  pp.selling_price AS expected_price,
  ci.selling_price AS actual_price
FROM product_prices pp
INNER JOIN public.catalog_items ci
  ON LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(pp.sku))
  AND ci.item_kind IN ('finished', 'raw', 'ingredient')
WHERE ci.selling_price IS DISTINCT FROM pp.selling_price
ORDER BY pp.sku;

SELECT
  'variant_mismatch' AS check_name,
  vp.parent_sku,
  vp.variant_sku,
  vp.selling_price AS expected_price,
  cv.selling_price AS actual_price
FROM variant_prices vp
INNER JOIN public.catalog_items ci
  ON LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(vp.parent_sku))
  AND ci.item_kind = 'finished'
INNER JOIN public.catalog_variants cv
  ON cv.item_id = ci.id
  AND cv.sku IS NOT NULL
  AND LOWER(BTRIM(cv.sku)) = LOWER(BTRIM(vp.variant_sku))
WHERE cv.selling_price IS DISTINCT FROM vp.selling_price
ORDER BY vp.parent_sku, vp.variant_sku;

SELECT
  'unmatched_product_sku' AS check_name,
  pp.sku,
  pp.selling_price
FROM product_prices pp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_items ci
  WHERE LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(pp.sku))
    AND ci.item_kind IN ('finished', 'raw', 'ingredient')
)
ORDER BY pp.sku;

SELECT
  'unmatched_variant_sku' AS check_name,
  vp.parent_sku,
  vp.variant_sku,
  vp.selling_price
FROM variant_prices vp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_items ci
  INNER JOIN public.catalog_variants cv ON cv.item_id = ci.id
  WHERE LOWER(BTRIM(ci.sku)) = LOWER(BTRIM(vp.parent_sku))
    AND ci.item_kind = 'finished'
    AND LOWER(BTRIM(cv.sku)) = LOWER(BTRIM(vp.variant_sku))
)
ORDER BY vp.parent_sku, vp.variant_sku;

COMMIT;
`;

const out = path.join(__dirname, "29b_supabase_apply_mintpos_gross_prices.sql");
fs.writeFileSync(out, sql, "utf8");
console.log(`Wrote ${out}`);
