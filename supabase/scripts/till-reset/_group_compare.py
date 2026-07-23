#!/usr/bin/env python3
"""Quick menu group ID comparison across Till 1, Till 2, Quick Corner."""

till1 = {
    2: "Alcohol", 3: "Main Meals", 4: "Bread", 5: "Breakfast", 6: "Burgers", 7: "Cakes",
    8: "Indian Cuisine", 9: "Raw Vegetables", 10: "Commodities", 11: "Beverages", 12: "Sauces",
    16: "Ice", 19: "Pizza", 21: "Rice", 22: "Salads", 23: "Sandwiches", 25: "Snacks",
    26: "Todays Special", 28: "Dough", 29: "Ingredients", 30: "Raw Poultry", 31: "Raw Beef",
    33: "Dip'd Wings", 35: "Energy Drinks", 36: "Packaging",
}

till2 = dict(till1)
del till2[36]
till2[20] = "Packaging"

qc = {
    2: "Alcohols", 7: "Cakes", 11: "Beverages", 13: "Donner Kebab", 14: "Hot Beverages",
    15: "Ice Cream", 20: "Plasticware", 21: "Confectionaries", 34: "Cold Coffee Beverages",
    35: "Energy Drinks", 36: "Popcorn",
}

# Product SKUs per group (from user exports)
packaging_skus = {"184", "349", "350", "352"}
till1_g36 = packaging_skus
till2_g20 = packaging_skus
qc_g20 = packaging_skus
qc_g36 = {"365"}

till1_g21 = {"200", "202"}
till2_g21 = {"200", "202"}
qc_g21 = {"357", "358"}  # Muffins, Scones - SKU conflict on 357

all_ids = sorted(set(till1) | set(till2) | set(qc))

print("MENU GROUP ID COMPARISON")
print("=" * 90)
print(f"{'ID':>3}  {'Till 1':<22} {'Till 2':<22} {'Quick Corner':<22}  Status")
print("-" * 90)

ok_all = []
ok_two = []
name_mismatch = []
partial = []

for gid in all_ids:
    n1 = till1.get(gid, "—")
    n2 = till2.get(gid, "—")
    nq = qc.get(gid, "—")
    present = [x for x in (n1, n2, nq) if x != "—"]
    names_used = set(present)

    if len(present) == 3 and len(names_used) == 1:
        status = "OK — all 3 match"
        ok_all.append(gid)
    elif len(present) == 2 and len(names_used) == 1:
        status = "OK — 2 tills match"
        ok_two.append(gid)
    elif len(present) >= 2 and len(names_used) > 1:
        status = "NAME MISMATCH"
        name_mismatch.append((gid, n1, n2, nq))
    else:
        status = "Only on some tills"
        partial.append(gid)

    print(f"{gid:>3}  {n1:<22} {n2:<22} {nq:<22}  {status}")

print()
print("SUMMARY")
print("-" * 90)
print(f"Groups matching on all 3 tills (same ID + name): {len(ok_all)} — IDs {ok_all}")
print(f"Groups matching on 2 tills only: {len(ok_two)} — IDs {ok_two}")
print(f"Groups with same ID but different names: {len(name_mismatch)}")
print(f"Groups present on only one till: {len(partial)}")

print()
print("NAME MISMATCHES (same ID, different name)")
print("-" * 90)
for gid, n1, n2, nq in name_mismatch:
    print(f"  ID {gid}: Till1={n1!r} | Till2={n2!r} | QC={nq!r}")

print()
print("ID COLLISIONS (same ID used for different product sets)")
print("-" * 90)
print("  ID 20: Till2/QC = Plasticware/Packaging SKUs", sorted(till2_g20))
print("         Till1 uses ID 36 for same packaging SKUs", sorted(till1_g36))
print("  ID 21: Till1/2 = Rice SKUs", sorted(till1_g21), "| QC = Confectionaries", sorted(qc_g21))
print("  ID 36: Till1 = Packaging SKUs", sorted(till1_g36), "| QC = Popcorn", sorted(qc_g36))

print()
print("VERDICT")
print("-" * 90)
print("Group IDs do NOT fully match across Till 1, Till 2, and Quick Corner.")
print("Till 1 and Till 2 are nearly aligned (1 ID shift: Packaging 36 vs 20).")
print("Quick Corner shares only a small subset and has several ID/name conflicts.")
