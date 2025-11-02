-- Safer role helper functions with qualified identifiers

create or replace function public.has_role(p_role public.role_type, p_outlet_id uuid default null)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = p_role
      and ur.active
      and (
        (p_outlet_id is null and ur.outlet_id is null)
        or (p_outlet_id is not null and ur.outlet_id = p_outlet_id)
      )
  );
$$;

grant execute on function public.has_role(public.role_type, uuid) to anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.has_role('admin'::public.role_type, null);
$$;

grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.tm_for_outlet(p_outlet_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.has_role('transfer_manager'::public.role_type, p_outlet_id);
$$;

grant execute on function public.tm_for_outlet(uuid) to anon, authenticated;

create or replace function public.tm_for_warehouse(p_warehouse_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(
    select 1
    from public.warehouses w
    where w.id = p_warehouse_id
      and public.has_role('transfer_manager'::public.role_type, w.outlet_id)
  );
$$;

grant execute on function public.tm_for_warehouse(uuid) to anon, authenticated;
