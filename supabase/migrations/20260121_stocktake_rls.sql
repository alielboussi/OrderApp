-- RLS adjustments for stocktake flow access
-- Allow stocktake users to read outlet item routing used by stocktake app.

create policy outlet_item_routes_select_stocktake
on public.outlet_item_routes
for select
to authenticated
using (
  is_stocktake_user(auth.uid())
  or is_admin(auth.uid())
);
