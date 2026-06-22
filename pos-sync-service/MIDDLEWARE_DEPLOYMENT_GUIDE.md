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

## Single-file deployment (EXE only)

You only need to transfer one file to outlet machines:

- `SCPGT.exe`

Installer behavior from the EXE wizard:

- auto-elevates with UAC
- installs/updates Windows service `SCPGT`
- creates config at `C:\ProgramData\SCPGT\appsettings.json`
- opens a full wizard UI with Back/Next buttons
- lets user choose install folder and config folder from folder picker
- collects required outlet + Supabase + POS DB values before install
- registers startup listener

## Outlet setup (exact order)

1. Copy only `SCPGT.exe` to the outlet machine.
2. Double-click `SCPGT.exe` to open setup wizard.
3. In wizard:
   - select **Install / Update service**
   - click **Next**
   - choose install and config folders
   - click **Next**
4. Fill required fields:
   - Outlet UUID
   - Supabase URL + anon key
   - POS SQL server/database/username/password
5. Click **Finish** to install service.
6. Grant SQL permissions once (run script SQL from HQ docs or direct SQL query pack).
7. Restart service if needed:
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
