-- Outlet warehouse stocktakes: outlet operators may count; variance = expected - closing

CREATE OR REPLACE FUNCTION public.can_operate_outlet_warehouse_stocktake(p_user uuid, p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.is_admin(p_user)
      OR public.is_stocktake_user(p_user)
      OR EXISTS (
        SELECT 1
        FROM public.outlet_warehouses ow
        WHERE ow.warehouse_id = p_warehouse_id
          AND ow.outlet_id = ANY(COALESCE(public.member_outlet_ids(p_user), ARRAY[]::uuid[]))
      );
$$;

-- Outlet app users (outlets.auth_user_id) with a stocktake warehouse may record counts
CREATE OR REPLACE FUNCTION public.is_stocktake_user(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user
      AND ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'
  )
  OR EXISTS (
    SELECT 1 FROM public.stocktake_app_users su
    WHERE su.id = p_user AND su.active
  )
  OR EXISTS (
    SELECT 1
    FROM public.outlets o
    JOIN public.outlet_warehouses ow ON ow.outlet_id = o.id AND COALESCE(ow.show_in_stocktake, true)
    WHERE o.auth_user_id = p_user AND COALESCE(o.active, true)
  );
$$;

-- Stamp outlet_id when a period opens on an outlet warehouse
CREATE OR REPLACE FUNCTION public.trg_set_stock_period_outlet_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.outlet_id IS NULL THEN
    SELECT ow.outlet_id INTO NEW.outlet_id
    FROM public.outlet_warehouses ow
    WHERE ow.warehouse_id = NEW.warehouse_id
    ORDER BY ow.outlet_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_stock_period_outlet_id ON public.warehouse_stock_periods;
CREATE TRIGGER set_stock_period_outlet_id
  BEFORE INSERT ON public.warehouse_stock_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stock_period_outlet_id();

-- Backfill outlet_id on existing periods
UPDATE public.warehouse_stock_periods wsp
SET outlet_id = ow.outlet_id
FROM public.outlet_warehouses ow
WHERE wsp.outlet_id IS NULL
  AND ow.warehouse_id = wsp.warehouse_id;

-- Variance view: Expected - Closing (positive = short vs book)
DROP VIEW IF EXISTS public.warehouse_stock_variances;
CREATE VIEW public.warehouse_stock_variances AS
WITH opening AS (
  SELECT period_id, item_id, normalize_variant_key(variant_key) AS variant_key,
         max(counted_qty) AS opening_qty
  FROM warehouse_stock_counts
  WHERE kind = 'opening'
  GROUP BY period_id, item_id, normalize_variant_key(variant_key)
),
closing AS (
  SELECT period_id, item_id, normalize_variant_key(variant_key) AS variant_key,
         max(counted_qty) AS closing_qty
  FROM warehouse_stock_counts
  WHERE kind = 'closing'
  GROUP BY period_id, item_id, normalize_variant_key(variant_key)
),
movement AS (
  SELECT
    wsp.id AS period_id,
    sl.item_id,
    normalize_variant_key(sl.variant_key) AS variant_key,
    sum(sl.delta_units) FILTER (WHERE sl.reason = 'warehouse_transfer') AS transfer_qty,
    sum(sl.delta_units) FILTER (WHERE sl.reason = 'damage') AS damage_qty,
    sum(sl.delta_units) FILTER (WHERE sl.reason = 'outlet_sale') AS sales_qty,
    sum(sl.delta_units) AS movement_qty
  FROM warehouse_stock_periods wsp
  JOIN stock_ledger sl
    ON sl.warehouse_id = wsp.warehouse_id
   AND sl.location_type = 'warehouse'
   AND sl.occurred_at >= wsp.opened_at
   AND sl.occurred_at <= COALESCE(wsp.closed_at, now())
  WHERE sl.reason IN ('warehouse_transfer', 'outlet_sale', 'damage', 'recipe_consumption', 'production_entry')
  GROUP BY wsp.id, sl.item_id, normalize_variant_key(sl.variant_key)
)
SELECT
  wsp.id AS period_id,
  wsp.warehouse_id,
  wsp.outlet_id,
  o.item_id,
  ci.name AS item_name,
  o.variant_key,
  o.opening_qty,
  COALESCE(m.transfer_qty, 0) AS transfer_qty,
  COALESCE(m.damage_qty, 0) AS damage_qty,
  COALESCE(m.sales_qty, 0) AS sales_qty,
  COALESCE(m.movement_qty, 0) AS movement_qty,
  c.closing_qty,
  o.opening_qty + COALESCE(m.movement_qty, 0) AS expected_qty,
  (o.opening_qty + COALESCE(m.movement_qty, 0)) - COALESCE(c.closing_qty, 0) AS variance_qty,
  COALESCE(ci.cost, 0) * ((o.opening_qty + COALESCE(m.movement_qty, 0)) - COALESCE(c.closing_qty, 0)) AS variance_cost
FROM warehouse_stock_periods wsp
JOIN opening o ON o.period_id = wsp.id
LEFT JOIN closing c ON c.period_id = wsp.id AND c.item_id = o.item_id AND c.variant_key = o.variant_key
LEFT JOIN movement m ON m.period_id = wsp.id AND m.item_id = o.item_id AND m.variant_key = o.variant_key
LEFT JOIN catalog_items ci ON ci.id = o.item_id;
