# Orders app — Operation A & Operation B

This document defines the two stock-related behaviours on the **Afterten Orders app** (outlet create-order flow). Use these names in future requests (e.g. *“add SKU X to Operation B”*).

---

## Operation A — stock gate (master switch)

**What it is:** The master switch that turns on live warehouse stock checks on the orders app.

**When enabled:**
- The app polls warehouse stock quantities from the stock API (via Firebase `getStockControlSnapshot`).
- Operation B rules below are allowed to run for enrolled products.

**When disabled:**
- No stock snapshot is used for ordering.
- Operation B has no effect.

**Config (orders app):**
- `EXPO_PUBLIC_STOCK_CONTROL_ENABLED=true` in `.env`, or
- `extra.stockControlEnabled: true` in Expo config.

**Config (Firebase Functions):**
- `STOCK_CONTROL_ENABLED=true`
- `STOCK_SYNC_API_TOKEN` set

**Legacy name:** “Stock Control” — same thing as **Operation A**.

---

## Operation B — available-qty ordering (enrolled products only)

**What it is:** For specific catalog item UUIDs, when **Operation A is on**, ordering is limited by **warehouse available quantity** and each product’s **order step** (from `order-qty-rules.ts`).

**Applies only to products listed in** `OPERATION_B_PRODUCT_IDS` (`afterten-orders-expo/src/lib/stock-control/operation-b.ts`).

**Current enrolled products:**

| Product            | Catalog UUID                             | Order step |
|--------------------|------------------------------------------|------------|
| Frozen Wings       | `ca6c3236-05e9-42ad-a771-1c03a25dd5f1` | 10         |
| Raw Chicken Pieces | `cd145afb-0994-4c67-bf42-a9db9c3cc3ef` | 10         |
| Chicken Shawarma Trays | `4313479e-0f97-4197-a638-bee916bf4a07` | 20     |

**Behaviour when Operation A is on and product is in Operation B:**

1. **Grey out / “Out of stock”** — tile is disabled when available qty ≤ 0, or when available qty is **less than one full order step** (e.g. 9 wings on hand → cannot order a case of 10).
2. **Cannot add to cart** — blocked while out of stock / below minimum step.
3. **Qty cap** — cart qty cannot exceed the largest multiple of the order step that fits available stock (e.g. 47 on hand, step 10 → max order 40).
4. **+ / − and typed qty** — bumps and manual entry are clamped to that cap.
5. **Review / checkout** — order is blocked if cart qty exceeds available stock.

**Products not in Operation B** are unaffected by stock qty even when Operation A is on (no grey-out, no cap).

---

## Adding more products to Operation B

1. Add the catalog item UUID to `OPERATION_B_PRODUCT_IDS` in `operation-b.ts`.
2. If the product needs a non-default order step, add it to `QTY_STEP_BY_PRODUCT_ID` in `order-qty-rules.ts`.
3. No other code changes are required unless the product needs companion lines (e.g. cups → lids) or other special rules.

---

## Related logic (not Operation A/B)

| Feature              | Module                 | Notes                                      |
|----------------------|------------------------|--------------------------------------------|
| Order steps (10, 25, 50) | `order-qty-rules.ts` | Per-product UUID; applies on order + supervisor edit |
| Cup → lid companions | `order-qty-rules.ts`   | Slush cups auto-add matching lids          |
| Tray → bread companions | `order-qty-rules.ts` | 4 Shawarma Bread per 20 Chicken Shawarma Trays |
| Supervisor qty edit  | Portal + `order/[id]`  | Same steps and companions when editing     |
