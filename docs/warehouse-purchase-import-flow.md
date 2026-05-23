# Warehouse Purchase Import Flow

This document describes how the Afterten stock movements API is imported into the warehouse purchase and stock system.

## Overview
- Source API: Afterten stock movements endpoint (receive movements only).
- Target: warehouse purchase receipts, stock counts, and import audit records.
- Entry point: Scanners API route `/api/warehouse-purchase-import`.
- Mode: `dryRun` to preview without inserts or updates.

## Authentication
- Uses `Afterten_Purchases_Api_Token` from environment.
- In non-production, headers can override:
  - `x-afterten-token`
  - `x-afterten-stocktake-user`

## Payload Fields Used
- `qty`, `unitCost`, `totalCost`
- `unitName` (preferred), `unit` (fallback), and legacy purchase uom fields
- `unitsInsidePurchaseProduct` / `units_per_purchase_pack`
- `productId`, `variantSku`, `itemSku`, `sku`, `productName`
- `warehouseId`, `warehouseName`
- `ref.invoiceId`, `by.name`, `at`

## Core Steps

### 1) Load and normalize movements
- Read raw items from API response.
- Normalize text and numbers.
- Extract purchase unit from `unitName` (fallback to `unit` or legacy fields).
- Extract units-per-pack when present and valid.

### 2) Match to catalog
- Variant match priority:
  1) `productId` (UUID)
  2) `variantSku`
  3) `sku` (when no variant SKU)
- Item match priority:
  1) `productId` (UUID)
  2) `itemSku`
  3) `sku`

### 3) Create missing items and variants
- New items are created with:
  - `purchase_pack_unit` from API unit name
  - `units_per_purchase_pack` from API if valid, else default 1
  - `item_kind` defaults to `ingredient`
- New variants are created similarly.
- Creation is skipped in `dryRun`.

### 4) Storage home check
- Storage home must exist for each matched item/variant.
- Missing storage home results in `missing_storage_home` status.

### 5) Period logic
- Find open stock periods per storage warehouse.
- Auto-open a period only when:
  - The warehouse has new items only, and
  - No open period exists.

### 6) Opening stock logic (new items only)
- For new items, ensure an opening stock count exists in the open period.
- Opening count uses effective quantity:
  - `effective_qty = qty * units_per_purchase_pack`
- Opening stock is inserted only for new items, and only when a stocktake user id is available.

### 7) Update product UOM and pack fields
- If API unit name differs from current `purchase_pack_unit`, update it.
- If API units-per-pack differs, update it.
- Cost is updated from the effective unit cost when present.

### 8) Import status evaluation
Statuses include:
- `duplicate`
- `duplicate_receipt`
- `missing_item`
- `missing_storage_home`
- `missing_open_period`
- `missing_opening_stock`
- `invalid_qty`
- `error`
- `ready`

### 9) Record receipts
- For each warehouse+reference group, call `record_purchase_receipt`.
- Quantities are posted in units using the effective qty.
- Successful imports are written to `warehouse_purchase_imports`.

## Quantity and Cost Rules
- Quantity conversion uses `units_per_purchase_pack`.
- Unit cost is normalized to the base unit:
  - `effective_unit_cost = unitCost / units_per_purchase_pack`

## Response Summary
- Returns a summary of total items and status counts.
- Each item includes:
  - matching results
  - status and message
  - created item/variant flags

## Notes
- New items do not auto-create a storage home.
- Duplicate imports are blocked by movement id and invoice rules.
- `dryRun` skips all inserts/updates but returns the full evaluation.
