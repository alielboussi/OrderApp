-- =============================================================================
-- 30 — Fix catalog SKU mapping for blocked Till 2 bills
-- =============================================================================
-- WHERE: Supabase SQL Editor
-- FIXES: Bills 1680370 and 1680866 (no_mappable_items)
--
-- Run section 1 first. If any SKU shows missing, run section 2, then re-check
-- section 3. SCPGT will retry pending bills automatically on the next cycle.
-- =============================================================================

-- Till 2 outlet
-- a655b0a1-a37a-43d6-aa55-7f97377b2660

-- -----------------------------------------------------------------------------
-- 1) PRE-CHECK — SKUs required by the two blocked bills
-- -----------------------------------------------------------------------------
WITH required AS (
  SELECT * FROM (VALUES
    ('1680370', '309', 'Used Oil(/20L)'),
    ('1680370', '271', 'Raw Chicken Bones(/Kg)'),
    ('1680370', '346', 'Millimeal(/Kg)'),
    ('1680866', '302', 'Sugar(/Kg)'),
    ('1680866', '328', 'Raw Rice(/Kg)'),
    ('1680866', '306', 'Cake Flour(/Kg)'),
    ('1680866', '304', 'Eggs(/Egg)'),
    ('1680866', '325', 'Milk(/Ltr)'),
    ('1680866', '272', 'Raw Chicken(/Kg)'),
    ('1680866', '268', 'Potatoes(/Kg)'),
    ('1680866', '263', 'Onions(/Kg)'),
    ('1680866', '262', 'Tomatoes(/Kg)')
  ) AS t(bill_id, mintpos_sku, mintpos_name)
)
SELECT
  r.bill_id,
  r.mintpos_sku,
  r.mintpos_name,
  ci.id AS catalog_item_id,
  ci.name AS portal_name,
  ci.item_kind,
  CASE
    WHEN ci.id IS NULL THEN 'MISSING — assign SKU below'
    ELSE 'OK'
  END AS status
FROM required r
LEFT JOIN public.catalog_items ci
  ON ci.active IS TRUE
 AND lower(btrim(ci.sku)) = lower(btrim(r.mintpos_sku))
ORDER BY r.bill_id, r.mintpos_sku;

-- -----------------------------------------------------------------------------
-- 1b) SKU OWNERS — includes inactive rows (explains duplicate-key errors)
-- -----------------------------------------------------------------------------
WITH required AS (
  SELECT * FROM (VALUES
    ('309'), ('271'), ('346'),
    ('302'), ('328'), ('306'), ('304'), ('325'), ('272'), ('268'), ('263'), ('262')
  ) AS t(mintpos_sku)
)
SELECT
  r.mintpos_sku,
  ci.id,
  ci.name,
  ci.item_kind,
  ci.active,
  ci.sku
FROM required r
LEFT JOIN public.catalog_items ci
  ON lower(btrim(ci.sku)) = r.mintpos_sku
WHERE ci.id IS NOT NULL
ORDER BY r.mintpos_sku, ci.active DESC, ci.name;

-- -----------------------------------------------------------------------------
-- 2) FIND PORTAL CANDIDATES (for any SKU still missing above)
-- -----------------------------------------------------------------------------
SELECT id, name, item_kind, sku, consumption_uom
FROM public.catalog_items
WHERE active IS TRUE
  AND NULLIF(btrim(sku), '') IS NULL
  AND (
    lower(name) LIKE '%used oil%'
    OR lower(name) LIKE '%mealie%'
    OR lower(name) LIKE '%millimeal%'
    OR lower(name) IN ('sugar', 'tomato', 'onion', 'potato', 'milk', 'eggs', 'egg')
    OR lower(name) LIKE '%cake flour%'
    OR lower(name) LIKE '%raw rice%'
    OR (lower(name) LIKE '%chicken%' AND lower(name) NOT LIKE '%breast%' AND lower(name) NOT LIKE '%fillet%' AND lower(name) NOT LIKE '%bone%' AND lower(name) NOT LIKE '%wing%' AND lower(name) NOT LIKE '%burger%' AND lower(name) NOT LIKE '%shawarma%')
  )
ORDER BY name;

-- -----------------------------------------------------------------------------
-- 3) ASSIGN SKUs — safe: skips SKUs already owned by another row
--     If section 1b shows a SKU owner that is inactive, section 3b reactivates it.
--     Do NOT assign the same SKU to a second row (unique index on lower(sku)).
-- -----------------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE _sku_assignments (
  target_id uuid NOT NULL,
  mintpos_sku text NOT NULL,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note) VALUES
  ('46d8d635-cd22-44f1-ab80-42905f1d39c1', '309', 'Used Oil Soyola Buckets'),
  ('798b89bf-df72-4604-8af0-73b368dc4075', '271', 'Bones');

-- Name-based targets (only when SKU is not already taken elsewhere)
INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '346', 'Millimeal'
FROM public.catalog_items
WHERE active IS TRUE AND NULLIF(btrim(sku), '') IS NULL
  AND (lower(name) LIKE '%mealie%' OR lower(name) LIKE '%millimeal%')
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '346')
LIMIT 1;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '302', 'Sugar'
FROM public.catalog_items
WHERE active IS TRUE AND lower(name) = 'sugar' AND NULLIF(btrim(sku), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '302')
LIMIT 1;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '328', 'Rice ingredient'
FROM public.catalog_items
WHERE active IS TRUE AND lower(name) = 'rice' AND item_kind = 'ingredient'
  AND NULLIF(btrim(sku), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '328')
LIMIT 1;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '304', 'Eggs'
FROM public.catalog_items
WHERE active IS TRUE AND lower(name) IN ('eggs', 'egg') AND NULLIF(btrim(sku), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '304')
LIMIT 1;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '325', 'Milk'
FROM public.catalog_items
WHERE active IS TRUE AND lower(name) = 'milk' AND NULLIF(btrim(sku), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '325')
LIMIT 1;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '262', 'Tomato'
FROM public.catalog_items
WHERE active IS TRUE AND lower(name) = 'tomato' AND NULLIF(btrim(sku), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '262')
LIMIT 1;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '263', 'Onion'
FROM public.catalog_items
WHERE active IS TRUE AND lower(name) = 'onion' AND NULLIF(btrim(sku), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '263')
LIMIT 1;

INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT id, '268', 'Potato'
FROM public.catalog_items
WHERE active IS TRUE AND lower(name) = 'potato' AND NULLIF(btrim(sku), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.catalog_items o WHERE lower(btrim(o.sku)) = '268')
LIMIT 1;

-- SKU 306 (Cake Flour): intentionally omitted — if another row already owns 306,
-- do NOT assign it again. Section 3b reactivates the existing owner if needed.

-- Raw Chicken(/Kg) — SKU 272
INSERT INTO _sku_assignments (target_id, mintpos_sku, note)
SELECT ci.id, '272', 'Raw Chicken(/Kg)'
FROM public.catalog_items ci
WHERE ci.active IS TRUE
  AND ci.item_kind IN ('ingredient', 'raw')
  AND NULLIF(btrim(ci.sku), '') IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.catalog_items o
    WHERE lower(btrim(o.sku)) = '272'
  )
  AND (
    lower(ci.name) LIKE '%whole chicken%'
    OR lower(ci.name) = 'chicken'
    OR lower(ci.name) LIKE 'raw chicken%'
  )
  AND lower(ci.name) NOT LIKE '%breast%'
  AND lower(ci.name) NOT LIKE '%fillet%'
  AND lower(ci.name) NOT LIKE '%bone%'
  AND lower(ci.name) NOT LIKE '%wing%'
  AND lower(ci.name) NOT LIKE '%burger%'
ORDER BY CASE WHEN lower(ci.name) LIKE '%whole chicken%' THEN 0 ELSE 1 END, ci.name
LIMIT 1;

UPDATE public.catalog_items ci
SET sku = a.mintpos_sku, updated_at = now()
FROM _sku_assignments a
WHERE ci.id = a.target_id
  AND NOT EXISTS (
    SELECT 1 FROM public.catalog_items o
    WHERE o.id <> ci.id AND lower(btrim(o.sku)) = lower(a.mintpos_sku)
  );

COMMIT;

-- -----------------------------------------------------------------------------
-- 3b) Reactivate inactive SKU owners (common cause of false "MISSING" in §1)
-- -----------------------------------------------------------------------------
BEGIN;

UPDATE public.catalog_items ci
SET active = true, updated_at = now()
WHERE lower(btrim(ci.sku)) IN (
  '309', '271', '346',
  '302', '328', '306', '304', '325', '272', '268', '263', '262'
)
  AND ci.active IS NOT TRUE;

COMMIT;

-- -----------------------------------------------------------------------------
-- 3c) Report SKUs still unassigned after safe updates
-- -----------------------------------------------------------------------------
WITH required AS (
  SELECT * FROM (VALUES
    ('309'), ('271'), ('346'),
    ('302'), ('328'), ('306'), ('304'), ('325'), ('272'), ('268'), ('263'), ('262')
  ) AS t(mintpos_sku)
)
SELECT
  r.mintpos_sku,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE ci.active IS TRUE AND lower(btrim(ci.sku)) = r.mintpos_sku
    ) THEN 'OK — active owner exists'
    WHEN EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE lower(btrim(ci.sku)) = r.mintpos_sku
    ) THEN 'OWNER INACTIVE — section 3b should fix'
    ELSE 'STILL MISSING — manual assign needed'
  END AS status;

-- -----------------------------------------------------------------------------
-- 4) VERIFY — all 12 SKUs must show OK
-- -----------------------------------------------------------------------------
WITH required AS (
  SELECT * FROM (VALUES
    ('309'), ('271'), ('346'),
    ('302'), ('328'), ('306'), ('304'), ('325'), ('272'), ('268'), ('263'), ('262')
  ) AS t(mintpos_sku)
)
SELECT
  r.mintpos_sku,
  ci.id,
  ci.name,
  ci.item_kind,
  CASE WHEN ci.id IS NULL THEN 'STILL MISSING' ELSE 'OK' END AS status
FROM required r
LEFT JOIN public.catalog_items ci
  ON ci.active IS TRUE AND lower(btrim(ci.sku)) = r.mintpos_sku
ORDER BY r.mintpos_sku;

-- -----------------------------------------------------------------------------
-- 5) TEST resolve_catalog_for_outlet for Till 2 (each line must return a row)
-- -----------------------------------------------------------------------------
SELECT '309' AS sku, r.*
FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '309', NULL, 'Used Oil(/20L)'
) r
UNION ALL
SELECT '271', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '271', NULL, 'Raw Chicken Bones(/Kg)'
) r
UNION ALL
SELECT '346', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '346', NULL, 'Millimeal(/Kg)'
) r
UNION ALL
SELECT '302', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '302', NULL, 'Sugar(/Kg)'
) r
UNION ALL
SELECT '328', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '328', NULL, 'Raw Rice(/Kg)'
) r
UNION ALL
SELECT '306', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '306', NULL, 'Cake Flour(/Kg)'
) r
UNION ALL
SELECT '304', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '304', NULL, 'Eggs(/Egg)'
) r
UNION ALL
SELECT '325', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '325', NULL, 'Milk(/Ltr)'
) r
UNION ALL
SELECT '272', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '272', NULL, 'Raw Chicken(/Kg)'
) r
UNION ALL
SELECT '268', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '268', NULL, 'Potatoes(/Kg)'
) r
UNION ALL
SELECT '263', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '263', NULL, 'Onions(/Kg)'
) r
UNION ALL
SELECT '262', r.* FROM public.resolve_catalog_for_outlet(
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid, '262', NULL, 'Tomatoes(/Kg)'
) r;

-- -----------------------------------------------------------------------------
-- 6) Supabase — blocked bills + 520 bill status
-- -----------------------------------------------------------------------------
SELECT
  source_event_id,
  outlet_id,
  status,
  created_at
FROM public.orders
WHERE source_event_id IN (
  'a655b0a1-a37a-43d6-aa55-7f97377b2660-1680370',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660-1680866',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660-1689770'
)
ORDER BY source_event_id;
