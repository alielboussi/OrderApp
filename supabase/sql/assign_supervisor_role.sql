-- Assign 'supervisor' role to a specific auth user across all outlets
-- Params: hard-coded per your request
-- uuid: 3c45d34b-b7bf-417f-a216-367f32197f73
-- email: supervisor@gmail.com

-- Ensure enum has 'supervisor' (should already exist)
-- alter type public.role_type add value if not exists 'supervisor'; -- postgres doesn't support IF NOT EXISTS for enums; skip if present

with me as (
  select cast('3c45d34b-b7bf-417f-a216-367f32197f73' as uuid) as uid
)
insert into public.user_roles (id, user_id, role, outlet_id, active)
select gen_random_uuid(), me.uid, 'supervisor'::public.role_type, o.id, true
from me, public.outlets o
where not exists (
  select 1 from public.user_roles ur
  where ur.user_id = me.uid and ur.role = 'supervisor'::public.role_type and ur.outlet_id = o.id
);

-- Alternatively, if you prefer a global supervisor (no outlet scope), use this instead:
-- insert into public.user_roles (id, user_id, role, outlet_id, active)
-- values ('00000000-0000-0000-0000-000000000000'::uuid, '3c45d34b-b7bf-417f-a216-367f32197f73'::uuid, 'supervisor'::public.role_type, null, true)
-- on conflict do nothing;