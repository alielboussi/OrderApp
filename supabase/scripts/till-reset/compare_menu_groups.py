#!/usr/bin/env python3
"""Compare MintPOS menu group IDs across Till 1, Till 2, and Quick Corner."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent

OUTLETS = {
    "Till 1": ROOT / "till1_groups.tsv",
    "Till 2": ROOT / "till2_groups.tsv",
    "Quick Corner": ROOT / "quick_corner_groups.tsv",
}


def load_groups(path: Path) -> dict[int, dict]:
    """group_id -> {name, product_skus, variant_skus}"""
    groups: dict[int, dict] = defaultdict(lambda: {"name": "", "product_skus": set(), "variant_skus": set()})
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        for row in reader:
            gid = int(row["mintpos_group_id"])
            groups[gid]["name"] = row["menu_group_name"].strip()
            sku = row["mintpos_sku"].strip()
            if row["row_type"] == "product":
                groups[gid]["product_skus"].add(sku)
            else:
                groups[gid]["variant_skus"].add(sku)
    return dict(groups)


def main() -> None:
    data = {name: load_groups(path) for name, path in OUTLETS.items()}
    all_ids = sorted(set().union(*(g.keys() for g in data.values())))

    print("=" * 80)
    print("MENU GROUP ID COMPARISON — Till 1 vs Till 2 vs Quick Corner")
    print("=" * 80)
    print()
    print(f"{'ID':>3}  {'Till 1':<22} {'Till 2':<22} {'Quick Corner':<22}  Match?")
    print("-" * 80)

    mismatches = []
    for gid in all_ids:
        names = []
        for outlet in OUTLETS:
            g = data[outlet].get(gid)
            names.append(g["name"] if g else "—")
        t1, t2, qc = names

        present = [n for n in names if n != "—"]
        if len(present) == 0:
            continue

        # Name match among outlets that have this group
        name_match = len(set(present)) == 1
        presence = (t1 != "—", t2 != "—", qc != "—")

        if not all(presence):
            status = "partial (not on all tills)"
        elif name_match:
            status = "OK"
        else:
            status = "NAME MISMATCH"
            mismatches.append((gid, t1, t2, qc))

        print(f"{gid:>3}  {t1:<22} {t2:<22} {qc:<22}  {status}")

    print()
    print("=" * 80)
    print("GROUPS ONLY ON ONE OR TWO TILLS")
    print("=" * 80)
    for outlet, groups in data.items():
        others = [g for n, g in data.items() if n != outlet]
        only_here = [gid for gid in groups if not any(gid in o for o in others)]
        if only_here:
            print(f"\n{outlet} only: {', '.join(f'{gid} ({groups[gid]['name']})' for gid in sorted(only_here))}")

    print()
    print("=" * 80)
    print("SAME GROUP ID, DIFFERENT NAME (where multiple tills have it)")
    print("=" * 80)
    for gid, t1, t2, qc in mismatches:
        print(f"  ID {gid}: Till1={t1!r} | Till2={t2!r} | QC={qc!r}")

    print()
    print("=" * 80)
    print("PACKAGING / PLASTICWARE / POPCORN — ID 20 vs 36")
    print("=" * 80)
    for label, gid in [("Till 1 group 36", 36), ("Till 2 group 20", 20), ("QC group 20", 20), ("QC group 36", 36)]:
        for outlet, groups in data.items():
            if gid in groups:
                g = groups[gid]
                skus = sorted(g["product_skus"], key=lambda s: int(s) if s.isdigit() else s)
                print(f"  {outlet} ID {gid} ({g['name']}): products {skus}")

    print()
    print("=" * 80)
    print("GROUP 21 — Rice vs Confectionaries")
    print("=" * 80)
    for outlet, groups in data.items():
        if 21 in groups:
            g = groups[21]
            skus = sorted(g["product_skus"], key=lambda s: int(s) if s.isdigit() else s)
            print(f"  {outlet} ID 21 ({g['name']}): products {skus}")


if __name__ == "__main__":
    main()
