-- Per-outlet POS catalog snapshot (SKUs currently on each till).
-- Called by SCPGT after sync_pos_catalog_from_middleware via:
--   sync_outlet_pos_catalog_bindings(p_outlet_id, p_rows)

CREATE TABLE IF NOT EXISTS public.outlet_pos_catalog_bindings (
  outlet_id uuid NOT NULL REFERENCES public.outlets (id) ON DELETE CASCADE,
  item_sku text NOT NULL,
  variant_sku text NOT NULL,
  item_name text,
  variant_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlet_pos_catalog_bindings_pkey PRIMARY KEY (outlet_id, item_sku, variant_sku)
);

CREATE INDEX IF NOT EXISTS idx_outlet_pos_catalog_bindings_outlet
  ON public.outlet_pos_catalog_bindings (outlet_id);

ALTER TABLE public.outlet_pos_catalog_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_pos_catalog_bindings_service ON public.outlet_pos_catalog_bindings;
CREATE POLICY outlet_pos_catalog_bindings_service
  ON public.outlet_pos_catalog_bindings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS outlet_pos_catalog_bindings_authenticated_read ON public.outlet_pos_catalog_bindings;
CREATE POLICY outlet_pos_catalog_bindings_authenticated_read
  ON public.outlet_pos_catalog_bindings
  FOR SELECT
  TO authenticated
  USING (true);

GRANT ALL ON TABLE public.outlet_pos_catalog_bindings TO service_role;
GRANT SELECT ON TABLE public.outlet_pos_catalog_bindings TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_outlet_pos_catalog_bindings(
  p_outlet_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_bindings_upserted integer := 0;
  v_bindings_removed integer := 0;
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'p_outlet_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.outlets o WHERE o.id = p_outlet_id) THEN
    RAISE EXCEPTION 'Unknown outlet %', p_outlet_id;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  CREATE TEMP TABLE _src_bindings ON COMMIT DROP AS
  SELECT DISTINCT
    p_outlet_id AS outlet_id,
    nullif(trim(r.item_sku), '') AS item_sku,
    nullif(trim(r.variant_sku), '') AS variant_sku,
    nullif(trim(r.item_name), '') AS item_name,
    nullif(trim(r.variant_name), '') AS variant_name
  FROM jsonb_to_recordset(p_rows) AS r(
    item_sku text,
    item_name text,
    variant_name text,
    variant_sku text
  )
  WHERE nullif(trim(r.item_sku), '') IS NOT NULL
    AND nullif(trim(r.variant_sku), '') IS NOT NULL;

  WITH removed AS (
    DELETE FROM public.outlet_pos_catalog_bindings b
    WHERE b.outlet_id = p_outlet_id
      AND NOT EXISTS (
        SELECT 1
        FROM _src_bindings s
        WHERE s.item_sku = b.item_sku
          AND s.variant_sku = b.variant_sku
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_bindings_removed FROM removed;

  WITH upserted AS (
    INSERT INTO public.outlet_pos_catalog_bindings (
      outlet_id,
      item_sku,
      variant_sku,
      item_name,
      variant_name,
      last_seen_at,
      updated_at
    )
    SELECT
      outlet_id,
      item_sku,
      variant_sku,
      item_name,
      variant_name,
      now(),
      now()
    FROM _src_bindings
    ON CONFLICT (outlet_id, item_sku, variant_sku) DO UPDATE
    SET
      item_name = EXCLUDED.item_name,
      variant_name = EXCLUDED.variant_name,
      last_seen_at = now(),
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_bindings_upserted FROM upserted;

  RETURN jsonb_build_object(
    'ok', true,
    'outlet_id', p_outlet_id,
    'bindings_upserted', v_bindings_upserted,
    'bindings_removed', v_bindings_removed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_outlet_pos_catalog_bindings(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_outlet_pos_catalog_bindings(uuid, jsonb) TO anon;
