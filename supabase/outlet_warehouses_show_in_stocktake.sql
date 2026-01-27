-- Add show_in_stocktake flag to outlet_warehouses

begin;

alter table public.outlet_warehouses
  add column if not exists show_in_stocktake boolean not null default true;

update public.outlet_warehouses
set show_in_stocktake = true
where show_in_stocktake is null;

commit;
