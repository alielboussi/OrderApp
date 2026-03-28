INSERT INTO "public"."recipes" (
  "id",
  "finished_item_id",
  "ingredient_item_id",
  "qty_per_unit",
  "qty_unit",
  "active",
  "created_at",
  "updated_at",
  "source_warehouse_id",
  "yield_qty_units",
  "finished_variant_key",
  "recipe_for_kind"
) VALUES
  (
    'a58e2db7-c865-4b9a-a5ec-6832b679a478',
    'ddd89b2a-d856-4961-8763-b6d788104d2a',
    '20de5f8f-cc97-4ae6-aa51-e158225f3703',
    '1',
    'each',
    true,
    '2026-03-27 08:09:03.050663+00',
    '2026-03-27 08:09:03.050663+00',
    null,
    '1',
    'base',
    'finished'
  ),
  (
    '6cabadec-e384-4a66-bc72-eb9c3e94dcc5',
    'ddd89b2a-d856-4961-8763-b6d788104d2a',
    'bcacc496-ffd7-430b-8c17-709d0497a1ff',
    '165',
    'g',
    true,
    '2026-03-27 08:09:03.050663+00',
    '2026-03-27 08:09:03.050663+00',
    null,
    '1',
    'base',
    'finished'
  );
