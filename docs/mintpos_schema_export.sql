-- SQL Server schema export (SSMS 22)
-- Returns a SINGLE JSON payload with all sections.

set nocount on;

declare @schema_export nvarchar(max);

select @schema_export = (
  select
    schemas = (
      select s.name as schema_name
      from sys.schemas s
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name
      for json path
    ),
    tables = (
      select
        s.name as table_schema,
        t.name as table_name
      from sys.tables t
      join sys.schemas s on s.schema_id = t.schema_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, t.name
      for json path
    ),
    columns = (
      select
        s.name as table_schema,
        t.name as table_name,
        c.column_id as ordinal_position,
        c.name as column_name,
        ty.name as data_type,
        c.max_length,
        c.precision,
        c.scale,
        c.is_nullable,
        c.is_identity,
        dc.definition as column_default
      from sys.columns c
      join sys.tables t on t.object_id = c.object_id
      join sys.schemas s on s.schema_id = t.schema_id
      join sys.types ty on ty.user_type_id = c.user_type_id
      left join sys.default_constraints dc on dc.parent_object_id = c.object_id and dc.parent_column_id = c.column_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, t.name, c.column_id
      for json path
    ),
    primary_keys = (
      select
        s.name as table_schema,
        t.name as table_name,
        kc.name as constraint_name,
        i.name as index_name,
        ic.key_ordinal,
        col.name as column_name
      from sys.key_constraints kc
      join sys.tables t on t.object_id = kc.parent_object_id
      join sys.schemas s on s.schema_id = t.schema_id
      join sys.indexes i on i.object_id = kc.parent_object_id and i.index_id = kc.unique_index_id
      join sys.index_columns ic on ic.object_id = i.object_id and ic.index_id = i.index_id
      join sys.columns col on col.object_id = ic.object_id and col.column_id = ic.column_id
      where kc.type = 'PK'
        and s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, t.name, kc.name, ic.key_ordinal
      for json path
    ),
    foreign_keys = (
      select
        s.name as table_schema,
        t.name as table_name,
        fk.name as constraint_name,
        s_ref.name as referenced_schema,
        t_ref.name as referenced_table,
        col.name as column_name,
        col_ref.name as referenced_column,
        fkc.constraint_column_id as ordinal_position,
        fk.delete_referential_action_desc as on_delete,
        fk.update_referential_action_desc as on_update
      from sys.foreign_keys fk
      join sys.tables t on t.object_id = fk.parent_object_id
      join sys.schemas s on s.schema_id = t.schema_id
      join sys.tables t_ref on t_ref.object_id = fk.referenced_object_id
      join sys.schemas s_ref on s_ref.schema_id = t_ref.schema_id
      join sys.foreign_key_columns fkc on fkc.constraint_object_id = fk.object_id
      join sys.columns col on col.object_id = fkc.parent_object_id and col.column_id = fkc.parent_column_id
      join sys.columns col_ref on col_ref.object_id = fkc.referenced_object_id and col_ref.column_id = fkc.referenced_column_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, t.name, fk.name, fkc.constraint_column_id
      for json path
    ),
    indexes = (
      select
        s.name as table_schema,
        t.name as table_name,
        i.name as index_name,
        i.type_desc as index_type,
        i.is_unique,
        i.is_primary_key,
        i.is_unique_constraint,
        ic.key_ordinal,
        ic.is_included_column,
        col.name as column_name
      from sys.indexes i
      join sys.tables t on t.object_id = i.object_id
      join sys.schemas s on s.schema_id = t.schema_id
      join sys.index_columns ic on ic.object_id = i.object_id and ic.index_id = i.index_id
      join sys.columns col on col.object_id = ic.object_id and col.column_id = ic.column_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
        and i.name is not null
      order by s.name, t.name, i.name, ic.key_ordinal
      for json path
    ),
    check_constraints = (
      select
        s.name as table_schema,
        t.name as table_name,
        cc.name as constraint_name,
        cc.definition
      from sys.check_constraints cc
      join sys.tables t on t.object_id = cc.parent_object_id
      join sys.schemas s on s.schema_id = t.schema_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, t.name, cc.name
      for json path
    ),
    default_constraints = (
      select
        s.name as table_schema,
        t.name as table_name,
        c.name as column_name,
        dc.name as constraint_name,
        dc.definition
      from sys.default_constraints dc
      join sys.tables t on t.object_id = dc.parent_object_id
      join sys.schemas s on s.schema_id = t.schema_id
      join sys.columns c on c.object_id = dc.parent_object_id and c.column_id = dc.parent_column_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, t.name, c.column_id
      for json path
    ),
    views = (
      select
        s.name as view_schema,
        v.name as view_name,
        m.definition
      from sys.views v
      join sys.schemas s on s.schema_id = v.schema_id
      join sys.sql_modules m on m.object_id = v.object_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, v.name
      for json path
    ),
    routines = (
      select
        s.name as routine_schema,
        o.name as routine_name,
        o.type_desc as routine_type,
        m.definition
      from sys.objects o
      join sys.schemas s on s.schema_id = o.schema_id
      join sys.sql_modules m on m.object_id = o.object_id
      where o.type in ('P','FN','IF','TF')
        and s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, o.name
      for json path
    ),
    triggers = (
      select
        s.name as table_schema,
        t.name as table_name,
        tr.name as trigger_name,
        m.definition
      from sys.triggers tr
      join sys.tables t on t.object_id = tr.parent_id
      join sys.schemas s on s.schema_id = t.schema_id
      join sys.sql_modules m on m.object_id = tr.object_id
      where s.name not in ('sys','INFORMATION_SCHEMA')
      order by s.name, t.name, tr.name
      for json path
    )
  for json path, without_array_wrapper
);

select @schema_export as schema_export;
