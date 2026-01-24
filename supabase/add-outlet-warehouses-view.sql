-- Fix missing relation referenced by validate_pos_order
-- Provide outlet -> warehouse mapping based on warehouses table
CREATE OR REPLACE VIEW public.outlet_warehouses AS
SELECT
  w.outlet_id,
  w.id AS warehouse_id
FROM public.warehouses w
WHERE w.outlet_id IS NOT NULL;
