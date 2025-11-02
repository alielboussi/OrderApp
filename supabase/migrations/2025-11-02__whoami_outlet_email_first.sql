-- whoami_outlet: determine outlet by email first, then fallback to outlet_users mapping by auth.uid()
-- This avoids dependence on a stable auth.user UUID; email change is handled by updating auth.users, not outlet mapping.
-- Returns at most one row; if multiple matches by email, picks the first by created_at.

create or replace function public.whoami_outlet()
returns table(
  outlet_id uuid,
  outlet_name text
)
language sql
security definer
stable
set search_path = public
as $$
  with jwt as (
    select coalesce(nullif(((current_setting('request.jwt.claims', true))::jsonb ->> 'email')::text, ''), '') as email
  ),
  email_match as (
    select o.id as outlet_id, o.name as outlet_name
    from outlets o, jwt
    where lower(coalesce(o.email, '')) = lower(jwt.email)
    order by o.created_at asc
    limit 1
  ),
  id_match as (
    select o.id as outlet_id, o.name as outlet_name
    from outlets o
    join outlet_users ou on ou.outlet_id = o.id
    where ou.user_id = auth.uid()
    limit 1
  )
  select * from email_match
  union all
  select * from id_match
  limit 1;
$$;

revoke all on function public.whoami_outlet() from public;
grant execute on function public.whoami_outlet() to anon, authenticated, service_role;
