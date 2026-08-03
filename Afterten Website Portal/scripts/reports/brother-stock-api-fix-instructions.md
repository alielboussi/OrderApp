# Stock API fixes required

**For:** Stock system maintainer  
**From:** Afterten portal / orders app team  
**Date:** August 2026

---

## Summary

The warehouse portal and orders app are synced to your **catalog API** (`/sync/catalog`).  
Your **stock API** (`/sync/stock`) is mostly aligned, but **60 items** need attention.

| Issue | Count | Priority | Root cause |
|-------|-------|----------|------------|
| Products in catalog but **not returned** by stock API | ~55 | Medium | **Likely stock qty &lt; 0** — your API omits them instead of returning them |
| Stock rows with **no UUID** | 5 | Urgent | Broken stock rows — must be fixed |

**Important:** The ~55 “missing” products are probably **not missing from your database**. They exist in `/sync/catalog`, but `/sync/stock` does not return them when quantity is below zero. Our checker reports that as “missing from stock API.”

---

## The rule (always)

Every product must use **one UUID everywhere**:

```
/sync/catalog  →  product.uuid
/sync/stock    →  item.uuid      (same value, when included in response)
Portal         →  catalog_items.id or catalog_variants.id (same value)
```

---

## Fix 1 — Urgent: 5 stock rows with NO UUID

These rows appear in **`/sync/stock`** but have an empty `uuid`. This is a real bug.

| Warehouse | Name in stock API (today) | Qty |
|-----------|---------------------------|-----|
| Beverages Storeroom | `7npczIqCmLf06ucG276z` | 6 |
| Beverages Storeroom | `cea2041f-dbc3-4c56-8035-5eaea87a2dc4` | 5 |
| Beverages Storeroom | `GGZBrvqzke6AJl84XVa8` | 5 |
| Beverages Storeroom | `KrkNEzGPfJUCGi6zOWS0` | 5 |
| Ingredients Storeroom | `jMKRtV9l67lOIz4e0keI` | 9 |

### What to do

1. Link each row to the correct product in `/sync/catalog`.
2. Set **`uuid`** to the catalog product UUID.
3. Set **`name`** to the real product name.

---

## Fix 2 — Products with stock qty &lt; 0 (the ~55 “missing” rows)

### What is happening

- Product exists in **`/sync/catalog`** with a valid UUID.
- Product has **negative stock** (or zero) in your system.
- Your **`/sync/stock`** endpoint **does not return** that product at all.
- Our portal reports it as “missing from stock API.”

We checked `/sync/stock`: it currently returns **only positive quantities** (no rows with qty ≤ 0). So negative-stock products never appear, even though they are valid catalog products.

### What you should do (pick one)

#### Option A — Recommended (best for orders app + stock control)

**Include all catalog products in `/sync/stock`, even when qty ≤ 0.**

Return the row with the **same UUID** as `/sync/catalog` and the **actual qty** (including negative numbers).

Example:

```json
{
  "uuid": "8817a557-6ee3-4ebc-b54e-fc9f191d134f",
  "name": "7-Up",
  "qty": -3,
  "unit": "Case(s)"
}
```

**Why:** The orders app can then grey out out-of-stock items and show correct availability.

#### Option B — Keep current behaviour (omit negative stock)

If you **intentionally** hide products with qty &lt; 0 from `/sync/stock`:

- No change needed on your side for those products.
- Tell us explicitly that this is by design.
- We will treat “not in stock API” as **out of stock** in the portal (same as qty 0).

**Downside:** We cannot distinguish “negative stock” from “product deleted from stock system.”

### Full list

See **`brother-stock-gaps.csv`** — rows where `issue` = `in_catalog_not_in_stock`.  
These are almost certainly products with **qty &lt; 0** in your system.

---

## How we verify after your fixes

| Check | Target |
|-------|--------|
| `stock_rows_without_uuid` | **0** (must fix the 5 broken rows) |
| `catalog_missing_in_stock_api` | **0** if you choose Option A; or we accept ~55 if Option B is confirmed |

---

## Going forward — new products

1. Product appears in **`/sync/catalog`** with a UUID.
2. Product appears in **`/sync/stock`** with the **same UUID** (even if qty is 0 or negative).
3. Portal auto-syncs within ~5 minutes.

**Do not** omit products from `/sync/stock` just because qty is negative — return them with the real qty instead.

---

## Attached file

**`brother-stock-gaps.csv`** — all rows with `issue`, `uuid`, `name`, `warehouse_name`, `unit`, and `action`.

---

## Quick reply we need from you

Please confirm:

1. **Are the ~55 “missing” products all ones with stock qty &lt; 0?** (Yes / No)
2. **Will you switch to Option A** (include them in `/sync/stock` with negative qty)? (Yes / No)
3. **When will the 5 no-UUID rows be fixed?**
