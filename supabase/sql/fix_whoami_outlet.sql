-- Replace whoami_outlet to avoid any ambiguous identifiers and return the user's outlet mapping
create or replace function public.whoami_outlet()
returns table (
  outlet_id uuid,
  outlet_name text
) language sql security definer set search_path = public, auth as $$
  with cur as (
    select u.id as uid, lower(u.email) as email
    from auth.users u
    where u.id = auth.uid()
  )
  (
    -- Direct mapping via outlet_users bridge
    select o.id, o.name
    from public.outlet_users ou
    join public.outlets o on o.id = ou.outlet_id
    join cur on cur.uid = ou.user_id
  )
  union
  (
    -- Fallback mapping via outlets.email = user email (legacy behavior)
    select o.id, o.name
    from public.outlets o
    join cur on cur.email is not null and lower(o.email) = cur.email
  );
$$;

grant execute on function public.whoami_outlet() to anon, authenticated;