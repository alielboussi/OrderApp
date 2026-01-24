-- Permanently seed stock_ledger from opening stock counts
-- Adds stock_reason value and a trigger to keep ledger in sync

DO $$
BEGIN
  ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'opening_stock';
EXCEPTION
  WHEN undefined_object THEN
    -- stock_reason type does not exist
    RAISE NOTICE 'stock_reason type not found';
END $$;

CREATE OR REPLACE FUNCTION public.sync_opening_stock_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delta numeric := 0;
  v_item_id uuid;
  v_variant text;
  v_period_id uuid;
  v_warehouse_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind <> 'opening' THEN
      RETURN NEW;
    END IF;
    v_delta := NEW.counted_qty;
    v_item_id := NEW.item_id;
    v_variant := public.normalize_variant_key(NEW.variant_key);
    v_period_id := NEW.period_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.kind <> 'opening' AND OLD.kind <> 'opening' THEN
      RETURN NEW;
    END IF;
    -- handle kind change or qty change
    IF OLD.kind = 'opening' THEN
      v_delta := v_delta - COALESCE(OLD.counted_qty, 0);
      v_item_id := OLD.item_id;
      v_variant := public.normalize_variant_key(OLD.variant_key);
      v_period_id := OLD.period_id;
    END IF;
    IF NEW.kind = 'opening' THEN
      v_delta := v_delta + COALESCE(NEW.counted_qty, 0);
      v_item_id := NEW.item_id;
      v_variant := public.normalize_variant_key(NEW.variant_key);
      v_period_id := NEW.period_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.kind <> 'opening' THEN
      RETURN OLD;
    END IF;
    v_delta := -1 * COALESCE(OLD.counted_qty, 0);
    v_item_id := OLD.item_id;
    v_variant := public.normalize_variant_key(OLD.variant_key);
    v_period_id := OLD.period_id;
  END IF;

  IF v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT wsp.warehouse_id
    INTO v_warehouse_id
  FROM public.warehouse_stock_periods wsp
  WHERE wsp.id = v_period_id
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.stock_ledger(
    location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at
  ) VALUES (
    'warehouse', v_warehouse_id, v_item_id, v_variant, v_delta, 'opening_stock',
    jsonb_build_object('period_id', v_period_id::text, 'source', 'opening_count'),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_opening_stock_to_ledger ON public.warehouse_stock_counts;
CREATE TRIGGER trg_opening_stock_to_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_stock_counts
FOR EACH ROW EXECUTE FUNCTION public.sync_opening_stock_to_ledger();
