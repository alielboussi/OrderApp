-- POS sync failure logging

create table if not exists public.pos_sync_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  outlet_id uuid null,
  source_event_id text null,
  pos_order_id text null,
  sale_id text null,
  stage text not null,
  error_message text not null,
  details jsonb null
);

create index if not exists idx_pos_sync_failures_created_at on public.pos_sync_failures(created_at desc);
create index if not exists idx_pos_sync_failures_source_event on public.pos_sync_failures(source_event_id);

alter table public.pos_sync_failures enable row level security;

-- Service role only (explicit)
create policy pos_sync_failures_service_only
on public.pos_sync_failures
for all
to service_role
using (true)
with check (true);

create or replace function public.log_pos_sync_failure(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.pos_sync_failures(
    outlet_id,
    source_event_id,
    pos_order_id,
    sale_id,
    stage,
    error_message,
    details
  ) values (
    nullif(payload->>'outlet_id','')::uuid,
    nullif(payload->>'source_event_id',''),
    nullif(payload->>'pos_order_id',''),
    nullif(payload->>'sale_id',''),
    coalesce(nullif(payload->>'stage',''),'unknown'),
    coalesce(nullif(payload->>'error_message',''), 'unknown error'),
    payload->'details'
  );
end;
$function$;
