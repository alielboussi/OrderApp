-- Enforce open stock period on source warehouse (not destination) for transfers.
create or replace function public.transfer_units_between_warehouses(
  p_source uuid,
  p_destination uuid,
  p_items jsonb,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec record;
  v_reference text;
  v_transfer_id uuid;
  v_variant_key text;
  v_occurred_at timestamptz;
begin
  if p_source is null or p_destination is null then
    raise exception 'source and destination required';
  end if;

  -- Require an open stock period on the source warehouse only.
  perform public.require_open_stock_period_for_outlet_warehouse(p_source);

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one transfer line is required';
  end if;

  v_reference := public.next_transfer_reference();

  insert into public.warehouse_transfers(
    reference_code,
    source_warehouse_id,
    destination_warehouse_id,
    note,
    context,
    created_by
  ) values (
    v_reference,
    p_source,
    p_destination,
    p_note,
    coalesce(p_items, '[]'::jsonb),
    auth.uid()
  ) returning id, created_at into v_transfer_id, v_occurred_at;

  v_occurred_at := coalesce(v_occurred_at, now());

  for rec in
    select
      (elem->>'product_id')::uuid as item_id,
      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,
      (elem->>'qty')::numeric as qty_units
    from jsonb_array_elements(p_items) elem
  loop
    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then
      raise exception 'each line needs product_id and qty > 0';
    end if;

    v_variant_key := public.normalize_variant_key(rec.variant_key);

    insert into public.warehouse_transfer_items(transfer_id, item_id, variant_key, qty_units)
    values (v_transfer_id, rec.item_id, v_variant_key, rec.qty_units);

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
    values (
      'warehouse',
      p_source,
      rec.item_id,
      v_variant_key,
      -1 * rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'out', 'transfer_created_at', v_occurred_at),
      v_occurred_at
    );

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
    values (
      'warehouse',
      p_destination,
      rec.item_id,
      v_variant_key,
      rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'in', 'transfer_created_at', v_occurred_at),
      v_occurred_at
    );
  end loop;

  return v_reference;
end;
$function$;
