-- Order workflow status updates and numbering format

create or replace function public.approve_lock_and_allocate_order(p_order_id uuid, p_strict boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_needs_allocation boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  if not (
    public.is_admin(v_uid)
    or v_order.outlet_id = any(coalesce(public.member_outlet_ids(v_uid), array[]::uuid[]))
  ) then
    raise exception 'not authorized to allocate order %', p_order_id;
  end if;

  v_needs_allocation := not coalesce(v_order.locked, false);

  if v_needs_allocation then
    update public.orders
    set status = coalesce(nullif(v_order.status, ''), 'ordered'),
        locked = true,
        approved_at = coalesce(v_order.approved_at, now()),
        approved_by = coalesce(v_order.approved_by, v_uid),
        updated_at = now()
    where id = p_order_id;

    perform public.record_order_fulfillment(p_order_id);
  elsif not p_strict then
    perform public.record_order_fulfillment(p_order_id);
  end if;
end;
$function$;

create or replace function public.assert_order_item_editable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = coalesce(new.order_id, old.order_id);
  if not found then
    raise exception 'order not found for item';
  end if;

  if coalesce(v_order.locked, false)
     or lower(coalesce(v_order.status, '')) in ('ordered', 'loaded', 'offloaded', 'delivered') then
    raise exception 'order % is locked; items cannot be modified', v_order.id;
  end if;

  return new;
end;
$function$;

create or replace function public.ensure_order_locked_and_allocated()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status in ('ordered', 'loaded', 'offloaded', 'delivered') and not coalesce(new.locked, false) then
    perform public.record_order_fulfillment(new.id);
    update public.orders
    set locked = true,
        updated_at = now()
    where id = new.id and locked = false;
  end if;
  return new;
end;
$function$;

create or replace function public.mark_order_offloaded(p_order_id uuid, p_offloader_name text, p_signature_path text default null::text, p_pdf_path text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_was_locked boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  v_was_locked := coalesce(v_order.locked, false);

  if not (
    public.is_admin(v_uid)
    or v_order.outlet_id = any(coalesce(public.member_outlet_ids(v_uid), array[]::uuid[]))
  ) then
    raise exception 'not authorized to complete order %', p_order_id;
  end if;

  update public.orders
  set status = 'offloaded',
      locked = true,
      offloader_signed_name = coalesce(nullif(p_offloader_name, ''), offloader_signed_name),
      offloader_signature_path = coalesce(nullif(p_signature_path, ''), offloader_signature_path),
      offloader_signed_at = now(),
      offloaded_pdf_path = coalesce(nullif(p_pdf_path, ''), offloaded_pdf_path),
      pdf_path = coalesce(nullif(p_pdf_path, ''), pdf_path),
      updated_at = now()
  where id = p_order_id;

  -- If stock was not allocated earlier, do it once here
  if not v_was_locked then
    perform public.record_order_fulfillment(p_order_id);
  end if;
end;
$function$;

create or replace function public.next_order_number(p_outlet_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prefix text;
  v_next bigint;
  v_scope uuid := coalesce(p_outlet_id, '00000000-0000-0000-0000-000000000000');
begin
  if p_outlet_id is null then
    raise exception 'outlet id required for numbering';
  end if;

  insert into public.counter_values(counter_key, scope_id, last_value)
  values ('order_number', v_scope, 1)
  on conflict (counter_key, scope_id)
  do update set last_value = public.counter_values.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  select coalesce(nullif(o.code, ''), substr(o.id::text, 1, 4)) into v_prefix
  from public.outlets o
  where o.id = p_outlet_id;

  v_prefix := coalesce(v_prefix, 'OUT');
  v_prefix := upper(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'));
  return substr(v_prefix, 1, 1) || lpad(v_next::text, 11, '0');
end;
$function$;

-- Trigger to lock/allocate on ordered/loaded/offloaded/delivered
DROP TRIGGER IF EXISTS trg_orders_lock_allocate ON public.orders;
CREATE TRIGGER trg_orders_lock_allocate
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN ((new.status = ANY (ARRAY['ordered'::text, 'loaded'::text, 'offloaded'::text, 'delivered'::text])) AND NOT COALESCE(new.locked, false))
EXECUTE FUNCTION public.ensure_order_locked_and_allocated();
