# Beverages Storeroom App - Build Instructions

## Non-negotiables
- Always use real data from Supabase tables. No fallbacks or fake data.
- When a fix is needed, apply the fastest direct fix (RLS/migration/code) to achieve the result.
- Keep this file up to date after every change until the app is production-ready.

## Current Requirements (Condensed)
- Android Kotlin app with its own Gradle, dependencies, and manifest.
- Login against `stocktake_app_users` (via `stocktake_app_login` RPC).
- Dashboard with Transfers and Purchases.
- Transfers:
  - From warehouse locked to `f71a25d0-9ec2-454d-a606-93cfaa3c606b` (hidden on items page; show on summary).
  - On entering Transfers, prompt destination warehouse (dropdown) using names from Supabase for:
    - `c4aa315f-2e09-4060-8258-9dab077271ce`
    - `c77376f7-1ede-4518-8180-b3efeecda128`
  - Items shown in 2-column grid; base items only.
  - If item has variants, navigate to variants page (2-column grid) with search/scan; qty dialog for variant.
  - If no variants, show qty dialog for base item.
  - Qty dialogs show:
    - How its consumed UOM (from catalog/manage)
    - How Its Transfered (from catalog/manage)
    - Units Inside A Product Transfer (from catalog/manage)
  - Transfer qty sent = entered qty * transfer_quantity.
  - Summary page includes: from warehouse name, to warehouse name, username, UTC+2 date/time, items list with variant bullets.
  - Transfer completion returns to dashboard; on network fail show retry prompt until success.
- Purchases:
  - Supplier selection page (search + single select).
  - Invoice number page (numeric keyboard required).
  - Items/variants selection like transfers (search/scan, qty dialog).
  - Qty dialogs show:
    - How its Purchased UOM (from catalog/manage)
    - How Its Transfered
    - Units Inside A Product Transfer
  - Purchase qty sent = entered qty * transfer_quantity.
  - Stock inserted into locked from warehouse `f71a25d0-9ec2-454d-a606-93cfaa3c606b`.
  - Summary page like transfers; accept purchases returns to dashboard; retry on network failure.
- UI: Blue/Green/Red accents, white backgrounds, black medium/large text.

## Supabase Schema Alignment
- `list_warehouse_items` RPC must return:
  - item + variant name, SKU
  - `consumption_uom`
  - `purchase_pack_unit`
  - `transfer_unit`
  - `transfer_quantity`
  - Items assigned to warehouse `f71a25d0-9ec2-454d-a606-93cfaa3c606b` even if stock is zero.
- `warehouses` names must be readable by the app (RLS policy required if blocked).

## Completed Work
- Transfers items grid (2-column) and variants page (2-column) with scan.
- Qty dialogs show consumed UOM and transfer unit/quantity for transfers.
- Transfer qty multiplier implemented.
- Purchases dialog shows purchased UOM and transfer unit/quantity.
- `list_warehouse_items` updated to include variant data, UOMs, transfer fields, and warehouse assignment logic.
- ML Kit barcode scanning (QR + Code128).
- Auto-logout (15 min + background).

## Pending Work
- Transfer summary page: include required metadata, variant bullet formatting, retry handling.
- Purchases full flow: supplier search, invoice page, summary page, retry handling.
- Purchases qty multiplier wired to locked from warehouse.
- Ensure warehouse names resolve from Supabase without fallbacks (RLS policy if needed).
- Style polish to meet UI requirements.

## Current Issues
- If destination warehouse dropdown is empty, fix RLS on `public.warehouses` to allow select for app token.

## RLS/Migrations
- If warehouse names are blocked, apply a policy allowing SELECT for the app token on `public.warehouses`.

## Update Log
- Keep a dated log of changes below.

### 2026-05-01
- Created this instructions file.
- Destination warehouse dropdown uses Supabase `warehouses` names; empty means RLS is blocking SELECT for app token.
