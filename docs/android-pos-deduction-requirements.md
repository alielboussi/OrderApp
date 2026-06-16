# Afterten Orders Android app — requirements after POS deduction changes

> **Orders UI & lifecycle:** See **[android-orders-app-flow.md](./android-orders-app-flow.md)** for the full outlet + supervisor app build spec (login, dashboard, create order, pending/handoff/completed, PDF, signatures).

This document defines what the **Afterten Orders Android app** must support once backoffice **POS sale deductions** (`/Warehouse_Backoffice/pos-sale-deductions`) and Supabase logic are updated as described below.

> **Scope:** The Android app does **not** run POS deductions. Middleware calls `sync_pos_order` → `apply_pos_sale_deduction_rules`. The app is responsible for **supplying and maintaining** outlet-warehouse stock that those rules consume.

---

## Summary of backoffice / schema changes (context)

| Change | Target | Why Android cares |
|--------|--------|-------------------|
| Deduction lines may use **finished goods + variants**, not only ingredients/raws | `outlet_pos_deduction_rules`, backoffice UI, `apply_pos_sale_deduction_rules` | App must receive, count, transfer, and damage **finished** stock at outlet warehouses |
| Rules apply **only for outlets on the Orders app** | `outlets` flag + RPC guards | App login/outlet model becomes the eligibility gate |
| Variant keys on deduct lines match catalog | `catalog_variants` SKU / normalized key | App stock movements must use the **same** variant keys |

---

## Target behaviour

### POS sale deduction (middleware — not Android)

```
POS sale (SKU) → sync_pos_order → apply_pos_sale_deduction_rules
                                      ↓
                         stock_ledger (outlet warehouse)
                         reason = outlet_sale
```

Example rule (configured in backoffice):

| Sold (POS) | Deduct from outlet warehouse | Qty / sale |
|------------|------------------------------|------------|
| Sandwich ×1 | Bread (ingredient) | 1 each |
| Sandwich ×1 | Chicken (ingredient) | 200 g |
| Sandwich ×1 | Bottled water (finished, variant 500 ml) | 1 each |

### Supply chain (Android app)

```
Hub → [Place order] → [Supervisor approve] → record_order_fulfillment
                                              ↓
                                    outlet receiving warehouse credited
                                              ↓
                         POS sales deduct via rules (middleware)
```

**POS deductions only work when the outlet has stock in its warehouse ledger.** That stock comes from approved Orders app deliveries (and transfers), not from the Android app calling deduction RPCs.

---

## Outlet eligibility — “Orders app outlets only”

### Proposed schema (backoffice / Supabase)

Add or standardize on one gate used by backoffice + RPCs:

```sql
-- Option A (preferred): explicit flag
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS uses_orders_app boolean NOT NULL DEFAULT false;

-- Option B (interim): existing columns
-- outlets.auth_user_id IS NOT NULL  AND  default_receiving_warehouse_id IS NOT NULL
```

| Surface | Rule |
|---------|------|
| `/pos-sale-deductions` outlet dropdown | Only `uses_orders_app = true` (or equivalent) |
| `apply_pos_sale_deduction_rules` | `RETURN` early if outlet not orders-app enabled |
| `sync_pos_order` | Skip deduction step when outlet not eligible |
| Android login | Already tied to `outlets.auth_user_id` — same outlet set |

### Android requirement

1. **No code change to login flow** if eligibility remains `auth_user_id` on the outlet row.
2. **Session must expose `outlet_id`** (already does) so all RPCs scope to the correct outlet.
3. **Document in outlet setup:** an outlet without `auth_user_id` / `uses_orders_app` cannot use the app and must not appear on POS deduction programming.
4. **Optional UI:** if login succeeds but `default_receiving_warehouse_id` is missing, show a blocking message — orders cannot credit stock for POS deductions.

---

## Catalog & ordering — finished goods

### Current app

- `ProductRepository.syncProducts()` loads `catalog_items` where `outlet_order_visible = true` (all kinds).
- Users place orders for finished products, ingredients, and variants.

### Required after change

| # | Requirement | Detail |
|---|-------------|--------|
| 1 | **Order finished goods used as deduct targets** | Branch users must be able to add finished items (and variants) that backoffice lists as deduction lines — same as today, but **explicitly including** finished goods that are deducted on POS sale (not only recipe parents). |
| 2 | **Variant selection on order lines** | When a finished good has variants, order flow must persist the correct `variant_key` on `order_items` so `record_order_fulfillment` credits the matching ledger row. |
| 3 | **No ingredient-only filter on order catalog** | Do not restrict the order product list to `item_kind = ingredient`. Finished + raw remain orderable when `outlet_order_visible`. |
| 4 | **Receive / offload** | Receive Orders flow unchanged; must post fulfillment for all line kinds so outlet warehouse ledger reflects finished stock. |

### Shared / RPC dependency

- `place_order` and `record_order_fulfillment` must route finished goods to `outlets.default_receiving_warehouse_id` (or per-item routing). **Verify** with a test order containing a finished deduct target before release.

---

## Stocktake — count finished goods at outlet warehouse

### Current limitation

`record_stock_count` rejects finished items **with an active recipe**. Finished goods used as direct POS deduct targets typically have **no recipe** and should be countable.

### Required after change

| # | Requirement | Detail |
|---|-------------|--------|
| 1 | **Show all ledger items** | `OutletStocktakeScreen` uses `list_warehouse_items` — must include **finished** rows and **variants** present in the outlet warehouse (ingredients + finished + raws as applicable). |
| 2 | **Variant-aware counts** | Opening/closing counts must pass `variant_key` matching backoffice deduction rules (`catalog_variants.sku` or normalized variant id). |
| 3 | **Schema alignment** | If `record_stock_count` still blocks some finished items, extend RPC to allow `item_kind = finished` when the item is a valid deduct target (or remove recipe guard for outlet warehouses). **Android blocked until RPC updated.** |
| 4 | **Variance reporting** | Closed-period variance must include finished deduct lines in opening/closing + sales — already driven by ledger; no extra Android work beyond accurate counts. |

---

## Transfers & damages — finished goods + variants

### Required after change

| # | Requirement | Detail |
|---|-------------|--------|
| 1 | **Item picker includes finished goods** | When creating outlet transfers/damages (future create flows or existing screens), item lists must not be ingredient-only. Use `list_warehouse_items` or `warehouse_live_items` without `item_kind=ingredient` filter. |
| 2 | **Variant key on movements** | Transfers/damages write `stock_ledger` with the same `variant_key` used in deduction rules. |
| 3 | **Read-only history** | Current Transfers/Damages screens list history — ensure displayed rows show finished product names for items deducted on POS. |

### Shared module note

`listWarehouseIngredientsDirect()` is ingredient-only — **do not use** for outlet flows that must support finished goods. Prefer `listWarehouseItems()` RPC.

---

## Variant key contract (critical)

Backoffice **Deduction lines** will use a **variant dropdown** (not free-text) aligned with:

- `base` for single-SKU finished items
- `catalog_variants.sku` or normalized variant id otherwise

Android must use **identical normalization** everywhere it sends `variant_key`:

| Flow | RPC / table |
|------|-------------|
| Stocktake | `record_stock_count(p_variant_key)` |
| Transfers | `warehouse_transfers` / ledger |
| Damages | `record_damage` / ledger |
| Orders | `order_items.variant_key` |

**Action:** Centralize variant key resolution in `Shared` (one helper used by Orders, Stocktake, Transfers, Damages) matching `normalize_variant_key()` in Postgres.

---

## What the Android app does **not** need to do

| Topic | Owner |
|-------|--------|
| Programming deduction rules | Backoffice `/pos-sale-deductions` |
| Applying deductions on POS sale | Middleware → `sync_pos_order` |
| POS SKU → catalog match | Middleware + `resolve_catalog_by_sku` |
| POS middleware heartbeat | `pos-sync-service` on outlet PC |
| Filtering POS bills on Outlet orders page | Backoffice (`source_event_id IS NULL`) |

---

## Proposed Supabase changes (prerequisites — not Android code)

Apply before or with the Android release:

1. **`outlets.uses_orders_app`** (or document `auth_user_id` + `default_receiving_warehouse_id` rule).
2. **`apply_pos_sale_deduction_rules`**
   - Allow `deduct_item_id` → any active `catalog_items` (finished, ingredient, raw).
   - Resolve `deduct_variant_key` against `catalog_variants`.
   - Guard: outlet must be orders-app enabled.
   - Write `stock_ledger` with `reason = outlet_sale` (signed negative delta).
3. **`record_stock_count`** — allow finished goods without recipe at outlet warehouses.
4. **Backoffice `/pos-sale-deductions`**
   - Outlet list: orders-app outlets only.
   - Deduct item: grouped finished / ingredient / raw with variant `<select>`.
   - Warehouse list: `outlet_warehouses` for selected outlet only.

---

## Android implementation checklist

### Must have (release blockers)

- [ ] Confirm `place_order` + fulfillment credits **finished** lines to outlet receiving warehouse.
- [ ] Stocktake: count finished goods + variants via `list_warehouse_items`; variant keys match backoffice.
- [ ] Unify `variant_key` helper in Shared module.
- [ ] Login/outlet guard when `default_receiving_warehouse_id` is null (clear error).
- [ ] QA with backoffice rule: sold finished POS item → deduct finished + ingredient lines from same outlet warehouse.

### Should have

- [ ] Transfers/damages create flows (when added) support finished goods picker with variants.
- [ ] Product list badge or filter by `item_kind` so branch staff can find deduct-target finished goods.
- [ ] Offline order queue still syncs finished line items with correct variant keys.

### Nice to have

- [ ] Read-only “warehouse on hand” snippet on Home for top deduct-target items.
- [ ] Link from order confirmation to expected POS deduct components (read rules API — optional).

---

## End-to-end test script (Android + backoffice + middleware)

1. **Setup (backoffice)**
   - Outlet: `uses_orders_app = true`, `auth_user_id` set, `default_receiving_warehouse_id` set.
   - Link outlet warehouses in `outlet_warehouses`.
   - Program rule on `/pos-sale-deductions`: sold finished item → deduct finished variant + ingredient.

2. **Android — supply stock**
   - Login as branch user.
   - Place order including the **deduct finished good** (and ingredients if ordered separately).
   - Supervisor approves → fulfillment runs.
   - Optional: stocktake opening count includes finished variant qty.

3. **Middleware — consume stock**
   - POS sells the configured SKU.
   - Verify `stock_ledger` rows for each deduct line at the rule warehouse.
   - Verify `outlet_stock_balances` / live balance decreased.

4. **Android — period close**
   - Enter closing stocktake counts including finished goods.
   - Backoffice stocktake variance reflects sales deductions.

---

## Files likely touched (Android / Shared)

| Area | Path |
|------|------|
| Order catalog | `Shared/.../repo/ProductRepository.kt`, `ProductListScreen.kt` |
| Stocktake | `Afterten Orders/.../OutletStocktakeScreen.kt`, `SupabaseProvider.recordStockCount` |
| Variant helper | `Shared/.../data/` (new `VariantKeys.kt` or similar) |
| Transfers / damages | `OutletTransfersScreen.kt`, `OutletDamagesScreen.kt`, future create UI |
| Session / outlet guards | `RootViewModel`, login flow |

---

## Related docs

- [outlet-middleware-orders-architecture.md](./outlet-middleware-orders-architecture.md)
- [simplified-pos-sync-migration.md](./simplified-pos-sync-migration.md)
- [outlet-stocktake-variance.md](./outlet-stocktake-variance.md)
- `Afterten Orders/README.md` — outlet flow matrix
