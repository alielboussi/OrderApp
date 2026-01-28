create or replace function public.log_pos_sync_failure(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(payload->>'stage','') ilike '%pos_item_match%'
     or coalesce(payload->>'error_message','') ilike '%pos_item_match%'
     or coalesce(payload->>'stage','') = 'missing_mapping'
     or coalesce(payload->>'error_message','') ilike '%missing_mapping%'
     or coalesce(payload->>'error_message','') ilike '%pos_item_map missing%'
     or coalesce(payload->>'error_message','') ilike '%no_mappable_items%'
     or coalesce(payload->>'error_message','') ilike '%no items had a valid pos_item_map%'
     or payload->'error_message' @> '[{"code":"no_mappable_items"}]'::jsonb
  then
    return;
  end if;

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
$$;
