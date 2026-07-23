-- Merge duplicate catalog_menu_groups that share the same MintPOS ID, then enforce uniqueness.

WITH ranked AS (
  SELECT
    g.id,
    g.name,
    g.pos_menu_group_id,
    g.created_at,
    COUNT(ci.id) AS item_count,
    ROW_NUMBER() OVER (
      PARTITION BY g.pos_menu_group_id
      ORDER BY
        COUNT(ci.id) DESC,
        length(btrim(g.name)) ASC,
        g.created_at ASC NULLS LAST,
        g.id ASC
    ) AS rn
  FROM public.catalog_menu_groups g
  LEFT JOIN public.catalog_items ci ON ci.menu_group_id = g.id
  WHERE g.pos_menu_group_id IS NOT NULL
  GROUP BY g.id, g.name, g.pos_menu_group_id, g.created_at
),
keepers AS (
  SELECT id AS keeper_id, pos_menu_group_id
  FROM ranked
  WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON k.pos_menu_group_id = r.pos_menu_group_id
  WHERE r.rn > 1
)
UPDATE public.catalog_items ci
SET menu_group_id = l.keeper_id
FROM losers l
WHERE ci.menu_group_id = l.loser_id;

WITH ranked AS (
  SELECT
    g.id,
    g.name,
    g.pos_menu_group_id,
    g.created_at,
    COUNT(ci.id) AS item_count,
    ROW_NUMBER() OVER (
      PARTITION BY g.pos_menu_group_id
      ORDER BY
        COUNT(ci.id) DESC,
        length(btrim(g.name)) ASC,
        g.created_at ASC NULLS LAST,
        g.id ASC
    ) AS rn
  FROM public.catalog_menu_groups g
  LEFT JOIN public.catalog_items ci ON ci.menu_group_id = g.id
  WHERE g.pos_menu_group_id IS NOT NULL
  GROUP BY g.id, g.name, g.pos_menu_group_id, g.created_at
),
keepers AS (
  SELECT id AS keeper_id, pos_menu_group_id
  FROM ranked
  WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON k.pos_menu_group_id = r.pos_menu_group_id
  WHERE r.rn > 1
)
DELETE FROM public.catalog_menu_groups g
USING losers l
WHERE g.id = l.loser_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_menu_groups_pos_menu_group_id
  ON public.catalog_menu_groups (pos_menu_group_id)
  WHERE pos_menu_group_id IS NOT NULL;
