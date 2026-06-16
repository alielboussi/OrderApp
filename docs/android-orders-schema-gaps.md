# Schema analysis — Android orders flow vs current Supabase

Compared against [android-orders-app-flow.md](./android-orders-app-flow.md) and your live schema dump (`supabase/Supabase Schema.sql`).

**Verdict:** You **do need migrations** before the new outlet + supervisor apps will work reliably. Several RPCs and RLS policies assume the **old** flow (`ordered` / `offloaded`, supervisor = outlet member, supervisor dispatches from outlet app).

---

## Status machine — gaps

### Target (app spec)

| Status | Who sets it |
|--------|-------------|
| `placed` | Outlet — Place order |
| `accepted` | Supervisor — Accept order |
| `loaded` | Supervisor — Handoff / Dispatch |
| `completed` | Outlet — Driver sign on delivery |

### Current schema behaviour

| Target status | What exists today | Gap |
|---------------|-------------------|-----|
| `placed` | `place_order` / direct insert can use `placed` | OK if RPC sets `status = 'placed'` and `source_event_id IS NULL` |
| `accepted` | **Missing.** `supervisor_approve_order` → `approve_lock_and_allocate_order` sets **`ordered`**, not `accepted` | Add `accepted` status + new accept RPC |
| `loaded` | `mark_order_loaded` sets `loaded` | Auth is **outlet-only** today; spec needs **supervisor** dispatch |
| `completed` | **Missing.** `mark_order_offloaded` sets **`offloaded`** | Add `completed` or map `offloaded` → `completed` in apps |

### Trigger conflict

```sql
-- trg_orders_lock_allocate fires on:
'ordered', 'loaded', 'offloaded', 'delivered'
```

- Does **not** include `placed` or `accepted` (good for edit window).
- Fires on `loaded` → may run `record_order_fulfillment` **at dispatch**, not at accept.
- **Decision needed:** run `record_order_fulfillment` on **`accepted`** (stock leaves hub when supervisor accepts) or on **`loaded`** (stock moves when truck leaves). Recommend **`accepted`** so outlet warehouse is credited before “on the way”.

**Required:** Update trigger to:

```sql
-- Example: allocate on accept + completed legacy statuses
ARRAY['accepted', 'ordered', 'loaded', 'offloaded', 'delivered', 'completed']
```

…and implement accept RPC to call `record_order_fulfillment` once.

---

## Signature columns — mostly OK, one gap

### Already on `orders`

| Column group | Use in new flow |
|--------------|-----------------|
| `employee_signed_*` | Outlet place order |
| `supervisor_signed_*` | Optional on Accept |
| `driver_signed_*` | Currently used by `mark_order_loaded` (outlet auth) |
| `offloader_signed_*` | Currently used by `mark_order_offloaded` |

### Problem — two driver signatures

Spec requires:

1. **Handoff** — supervisor app, driver signs → `loaded`
2. **Delivery** — outlet app, driver signs again → `completed`

Today there is only **one** `driver_signed_*` set and **`offloader_signed_*`** for receive.

### Recommended migration (Option A — explicit)

```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS handoff_driver_name text,
  ADD COLUMN IF NOT EXISTS handoff_driver_signature_path text,
  ADD COLUMN IF NOT EXISTS handoff_driver_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_driver_name text,
  ADD COLUMN IF NOT EXISTS delivery_driver_signature_path text,
  ADD COLUMN IF NOT EXISTS delivery_driver_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_pdf_path text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
```

Map RPCs:

- `dispatch_order` → `handoff_driver_*`, status `loaded`
- `complete_order` → `delivery_driver_*`, status `completed`, `completed_pdf_path`

### Alternative (Option B — reuse columns)

| Leg | Columns |
|-----|---------|
| Handoff | `driver_signed_*` |
| Delivery | `offloader_signed_*` (rename in UI to “Driver delivery sign”) |

Fewer columns, but confusing names in backoffice/PDF.

---

## RPCs — blockers

### Works today (outlet)

| RPC | Notes |
|-----|-------|
| `place_order` | SECURITY DEFINER; auth via `member_outlet_ids` ✓ |
| `next_order_number` | ✓ |
| `mark_order_offloaded` | Outlet can complete — but status is `offloaded`, not `completed` |

### Broken / wrong for new flow

| RPC | Issue |
|-----|-------|
| `supervisor_approve_order` | Calls `approve_lock_and_allocate_order` which requires **`member_outlet_ids`** — **hub supervisors fail** (they are not `outlets.auth_user_id`) |
| `approve_lock_and_allocate_order` | Same auth; sets status **`ordered`**, not **`accepted`** |
| `mark_order_loaded` | Auth = admin **or outlet member only** — **supervisor cannot dispatch** |
| `mark_order_modified` | No status change; no supervisor auth check |

### Missing RPCs (create these)

| RPC | Caller | Behaviour |
|-----|--------|-----------|
| `is_supervisor(uuid)` | policies / other RPCs | `EXISTS (user_roles + role slug supervisor)` |
| `accept_order(p_order_id, p_supervisor_name, …)` | Supervisor app | Verify `status = 'placed'`; allow qty edits already saved; set `accepted`, `accepted_at`, `accepted_by`; call `record_order_fulfillment` once; optional supervisor signature |
| `dispatch_order(p_order_id, p_driver_name, p_signature_path)` | Supervisor app | Verify `status = 'accepted'`; set `loaded`, `handoff_driver_*`, `locked = true` |
| `complete_order(p_order_id, p_driver_name, p_signature_path, p_pdf_path)` | Outlet app | Verify `status = 'loaded'`; set `completed`, `delivery_driver_*`, `completed_pdf_path` |
| `supervisor_replace_order_item_variant(...)` | Supervisor app | Same-`product_id` variant swap + qty merge (or enforce in trigger + app) |

Deprecate or wrap:

- `supervisor_approve_order` → call `accept_order`
- `mark_order_loaded` → call `dispatch_order` (supervisor auth) **or** split auth by status
- `mark_order_offloaded` → call `complete_order`

---

## RLS — supervisor cannot read orders today

### `orders`

| Policy | Rule | Problem |
|--------|------|---------|
| `orders_policy_select` | `is_admin OR outlet_id = ANY(member_outlet_ids())` | **Supervisors not in `member_outlet_ids`** → empty list |
| `orders_policy_update` | **`is_admin` only** | Supervisors cannot update orders via REST |

### `order_items`

| Policy | Rule | Problem |
|--------|------|---------|
| `order_items_policy_*` | `order_is_accessible(order_id, auth.uid())` | Same — **no supervisor path** |

`order_is_accessible` only checks admin, `member_outlet_ids`, or `outlet_auth_user_matches` — **not supervisor role**.

### Required RLS changes

```sql
CREATE OR REPLACE FUNCTION public.is_supervisor(p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user
      AND lower(coalesce(r.normalized_slug, r.slug)) = 'supervisor'
  );
$$;

-- orders SELECT: add supervisor
-- orders UPDATE: supervisors via RPC only (keep direct UPDATE admin-only) OR allow supervisor UPDATE when status = 'placed'

-- order_items SELECT/UPDATE: extend order_is_accessible OR rely on SECURITY DEFINER RPCs for all supervisor writes
```

**Practical approach:** Supervisors use **RPCs only** (SECURITY DEFINER); add **`orders_supervisor_select`** policy:

```sql
CREATE POLICY orders_supervisor_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_supervisor(auth.uid()) AND source_event_id IS NULL);
```

Filter **`source_event_id IS NULL`** so supervisors only see **warehouse app orders**, not POS sync bills.

---

## `assert_order_item_editable` trigger — partial fit

Already enforces:

- Supervisors: **no INSERT/DELETE** on `order_items` ✓

**Verify / extend in migration:**

- Allow supervisor **UPDATE** only when `orders.status = 'placed'`
- Allow changing **`qty`** and **`variation_key`** only if `product_id` unchanged
- Block edits when status ∈ `accepted`, `loaded`, `completed`
- Add RPC **`supervisor_merge_variant_lines`** for replace-variant-merge-qty (app can also merge client-side then DELETE old line — but DELETE is blocked; **must merge via UPDATE + RPC delete** or single RPC)

**Important:** Supervisor variant merge that **removes** a line needs either:

- SECURITY DEFINER RPC that deletes duplicate variant row, or
- Relax trigger to allow supervisor DELETE when merging variants (same product_id)

---

## `order_items` table — OK with notes

| Column | Status |
|--------|--------|
| `product_id`, `variation_key`, `qty`, `cost`, `amount`, `receiving_uom` | ✓ |
| `name` | ✓ for cart display |

**Optional:** unique index for merge logic:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_items_line
  ON public.order_items (order_id, product_id, variation_key);
```

Enables upsert when merging variant lines.

---

## Outlet auth — OK

| Feature | Status |
|---------|--------|
| `outlets.auth_user_id` | ✓ outlet login |
| `member_outlet_ids(user)` | ✓ returns outlets where `auth_user_id = user` |
| Email/password login | Supabase Auth ✓ (app already uses this) |

**Optional:**

```sql
ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS uses_orders_app boolean NOT NULL DEFAULT false;
```

Backfill: `uses_orders_app = (auth_user_id IS NOT NULL AND default_receiving_warehouse_id IS NOT NULL)`.

---

## Warehouse vs POS orders — required filter

| Column | Purpose |
|--------|---------|
| `source_event_id` | Set by `sync_pos_order`; **NULL** for Android orders |

**Required:**

- `place_order` must set `source_event_id = NULL` explicitly
- All app queries: `.is('source_event_id', null)` (outlet-orders page already does this)
- Supervisor policies: same filter

---

## Storage buckets — verify in Supabase dashboard

Not in schema SQL dump; app code expects:

| Bucket | Use |
|--------|-----|
| `signatures` | PNG uploads (employee, handoff driver, delivery driver) |
| `orders` | Final PDF (`completed_pdf_path`) |

**Apply if missing:**

- Create buckets (private recommended)
- RLS: authenticated users upload to `{outlet_id}/…`; supervisors read all warehouse orders; signed URLs for PDF download

---

## Realtime / notifications

Not required in Postgres schema; enable:

```sql
-- If not already enabled for orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
```

Outlet app subscribes to `orders` UPDATE where `outlet_id` = session and `status` → `loaded`.

---

## PDF paths

Existing columns: `pdf_path`, `approved_pdf_path`, `loaded_pdf_path`, `offloaded_pdf_path`.

**Recommendation:** use **`completed_pdf_path`** (new) for final signed PDF; keep others for intermediate exports if needed.

---

## Migration checklist (apply in order)

Apply in order via Supabase SQL editor or CLI.

**Migration file:** [`supabase/migrations/20260617000000_android_orders_flow.sql`](../supabase/migrations/20260617000000_android_orders_flow.sql)

### Phase 1 — Helpers & columns

- [ ] `is_supervisor(uuid)`
- [ ] Handoff + delivery driver columns (or document column reuse)
- [ ] `accepted_at`, `accepted_by`, `completed_at`, `completed_pdf_path`
- [ ] Optional `outlets.uses_orders_app`
- [ ] Optional `ux_order_items_line` unique index

### Phase 2 — RPCs

- [ ] `accept_order` — supervisor auth, `placed` → `accepted`, fulfillment
- [ ] `dispatch_order` — supervisor auth, `accepted` → `loaded`, handoff signature
- [ ] `complete_order` — outlet auth, `loaded` → `completed`, delivery signature + PDF path
- [ ] `supervisor_merge_order_item_variant` (optional but recommended)
- [ ] Update `place_order` — force `source_event_id NULL`, `status = 'placed'`

### Phase 3 — Triggers & constraints

- [ ] Update `ensure_order_locked_and_allocated` / trigger for `accepted` (+ `completed`)
- [ ] Extend `assert_order_item_editable` — status guards + variant swap rules
- [ ] Optional `orders_status_check` CHECK (status IN (...))

### Phase 4 — RLS

- [ ] `orders_supervisor_select` (warehouse orders only)
- [ ] `order_items` select via supervisor OR keep RPC-only writes
- [ ] Storage policies for `signatures` + `orders` buckets

### Phase 5 — Data cleanup (one-time)

```sql
-- Optional: rename legacy warehouse order statuses
UPDATE public.orders SET status = 'accepted' WHERE status = 'ordered' AND source_event_id IS NULL;
UPDATE public.orders SET status = 'completed' WHERE status = 'offloaded' AND source_event_id IS NULL;
```

---

## What you can keep without change

- `orders` core columns (outlet_id, order_number, locked, signatures)
- `order_items` structure
- `next_order_number`
- `record_order_fulfillment` (call from `accept_order`)
- Outlet login via `auth_user_id` + Supabase Auth
- `signatures` / `orders` storage pattern in app code
- POS orders stay separate via `source_event_id`

---

## Summary table

| Area | Change required? |
|------|------------------|
| Status values `accepted`, `completed` | **Yes** |
| Supervisor can read all warehouse orders | **Yes** (RLS) |
| Supervisor accept / dispatch RPCs | **Yes** |
| Supervisor auth on existing approve/load RPCs | **Yes** (currently outlet-only) |
| Two driver signature legs | **Yes** (new columns or reuse) |
| `place_order` → `placed` + no POS id | **Verify / fix** |
| Fulfillment timing (accept vs load) | **Decide + update trigger** |
| Variant merge delete for supervisors | **Yes** (RPC or trigger) |
| Storage buckets + policies | **Verify in dashboard** |
| Realtime on `orders` | **Recommended** |
| Catalog / order_items columns | **No** |

---

## Related docs

- [android-orders-app-flow.md](./android-orders-app-flow.md) — UI / app behaviour
- [android-pos-deduction-requirements.md](./android-pos-deduction-requirements.md) — stock after delivery
