#!/usr/bin/env python3
"""Generate MintPOS Till 2 cleanup SQL from Till 1 canonical catalog."""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TSV = ROOT / "canonical_catalog_rows.tsv"
META = ROOT / "canonical_catalog.json"
OUT = ROOT / "16_mintpos_till2_remove_extra_catalog.sql"


def sql_str(v: str) -> str:
    return "'" + v.replace("'", "''") + "'"


def main() -> None:
    rows = list(csv.DictReader(TSV.open(encoding="utf-8"), delimiter="\t"))
    products = sorted(
        {r["mintpos_sku"] for r in rows if r["row_type"] == "product"},
        key=lambda s: (not s.isdigit(), int(s) if s.isdigit() else s),
    )
    variants = [
        (r["parent_item_sku"], r["mintpos_sku"], r["variant_name"])
        for r in rows
        if r["row_type"] == "variant"
    ]
    product_groups = {
        r["mintpos_sku"]: int(r["mintpos_group_id"])
        for r in rows
        if r["row_type"] == "product"
    }
    group_ids = sorted(
        {
            int(r["mintpos_group_id"])
            for r in rows
            if r["row_type"] == "product"
        }
        | {
            int(r["mintpos_group_id"])
            for r in rows
            if r["row_type"] == "variant"
        }
    )

    lines = [
        "-- =============================================================================",
        "-- 16 — Till 2 MintPOS: remove groups/products not in Till 1 / Supabase",
        "-- =============================================================================",
        "-- WHERE: SSMS → MINTPOS on Till 2 PC",
        "-- WHEN:  After 14_mintpos_till2_align_groups_to_till1.sql",
        "--",
        "-- Makes Till 2 catalog 1:1 with Till 1 / Supabase:",
        "--   • Deletes products whose SKU is not in Till 1 (incl. blank Code)",
        "--   • Deletes variants not in Till 1 for that parent product",
        "--   • Deletes empty menu groups not used on Till 1",
        "-- =============================================================================",
        "",
        "BEGIN TRANSACTION;",
        "",
        "DECLARE @allowed_groups TABLE (Id int PRIMARY KEY);",
        "INSERT INTO @allowed_groups (Id) VALUES",
        "  " + ",\n  ".join(f"({gid})" for gid in group_ids) + ";",
        "",
        "DECLARE @allowed_products TABLE (Sku varchar(50) PRIMARY KEY, TargetGroupId int NOT NULL);",
        "INSERT INTO @allowed_products (Sku, TargetGroupId) VALUES",
        "  "
        + ",\n  ".join(
            f"({sql_str(sku)}, {product_groups[sku]})" for sku in products
        )
        + ";",
        "",
        "DECLARE @allowed_variants TABLE (",
        "  ParentSku varchar(50) NOT NULL,",
        "  VariantSku varchar(50) NOT NULL,",
        "  PRIMARY KEY (ParentSku, VariantSku)",
        ");",
        "INSERT INTO @allowed_variants (ParentSku, VariantSku) VALUES",
        "  "
        + ",\n  ".join(
            f"({sql_str(p)}, {sql_str(v)})" for p, v, _ in sorted(variants)
        )
        + ";",
        "",
        "-- A) Preflight — extra menu groups on Till 2",
        "SELECT mg.Id, mg.Name,",
        "  (SELECT COUNT(*) FROM dbo.MenuItem mi WHERE mi.MenuGroupId = mg.Id) AS product_count",
        "FROM dbo.MenuGroup mg",
        "WHERE NOT EXISTS (SELECT 1 FROM @allowed_groups g WHERE g.Id = mg.Id)",
        "ORDER BY mg.Id;",
        "",
        "-- B) Preflight — products not in Till 1 (will be deleted)",
        "SELECT mi.Id, mi.Code, mi.Name, mi.MenuGroupId",
        "FROM dbo.MenuItem mi",
        "WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL",
        "   OR NOT EXISTS (",
        "     SELECT 1 FROM @allowed_products ap",
        "     WHERE ap.Sku = LTRIM(RTRIM(mi.Code))",
        "   )",
        "ORDER BY mi.MenuGroupId, mi.Code, mi.Name;",
        "",
        "-- C) Fix group assignment for allowed products (wrong group → Till 1 group)",
        "UPDATE mi",
        "SET MenuGroupId = ap.TargetGroupId, uploadstatus = 0",
        "FROM dbo.MenuItem mi",
        "INNER JOIN @allowed_products ap ON ap.Sku = LTRIM(RTRIM(mi.Code))",
        "WHERE mi.MenuGroupId <> ap.TargetGroupId;",
        "",
        "UPDATE mf",
        "SET MenuGroupId = ap.TargetGroupId, uploadstatus = 0",
        "FROM dbo.ModifierFlavour mf",
        "INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId",
        "INNER JOIN @allowed_products ap ON ap.Sku = LTRIM(RTRIM(mi.Code))",
        "WHERE mf.MenuGroupId <> ap.TargetGroupId;",
        "",
        "-- D) Delete variants not in Till 1 (parent + variant SKU scope)",
        "DELETE sd",
        "FROM dbo.Saledetails sd",
        "INNER JOIN dbo.ModifierFlavour mf ON mf.Id = sd.FlavourId",
        "INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId",
        "WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL",
        "   OR NOT EXISTS (",
        "     SELECT 1 FROM @allowed_variants av",
        "     WHERE av.ParentSku = LTRIM(RTRIM(mi.Code))",
        "       AND av.VariantSku = LTRIM(RTRIM(mf.Name2))",
        "   );",
        "",
        "DELETE mf",
        "FROM dbo.ModifierFlavour mf",
        "INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId",
        "WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL",
        "   OR NOT EXISTS (",
        "     SELECT 1 FROM @allowed_variants av",
        "     WHERE av.ParentSku = LTRIM(RTRIM(mi.Code))",
        "       AND av.VariantSku = LTRIM(RTRIM(mf.Name2))",
        "   );",
        "",
        "-- E) Delete sale lines + products not in Till 1",
        "DELETE sd",
        "FROM dbo.Saledetails sd",
        "INNER JOIN dbo.MenuItem mi ON mi.Id = sd.MenuItemId",
        "WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL",
        "   OR NOT EXISTS (",
        "     SELECT 1 FROM @allowed_products ap WHERE ap.Sku = LTRIM(RTRIM(mi.Code))",
        "   );",
        "",
        "DELETE mf",
        "FROM dbo.ModifierFlavour mf",
        "INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId",
        "WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL",
        "   OR NOT EXISTS (",
        "     SELECT 1 FROM @allowed_products ap WHERE ap.Sku = LTRIM(RTRIM(mi.Code))",
        "   );",
        "",
        "DELETE mi",
        "FROM dbo.MenuItem mi",
        "WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL",
        "   OR NOT EXISTS (",
        "     SELECT 1 FROM @allowed_products ap WHERE ap.Sku = LTRIM(RTRIM(mi.Code))",
        "   );",
        "",
        "-- F) Delete empty menu groups not on Till 1 (e.g. old group 20)",
        "DELETE mg",
        "FROM dbo.MenuGroup mg",
        "WHERE NOT EXISTS (SELECT 1 FROM @allowed_groups g WHERE g.Id = mg.Id)",
        "  AND NOT EXISTS (SELECT 1 FROM dbo.MenuItem mi WHERE mi.MenuGroupId = mg.Id)",
        "  AND NOT EXISTS (SELECT 1 FROM dbo.ModifierFlavour mf WHERE mf.MenuGroupId = mg.Id);",
        "",
        "-- G) Verify — should match Till 1 group list only",
        "SELECT mg.Id, mg.Name,",
        "  (SELECT COUNT(*) FROM dbo.MenuItem mi WHERE mi.MenuGroupId = mg.Id) AS products",
        "FROM dbo.MenuGroup mg",
        "ORDER BY mg.Id;",
        "",
        "-- H) Verify — any Till 2 products still not in Till 1 (must be empty)",
        "SELECT mi.Code, mi.Name, mi.MenuGroupId",
        "FROM dbo.MenuItem mi",
        "WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NULL",
        "   OR NOT EXISTS (",
        "     SELECT 1 FROM @allowed_products ap WHERE ap.Sku = LTRIM(RTRIM(mi.Code))",
        "   );",
        "",
        "COMMIT TRANSACTION;",
        "",
        f"-- Till 1 reference: {len(group_ids)} groups, {len(products)} products, {len(variants)} variants",
    ]

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.name}")


if __name__ == "__main__":
    main()
