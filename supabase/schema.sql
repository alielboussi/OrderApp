-- Schema additions: order number formatting helper(s)
-- Safe to run multiple times (create or replace). Keep this file focused on additive helpers.

-- Formats an order number like: OutletName_0000001
-- - outlet_name: free text (will be sanitized to [A-Za-z0-9])
-- - seq: bigint sequence number, zero-padded to 7 digits
-- Example: ('AfterTen Beirut', 1) => 'AfterTenBeirut_0000001'
CREATE OR REPLACE FUNCTION public.format_order_number(outlet_name text, seq bigint)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT concat(
    -- sanitize: remove all non-alphanumeric characters
    regexp_replace(coalesce(outlet_name, ''), '[^A-Za-z0-9]+', '', 'g'),
    '_',
    lpad(coalesce(seq, 0)::text, 7, '0')
  );
$$;

-- Optional convenience: derive formatted number directly from outlet_id by reading outlets.name and outlet_sequences.next_seq
-- This function is created only if the expected tables exist.
DO $$
BEGIN
  IF to_regclass('public.outlets') IS NOT NULL
     AND to_regclass('public.outlet_sequences') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION public.format_order_number_for_outlet(p_outlet_id uuid)
      RETURNS text
      LANGUAGE sql
      STABLE
      AS $fn$
        SELECT public.format_order_number(o.name, s.next_seq)
        FROM public.outlets o
        JOIN public.outlet_sequences s ON s.outlet_id = o.id
        WHERE o.id = p_outlet_id
      $fn$;';
  ELSE
    RAISE NOTICE 'format_order_number_for_outlet not created (outlets/outlet_sequences missing)';
  END IF;
END
$$;