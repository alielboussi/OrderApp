const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'mintpos_catalog_groups.json');
const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const minified = JSON.stringify(rows);

const pgMigration = `-- Backfill catalog_menu_groups + catalog_items.menu_group_id from MintPOS mapping.
-- Only links finished catalog_items that exist in BOTH MintPOS and Supabase.
-- Source: supabase/scripts/mintpos_catalog_groups.json (${rows.length} rows)

create temp table mintpos_catalog_seed (
  item_sku text not null,
  variant_sku text,
  group_name text not null,
  pos_menu_group_id integer not null
) on commit drop;

insert into mintpos_catalog_seed (item_sku, variant_sku, group_name, pos_menu_group_id)
select distinct
  nullif(btrim(j ->> 'item_sku'), '') as item_sku,
  nullif(btrim(j ->> 'variant_sku'), '') as variant_sku,
  btrim(j ->> 'group_name') as group_name,
  (j ->> 'pos_menu_group_id')::integer as pos_menu_group_id
from jsonb_array_elements('${minified.replace(/'/g, "''")}'::jsonb) as j
where nullif(btrim(j ->> 'item_sku'), '') is not null
  and nullif(btrim(j ->> 'group_name'), '') is not null
  and nullif(btrim(j ->> 'pos_menu_group_id'), '') is not null;

-- Upsert menu groups from seed
with src as (
  select distinct group_name, pos_menu_group_id
  from mintpos_catalog_seed
),
updated as (
  update public.catalog_menu_groups g
  set
    pos_menu_group_id = src.pos_menu_group_id,
    active = true,
    updated_at = now()
  from src
  where lower(btrim(g.name)) = lower(btrim(src.group_name))
  returning g.id
)
insert into public.catalog_menu_groups (name, pos_menu_group_id, active, sort_order, updated_at)
select src.group_name, src.pos_menu_group_id, true, src.pos_menu_group_id, now()
from src
where not exists (
  select 1
  from public.catalog_menu_groups g
  where lower(btrim(g.name)) = lower(btrim(src.group_name))
);

-- Direct SKU match (finished items only)
with direct_match as (
  select distinct
    ci.id as item_id,
    g.id as menu_group_id
  from public.catalog_items ci
  inner join mintpos_catalog_seed s
    on lower(btrim(ci.sku)) = lower(btrim(s.item_sku))
  inner join public.catalog_menu_groups g
    on g.pos_menu_group_id = s.pos_menu_group_id
  where ci.item_kind = 'finished'
    and ci.active = true
)
update public.catalog_items ci
set
  menu_group_id = dm.menu_group_id,
  updated_at = now()
from direct_match dm
where ci.id = dm.item_id;

-- Parent match via shared variant SKU (when parent item sku differs from MintPOS item sku)
with variant_match as (
  select distinct
    ci.id as item_id,
    g.id as menu_group_id
  from public.catalog_items ci
  inner join public.catalog_variants cv
    on cv.item_id = ci.id
    and cv.active = true
  inner join mintpos_catalog_seed s
    on s.variant_sku is not null
    and lower(btrim(cv.sku)) = lower(btrim(s.variant_sku))
  inner join public.catalog_menu_groups g
    on g.pos_menu_group_id = s.pos_menu_group_id
  where ci.item_kind = 'finished'
    and ci.active = true
    and (ci.menu_group_id is null or ci.menu_group_id <> g.id)
)
update public.catalog_items ci
set
  menu_group_id = vm.menu_group_id,
  updated_at = now()
from variant_match vm
where ci.id = vm.item_id
  and ci.menu_group_id is distinct from vm.menu_group_id;

-- Report: matched finished products now linked to a menu group
select
  g.name as group_name,
  g.pos_menu_group_id,
  ci.sku as item_sku,
  ci.name as item_name,
  ci.id as item_id,
  count(cv.id) as variant_count
from public.catalog_items ci
inner join public.catalog_menu_groups g on g.id = ci.menu_group_id
left join public.catalog_variants cv on cv.item_id = ci.id and cv.active = true
where ci.item_kind = 'finished'
group by g.name, g.pos_menu_group_id, ci.sku, ci.name, ci.id
order by g.name, ci.name;

-- Report: finished POS SKUs in seed that did NOT match any catalog item
select distinct
  s.item_sku,
  s.group_name,
  s.pos_menu_group_id
from mintpos_catalog_seed s
where s.variant_sku is null
  and not exists (
    select 1
    from public.catalog_items ci
    where ci.item_kind = 'finished'
      and lower(btrim(ci.sku)) = lower(btrim(s.item_sku))
  )
  and not exists (
    select 1
    from public.catalog_items ci
    inner join public.catalog_variants cv on cv.item_id = ci.id
    inner join mintpos_catalog_seed sv
      on sv.item_sku = s.item_sku
      and sv.variant_sku is not null
      and lower(btrim(cv.sku)) = lower(btrim(sv.variant_sku))
    where ci.item_kind = 'finished'
  )
order by s.group_name, s.item_sku;
`;

const pgScript = `-- Run AFTER migrations/20260622180000_catalog_menu_groups.sql
-- Uses sync_pos_menu_groups_from_middleware (direct item_sku match only).

do $apply$
declare
  mintpos_json jsonb := '${minified.replace(/'/g, "''")}'::jsonb;
  result jsonb;
begin
  select public.sync_pos_menu_groups_from_middleware(mintpos_json) into result;
  raise notice 'sync_pos_menu_groups_from_middleware result: %', result;
end
$apply$;

select
  g.name as group_name,
  g.pos_menu_group_id,
  ci.sku,
  ci.name,
  count(cv.id) as variants
from public.catalog_items ci
left join public.catalog_menu_groups g on g.id = ci.menu_group_id
left join public.catalog_variants cv on cv.item_id = ci.id and cv.active = true
where ci.item_kind = 'finished'
  and ci.menu_group_id is not null
group by g.name, g.pos_menu_group_id, ci.sku, ci.name
order by g.name, ci.name;
`;

const mssqlJson = minified.replace(/'/g, "''");

const mssqlScript = `-- MintPOS: apply MenuGroupId for products in the MintPOS export.
-- Source: supabase/scripts/mintpos_catalog_groups.json (${rows.length} rows)
-- Run after unified.sql

USE [MINTPOS];
GO

DECLARE @json nvarchar(max) = N'${mssqlJson}';

DECLARE @seed TABLE (
  item_sku varchar(50) not null,
  variant_sku varchar(50) null,
  group_id int not null,
  group_name nvarchar(100) not null
);

INSERT INTO @seed (item_sku, variant_sku, group_id, group_name)
SELECT DISTINCT
  LTRIM(RTRIM(JSON_VALUE(value, '$.item_sku'))),
  NULLIF(LTRIM(RTRIM(JSON_VALUE(value, '$.variant_sku'))), ''),
  CAST(JSON_VALUE(value, '$.pos_menu_group_id') AS int),
  LTRIM(RTRIM(JSON_VALUE(value, '$.group_name')))
FROM OPENJSON(@json)
WHERE JSON_VALUE(value, '$.item_sku') IS NOT NULL
  AND JSON_VALUE(value, '$.group_name') IS NOT NULL
  AND JSON_VALUE(value, '$.pos_menu_group_id') IS NOT NULL;

INSERT INTO dbo.MenuGroup (Name, Status, uploadstatus)
SELECT DISTINCT s.group_name, 'Active', 'Pending'
FROM @seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.MenuGroup mg
  WHERE LTRIM(RTRIM(mg.Name)) = LTRIM(RTRIM(s.group_name))
);

UPDATE mi
SET
  MenuGroupId = s.group_id,
  uploadstatus = 'Pending'
FROM dbo.MenuItem mi
INNER JOIN (
  SELECT DISTINCT item_sku, group_id
  FROM @seed
  WHERE variant_sku IS NULL
) s ON LTRIM(RTRIM(mi.Code)) = LTRIM(RTRIM(s.item_sku));

UPDATE mf
SET
  MenuGroupId = s.group_id,
  UploadStatus = 'Pending'
FROM dbo.ModifierFlavour mf
INNER JOIN @seed s
  ON s.variant_sku IS NOT NULL
 AND LTRIM(RTRIM(mf.Name2)) = LTRIM(RTRIM(s.variant_sku));

UPDATE mf
SET
  MenuGroupId = mi.MenuGroupId,
  UploadStatus = 'Pending'
FROM dbo.ModifierFlavour mf
INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
WHERE mi.MenuGroupId IS NOT NULL
  AND (mf.MenuGroupId IS NULL OR mf.MenuGroupId <> mi.MenuGroupId);

SELECT
  mg.Name AS group_name,
  mg.Id AS pos_menu_group_id,
  mi.Code AS item_sku,
  mi.Name AS item_name,
  mf.Name AS variant_name,
  mf.Name2 AS variant_sku
FROM dbo.MenuItem mi
LEFT JOIN dbo.MenuGroup mg ON mg.Id = mi.MenuGroupId
LEFT JOIN dbo.ModifierFlavour mf ON mf.MenuItemId = mi.Id
WHERE mi.MenuGroupId IS NOT NULL
ORDER BY mg.Name, mi.Name, mf.Name;
GO
`;

fs.writeFileSync(
  path.join(__dirname, '..', 'migrations', '20260622190000_backfill_catalog_menu_groups_mintpos.sql'),
  pgMigration
);
fs.writeFileSync(path.join(__dirname, 'backfill_menu_groups_from_mintpos_json.sql'), pgScript);
fs.writeFileSync(
  path.join(__dirname, '..', '..', 'pos-sync-service', 'scripts', 'backfill_mintpos_menu_groups.sql'),
  mssqlScript
);

console.log('Generated SQL from', rows.length, 'MintPOS rows');
