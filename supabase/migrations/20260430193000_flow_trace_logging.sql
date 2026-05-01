-- Flow trace logging for sales and recipe deductions

CREATE TABLE IF NOT EXISTS public.flow_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NULL,
  order_id uuid NULL,
  outlet_id uuid NULL,
  level text NOT NULL,
  item_id uuid NOT NULL,
  variant_key text NOT NULL DEFAULT 'base',
  warehouse_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_flow_traces_sale_level_item_wh
  ON public.flow_traces (sale_id, level, item_id, warehouse_id, variant_key)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flow_traces_outlet
  ON public.flow_traces (outlet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.flow_trace_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL REFERENCES public.flow_traces(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  delta_units numeric NOT NULL,
  available_units numeric NULL,
  reason text NOT NULL,
  negative boolean NOT NULL DEFAULT false,
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_flow_trace_steps_trace
  ON public.flow_trace_steps (trace_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.stock_ledger_flow_trace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id uuid := nullif(new.context->>'sale_id', '')::uuid;
  v_order_id uuid := nullif(new.context->>'order_id', '')::uuid;
  v_outlet_id uuid := nullif(new.context->>'outlet_id', '')::uuid;
  v_component_kind text := lower(coalesce(new.context->>'component_kind', ''));
  v_level text;
  v_trace_id uuid;
  v_available numeric := null;
  v_negative boolean := false;
BEGIN
  IF new.reason NOT IN ('outlet_sale', 'recipe_consumption') THEN
    RETURN new;
  END IF;

  IF new.reason = 'outlet_sale' THEN
    v_level := 'finished';
  ELSIF v_component_kind = 'ingredient' THEN
    v_level := 'ingredient';
  ELSE
    v_level := 'raw';
  END IF;

  IF new.warehouse_id IS NOT NULL THEN
    SELECT wsi.net_units
      INTO v_available
    FROM public.warehouse_stock_items wsi
    WHERE wsi.warehouse_id = new.warehouse_id
      AND wsi.item_id = new.item_id
      AND wsi.variant_key = public.normalize_variant_key(coalesce(new.variant_key, 'base'))
    LIMIT 1;
  END IF;

  IF v_available IS NOT NULL AND v_available < 0 THEN
    v_negative := true;
  END IF;

  INSERT INTO public.flow_traces (
    sale_id,
    order_id,
    outlet_id,
    level,
    item_id,
    variant_key,
    warehouse_id,
    context
  ) VALUES (
    v_sale_id,
    v_order_id,
    v_outlet_id,
    v_level,
    new.item_id,
    public.normalize_variant_key(coalesce(new.variant_key, 'base')),
    new.warehouse_id,
    new.context
  )
  ON CONFLICT (sale_id, level, item_id, warehouse_id, variant_key)
  DO UPDATE SET
    context = excluded.context
  RETURNING id INTO v_trace_id;

  INSERT INTO public.flow_trace_steps (
    trace_id,
    occurred_at,
    delta_units,
    available_units,
    reason,
    negative,
    context
  ) VALUES (
    v_trace_id,
    new.occurred_at,
    new.delta_units,
    v_available,
    new.reason,
    v_negative,
    new.context
  );

  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stock_ledger_flow_trace ON public.stock_ledger;
CREATE TRIGGER trg_stock_ledger_flow_trace
AFTER INSERT ON public.stock_ledger
FOR EACH ROW
EXECUTE FUNCTION public.stock_ledger_flow_trace();
