# Firestore → Supabase migration (zero data loss)

Full transfer plan: export every Firestore document → import into Supabase `firestore_mirror` → normalize into proper Postgres tables → switch portal to Supabase.

## Prerequisites

1. **Supabase project** — your existing project URL + service role key in `afterten-website-portal/.env.local`:
   ```
   SUPABASE_URL=https://....supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   CLOUD_BACKEND=supabase
   ```

2. **Firebase service account** still readable (for export):
   ```
   FIREBASE_CREDENTIALS_PATH=C:\Projects\Afterten\secrets\afterten-firebase-adminsdk.json
   ```

3. Install portal dependency:
   ```powershell
   cd C:\Projects\Afterten\afterten-website-portal
   npm install
   ```

## Step 1 — Create mirror tables in Supabase

Open **Supabase → SQL Editor** and run:

`supabase/migrations/20260830100000_firestore_mirror.sql`

This creates `firestore_mirror.documents` — every Firestore doc lands here as JSON (no loss).

## Step 2 — Export all Firestore data

```powershell
cd C:\Projects\Afterten
node firebase/scripts/export-firestore-full.cjs
```

Output:
- `exports/firestore/latest/documents.json`
- `exports/firestore/latest/manifest.json`

Re-run anytime; use `--out exports/firestore/backup-YYYY-MM-DD` for dated backups.

## Step 3 — Import into Supabase

```powershell
node firebase/scripts/import-firestore-to-supabase.cjs
```

Uses upsert on `(collection_path, document_id)` — safe to re-run.

## Step 4 — Verify counts

```powershell
node firebase/scripts/inspect-supabase.cjs
node firebase/scripts/inspect-supabase.cjs --collection transfer_orders
```

Compare `manifest.json` document_count with `firestore_mirror` total.

## Step 5 — Agent / portal can read Supabase (like Firestore)

**CLI inspect:**
```powershell
node firebase/scripts/inspect-supabase.cjs
```

**HTTP inspect (local dev):**
```
GET http://localhost:3000/api/migration/supabase-mirror?collection=transfer_orders&limit=10
```

**Code (server-side):**
- `afterten-website-portal/src/lib/supabase-server.ts`
- `listFirestoreMirrorDocuments()`, `countFirestoreMirrorDocuments()`

## Step 6 — Normalize into real tables (next phase)

After mirror import is verified:

1. Map `firestore_mirror.documents` → existing `public` tables (`catalog_items`, `transfer_orders`, etc.)
2. Rewire portal APIs from `getFirestoreDb()` → `getSupabaseAdmin()`
3. Point Orders app at portal APIs (not Firestore client)
4. Set `CLOUD_BACKEND=supabase` on Vercel
5. Abandon Firebase project (do not re-enable billing)

## Collections exported

Root collections (auto-discovered) plus subcollections:

| Path | Notes |
|------|--------|
| `transfer_orders` | + `items` subcollection |
| `outlet_damage_reports` | + `lines` subcollection |
| `pos_sales/{outletId}/bills` | + `lines` subcollection |
| All other root collections | `catalog_items`, `outlets`, `app_users`, etc. |

## Rules

- **Never** skip the mirror step — it is the zero-loss backup.
- Keep `exports/firestore/` backups until Supabase is live for 30+ days.
- Do not delete Firebase until mirror counts match manifest.
