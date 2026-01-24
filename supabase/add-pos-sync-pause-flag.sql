-- Add global POS sync pause flag and allow admin/backoffice access.

insert into public.counter_values (counter_key, scope_id, last_value)
values ('pos_sync_paused', '00000000-0000-0000-0000-000000000000', 0)
on conflict (counter_key, scope_id) do nothing;

create policy counter_values_pos_sync_pause_select
on public.counter_values
for select
to authenticated
using (
  counter_key = 'pos_sync_paused'
  and scope_id = '00000000-0000-0000-0000-000000000000'
  and (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
    )
  )
);

create policy counter_values_pos_sync_pause_update
on public.counter_values
for update
to authenticated
using (
  counter_key = 'pos_sync_paused'
  and scope_id = '00000000-0000-0000-0000-000000000000'
  and (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
    )
  )
)
with check (
  counter_key = 'pos_sync_paused'
  and scope_id = '00000000-0000-0000-0000-000000000000'
  and (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
    )
  )
);

create policy counter_values_pos_sync_pause_insert
on public.counter_values
for insert
to authenticated
with check (
  counter_key = 'pos_sync_paused'
  and scope_id = '00000000-0000-0000-0000-000000000000'
  and (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
    )
  )
);
