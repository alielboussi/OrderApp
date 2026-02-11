-- Supabase health checks for POS mapping, routes, and stock periods
-- Adjust time window as needed.

-- 1) POS mappings coverage (recent sales with no pos_item_map)
WITH recent_pos_sales AS (
  SELECT
    os.outlet_id,
    (os.context->>'pos_item_id') AS pos_item_id,
    (os.context->>'flavour_id') AS pos_flavour_id
  FROM outlet_sales os
  WHERE os.created_at >= now() - interval '7 days'
    AND os.context ? 'pos_item_id'
)
SELECT
  r.outlet_id,
  r.pos_item_id,
  r.pos_flavour_id,
  COUNT(*) AS sale_rows
FROM recent_pos_sales r
LEFT JOIN pos_item_map pm
  ON pm.outlet_id = r.outlet_id
 AND pm.pos_item_id = r.pos_item_id
 AND (pm.pos_flavour_id IS NULL OR pm.pos_flavour_id = r.pos_flavour_id)
WHERE pm.id IS NULL
GROUP BY r.outlet_id, r.pos_item_id, r.pos_flavour_id
ORDER BY sale_rows DESC;

-- 2) POS mappings missing outlet routes (deduction mapping)
SELECT
  pm.outlet_id,
  pm.catalog_item_id,
  pm.catalog_variant_key,
  pm.warehouse_id,
  COUNT(*) AS map_rows
FROM pos_item_map pm
LEFT JOIN outlet_item_routes r
  ON r.outlet_id = pm.outlet_id
 AND r.item_id = pm.catalog_item_id
 AND r.normalized_variant_key IN (normalize_variant_key(pm.catalog_variant_key), 'base')
WHERE r.outlet_id IS NULL
GROUP BY pm.outlet_id, pm.catalog_item_id, pm.catalog_variant_key, pm.warehouse_id
ORDER BY map_rows DESC;

-- 3) Mapped items pointing to warehouses with no open stock period
SELECT
  pm.outlet_id,
  pm.catalog_item_id,
  pm.catalog_variant_key,
  COALESCE(pm.warehouse_id, r.warehouse_id) AS resolved_warehouse_id
FROM pos_item_map pm
LEFT JOIN outlet_item_routes r
  ON r.outlet_id = pm.outlet_id
 AND r.item_id = pm.catalog_item_id
 AND r.normalized_variant_key IN (normalize_variant_key(pm.catalog_variant_key), 'base')
LEFT JOIN warehouse_stock_periods wsp
  ON wsp.warehouse_id = COALESCE(pm.warehouse_id, r.warehouse_id)
 AND wsp.status = 'open'
WHERE COALESCE(pm.warehouse_id, r.warehouse_id) IS NOT NULL
  AND wsp.id IS NULL
ORDER BY pm.outlet_id;

-- 4) Stock movement sanity (last 7 days)
SELECT
  warehouse_id,
  item_id,
  variant_key,
  SUM(delta_units) AS net_delta
FROM stock_ledger
WHERE occurred_at >= now() - interval '7 days'
GROUP BY warehouse_id, item_id, variant_key
ORDER BY warehouse_id, net_delta ASC;
