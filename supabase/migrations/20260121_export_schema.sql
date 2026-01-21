-- Export Supabase schema details (tables, columns, constraints, relationships, policies, views, functions)
-- Run this in Supabase SQL editor; it returns a SINGLE JSON payload with all sections.

select jsonb_build_object(
  'schemas', (
    select jsonb_agg(row_to_json(s))
    from (
      select n.nspname as schema_name
      from pg_namespace n
      where n.nspname = 'public'
      order by n.nspname
    ) s
  ),
  'tables', (
    select jsonb_agg(row_to_json(t))
    from (
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema = 'public'
      order by table_schema, table_name
    ) t
  ),
  'columns', (
    select jsonb_agg(row_to_json(c))
    from (
      select
        table_schema,
        table_name,
        ordinal_position,
        column_name,
        data_type,
        is_nullable,
        column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_schema, table_name, ordinal_position
    ) c
  ),
  'constraints', (
    select jsonb_agg(row_to_json(cs))
    from (
      select
        tc.table_schema,
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_schema as foreign_table_schema,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name
      from information_schema.table_constraints tc
      left join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      left join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name
        and tc.table_schema = ccu.table_schema
      where tc.table_schema = 'public'
      order by tc.table_schema, tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position
    ) cs
  ),
  'indexes', (
    select jsonb_agg(row_to_json(i))
    from (
      select
        schemaname as table_schema,
        tablename as table_name,
        indexname,
        indexdef
      from pg_indexes
      where schemaname = 'public'
      order by schemaname, tablename, indexname
    ) i
  ),
  'foreign_keys', (
    select jsonb_agg(row_to_json(fk))
    from (
      select
        nsp.nspname as table_schema,
        cls.relname as table_name,
        con.conname as constraint_name,
        pg_get_constraintdef(con.oid, true) as constraint_def
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
      where con.contype = 'f'
        and nsp.nspname = 'public'
      order by nsp.nspname, cls.relname, con.conname
    ) fk
  ),
  'views', (
    select jsonb_agg(row_to_json(v))
    from (
      select
        schemaname as view_schema,
        viewname as view_name,
        definition
      from pg_views
      where schemaname = 'public'
      order by schemaname, viewname
    ) v
  ),
  'functions', (
    select jsonb_agg(row_to_json(fn))
    from (
      select
        n.nspname as function_schema,
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by n.nspname, p.proname
    ) fn
  ),
  'policies', (
    select jsonb_agg(row_to_json(pl))
    from (
      select
        schemaname as table_schema,
        tablename as table_name,
        policyname as policy_name,
        permissive,
        roles,
        cmd as command,
        qual as using_expression,
        with_check as with_check_expression
      from pg_policies
      where schemaname = 'public'
      order by schemaname, tablename, policyname
    ) pl
  ),
  'triggers', (
    select jsonb_agg(row_to_json(tr))
    from (
      select
        n.nspname as table_schema,
        c.relname as table_name,
        t.tgname as trigger_name,
        pg_get_triggerdef(t.oid, true) as trigger_def
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal
        and n.nspname = 'public'
      order by n.nspname, c.relname, t.tgname
    ) tr
  )
) as schema_export;
