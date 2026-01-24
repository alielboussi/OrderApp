-- Allow platform admins or backoffice role to see all outlets in whoami_roles
CREATE OR REPLACE FUNCTION public.whoami_roles()
 RETURNS TABLE(user_id uuid, email text, is_admin boolean, roles text[], outlets jsonb, role_catalog jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_is_admin boolean := false;
  v_is_backoffice boolean := false;
  v_roles text[] := ARRAY[]::text[];
  v_outlets jsonb := '[]'::jsonb;
  v_role_catalog jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Qualify column to avoid ambiguity with output parameter "email"
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;
  v_is_admin := EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = v_uid);
  v_is_backoffice := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'description' - 'active' - 'created_at'), '[]'::jsonb)
    INTO v_role_catalog
  FROM (
    SELECT id, slug, normalized_slug, display_name
    FROM public.roles
    WHERE active
    ORDER BY display_name
  ) r;

  SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])
    INTO v_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_uid AND ur.outlet_id IS NULL;

  IF v_is_admin THEN
    v_roles := array_append(v_roles, 'admin');
  END IF;

  IF v_is_admin OR v_is_backoffice THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'outlet_id', o.id,
          'outlet_name', o.name,
          'roles', (
            SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])
            FROM public.user_roles ur2
            JOIN public.roles r ON r.id = ur2.role_id
            WHERE ur2.user_id = v_uid AND ur2.outlet_id = o.id
          ) || CASE WHEN o.auth_user_id = v_uid THEN ARRAY['Outlet']::text[] ELSE ARRAY[]::text[] END
        )
      ),
      '[]'::jsonb
    ) INTO v_outlets
    FROM public.outlets o
    WHERE o.active;
  ELSE
    WITH raw_outlets AS (
      SELECT o.id,
             o.name,
             TRUE AS via_auth_mapping
      FROM public.outlets o
      WHERE o.active AND o.auth_user_id = v_uid

      UNION ALL

      SELECT o.id,
             o.name,
             FALSE AS via_auth_mapping
      FROM public.user_roles ur
      JOIN public.outlets o ON o.id = ur.outlet_id
      WHERE ur.user_id = v_uid AND o.active
    ),
    outlet_sources AS (
      SELECT id,
             name,
             bool_or(via_auth_mapping) AS via_auth_mapping
      FROM raw_outlets
      GROUP BY id, name
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'outlet_id', src.id,
          'outlet_name', src.name,
          'roles', (
            SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])
            FROM public.user_roles ur2
            JOIN public.roles r ON r.id = ur2.role_id
            WHERE ur2.user_id = v_uid AND ur2.outlet_id = src.id
          ) || CASE WHEN src.via_auth_mapping THEN ARRAY['Outlet']::text[] ELSE ARRAY[]::text[] END
        )
      ),
      '[]'::jsonb
    ) INTO v_outlets
    FROM outlet_sources src;
  END IF;

  RETURN QUERY SELECT v_uid, v_email, v_is_admin, v_roles, v_outlets, v_role_catalog;
END;
$function$;
