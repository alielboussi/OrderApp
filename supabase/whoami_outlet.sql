-- Returns the outlet mapped to the currently authenticated user
create or replace function public.whoami_outlet()
returns table (outlet_id uuid, outlet_name text)
language sql
stable
security definer
set search_path = public
as $$
  select ou.outlet_id, o.name as outlet_name
  from public.outlet_users ou
  join public.outlets o on o.id = ou.outlet_id
  where ou.user_id = auth.uid()
$$;

revoke all on function public.whoami_outlet() from anon;
grant execute on function public.whoami_outlet() to authenticated;
