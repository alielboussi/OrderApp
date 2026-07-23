-- =============================================================================
-- 00 — Pre-flight: compare Till 1, Till 2, and Quick Corner middleware setup
-- =============================================================================
-- WHERE: Supabase SQL Editor (read-only checks — run BEFORE stopping services)
-- PASS: Each till row shows has_pos_middleware = true, heartbeat recent, bindings > 0
-- =============================================================================

-- Outlet UUIDs (from Afterten/src/lib/outletScope.ts)
-- Till 1:  648e949d-8648-4c43-80d4-f08feb7bdd04
-- Till 2:  a655b0a1-a37a-43d6-aa55-7f97377b2660
-- Quick Corner: a406fede-7aab-4473-8e9f-ff645267466f

-- 1) Outlet flags (must match Quick Corner pattern)
SELECT
  o.id,
  o.name,
  o.active,
  o.has_pos_middleware,
  o.uses_orders_app,
  o.default_sales_warehouse_id,
  o.default_receiving_warehouse_id
FROM public.outlets o
WHERE o.id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660',
  'a406fede-7aab-4473-8e9f-ff645267466f'
)
ORDER BY o.name;

-- 2) Warehouse links per outlet
SELECT
  o.name AS outlet_name,
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.warehouse_scope
FROM public.outlet_warehouses ow
JOIN public.outlets o ON o.id = ow.outlet_id
JOIN public.warehouses w ON w.id = ow.warehouse_id
WHERE ow.outlet_id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660',
  'a406fede-7aab-4473-8e9f-ff645267466f'
)
ORDER BY o.name, w.name;

-- 3) Middleware heartbeat (Quick Corner reference vs tills)
SELECT
  o.name AS outlet_name,
  hb.host_name,
  hb.last_seen_at,
  now() - hb.last_seen_at AS age,
  hb.middleware_version,
  hb.pending_sales_count,
  hb.last_sync_error
FROM public.outlets o
LEFT JOIN public.outlet_pos_heartbeats hb ON hb.outlet_id = o.id
WHERE o.id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660',
  'a406fede-7aab-4473-8e9f-ff645267466f'
)
ORDER BY o.name;

-- 4) Current sales volume (baseline before wipe)
SELECT
  o.name AS outlet_name,
  (SELECT COUNT(*) FROM public.outlet_sales os WHERE os.outlet_id = o.id) AS outlet_sales,
  (SELECT COUNT(*) FROM public.orders ord
   WHERE ord.outlet_id = o.id
     AND ord.source_event_id LIKE o.id::text || '-%') AS pos_orders,
  (SELECT COUNT(*) FROM public.pos_sync_failures psf WHERE psf.outlet_id = o.id) AS sync_failures,
  (SELECT COUNT(*) FROM public.outlet_pos_catalog_bindings b WHERE b.outlet_id = o.id) AS catalog_bindings
FROM public.outlets o
WHERE o.id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660',
  'a406fede-7aab-4473-8e9f-ff645267466f'
)
ORDER BY o.name;

-- 5) Catalog sync health (last 7 days)
SELECT
  o.name AS outlet_name,
  e.status,
  COUNT(*) AS events
FROM public.outlet_catalog_sync_events e
JOIN public.outlets o ON o.id = e.outlet_id
WHERE e.outlet_id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660',
  'a406fede-7aab-4473-8e9f-ff645267466f'
)
  AND e.created_at > now() - interval '7 days'
GROUP BY o.name, e.status
ORDER BY o.name, e.status;
