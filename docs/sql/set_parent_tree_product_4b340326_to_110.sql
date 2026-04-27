-- SQL Canvas: Set Parent Tree Total to 110
-- Purpose:
-- Force total stock for product 4b340326-5f47-492f-924b-4771e434ea60
-- across warehouse fad8f3bf-6a13-471f-9198-c46bc65014e4 and all its children to exactly 110.

-- Run Block 1: Apply Adjustment
BEGIN;

WITH RECURSIVE warehouse_tree AS (
  SELECT id
  FROM public.warehouses
  WHERE id = 'fad8f3bf-6a13-471f-9198-c46bc65014e4'::uuid

  UNION ALL

  SELECT w.id
  FROM public.warehouses w
  JOIN warehouse_tree wt
    ON w.parent_warehouse_id = wt.id
),
current_total AS (
  SELECT COALESCE(SUM(wsi.net_units), 0)::numeric AS qty
  FROM public.warehouse_stock_items wsi
  JOIN warehouse_tree wt
    ON wt.id = wsi.warehouse_id
  WHERE wsi.item_id = '4b340326-5f47-492f-924b-4771e434ea60'::uuid
),
delta AS (
  SELECT (110::numeric - qty) AS delta_qty, qty AS current_qty
  FROM current_total
)
INSERT INTO public.stock_ledger (
  location_type,
  warehouse_id,
  item_id,
  variant_key,
  delta_units,
  reason,
  context
)
SELECT
  'warehouse',
  'fad8f3bf-6a13-471f-9198-c46bc65014e4'::uuid,
  '4b340326-5f47-492f-924b-4771e434ea60'::uuid,
  'base',
  d.delta_qty,
  'opening_stock'::public.stock_reason,
  jsonb_build_object(
    'note', 'force parent-tree total to 110',
    'parent_warehouse_id', 'fad8f3bf-6a13-471f-9198-c46bc65014e4',
    'before_total', d.current_qty,
    'target_total', 110,
    'applied_at', now()
  )
FROM delta d
WHERE d.delta_qty <> 0;

COMMIT;

-- Run Block 2: Verify
WITH RECURSIVE warehouse_tree AS (
  SELECT id
  FROM public.warehouses
  WHERE id = 'fad8f3bf-6a13-471f-9198-c46bc65014e4'::uuid
  UNION ALL
  SELECT w.id
  FROM public.warehouses w
  JOIN warehouse_tree wt
    ON w.parent_warehouse_id = wt.id
)
SELECT COALESCE(SUM(wsi.net_units), 0) AS parent_tree_total
FROM public.warehouse_stock_items wsi
JOIN warehouse_tree wt
  ON wt.id = wsi.warehouse_id
WHERE wsi.item_id = '4b340326-5f47-492f-924b-4771e434ea60'::uuid;
