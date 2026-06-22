-- Remove pending catalog sync queue rows for outlets that are currently offline.
-- Offline = no heartbeat OR last_seen_at older than 10 minutes (matches dashboard).

-- 1) Review what will be removed
select
  o.name as outlet_name,
  e.outlet_id,
  count(*) as pending_events,
  max(e.created_at) as newest_pending,
  hb.last_seen_at
from public.outlet_catalog_sync_events e
join public.outlets o on o.id = e.outlet_id
left join public.outlet_pos_heartbeats hb on hb.outlet_id = e.outlet_id
where e.status = 'pending'
  and (
    hb.last_seen_at is null
    or hb.last_seen_at < now() - interval '10 minutes'
  )
group by o.name, e.outlet_id, hb.last_seen_at
order by o.name;

-- 2) Delete pending events for offline outlets
delete from public.outlet_catalog_sync_events e
where e.status = 'pending'
  and e.outlet_id in (
    select distinct p.outlet_id
    from public.outlet_catalog_sync_events p
    left join public.outlet_pos_heartbeats hb on hb.outlet_id = p.outlet_id
    where p.status = 'pending'
      and (
        hb.last_seen_at is null
        or hb.last_seen_at < now() - interval '10 minutes'
      )
  );

-- 3) Confirm nothing left for offline outlets
select count(*) as remaining_offline_pending
from public.outlet_catalog_sync_events e
left join public.outlet_pos_heartbeats hb on hb.outlet_id = e.outlet_id
where e.status = 'pending'
  and (
    hb.last_seen_at is null
    or hb.last_seen_at < now() - interval '10 minutes'
  );
