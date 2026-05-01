DROP FUNCTION IF EXISTS public.has_open_warehouse_period(uuid);

CREATE OR REPLACE FUNCTION public.has_open_warehouse_period(
  p_warehouse_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.warehouse_stock_periods wsp
    where wsp.warehouse_id = p_warehouse_id
      and wsp.status = 'open'
    limit 1
  );
$function$;
