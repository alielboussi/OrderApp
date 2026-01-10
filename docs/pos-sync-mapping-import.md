# POS → Supabase mapping and data flow reference

## POS tables touched by a sale (observed)
- `BillType`: header/payment, `uploadStatus` used for pending/processed.
- `Sale`: sale header; now also marked processed.
- `Saledetails`: sale lines; now marked processed.
- `InventoryConsumed`: ingredient consumption rows; marked processed.
- Other tables changed in diffs (not marked): `Log`, `ReopenLog`, `Production`, `CompleteWaste`, `DineInTableDesign`, `DayBook`, `SubItems`, `ordersource`, `Threading`, `tabs`, `Reasons`, `SerivceCharges`, `ReceiptSettings`, `cashdrawer`, `selecttype`.

## Supabase tables receiving POS data
- `orders` (with `source_event_id` for idempotency, `sale_id` optional in payload).
- `pos_order_meta` (header details: bill/order type, discounts, taxes, charges, tip, pos_fee, price_type, customer, raw payload).
- `pos_inventory_consumed` (staged ingredient usage).
- Stock movement via your mapping + `record_outlet_sale` into `stock_ledger` / `outlet_stock_balances`.

## Payload shape (middleware → Supabase RPC `sync_pos_order`)
```jsonc
{
  "source_event_id": "<outlet>-<billId>",
  "sale_id": "<saleId>",
  "outlet_id": "<uuid>",
  "occurred_at": "2024-02-23T08:00:00Z",
  "order_type": "TakeAway",
  "bill_type": "Cash",
  "total_discount": 0,
  "total_discount_amount": 0,
  "total_gst": 0,
  "service_charges": 0,
  "delivery_charges": 0,
  "tip": 0,
  "pos_fee": 0,
  "price_type": "Default",
  "items": [
    {
      "pos_item_id": "17",
      "name": "Plain Omlette",
      "quantity": 1,
      "unit_price": 30.17,
      "discount": 0,
      "tax": 0,
      "variant_id": null
    }
  ],
  "payments": [ { "method": "Cash", "amount": 30.17 } ],
  "customer": { "name": "Walk-in", "phone": null, "email": null },
  "inventory_consumed": [
    {
      "pos_id": "169560",
      "raw_item_id": "148",
      "quantity_consumed": 3,
      "remaining_quantity": null,
      "pos_date": "2024-02-23",
      "kdsid": null,
      "typec": null
    }
  ]
}
```

## Mapping POS items to catalog items
Table: `public.pos_item_map`
- `pos_item_id` (text, PK) — POS MenuItem.Id
- `catalog_item_id` (uuid) — Supabase catalog_items.id
- `catalog_variant_id` (uuid, nullable)
- `warehouse_id` (uuid, nullable) — preferred deduction warehouse

### CSV import helper (psql)
Prepare `pos_item_map.csv` (no header) with columns:
```
pos_item_id,catalog_item_id,catalog_variant_id,warehouse_id
```
Example row:
```
17,11111111-2222-3333-4444-555555555555,,aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```
Import:
```sql
\copy public.pos_item_map(pos_item_id, catalog_item_id, catalog_variant_id, warehouse_id)
  FROM '/path/to/pos_item_map.csv' DELIMITER ',' CSV;
```

### Direct SQL insert example
```sql
insert into public.pos_item_map(pos_item_id, catalog_item_id, catalog_variant_id, warehouse_id)
values
  ('17', '11111111-2222-3333-4444-555555555555', null, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
```

## Marking processed (middleware)
- After successful RPC:
  - `BillType.uploadStatus = 'Processed'`
  - `Sale.uploadstatus = 'Processed'`
  - `Saledetails.uploadstatus = 'Processed'`
  - `InventoryConsumed.uploadstatus = 'Processed'`

## Supabase RPC (`sync_pos_order`) overview
- Path: `/rest/v1/rpc/sync_pos_order`
- Idempotency: `orders.source_event_id` unique.
- Inserts `orders`, `pos_order_meta`, `pos_inventory_consumed`.
- For each item: maps `pos_item_id` via `pos_item_map`, then calls `record_outlet_sale` (stock deducts via recipes and outlet/warehouse mappings).

## Operational checklist
1) Populate `pos_item_map` with all POS MenuItem.Id → catalog item/variant/warehouse.
2) Configure per-outlet `appsettings.json` (POS connection, outlet UUID, Supabase URL/key).
3) Publish & install Windows service; start it.
4) Test a sale; verify:
   - POS rows marked Processed.
   - Supabase `orders`, `pos_order_meta`, `pos_inventory_consumed` populated.
   - Stock moves in `stock_ledger` / `outlet_stock_balances`.
5) Monitor logs; adjust polling if needed.

## Notes
- InventoryConsumed currently matched by sale date + pending status; if you add a saleid column there, switch matching to saleid for precision.
- Keep `source_event_id` stable to avoid duplicates on retries.
- Use service-role key for RPC; restrict if desired and grant execute on `sync_pos_order` accordingly.
