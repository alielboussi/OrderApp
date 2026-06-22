# SCPGT Middleware Deployment Guide

This guide is for deploying the Afterten POS middleware (`SCPGT.exe`) to outlet machines.

## What the middleware does

- Syncs POS sales from local MintPOS SQL to Supabase.
- Marks successful POS rows as `Processed` so only pending/unprocessed rows continue syncing.
- Sends heartbeat/status to Supabase for outlet middleware monitoring.
- Pulls and applies catalog sync events from Supabase:
  - item price updates
  - new items
  - new variants
  - scheduled updates
  - delete commands (with required delete order for SaleDetails -> ModifierFlavour/MenuItem)
- Runs POS -> Supabase SKU/name catalog sync (automatic interval + on-demand event trigger).
- Runs as a Windows Service (`SCPGT`) with startup listener and hotkey UI.

## Publish output to deploy

Use this folder:

- `C:\Projects\Afterten Orders App\pos-sync-service\publish`

It must contain:

- `SCPGT.exe`
- `scripts\install-service.bat`
- `scripts\install-service.ps1`
- `scripts\POS_SQL_Permissions.sql`

## Outlet setup (exact order)

1. Copy the full `publish` folder to the outlet machine.
2. Run `scripts\install-service.bat` as Administrator.
3. Open `C:\ProgramData\SCPGT\appsettings.json`.
4. Fill outlet-specific settings:
   - `Outlet.Id` = outlet UUID from Supabase `outlets.id`
   - `Supabase.Url` = your Supabase project URL
   - `Supabase.AnonKey` = anon key
   - `Supabase.ServiceKey` = service role key
   - `PosDb.Server`, `PosDb.Database`, `PosDb.Username`, `PosDb.Password`
5. In SQL Server, execute `scripts\POS_SQL_Permissions.sql` for the POS DB user.
6. Restart service:
   - `Restart-Service SCPGT`
   - `Get-Service SCPGT` (must be `Running`)

## Required appsettings.json shape

```json
{
  "PosDb": {
    "ConnectionString": "",
    "Server": "localhost",
    "Database": "MINTPOS",
    "Username": "mint",
    "Password": "CHANGE_ME",
    "TrustServerCertificate": true,
    "IntegratedSecurity": false,
    "Encrypt": false
  },
  "Outlet": {
    "Id": "00000000-0000-0000-0000-000000000000"
  },
  "Supabase": {
    "Url": "https://YOUR-PROJECT.supabase.co",
    "AnonKey": "SUPABASE_ANON_KEY",
    "ServiceKey": "SUPABASE_SERVICE_ROLE_KEY"
  },
  "Sync": {
    "PollSeconds": 60,
    "BatchSize": 50,
    "SourceSystem": "afterten-pos",
    "IncludeProcessed": false,
    "PosCatalogSyncMinutes": 30
  }
}
```

## Sales API link (website)

Middleware-synced sales API endpoint:

- `https://<your-website-domain>/api/outlet-middleware-sales`

Local dev example:

- `http://localhost:3000/api/outlet-middleware-sales`

## Post-deploy validation (sale test)

1. Confirm Supabase migration is applied:
   - `supabase/migrations/20260622113000_sync_pos_catalog_from_middleware.sql`
2. In backoffice dashboard, click **Sync POS catalog now**.
3. Make one sale in POS.
4. Wait one poll cycle (default 60s).
5. Check:
   - POS rows now show `uploadStatus = 'Processed'`
   - Supabase `outlet_sales` has the sale
   - API returns the sale via `/api/outlet-middleware-sales`

## Troubleshooting quick checks

- Service not running:
  - `Get-Service SCPGT`
  - `Start-Service SCPGT`
- Config issue:
  - verify `C:\ProgramData\SCPGT\appsettings.json` values
- DB permission issue:
  - rerun `scripts\POS_SQL_Permissions.sql`
- Sales not moving:
  - check outlet has middleware enabled in Supabase
  - confirm stocktake/sync window state in backoffice
  - ensure `Sync.IncludeProcessed` remains `false` for normal operation
