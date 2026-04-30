BEGIN;

CREATE OR REPLACE VIEW public.warehouse_stock_variances AS
WITH opening AS (
  SELECT
    warehouse_stock_counts.period_id,
    warehouse_stock_counts.item_id,
    public.normalize_variant_key(warehouse_stock_counts.variant_key) AS variant_key,
    max(warehouse_stock_counts.counted_qty) AS opening_qty
  FROM public.warehouse_stock_counts
  WHERE warehouse_stock_counts.kind = 'opening'
  GROUP BY warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, public.normalize_variant_key(warehouse_stock_counts.variant_key)
),
closing AS (
  SELECT
    warehouse_stock_counts.period_id,
    warehouse_stock_counts.item_id,
    public.normalize_variant_key(warehouse_stock_counts.variant_key) AS variant_key,
    max(warehouse_stock_counts.counted_qty) AS closing_qty
  FROM public.warehouse_stock_counts
  WHERE warehouse_stock_counts.kind = 'closing'
  GROUP BY warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, public.normalize_variant_key(warehouse_stock_counts.variant_key)
),
movement AS (
  SELECT
    wsp.id AS period_id,
    sl.item_id,
    public.normalize_variant_key(sl.variant_key) AS variant_key,
    sum(sl.delta_units) AS movement_qty
  FROM public.warehouse_stock_periods wsp
  LEFT JOIN public.stock_ledger sl
    ON sl.warehouse_id = wsp.warehouse_id
    AND sl.location_type = 'warehouse'
    AND sl.item_id IS NOT NULL
    AND sl.occurred_at >= wsp.opened_at
    AND (wsp.closed_at IS NULL OR sl.occurred_at <= COALESCE(wsp.closed_at, now()))
    AND sl.reason = ANY (
      ARRAY[
        'warehouse_transfer'::public.stock_reason,
        'outlet_sale'::public.stock_reason,
        'damage'::public.stock_reason,
        'recipe_consumption'::public.stock_reason,
        'production_entry'::public.stock_reason
      ]
    )
  GROUP BY wsp.id, sl.item_id, public.normalize_variant_key(sl.variant_key)
),
keys AS (
  SELECT opening.period_id, opening.item_id, opening.variant_key FROM opening
  UNION
  SELECT closing.period_id, closing.item_id, closing.variant_key FROM closing
  UNION
  SELECT movement.period_id, movement.item_id, movement.variant_key FROM movement
)
SELECT
  k.period_id,
  wsp.warehouse_id,
  wsp.outlet_id,
  k.item_id,
  k.variant_key,
  COALESCE(o.opening_qty, 0::numeric) AS opening_qty,
  COALESCE(m.movement_qty, 0::numeric) AS movement_qty,
  COALESCE(c.closing_qty, 0::numeric) AS closing_qty,
  (COALESCE(o.opening_qty, 0::numeric) + COALESCE(m.movement_qty, 0::numeric)) AS expected_qty,
  (COALESCE(c.closing_qty, 0::numeric) - (COALESCE(o.opening_qty, 0::numeric) + COALESCE(m.movement_qty, 0::numeric))) AS variance_qty,
  ci.name AS item_name,
  COALESCE(ci.cost, 0::numeric) AS unit_cost,
  ((COALESCE(c.closing_qty, 0::numeric) - (COALESCE(o.opening_qty, 0::numeric) + COALESCE(m.movement_qty, 0::numeric))) * COALESCE(ci.cost, 0::numeric)) AS variance_cost
FROM keys k
JOIN public.warehouse_stock_periods wsp ON wsp.id = k.period_id
LEFT JOIN opening o ON o.period_id = k.period_id AND o.item_id = k.item_id AND o.variant_key = k.variant_key
LEFT JOIN closing c ON c.period_id = k.period_id AND c.item_id = k.item_id AND c.variant_key = k.variant_key
LEFT JOIN movement m ON m.period_id = k.period_id AND m.item_id = k.item_id AND m.variant_key = k.variant_key
LEFT JOIN public.catalog_items ci ON ci.id = k.item_id;

COMMIT;
