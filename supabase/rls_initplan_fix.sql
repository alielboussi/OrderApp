-- RLS initplan performance fix: wrap auth.uid() calls in policies with (select auth.uid())
-- Run as a role with privileges to ALTER policies on the listed tables.
-- Safe and idempotent: re-generates USING / WITH CHECK with the same logic.

DO $$
DECLARE
  r record;
  new_using text;
  new_check text;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname,
           p.qual AS using_expr,
           p.with_check AS check_expr
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN (
        'orders','order_items','order_item_allocations','warehouses',
        'stock_movements','stock_movement_items','stock_ledger',
        'user_roles','outlets','products','product_variations','assets'
      )
  LOOP
    new_using := NULL;
    new_check := NULL;

    IF r.using_expr IS NOT NULL THEN
      new_using := replace(r.using_expr, 'auth.uid()', '(select auth.uid())');
      -- Disambiguate 2-arg has_role calls by routing to wrapper has_role_any_outlet(user, role)
      new_using := regexp_replace(new_using,
        '(^|[^A-Za-z0-9_])public\\.has_role\\s*\\(([^,]+),\\s*([^,\\)]+)\\)',
        '\\1public.has_role_any_outlet(\\2, \\3)', 'g');
      new_using := regexp_replace(new_using,
        '(^|[^A-Za-z0-9_])has_role\\s*\\(([^,]+),\\s*([^,\\)]+)\\)',
        '\\1public.has_role_any_outlet(\\2, \\3)', 'g');
      -- Fallback: handle the common pattern explicitly if regex didn't match
      new_using := replace(new_using,
        'public.has_role((select auth.uid()),',
        'public.has_role_any_outlet((select auth.uid()),');
      new_using := replace(new_using,
        'has_role((select auth.uid()),',
        'public.has_role_any_outlet((select auth.uid()),');
    END IF;

    IF r.check_expr IS NOT NULL THEN
      new_check := replace(r.check_expr, 'auth.uid()', '(select auth.uid())');
      new_check := regexp_replace(new_check,
        '(^|[^A-Za-z0-9_])public\\.has_role\\s*\\(([^,]+),\\s*([^,\\)]+)\\)',
        '\\1public.has_role_any_outlet(\\2, \\3)', 'g');
      new_check := regexp_replace(new_check,
        '(^|[^A-Za-z0-9_])has_role\\s*\\(([^,]+),\\s*([^,\\)]+)\\)',
        '\\1public.has_role_any_outlet(\\2, \\3)', 'g');
      new_check := replace(new_check,
        'public.has_role((select auth.uid()),',
        'public.has_role_any_outlet((select auth.uid()),');
      new_check := replace(new_check,
        'has_role((select auth.uid()),',
        'public.has_role_any_outlet((select auth.uid()),');
    END IF;

    IF new_using IS DISTINCT FROM r.using_expr OR new_check IS DISTINCT FROM r.check_expr THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I %s %s',
        r.policyname, r.schemaname, r.tablename,
        CASE WHEN new_using IS NOT NULL THEN 'USING (' || new_using || ')' ELSE '' END,
        CASE WHEN new_check IS NOT NULL THEN ' WITH CHECK (' || new_check || ')' ELSE '' END
      );
    END IF;
  END LOOP;
END
$$;