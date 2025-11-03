-- Formatting helpers and any small schema utilities
-- Idempotent: safe to run multiple times

CREATE OR REPLACE FUNCTION public.format_order_number(outlet_name text, seq bigint)
RETURNS text
LANGUAGE sql
SET search_path = pg_temp
STABLE
AS $$
  WITH safe AS (
    SELECT regexp_replace(trim(coalesce(outlet_name, 'Outlet')), '[^A-Za-z0-9_-]', '_', 'g') AS name
  )
  SELECT format('%s_%07d', name, seq) FROM safe;
$$;