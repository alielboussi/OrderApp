# Supabase maintenance scripts

## Security migration

Apply [`../../migrations/20260725_supabase_advisor_security_fixes.sql`](../../migrations/20260725_supabase_advisor_security_fixes.sql) in the SQL Editor to resolve Supabase advisor warnings (RLS, RPC grants, duplicate indexes).

After running, manually in the dashboard:

- **Auth** → enable leaked password protection
- **Storage** → `Transfers` bucket → disable public listing if not needed

If advisor still lists **"Public Can Execute SECURITY DEFINER Function"**, run  
[`02_revoke_anon_function_execute.sql`](02_revoke_anon_function_execute.sql) — Supabase grants `anon` by default; revoking `PUBLIC` alone is not enough.

**RLS + performance follow-up:** [`04_advisor_rls_and_indexes.sql`](04_advisor_rls_and_indexes.sql)

**More FK indexes:** [`05_advisor_fk_indexes.sql`](05_advisor_fk_indexes.sql) — run after `04`; does not drop indexes.

**Allowlist duplicate indexes:** [`06_dedupe_allowlist_indexes.sql`](06_dedupe_allowlist_indexes.sql) — run if advisor shows duplicate on `outlet_catalog_allowlist`.

## `01_pg_cron_pos_sync_failures.sql`

Auto-deletes `pos_sync_failures` rows older than **30 days**.

### Setup (once)

1. Supabase Dashboard → **Database** → **Extensions** → enable **pg_cron**
2. **SQL Editor** → paste and run `01_pg_cron_pos_sync_failures.sql`
3. Run the one-time purge (if you have a large backlog from an outage):

```sql
SELECT public.maintenance_purge_old_pos_sync_failures(30) AS deleted_rows;
```

### Schedule

- **Daily** at **03:00 EAT** (00:00 UTC)
- Job name: `purge-pos-sync-failures-30d`

### Verify

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
```

```sql
SELECT start_time, status, return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 5;
```

### What is NOT deleted

- `outlet_sales` (actual sale lines)
- `orders` (bill headers)

Only POS sync **error logs** in `pos_sync_failures`.
