#!/usr/bin/env python3
"""Generate Supabase catalog alignment SQL from canonical MintPOS export rows."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TSV_PATH = ROOT / "canonical_catalog_rows.tsv"
META_PATH = ROOT / "canonical_catalog.json"
OUT_SQL = ROOT / "11_align_supabase_canonical_catalog.sql"
OUT_VERIFY = ROOT / "12_verify_catalog_alignment.sql"

RAW_GROUPS = {9, 30, 31}
INGREDIENT_GROUPS = {10, 28, 29}
FINISHED_GROUPS = None  # everything else defaults to finished
QC_ONLY_FINISHED_SKUS = (
    "360", "362", "363", "366", "367", "67",
    "111", "112", "117", "351", "356", "358", "361", "365",
)


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def item_kind_for_group(group_id: int) -> str:
    if group_id in RAW_GROUPS:
        return "raw"
    if group_id in INGREDIENT_GROUPS:
        return "ingredient"
    return "finished"


def load_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with TSV_PATH.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        for row in reader:
            rows.append({k: (v or "").strip() for k, v in row.items()})
    return rows


def build_model(rows: list[dict[str, str]]):
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    groups = {int(g["pos_menu_group_id"]): g["name"] for g in meta["menu_groups"]}

    products: dict[str, dict] = {}
    variants: list[dict] = []
    parents_with_variants: set[str] = set()

    for row in rows:
        sku = row["mintpos_sku"]
        group_id = int(row["mintpos_group_id"])
        if row["row_type"] == "product":
            products[sku] = {
                "sku": sku,
                "name": row["product_name"],
                "group_id": group_id,
                "group_name": groups.get(group_id, row["menu_group_name"]),
                "item_kind": item_kind_for_group(group_id),
            }
        elif row["row_type"] == "variant":
            parent = row["parent_item_sku"]
            parents_with_variants.add(parent)
            variants.append(
                {
                    "sku": sku,
                    "parent_sku": parent,
                    "name": row["variant_name"] or row["product_name"],
                    "group_id": group_id,
                    "item_kind": item_kind_for_group(group_id),
                }
            )

    for sku in parents_with_variants:
        if sku in products:
            products[sku]["has_variations"] = True

    for product in products.values():
        product.setdefault("has_variations", False)

    return groups, products, variants


def render_sql(groups: dict[int, str], products: dict[str, dict], variants: list[dict]) -> str:
    lines: list[str] = [
        "-- =============================================================================",
        "-- 11 — Align Supabase catalog to Till 1 (reference till)",
        "-- =============================================================================",
        "-- WHERE: Supabase SQL Editor",
        "-- SOURCE: canonical_catalog_rows.tsv (Till 1 MintPOS export)",
        "--",
        "-- WORKFLOW:",
        "--   1. Run this script (Supabase = Till 1)",
        "--   2. Run 14 on Till 2 PC, 15 on Quick Corner PC (MintPOS group remap)",
        "--   3. Push catalog from portal → each till",
        "--",
        "-- NOTES:",
        "--   • Packaging uses group 36 on Till 1",
        "--   • Till 2 / QC MintPOS must be remapped before push",
        "-- =============================================================================",
        "",
        "BEGIN;",
        "",
        "CREATE TEMP TABLE stg_canonical_catalog (",
        "  mintpos_group_id integer NOT NULL,",
        "  menu_group_name text NOT NULL,",
        "  row_type text NOT NULL CHECK (row_type IN ('product', 'variant')),",
        "  mintpos_sku text NOT NULL,",
        "  parent_item_sku text NULL,",
        "  product_name text NOT NULL,",
        "  variant_name text NULL,",
        "  item_kind text NOT NULL,",
        "  has_variations boolean NOT NULL DEFAULT false",
        ") ON COMMIT DROP;",
        "",
        "INSERT INTO stg_canonical_catalog (",
        "  mintpos_group_id, menu_group_name, row_type, mintpos_sku, parent_item_sku,",
        "  product_name, variant_name, item_kind, has_variations",
        ") VALUES",
    ]

    value_rows: list[str] = []
    for product in sorted(products.values(), key=lambda p: (p["group_id"], int(p["sku"]) if p["sku"].isdigit() else p["sku"])):
        value_rows.append(
            "  ({gid}, {gname}, 'product', {sku}, NULL, {pname}, NULL, {kind}, {hv})".format(
                gid=product["group_id"],
                gname=sql_str(product["group_name"]),
                sku=sql_str(product["sku"]),
                pname=sql_str(product["name"]),
                kind=sql_str(product["item_kind"]),
                hv="true" if product["has_variations"] else "false",
            )
        )

    for variant in sorted(variants, key=lambda v: (v["group_id"], int(v["sku"]) if v["sku"].isdigit() else v["sku"])):
        parent = products.get(variant["parent_sku"])
        group_name = parent["group_name"] if parent else groups.get(variant["group_id"], "")
        value_rows.append(
            "  ({gid}, {gname}, 'variant', {sku}, {parent}, {pname}, {vname}, {kind}, false)".format(
                gid=variant["group_id"],
                gname=sql_str(group_name),
                sku=sql_str(variant["sku"]),
                parent=sql_str(variant["parent_sku"]),
                pname=sql_str(parent["name"] if parent else variant["name"]),
                vname=sql_str(variant["name"]),
                kind=sql_str(variant["item_kind"]),
            )
        )

    lines.append(",\n".join(value_rows) + ";")
    lines.extend(
        [
            "",
            "-- -----------------------------------------------------------------------------",
            "-- Menu groups",
            "-- -----------------------------------------------------------------------------",
            "WITH src AS (",
            "  SELECT DISTINCT mintpos_group_id, menu_group_name",
            "  FROM stg_canonical_catalog",
            ")",
            "INSERT INTO public.catalog_menu_groups (name, pos_menu_group_id, active, sort_order)",
            "SELECT s.menu_group_name, s.mintpos_group_id, true, s.mintpos_group_id",
            "FROM src s",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM public.catalog_menu_groups g",
            "  WHERE g.pos_menu_group_id = s.mintpos_group_id",
            ");",
            "",
            "UPDATE public.catalog_menu_groups g",
            "SET",
            "  name = s.menu_group_name,",
            "  active = true,",
            "  sort_order = s.mintpos_group_id,",
            "  updated_at = now()",
            "FROM (",
            "  SELECT DISTINCT mintpos_group_id, menu_group_name FROM stg_canonical_catalog",
            ") s",
            "WHERE g.pos_menu_group_id = s.mintpos_group_id;",
            "",
            "UPDATE public.catalog_menu_groups g",
            "SET active = false, updated_at = now()",
            "WHERE g.pos_menu_group_id IS NOT NULL",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM (",
            "      SELECT DISTINCT mintpos_group_id FROM stg_canonical_catalog",
            "    ) s WHERE s.mintpos_group_id = g.pos_menu_group_id",
            "  );",
            "",
            "-- -----------------------------------------------------------------------------",
            "-- Products (match by SKU, then by name+item_kind for legacy rows)",
            "-- -----------------------------------------------------------------------------",
            "WITH src AS (",
            "  SELECT DISTINCT ON (mintpos_sku)",
            "    mintpos_sku, product_name, mintpos_group_id, item_kind, has_variations",
            "  FROM stg_canonical_catalog",
            "  WHERE row_type = 'product'",
            "  ORDER BY mintpos_sku, mintpos_group_id",
            ")",
            "UPDATE public.catalog_items ci",
            "SET",
            "  name = s.product_name,",
            "  item_kind = s.item_kind::public.item_kind,",
            "  has_variations = s.has_variations,",
            "  active = true,",
            "  menu_group_id = g.id,",
            "  updated_at = now()",
            "FROM src s",
            "JOIN public.catalog_menu_groups g ON g.pos_menu_group_id = s.mintpos_group_id",
            "WHERE lower(btrim(ci.sku)) = lower(btrim(s.mintpos_sku));",
            "",
            "WITH src AS (",
            "  SELECT DISTINCT ON (mintpos_sku)",
            "    mintpos_sku, product_name, mintpos_group_id, item_kind, has_variations",
            "  FROM stg_canonical_catalog",
            "  WHERE row_type = 'product'",
            "  ORDER BY mintpos_sku, mintpos_group_id",
            ")",
            "UPDATE public.catalog_items ci",
            "SET",
            "  sku = s.mintpos_sku,",
            "  name = s.product_name,",
            "  item_kind = s.item_kind::public.item_kind,",
            "  has_variations = s.has_variations,",
            "  active = true,",
            "  menu_group_id = g.id,",
            "  updated_at = now()",
            "FROM src s",
            "JOIN public.catalog_menu_groups g ON g.pos_menu_group_id = s.mintpos_group_id",
            "WHERE lower(btrim(ci.name)) = lower(btrim(s.product_name))",
            "  AND ci.item_kind = s.item_kind::public.item_kind",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM public.catalog_items other",
            "    WHERE lower(btrim(other.sku)) = lower(btrim(s.mintpos_sku))",
            "      AND other.id <> ci.id",
            "  );",
            "",
            "WITH src AS (",
            "  SELECT DISTINCT ON (mintpos_sku)",
            "    mintpos_sku, product_name, mintpos_group_id, item_kind, has_variations",
            "  FROM stg_canonical_catalog",
            "  WHERE row_type = 'product'",
            "  ORDER BY mintpos_sku, mintpos_group_id",
            ")",
            "INSERT INTO public.catalog_items (",
            "  name, sku, item_kind, consumption_uom, purchase_pack_unit, units_per_purchase_pack,",
            "  cost, has_variations, outlet_order_visible, active, menu_group_id",
            ")",
            "SELECT",
            "  s.product_name,",
            "  s.mintpos_sku,",
            "  s.item_kind::public.item_kind,",
            "  'each',",
            "  'each',",
            "  1,",
            "  0,",
            "  s.has_variations,",
            "  false,",
            "  true,",
            "  g.id",
            "FROM src s",
            "JOIN public.catalog_menu_groups g ON g.pos_menu_group_id = s.mintpos_group_id",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM public.catalog_items ci",
            "  WHERE lower(btrim(ci.sku)) = lower(btrim(s.mintpos_sku))",
            ")",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM public.catalog_items ci",
            "    WHERE lower(btrim(ci.name)) = lower(btrim(s.product_name))",
            "      AND ci.item_kind = s.item_kind::public.item_kind",
            "  );",
            "",
            "-- -----------------------------------------------------------------------------",
            "-- Variants (scoped by parent product SKU + variant SKU, like MintPOS)",
            "-- -----------------------------------------------------------------------------",
            "WITH src AS (",
            "  SELECT",
            "    v.mintpos_sku,",
            "    v.parent_item_sku,",
            "    v.variant_name,",
            "    v.item_kind",
            "  FROM stg_canonical_catalog v",
            "  WHERE v.row_type = 'variant'",
            ")",
            "UPDATE public.catalog_variants cv",
            "SET",
            "  name = s.variant_name,",
            "  item_id = ci.id,",
            "  item_kind = s.item_kind::public.item_kind,",
            "  active = true,",
            "  updated_at = now()",
            "FROM src s",
            "JOIN public.catalog_items ci ON lower(btrim(ci.sku)) = lower(btrim(s.parent_item_sku))",
            "WHERE cv.item_id = ci.id",
            "  AND lower(btrim(cv.sku)) = lower(btrim(s.mintpos_sku));",
            "",
            "WITH src AS (",
            "  SELECT",
            "    v.mintpos_sku,",
            "    v.parent_item_sku,",
            "    v.variant_name,",
            "    v.item_kind",
            "  FROM stg_canonical_catalog v",
            "  WHERE v.row_type = 'variant'",
            ")",
            "UPDATE public.catalog_variants cv",
            "SET",
            "  sku = s.mintpos_sku,",
            "  name = s.variant_name,",
            "  item_id = ci.id,",
            "  item_kind = s.item_kind::public.item_kind,",
            "  active = true,",
            "  updated_at = now()",
            "FROM src s",
            "JOIN public.catalog_items ci ON lower(btrim(ci.sku)) = lower(btrim(s.parent_item_sku))",
            "WHERE lower(btrim(cv.name)) = lower(btrim(s.variant_name))",
            "  AND cv.item_id = ci.id",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM public.catalog_variants other",
            "    WHERE other.item_id = ci.id",
            "      AND lower(btrim(other.sku)) = lower(btrim(s.mintpos_sku))",
            "      AND other.id <> cv.id",
            "  );",
            "",
            "WITH src AS (",
            "  SELECT",
            "    v.mintpos_sku,",
            "    v.parent_item_sku,",
            "    v.variant_name,",
            "    v.item_kind",
            "  FROM stg_canonical_catalog v",
            "  WHERE v.row_type = 'variant'",
            ")",
            "INSERT INTO public.catalog_variants (",
            "  id, item_id, name, sku, item_kind, consumption_uom, purchase_pack_unit,",
            "  units_per_purchase_pack, cost, active",
            ")",
            "SELECT",
            "  gen_random_uuid()::text,",
            "  ci.id,",
            "  s.variant_name,",
            "  s.mintpos_sku,",
            "  s.item_kind::public.item_kind,",
            "  'each',",
            "  'each',",
            "  1,",
            "  0,",
            "  true",
            "FROM src s",
            "JOIN public.catalog_items ci ON lower(btrim(ci.sku)) = lower(btrim(s.parent_item_sku))",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM public.catalog_variants cv",
            "  WHERE cv.item_id = ci.id",
            "    AND lower(btrim(cv.sku)) = lower(btrim(s.mintpos_sku))",
            ")",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM public.catalog_variants cv",
            "    WHERE cv.item_id = ci.id",
            "      AND lower(btrim(cv.name)) = lower(btrim(s.variant_name))",
            "  );",
            "",
            "-- Deactivate portal finished products not in canonical list (keep Quick Corner-only SKUs)",
            "UPDATE public.catalog_items ci",
            "SET active = false, updated_at = now()",
            "WHERE ci.item_kind = 'finished'",
            "  AND ci.sku IS NOT NULL",
            "  AND lower(btrim(ci.sku)) NOT IN (",
            "    " + ", ".join(sql_str(s) for s in QC_ONLY_FINISHED_SKUS),
            "  )",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM stg_canonical_catalog s",
            "    WHERE s.row_type = 'product' AND lower(btrim(s.mintpos_sku)) = lower(btrim(ci.sku))",
            "  );",
            "",
            "UPDATE public.catalog_variants cv",
            "SET active = false, updated_at = now()",
            "WHERE cv.sku IS NOT NULL",
            "  AND EXISTS (",
            "    SELECT 1 FROM public.catalog_items ci",
            "    WHERE ci.id = cv.item_id AND ci.item_kind = 'finished'",
            "  )",
            "  AND NOT EXISTS (",
            "    SELECT 1 FROM stg_canonical_catalog s",
            "    JOIN public.catalog_items parent_ci ON parent_ci.id = cv.item_id",
            "    WHERE s.row_type = 'variant'",
            "      AND lower(btrim(s.mintpos_sku)) = lower(btrim(cv.sku))",
            "      AND lower(btrim(s.parent_item_sku)) = lower(btrim(parent_ci.sku))",
            "  );",
            "",
            "COMMIT;",
            "",
            f"-- Generated rows: {len(products)} products, {len(variants)} variants, {len(groups)} menu groups",
        ]
    )
    return "\n".join(lines) + "\n"


def render_verify_sql(groups: dict[int, str], products: dict[str, dict], variants: list[dict]) -> str:
    product_skus = sorted(products.keys(), key=lambda s: (not s.isdigit(), int(s) if s.isdigit() else s))
    variant_skus = sorted({v["sku"] for v in variants}, key=lambda s: (not s.isdigit(), int(s) if s.isdigit() else s))
    group_ids = sorted(groups.keys())

    return f"""-- =============================================================================
-- 12 — Verify Supabase catalog matches canonical MintPOS union
-- =============================================================================
-- PASS: missing_* sections return 0 rows; summary counts match targets below.

-- Target counts from canonical export
--   menu groups: {len(groups)}
--   products:    {len(products)}
--   variants:    {len(variants)}

-- A) Summary
SELECT
  (SELECT COUNT(*) FROM public.catalog_menu_groups WHERE active AND pos_menu_group_id IS NOT NULL) AS active_menu_groups,
  (SELECT COUNT(*) FROM public.catalog_items ci WHERE ci.active AND ci.sku IS NOT NULL AND ci.item_kind = 'finished') AS active_finished_products,
  (SELECT COUNT(*) FROM public.catalog_variants cv JOIN public.catalog_items ci ON ci.id = cv.item_id WHERE cv.active AND ci.item_kind = 'finished') AS active_finished_variants;

-- B) Missing menu groups
WITH expected(pos_menu_group_id) AS (
  VALUES {", ".join(f"({gid})" for gid in group_ids)}
)
SELECT e.pos_menu_group_id
FROM expected e
LEFT JOIN public.catalog_menu_groups g ON g.pos_menu_group_id = e.pos_menu_group_id AND g.active
WHERE g.id IS NULL
ORDER BY e.pos_menu_group_id;

-- C) Missing product SKUs (finished)
WITH expected(sku) AS (
  VALUES {", ".join(f"({sql_str(sku)})" for sku in product_skus if products[sku]['item_kind'] == 'finished')}
)
SELECT e.sku
FROM expected e
LEFT JOIN public.catalog_items ci ON lower(btrim(ci.sku)) = lower(btrim(e.sku)) AND ci.active
WHERE ci.id IS NULL
ORDER BY e.sku;

-- D) Missing variant SKUs
WITH expected(sku) AS (
  VALUES {", ".join(f"({sql_str(sku)})" for sku in variant_skus)}
)
SELECT e.sku
FROM expected e
LEFT JOIN public.catalog_variants cv ON lower(btrim(cv.sku)) = lower(btrim(e.sku)) AND cv.active
WHERE cv.id IS NULL
ORDER BY e.sku;

-- E) Wrong menu group assignment (finished products)
SELECT
  ci.sku,
  ci.name,
  g.pos_menu_group_id AS portal_group_id,
  s.mintpos_group_id AS expected_group_id,
  g.name AS portal_group_name,
  s.menu_group_name AS expected_group_name
FROM public.catalog_items ci
JOIN (
  SELECT DISTINCT ON (mintpos_sku) mintpos_sku, mintpos_group_id, menu_group_name
  FROM (
    SELECT mintpos_group_id, menu_group_name, mintpos_sku
    FROM (
      VALUES
        {", ".join(f"({p['group_id']}, {sql_str(p['group_name'])}, {sql_str(p['sku'])})" for p in products.values() if p['item_kind'] == 'finished')}
    ) AS v(mintpos_group_id, menu_group_name, mintpos_sku)
  ) q
  ORDER BY mintpos_sku, mintpos_group_id
) s ON lower(btrim(s.mintpos_sku)) = lower(btrim(ci.sku))
LEFT JOIN public.catalog_menu_groups g ON g.id = ci.menu_group_id
WHERE ci.item_kind = 'finished'
  AND ci.active
  AND COALESCE(g.pos_menu_group_id, -1) <> s.mintpos_group_id
ORDER BY ci.sku;

-- F) Duplicate variant SKUs within the same parent product (must be empty)
SELECT
  ci.sku AS item_sku,
  ci.name AS item_name,
  lower(btrim(cv.sku)) AS variant_sku,
  COUNT(*) AS row_count,
  string_agg(cv.name, ' | ' ORDER BY cv.name) AS variant_names
FROM public.catalog_variants cv
JOIN public.catalog_items ci ON ci.id = cv.item_id
WHERE cv.sku IS NOT NULL AND cv.active
GROUP BY ci.sku, ci.name, lower(btrim(cv.sku))
HAVING COUNT(*) > 1
ORDER BY 1, 3;

-- G) Same variant SKU on different parent products (OK — matches MintPOS)
SELECT
  lower(btrim(cv.sku)) AS variant_sku,
  COUNT(DISTINCT ci.sku) AS parent_product_count,
  string_agg(DISTINCT ci.sku || ':' || ci.name, ' | ' ORDER BY ci.sku || ':' || ci.name) AS parents
FROM public.catalog_variants cv
JOIN public.catalog_items ci ON ci.id = cv.item_id
WHERE cv.sku IS NOT NULL AND cv.active
GROUP BY lower(btrim(cv.sku))
HAVING COUNT(DISTINCT ci.sku) > 1
ORDER BY 1;
"""


def main() -> None:
    rows = load_rows()
    groups, products, variants = build_model(rows)
    OUT_SQL.write_text(render_sql(groups, products, variants), encoding="utf-8")
    OUT_VERIFY.write_text(render_verify_sql(groups, products, variants), encoding="utf-8")
    print(f"Wrote {OUT_SQL.name} ({len(products)} products, {len(variants)} variants)")
    print(f"Wrote {OUT_VERIFY.name}")


if __name__ == "__main__":
    main()
