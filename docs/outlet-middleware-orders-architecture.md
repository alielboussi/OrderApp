# Outlets, outlet warehouses, hub warehouses & middleware

## Three layers (do not mix)

| Layer | What it is | Examples | Middleware? |
|-------|------------|----------|---------------|
| **Outlet** | A selling location (21 total) | Quick Corner, Remote Branch 5 | **Yes** — one SCPGT service per outlet |
| **Outlet warehouse** | Stock held *at* that outlet after orders are approved | "QC Dry Store", "QC Cold" | **No** — inventory only |
| **Hub warehouse** | Central production/storage (main branch) | Beverages storeroom, Cold room 3, Prep kitchen | **No** — scanners & purchases |

### How to tell them apart in Supabase

- **`outlets`** — the 21 selling locations. POS middleware `Outlet:Id` = `outlets.id`.
- **`outlet_warehouses`** — links an outlet to its deduction/receiving warehouses.
- **`warehouses.outlet_id`** — optional direct link (warehouse belongs to one outlet).
- **`warehouses.warehouse_scope`** (new):
  - `hub` — central / main-branch storage (no POS middleware)
  - `outlet` — stock at a selling location (deduction target for sales)

**Rule:** `outlet_pos_heartbeats` and middleware status UI only use **`outlets`**, never warehouse rows.

---

## End-to-end flow

```
[Hub warehouses]  ──orders app (approved)──►  [Outlet warehouses]  ──POS sale──►  deduct
     ▲                                              ▲
     │ purchases / transfers                        │ record_order_fulfillment
     │                                              │ (+sent_units on outlet_stock_balances)
```

### 1. Order accepted (Afterten Orders app)

Supervisor accepts → `accept_order` → `record_order_fulfillment(order_id)`:

- Deducts from hub/source warehouses (existing logic)
- **Credits** outlet receiving warehouse (`outlets.default_receiving_warehouse_id`)
- Increments **`outlet_stock_balances.sent_units`** for that outlet

### 2. POS sale (middleware → Supabase)

Middleware sends sale with SKU → `sync_pos_order`:

1. Resolve sold item via `resolve_catalog_by_sku`
2. Insert `orders` + `outlet_sales` row for the **sold** product (audit)
3. Run **`apply_pos_sale_deduction_rules`** — programmable lines (replaces old recipes)

Example: Sandwich sold ×1 → rules deduct:

| From outlet warehouse | Item | Qty |
|----------------------|------|-----|
| QC Dry Store | Bread | 1 each |
| QC Dry Store | Chicken | 200 g |

### 3. Programming deductions (backoffice)

Table: **`outlet_pos_deduction_rules`**

Configure per outlet + sold catalog item (+ optional variant):

- `deduct_item_id`, `deduct_variant_key`, `deduct_qty_per_sale`
- `warehouse_id` — must be an **outlet** warehouse for that outlet

No per-outlet POS SKU mapping needed if `MenuItem.Code` = catalog SKU.

---

## Middleware ↔ website contract

| Concern | Owner |
|---------|--------|
| Heartbeat every poll | Middleware → `upsert_outlet_heartbeat` |
| Sale upload | Middleware → `sync_pos_order` |
| Catalog/price push | Website → `outlet_catalog_sync_events` → middleware |
| Deduction rules | Website backoffice (outlet setup) |
| Order → outlet stock | Orders app + `record_order_fulfillment` |

Middleware **does not** need to know deduction rules — Supabase applies them inside `sync_pos_order`.

---

## UI

- **Dashboard** — signed-in user + middleware connection monitor (outlets only, refreshes every 60s)
- **Outlet live balances** — `outlet_stock_balances` + warehouse ledger per outlet warehouse (sidebar → Outlet live balances)
- **Program POS deductions** — outlet setup → "POS sale deductions" panel

### Backoffice Outlets nav (Afterten Orders + middleware)

All items under **Outlets** are scoped to selling locations — not hub storerooms:

| Nav item | Android app | Middleware |
|----------|-------------|------------|
| Outlet orders | place / receive orders | — |
| Outlet setup | — | — |
| POS sale deductions | — | rules applied in `sync_pos_order` |
| Outlet live balances | — | — |
| Transfers | Outlet Transfers screen | — |
| Damages | Outlet Damages screen | — |
| Stocktakes | — | — |

**Inventory** nav keeps hub-only **Purchases**.

APIs accept `scope=outlet` on `/api/warehouses`, `/api/warehouse-transfers`, `/api/warehouse-damages`.

---

## Migration

Apply after the two prior migrations:

`supabase/migrations/20260616160000_outlet_scope_and_pos_deduction_rules.sql`
