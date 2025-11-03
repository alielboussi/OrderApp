-- Harden functions: pin search_path to pg_temp for security and linter compliance
-- Run as a role with ALTER FUNCTION privileges in the public schema.
-- Idempotent: re-runnable; only sets function option.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_admin',
        'member_outlet_ids',
        'mark_order_modified',
        'tg_order_items_amount',
        'tg_order_items_supervisor_qty_only',
        'has_role',
        'reset_order_sequence',
        'trg_order_items_supervisor_guard',
        'current_user_email',
        'format_order_number',
        'format_order_number_for_outlet'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = pg_temp',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END
$$;