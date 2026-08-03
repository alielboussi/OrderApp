-- =============================================================================
-- Add OneWay outlet + warehouse (orders app pilot)
-- =============================================================================
-- WHERE: Supabase SQL Editor
-- IDs match firebase/scripts/oneway-outlet.json
-- =============================================================================

-- Outlet:  7f3e9a2b-1c4d-5e6f-8a9b-0c1d2e3f4a5b
-- Warehouse: 8a4f0b3c-2d5e-6f70-9b0c-1d2e3f405a6b

BEGIN;

INSERT INTO public.warehouses (id, name, code, active, warehouse_scope)
VALUES (
  '8a4f0b3c-2d5e-6f70-9b0c-1d2e3f405a6b'::uuid,
  'OneWay',
  'ONEWAY',
  true,
  'outlet'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  active = EXCLUDED.active,
  warehouse_scope = EXCLUDED.warehouse_scope,
  updated_at = now();

INSERT INTO public.outlets (
  id,
  name,
  code,
  channel,
  active,
  deduct_on_pos_sale,
  has_pos_middleware,
  uses_orders_app,
  default_sales_warehouse_id,
  default_receiving_warehouse_id
)
VALUES (
  '7f3e9a2b-1c4d-5e6f-8a9b-0c1d2e3f4a5b'::uuid,
  'OneWay',
  'ONEWAY',
  'selling',
  true,
  false,
  false,
  true,
  '8a4f0b3c-2d5e-6f70-9b0c-1d2e3f405a6b'::uuid,
  '8a4f0b3c-2d5e-6f70-9b0c-1d2e3f405a6b'::uuid
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  channel = EXCLUDED.channel,
  active = EXCLUDED.active,
  deduct_on_pos_sale = EXCLUDED.deduct_on_pos_sale,
  has_pos_middleware = EXCLUDED.has_pos_middleware,
  uses_orders_app = EXCLUDED.uses_orders_app,
  default_sales_warehouse_id = EXCLUDED.default_sales_warehouse_id,
  default_receiving_warehouse_id = EXCLUDED.default_receiving_warehouse_id,
  updated_at = now();

UPDATE public.warehouses
SET outlet_id = '7f3e9a2b-1c4d-5e6f-8a9b-0c1d2e3f4a5b'::uuid,
    updated_at = now()
WHERE id = '8a4f0b3c-2d5e-6f70-9b0c-1d2e3f405a6b'::uuid;

INSERT INTO public.outlet_warehouses (outlet_id, warehouse_id)
VALUES (
  '7f3e9a2b-1c4d-5e6f-8a9b-0c1d2e3f4a5b'::uuid,
  '8a4f0b3c-2d5e-6f70-9b0c-1d2e3f405a6b'::uuid
)
ON CONFLICT (outlet_id, warehouse_id) DO NOTHING;

COMMIT;

-- Verify
SELECT
  o.id AS outlet_id,
  o.name AS outlet_name,
  o.uses_orders_app,
  o.has_pos_middleware,
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.warehouse_scope
FROM public.outlets o
JOIN public.outlet_warehouses ow ON ow.outlet_id = o.id
JOIN public.warehouses w ON w.id = ow.warehouse_id
WHERE o.id = '7f3e9a2b-1c4d-5e6f-8a9b-0c1d2e3f4a5b'::uuid;
