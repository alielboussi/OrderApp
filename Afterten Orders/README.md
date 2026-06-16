# Afterten Orders

Standalone Android app for **outlet operations** — ordering, receiving, transfers, and damages at selling locations.

## Outlet flow (aligned with backoffice + middleware)

| Step | Android app | Backoffice (Outlets nav) | Supabase |
|------|-------------|--------------------------|----------|
| Place order | Create New Order | Outlet orders | `place_order` |
| Receive delivery | Receive Orders | Outlet orders | `mark_order_offloaded` |
| Stock credited | — | Outlet live balances | `record_order_fulfillment` (on supervisor approve) |
| POS sale deduct | — | POS sale deductions | `sync_pos_order` → `apply_pos_sale_deduction_rules` |
| Transfers | Outlet Transfers | Transfers | `warehouse_transfers` |
| Damages | Outlet Damages | Damages | `warehouse_damages` / `record_damage` |

Hub purchases and central storerooms are **not** in this app — use Inventory → Purchases in the backoffice.

## Setup

1. Copy `gradle.properties` values as needed (Supabase URL/anon key).
2. Open this folder in Android Studio.
3. Run the `ordersDebug` variant on a device or emulator.

**Build spec:** [docs/android-orders-app-flow.md](../docs/android-orders-app-flow.md) — outlet dashboard (Create Order, Pending Orders, Completed Orders), supervisor app, status flow, PDF, signatures.

## Shared module

Business logic and Supabase calls live in `../Shared` (included as `:shared`).
