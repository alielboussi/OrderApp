-- Catalog push diagnostic — run in Supabase SQL Editor.
-- Change OUTLET_ID below once (find/replace) if not Quick Corner.

-- OUTLET_ID: a406fede-7aab-4473-8e9f-ff645267466f

-- 1) Till middleware heartbeat
SELECT
  o.name AS outlet_name,
  o.has_pos_middleware,
  hb.last_seen_at,
  hb.host_name,
  hb.middleware_version,
  hb.pending_sales_count,
  hb.last_sync_error
FROM public.outlets o
LEFT JOIN public.outlet_pos_heartbeats hb ON hb.outlet_id = o.id
WHERE o.id = 'a406fede-7aab-4473-8e9f-ff645267466f'::uuid;

-- 2) Catalog sync queue summary
SELECT
  status,
  entity_type,
  COUNT(*) AS event_count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM public.outlet_catalog_sync_events
WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'::uuid
GROUP BY status, entity_type
ORDER BY status, entity_type;

-- 3) Latest 50 catalog sync events
SELECT
  id,
  status,
  entity_type,
  entity_id,
  payload->>'sku' AS item_sku,
  payload->>'name' AS item_name,
  payload->>'item_sku' AS parent_item_sku,
  payload->>'variant_sku' AS variant_sku,
  payload->>'variant_name' AS variant_name,
  payload->>'sync_mode' AS sync_mode,
  payload->>'scheduled_at' AS scheduled_at,
  created_at,
  delivered_at,
  error_message
FROM public.outlet_catalog_sync_events
WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'::uuid
ORDER BY created_at DESC
LIMIT 50;

-- 4) Finished products blocked from push (missing menu group / SKU / inactive)
SELECT
  ci.id,
  ci.name,
  ci.sku,
  ci.item_kind,
  ci.menu_group_id,
  ci.active,
  CASE
    WHEN ci.item_kind <> 'finished' THEN 'not finished'
    WHEN ci.menu_group_id IS NULL THEN 'missing menu group'
    WHEN NULLIF(trim(ci.sku), '') IS NULL THEN 'missing sku'
    WHEN ci.active IS FALSE THEN 'inactive'
    ELSE 'ok'
  END AS push_blocker
FROM public.catalog_items ci
WHERE ci.item_kind = 'finished'
  AND (
    ci.menu_group_id IS NULL
    OR NULLIF(trim(ci.sku), '') IS NULL
    OR ci.active IS FALSE
  )
ORDER BY ci.name;
