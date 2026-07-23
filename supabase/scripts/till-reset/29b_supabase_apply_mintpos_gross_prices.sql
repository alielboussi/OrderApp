-- =============================================================================
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
  ('17', 35.00),
  ('18', 75.00),
  ('19', 50.00),
  ('20', 35.00),
  ('38', 35.00),
  ('39', 60.00),
  ('41', 80.00),
  ('44', 40.00),
  ('45', 75.00),
  ('62', 5.00),
  ('66', 15.00),
  ('67', 15.00),
  ('68', 25.00),
  ('70', 15.00),
  ('72', 15.00),
  ('103', 15.00),
  ('104', 8.00),
  ('105', 200.00),
  ('111', 50.00),
  ('112', 50.00),
  ('117', 10.00),
  ('119', 30.00),
  ('120', 30.00),
  ('121', 5.00),
  ('123', 60.00),
  ('149', 70.00),
  ('150', 85.00),
  ('151', 15.00),
  ('152', 15.00),
  ('153', 35.00),
  ('154', 35.00),
  ('155', 50.00),
  ('156', 40.00),
  ('157', 25.00),
  ('158', 35.00),
  ('159', 30.00),
  ('160', 55.00),
  ('162', 120.00),
  ('176', 25.00),
  ('179', 35.00),
  ('184', 1.00),
  ('200', 50.00),
  ('202', 40.00),
  ('204', 30.00),
  ('205', 30.00),
  ('206', 45.00),
  ('207', 45.00),
  ('208', 45.00),
  ('209', 35.00),
  ('210', 60.00),
  ('211', 60.00),
  ('212', 60.00),
  ('213', 60.00),
  ('214', 60.00),
  ('215', 45.00),
  ('216', 60.00),
  ('217', 90.00),
  ('218', 60.00),
  ('219', 60.00),
  ('220', 20.00),
  ('226', 40.00),
  ('227', 20.00),
  ('228', 7.00),
  ('229', 8.00),
  ('230', 7.00),
  ('231', 7.00),
  ('232', 7.00),
  ('233', 10.00),
  ('234', 7.00),
  ('235', 7.00),
  ('237', 7.00),
  ('238', 7.00),
  ('241', 65.00),
  ('242', 45.00),
  ('256', 20.00),
  ('257', 20.00),
  ('258', 3.00),
  ('259', 3.00),
  ('260', 5.00),
  ('261', 5.00),
  ('262', 12.00),
  ('263', 8.00),
  ('264', 8.00),
  ('265', 8.00),
  ('266', 17.00),
  ('267', 62.00),
  ('268', 12.00),
  ('269', 9.00),
  ('270', 122.00),
  ('271', 10.00),
  ('272', 75.00),
  ('273', 105.00),
  ('274', 100.00),
  ('275', 50.00),
  ('276', 50.00),
  ('277', 100.00),
  ('278', 80.00),
  ('279', 110.00),
  ('280', 110.00),
  ('281', 100.00),
  ('282', 20.00),
  ('283', 15.00),
  ('284', 10.00),
  ('285', 80.00),
  ('286', 110.00),
  ('287', 140.00),
  ('288', 140.00),
  ('289', 100.00),
  ('290', 100.00),
  ('291', 110.00),
  ('292', 140.00),
  ('293', 140.00),
  ('294', 120.00),
  ('295', 140.00),
  ('296', 70.00),
  ('297', 150.00),
  ('299', 60.00),
  ('300', 9.00),
  ('301', 9.00),
  ('302', 22.00),
  ('303', 122.00),
  ('304', 50.00),
  ('305', 17.00),
  ('306', 19.00),
  ('307', 15.00),
  ('308', 20.00),
  ('309', 200.00),
  ('310', 72.00),
  ('311', 27.00),
  ('312', 27.00),
  ('313', 152.00),
  ('314', 10.00),
  ('315', 22.00),
  ('316', 72.00),
  ('317', 72.00),
  ('319', 42.00),
  ('320', 40.00),
  ('321', 132.00),
  ('322', 11.00),
  ('323', 12.00),
  ('324', 25.00),
  ('325', 12.00),
  ('326', 45.00),
  ('327', 24.00),
  ('328', 16.00),
  ('329', 162.00),
  ('330', 42.00),
  ('331', 60.00),
  ('332', 57.00),
  ('333', 162.00),
  ('334', 400.00),
  ('335', 100.00),
  ('336', 60.00),
  ('337', 12.00),
  ('339', 88.00),
  ('340', 12.00),
  ('341', 10.00),
  ('342', 45.00),
  ('343', 35.00),
  ('344', 65.00),
  ('345', 85.00),
  ('346', 15.00),
  ('351', 30.00),
  ('355', 20.00),
  ('356', 15.00),
  ('357', 70.00),
  ('358', 7.00),
  ('360', 30.00),
  ('361', 30.00),
  ('362', 20.00),
  ('363', 20.00),
  ('365', 10.00),
  ('366', 25.00),
  ('367', 25.00);

CREATE TEMP TABLE variant_prices (
  parent_sku text NOT NULL,
  variant_sku text NOT NULL,
  selling_price numeric NOT NULL,
  PRIMARY KEY (parent_sku, variant_sku)
) ON COMMIT DROP;

INSERT INTO variant_prices (parent_sku, variant_sku, selling_price) VALUES
  ('177', '39', 140.00),
  ('177', '40', 160.00),
  ('177', '41', 7.00),
  ('177', '42', 70.00),
  ('177', '43', 90.00),
  ('177', '44', 120.00),
  ('177', '45', 140.00),
  ('243', '100', 900.00),
  ('243', '29', 120.00),
  ('243', '30', 220.00),
  ('243', '34', 500.00),
  ('243', '35', 600.00),
  ('243', '95', 220.00),
  ('243', '96', 350.00),
  ('243', '97', 500.00),
  ('243', '98', 600.00),
  ('243', '99', 800.00),
  ('244', '47', 55.00),
  ('244', '49', 45.00),
  ('244', '52', 12.00),
  ('245', '6001108028044', 35.00),
  ('245', '6001108055187', 35.00),
  ('245', '6003326015721', 25.00),
  ('245', '6003326015790', 25.00),
  ('245', '6009801472102', 30.00),
  ('245', '88', 35.00),
  ('255', '23', 45.00),
  ('255', '24', 40.00),
  ('255', '25', 15.00),
  ('255', '26', 40.00),
  ('255', '27', 25.00),
  ('255', '28', 10.00),
  ('255', '98', 10.00),
  ('357', '53', 70.00),
  ('357', '54', 70.00),
  ('357', '55', 70.00),
  ('364', '81', 15.00),
  ('364', '82', 15.00),
  ('364', '89', 6.00),
  ('364', '90', 15.00),
  ('364', '94', 15.00),
  ('364', '95', 15.00),
  ('62', '92', 5.00),
  ('62', '93', 5.00),
  ('66', '71', 15.00),
  ('66', '72', 15.00),
  ('66', '73', 15.00),
  ('66', '74', 15.00),
  ('66', '75', 15.00),
  ('66', '76', 15.00),
  ('66', '77', 15.00),
  ('66', '78', 15.00),
  ('70', '79', 15.00),
  ('70', '80', 15.00),
  ('72', '56', 15.00),
  ('72', '57', 15.00),
  ('72', '58', 15.00),
  ('72', '59', 15.00),
  ('72', '60', 15.00),
  ('72', '61', 15.00),
  ('72', '62', 15.00),
  ('72', '63', 15.00),
  ('72', '64', 15.00),
  ('72', '65', 15.00),
  ('72', '66', 15.00),
  ('72', '67', 15.00),
  ('72', '68', 15.00),
  ('72', '69', 15.00),
  ('72', '70', 15.00),
  ('72', '91', 20.00);

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
