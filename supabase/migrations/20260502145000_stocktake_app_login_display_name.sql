create or replace function public.stocktake_app_login(p_email text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public, private'
set row_security to 'off'
as $function$
declare
  v_user public.stocktake_app_users%rowtype;
  v_now timestamptz := now();
  v_exp_seconds bigint;
  v_payload jsonb;
  v_token text;
  v_secret text;
begin
  if p_email is null or btrim(p_email) = '' or p_pin is null or btrim(p_pin) = '' then
    raise exception 'email and pin required';
  end if;

  select *
  into v_user
  from public.stocktake_app_users
  where lower(email) = lower(p_email)
    and active
  limit 1;

  if not found or (v_user.pin_hash <> p_pin and extensions.crypt(p_pin, v_user.pin_hash) <> v_user.pin_hash) then
    raise exception 'invalid credentials';
  end if;

  update public.stocktake_app_users
  set last_login_at = v_now
  where id = v_user.id;

  v_exp_seconds := extract(epoch from (v_now + interval '12 hours'))::bigint;
  v_payload := jsonb_build_object(
    'sub', v_user.id::text,
    'email', v_user.email,
    'role', 'authenticated',
    'iat', extract(epoch from v_now)::bigint,
    'exp', v_exp_seconds
  );

  select jwt_secret into v_secret from private.app_settings where id = true;
  if v_secret is null or v_secret = '' then
    raise exception 'jwt secret not configured';
  end if;

  v_token := extensions.sign(v_payload::json, v_secret);

  return jsonb_build_object(
    'token', v_token,
    'refresh_token', '',
    'expires_at', (v_exp_seconds * 1000),
    'outlet_id', '',
    'outlet_name', '',
    'user_id', v_user.id::text,
    'email', v_user.email,
    'display_name', v_user.display_name,
    'roles', jsonb_build_array(jsonb_build_object(
      'id', '95b6a75d-bd46-4764-b5ea-981b1608f1ca',
      'slug', 'stock operator',
      'normalized_slug', 'stock operator',
      'display_name', 'Stock Operator'
    )),
    'is_admin', false,
    'can_transfer', false,
    'is_transfer_manager', false,
    'is_supervisor', false
  );
end;
$function$;
