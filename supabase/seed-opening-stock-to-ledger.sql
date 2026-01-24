-- Seed stock_ledger from opening stock counts for a warehouse
-- Replace :warehouse_id if your SQL editor doesn't support parameters
WITH latest_period AS (
  SELECT wsp.id, wsp.warehouse_id
  FROM public.warehouse_stock_periods wsp
  WHERE wsp.warehouse_id = 'c77376f7-1ede-4518-8180-b3efeecda128'
    AND wsp.status = 'open'
  ORDER BY wsp.opened_at DESC NULLS LAST
  LIMIT 1
),
opening_counts AS (
  SELECT wsc.period_id, wsc.item_id, wsc.variant_key, wsc.counted_qty
  FROM public.warehouse_stock_counts wsc
  JOIN latest_period lp ON lp.id = wsc.period_id
  WHERE wsc.kind = 'opening'
),
missing_rows AS (
  SELECT oc.*
  FROM opening_counts oc
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.stock_ledger sl
    WHERE sl.warehouse_id = (SELECT warehouse_id FROM latest_period)
      AND sl.item_id = oc.item_id
      AND public.normalize_variant_key(sl.variant_key) = public.normalize_variant_key(oc.variant_key)
      AND sl.reason = 'purchase_receipt'
      AND sl.context->>'period_id' = oc.period_id::text
  )
)
INSERT INTO public.stock_ledger (
  location_type,
  warehouse_id,
  item_id,
  variant_key,
  delta_units,
  reason,
  context,
  occurred_at
)
SELECT
  'warehouse',
  (SELECT warehouse_id FROM latest_period),
  mr.item_id,
  public.normalize_variant_key(mr.variant_key),
  mr.counted_qty,
  'purchase_receipt',
  jsonb_build_object('period_id', mr.period_id::text, 'source', 'opening_count', 'note', 'seeded from opening count'),
  now()
FROM missing_rows mr;
