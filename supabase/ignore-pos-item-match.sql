CREATE OR REPLACE FUNCTION public.log_pos_sync_failure(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if coalesce(payload->>'stage','') ilike '%pos_item_match%'
     or coalesce(payload->>'error_message','') ilike '%pos_item_match%'
     or coalesce(payload->>'stage','') = 'missing_mapping'
     or coalesce(payload->>'error_message','') ilike '%missing_mapping%'
     or coalesce(payload->>'error_message','') ilike '%pos_item_map missing%' then
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
$function$;
