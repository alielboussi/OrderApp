# Firebase migration plan (Afterten POS middleware)

Dual-track: **Supabase Micro now** for production stability, **Firebase phased rollout** without stopping tills.

## Phase 0 — Supabase Micro (today)

1. Supabase Dashboard → Project → **Settings → Compute**
2. Change **Nano → Micro** (on Pro, Micro is usually covered by the $10 compute credit → still ~$25/month total)
3. Confirm heartbeat `last_seen_at` updates and `orders_missing_shift` drops on Till 1
4. Target **Small** when adding many outlets; **Medium** before full 23-outlet rollout

## Phase 1 — Abstraction (code)

- `IOutletCloudClient` in SCPGT — same operations as today’s Supabase RPCs
- `SupabaseClient` implements it (current production path)
- `FirebaseCloudClient` stub → implemented per operation in later phases
- Config: `Cloud:Backend` = `Supabase` | `Firebase` in `appsettings.json`

## Phase 2 — Firestore schema (mirror current Postgres concepts)

```
outlets/{outletId}
outlet_heartbeats/{outletId}          ← upsert_outlet_heartbeat
outlet_sync_failures/{id}             ← log_pos_sync_failure
outlet_catalog_sync_events/{eventId}  ← fetch_outlet_catalog_sync

sales/{sourceEventId}                 ← orders + raw_payload (shift, payments, items[])
  lines/{lineId}                      ← outlet_sales rows (optional subcollection)

catalog_items/{itemId}                ← portal catalog (synced from portal or MintPOS pull)
catalog_variants/{variantId}
outlet_catalog_bindings/{outletId}/skus/{key}  ← SKU → item + variant resolution
```

Catalog resolution (`resolve_catalog_for_outlet`) becomes:

- Firestore read on `outlet_catalog_bindings` + `catalog_items` / `catalog_variants`
- Or callable Cloud Function `resolveCatalogForOutlet(outletId, itemSku, variantSku)`

## Phase 3 — Middleware RPC mapping

| Supabase RPC (SCPGT today) | Firebase target |
|----------------------------|-----------------|
| `validate_pos_order` | `validatePosOrder` (Function or client-side + rules) |
| `sync_pos_order` | Write `sales/{sourceEventId}` + line docs + deduction trigger |
| `patch_pos_order_payload` | Merge shift/terminal into `sales/{sourceEventId}` |
| `upsert_outlet_heartbeat` | Set `outlet_heartbeats/{outletId}` |
| `list_orders_missing_shift` | Query sales where shift missing |
| `fetch_outlet_catalog_sync` | Query `outlet_catalog_sync_events` pending |
| `mark_catalog_sync_delivered` | Update event status |
| `sync_pos_catalog_from_middleware` | Batch update catalog_items/variants |
| `sync_outlet_pos_catalog_bindings` | Write bindings collection |
| `log_pos_sync_failure` | Write failure doc |
| `get_outlet_sync_context` | Read outlet + warehouse config doc |

MintPOS read path (`PosRepository`) **does not change**. Only cloud client changes.

## Phase 4 — Pilot (one outlet)

1. Pick **Quick Corner** or **Till 2** (lower risk than Till 1 backlog)
2. Deploy Cloud Functions + Firestore rules
3. SCPGT build with `Cloud:Backend=Firebase` on **one PC only**
4. Run **parallel** with Supabase for 2 weeks: compare bill counts, shifts, `/tills` API parity
5. Roll back = flip config to `Supabase`

## Phase 5 — Portal + APIs

- Next.js routes today use `getServiceClient()` → Postgres
- Options:
  - **A)** Portal reads/writes Firestore (Admin SDK) for sales APIs
  - **B)** Portal calls Cloud Functions (keeps one backend brain)
  - **C)** Hybrid: catalog on Firestore, reports export to BigQuery later

`/api/outlet-middleware-sales/tills` must read the same shape from Firestore as from `orders.raw_payload.shift`.

## Phase 6 — Full cutover (23 outlets)

- Migrate historical `orders` + `outlet_sales` (one-time script)
- Phased SCPGT config per till PC (5–10 outlets per wave)
- Decommission Supabase RPC path when all outlets green for 30 days

## What not to migrate blindly

- SQL triggers (`refresh_catalog_has_variations`, deduction rules) → Cloud Functions or client transactions
- `pg_cron` maintenance → Firebase scheduled functions
- Complex reports → BigQuery export or keep read replica on Postgres during transition

## Success criteria (per outlet)

- [ ] `pending_sales_count` = 0 in heartbeat
- [ ] Shifts present on sales (`shift_id` 1/2/3)
- [ ] `/tills` API matches Supabase output for same date range
- [ ] Catalog push → delivered → sell on till → sync within 2 minutes
- [ ] No statement timeouts under lunch peak (1000+ bills/day)
