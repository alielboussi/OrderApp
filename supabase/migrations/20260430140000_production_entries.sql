BEGIN;

CREATE TABLE IF NOT EXISTS public.production_item_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  variant_key text NOT NULL DEFAULT 'base',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_production_item_assignment
  ON public.production_item_assignments (finished_item_id, warehouse_id, variant_key);

CREATE TABLE IF NOT EXISTS public.production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_key text NOT NULL DEFAULT 'base',
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  period_id uuid NULL REFERENCES public.warehouse_stock_periods(id) ON DELETE SET NULL,
  note text NULL,
  max_producible numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_production_entries_wh_item
  ON public.production_entries (warehouse_id, item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_entries_period
  ON public.production_entries (period_id);

CREATE OR REPLACE FUNCTION public.set_production_assignment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_production_assignment_updated_at ON public.production_item_assignments;
CREATE TRIGGER trg_production_assignment_updated_at
BEFORE UPDATE ON public.production_item_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_production_assignment_updated_at();

CREATE OR REPLACE FUNCTION public.record_production_entry(
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text DEFAULT 'base',
  p_warehouse_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.production_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_variant text := public.normalize_variant_key(p_variant_key);
  v_period_id uuid;
  v_row public.production_entries%rowtype;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT (public.is_stocktake_user(v_uid)
          OR public.is_admin(v_uid)
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = v_uid
              AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
          ))
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN
    RAISE EXCEPTION 'item + qty required for production entry';
  END IF;

  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse required for production entry';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.production_item_assignments pia
    WHERE pia.finished_item_id = p_item_id
      AND pia.warehouse_id = p_warehouse_id
      AND public.normalize_variant_key(pia.variant_key) = v_variant
      AND pia.active
  ) THEN
    RAISE EXCEPTION 'production assignment missing for item %', p_item_id;
  END IF;

  SELECT wsp.id
  INTO v_period_id
  FROM public.warehouse_stock_periods wsp
  WHERE wsp.warehouse_id = p_warehouse_id
    AND wsp.status = 'open'
  ORDER BY wsp.opened_at DESC NULLS LAST
  LIMIT 1;

  INSERT INTO public.production_entries(
    warehouse_id,
    item_id,
    variant_key,
    qty_units,
    period_id,
    note,
    created_by
  ) VALUES (
    p_warehouse_id,
    p_item_id,
    v_variant,
    p_qty_units,
    v_period_id,
    p_note,
    v_uid
  ) RETURNING * INTO v_row;

  INSERT INTO public.stock_ledger(
    location_type,
    warehouse_id,
    item_id,
    variant_key,
    delta_units,
    reason,
    context
  ) VALUES (
    'warehouse',
    p_warehouse_id,
    p_item_id,
    v_variant,
    p_qty_units,
    'production_entry',
    jsonb_build_object(
      'production_entry_id', v_row.id::text,
      'note', p_note,
      'period_id', v_period_id::text,
      'source', 'production_entry'
    )
  );

  RETURN v_row;
END;
$function$;

ALTER TABLE public.production_item_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_item_assignments_select ON public.production_item_assignments;
CREATE POLICY production_item_assignments_select ON public.production_item_assignments
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.is_stocktake_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  );

DROP POLICY IF EXISTS production_item_assignments_write ON public.production_item_assignments;
CREATE POLICY production_item_assignments_write ON public.production_item_assignments
  FOR ALL
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  );

DROP POLICY IF EXISTS production_entries_select ON public.production_entries;
CREATE POLICY production_entries_select ON public.production_entries
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.is_stocktake_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  );

DROP POLICY IF EXISTS production_entries_insert ON public.production_entries;
CREATE POLICY production_entries_insert ON public.production_entries
  FOR INSERT
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.is_stocktake_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  );

COMMIT;
