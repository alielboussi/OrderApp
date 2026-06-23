-- Outlet damages recorded from the Afterten Ordering App (no backoffice nav).
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.outlet_damages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  note text,
  reported_by text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outlet_damages_outlet_id_idx ON public.outlet_damages(outlet_id);
CREATE INDEX IF NOT EXISTS outlet_damages_warehouse_id_idx ON public.outlet_damages(warehouse_id);
CREATE INDEX IF NOT EXISTS outlet_damages_created_at_idx ON public.outlet_damages(created_at DESC);

CREATE TABLE IF NOT EXISTS public.outlet_damage_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  damage_id uuid NOT NULL REFERENCES public.outlet_damages(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  variant_key text NOT NULL DEFAULT 'base',
  qty numeric NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (damage_id, item_id, variant_key)
);

CREATE INDEX IF NOT EXISTS outlet_damage_items_damage_id_idx ON public.outlet_damage_items(damage_id);
CREATE INDEX IF NOT EXISTS outlet_damage_items_item_id_idx ON public.outlet_damage_items(item_id);

ALTER TABLE public.outlet_damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_damage_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_damages_select ON public.outlet_damages;
CREATE POLICY outlet_damages_select ON public.outlet_damages
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR outlet_id = ANY(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]))
    OR public.is_supervisor(auth.uid())
    OR public.is_stocktake_user(auth.uid())
  );

DROP POLICY IF EXISTS outlet_damage_items_select ON public.outlet_damage_items;
CREATE POLICY outlet_damage_items_select ON public.outlet_damage_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.outlet_damages d
      WHERE d.id = outlet_damage_items.damage_id
        AND (
          public.is_admin(auth.uid())
          OR d.outlet_id = ANY(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]))
          OR public.is_supervisor(auth.uid())
          OR public.is_stocktake_user(auth.uid())
        )
    )
  );

CREATE OR REPLACE FUNCTION public.record_outlet_damage(
  p_outlet_id uuid,
  p_warehouse_id uuid,
  p_items jsonb,
  p_note text DEFAULT NULL,
  p_reported_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_damage_id uuid;
  rec record;
  v_variant_key text;
  v_qty numeric;
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'outlet_id is required';
  END IF;

  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse_id is required';
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR p_outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'not authorized for outlet %', p_outlet_id;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one damage line is required';
  END IF;

  PERFORM public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id);

  INSERT INTO public.outlet_damages(outlet_id, warehouse_id, note, reported_by, created_by)
  VALUES (p_outlet_id, p_warehouse_id, p_note, p_reported_by, v_uid)
  RETURNING id INTO v_damage_id;

  FOR rec IN
    SELECT
      (elem->>'product_id')::uuid AS item_id,
      COALESCE(NULLIF(elem->>'variant_key', ''), 'base') AS variant_key,
      (elem->>'qty')::numeric AS qty
    FROM jsonb_array_elements(p_items) AS elem
  LOOP
    IF rec.item_id IS NULL OR rec.qty IS NULL OR rec.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_variant_key := public.normalize_variant_key(rec.variant_key);
    v_qty := rec.qty;

    INSERT INTO public.outlet_damage_items(damage_id, item_id, variant_key, qty)
    VALUES (v_damage_id, rec.item_id, v_variant_key, v_qty);

    INSERT INTO public.stock_ledger(
      location_type,
      warehouse_id,
      item_id,
      variant_key,
      delta_units,
      reason,
      occurred_at,
      context
    )
    VALUES (
      'warehouse',
      p_warehouse_id,
      rec.item_id,
      v_variant_key,
      -ABS(v_qty),
      'damage',
      now(),
      jsonb_build_object(
        'outlet_id', p_outlet_id,
        'outlet_damage_id', v_damage_id,
        'source', 'afterten_orders_app'
      )
    );
  END LOOP;

  RETURN v_damage_id;
END;
$$;

GRANT SELECT ON public.outlet_damages TO authenticated;
GRANT SELECT ON public.outlet_damage_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_outlet_damage(uuid, uuid, jsonb, text, text) TO authenticated;
