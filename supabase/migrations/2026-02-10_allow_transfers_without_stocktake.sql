create or replace function public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_warehouse_id is null then
    return;
  end if;

  -- Allow transfers without an open stock period for specific home warehouses.
  if p_warehouse_id = any (array[
    '21e1b353-9f6a-4cea-8998-128f4328b79d'::uuid,
    '251a87ae-3ff6-4d26-918a-0f7c1fc45d4d'::uuid,
    '29f617c5-9c76-4131-aebf-4be4544924db'::uuid,
    '38bfcdb0-fec1-4b91-be05-d8990bf357a8'::uuid,
    '4631b410-fc81-4f16-a74c-7e4de3c1f576'::uuid,
    '732d83ba-48f6-481a-bedf-291b5f158552'::uuid,
    'ac0bb46a-879b-4166-a10e-b31b688ee7c7'::uuid,
    'd4252cfd-03c0-4187-9267-18ec79a00814'::uuid
  ]) then
    return;
  end if;

  if exists (
    select 1
    from public.outlet_warehouses ow
    where ow.warehouse_id = p_warehouse_id
  ) or exists (
    select 1
    from public.outlets o
    where o.default_sales_warehouse_id = p_warehouse_id
       or o.default_receiving_warehouse_id = p_warehouse_id
  ) then
    if not exists (
      select 1
      from public.warehouse_stock_periods wsp
      where wsp.warehouse_id = p_warehouse_id
        and wsp.status = 'open'
    ) then
      raise exception 'open stock period required for warehouse %', p_warehouse_id;
    end if;
  end if;
end;
$function$;
