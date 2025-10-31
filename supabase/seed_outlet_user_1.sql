-- Map first Auth user to the 'First Class' outlet
-- User UUID: e8382212-4055-454a-93e4-d8abcf279e9b
-- Outlet UUID: 70a61e94-50a2-4c78-a554-d60fcfabc133

insert into public.outlet_users (user_id, outlet_id)
values (
  'e8382212-4055-454a-93e4-d8abcf279e9b',
  '70a61e94-50a2-4c78-a554-d60fcfabc133'
)
on conflict (user_id) do update
set outlet_id = excluded.outlet_id;
