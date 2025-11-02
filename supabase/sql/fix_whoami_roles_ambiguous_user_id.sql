-- Fix for error 42702: column reference "user_id" is ambiguous inside whoami_roles
-- Root cause: an unqualified reference to user_id conflicted with a table column and/or a PL/pgSQL variable.
-- This version qualifies all columns and avoids naming variables "user_id".

create or replace function public.whoami_roles()
returns table (
    user_id uuid,
    email text,
    is_admin boolean,
    roles text[],
    outlets jsonb
) language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_is_admin boolean := false;
  v_roles text[] := '{}';
  v_outlets jsonb := '[]'::jsonb;
begin
  -- email from auth.users
  select u.email into v_email
  from auth.users u
  where u.id = v_uid;

  -- admin flag from user_roles
  select exists(
    select 1 from public.user_roles ur
    where ur.user_id = v_uid and ur.role = 'admin'::public.role_type and ur.active
  ) into v_is_admin;

  -- flat roles set for this user
  select coalesce(array(select distinct ur.role::text
                        from public.user_roles ur
                        where ur.user_id = v_uid and ur.active), '{}')
    into v_roles;

  -- per-outlet roles aggregation
  select coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'outlet_id', o.id,
        'outlet_name', o.name,
        'roles', x.roles
      ))
      from (
        select ur.outlet_id, array_agg(distinct ur.role::text) as roles
        from public.user_roles ur
        where ur.user_id = v_uid and ur.active and ur.outlet_id is not null
        group by ur.outlet_id
      ) x
      join public.outlets o on o.id = x.outlet_id
    ), '[]'::jsonb)
  into v_outlets;

  return query select v_uid, v_email, coalesce(v_is_admin, false), coalesce(v_roles, '{}'), coalesce(v_outlets, '[]'::jsonb);
end;
$$;

-- Ensure callable from PostgREST
grant execute on function public.whoami_roles() to anon, authenticated;
