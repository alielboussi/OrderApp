# POS → Supabase Sync Windows Service

A .NET 8 Worker Service that polls the local POS SQL Server database, posts orders to Supabase via an RPC, and marks POS rows processed. Installable as a Windows Service (visible in services.msc).

## Build
```
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```
(This produces `PosSyncService.exe` in `publish/`.)

## Configure
Edit `publish/appsettings.json` per outlet:
- `PosDb.ConnectionString`: SQL Server for the POS at that outlet.
- `Outlet.Id`: Supabase outlet UUID.
- `Supabase.Url`: Supabase project URL.
- `Supabase.ServiceKey`: Service role key (or a restricted key for RPC execution).
- `Sync.PollSeconds`, `Sync.BatchSize`, `Sync.SourceSystem`: polling and idempotency settings.

## Install as Windows Service (PowerShell as Administrator)
Quick installer script (publishes, copies, installs service, seeds config):
```
pwsh -File scripts/install-service.ps1
```
Defaults:
- Binary to `C:\Program Files\PosSupabaseSync` (configurable via `-InstallPath`)
- Config at `C:\Users\aliel\AppData\Local\XtZ` (configurable via `-ConfigRoot`)
- Publishes self-contained win-x64; use `-SkipPublish` to reuse existing `publish` folder.

Manual install (if you prefer):
```
New-Service -Name "PosSupabaseSync" -BinaryPathName "\"C:\\Program Files\\PosSyncService\\PosSyncService.exe\" --run-as-service --contentRoot \"C:\\Users\\aliel\\AppData\\Local\\XtZ\"" -DisplayName "POS → Supabase Sync" -Description "Sync POS sales to Supabase" -StartupType Automatic
Start-Service -Name "PosSupabaseSync"
```

To uninstall manually:
```
Stop-Service -Name "PosSupabaseSync"
sc delete PosSupabaseSync
```

## What to adapt
- Update the SQL queries in `PosRepository` to match your POS tables (e.g., `BillType`, `Saledetails`, payments, customers).
- Ensure the Supabase RPC `sync_pos_order` exists and enforces idempotency on `source_event_id`.
- Map POS item IDs to Supabase catalog/variant IDs inside the payload generation.

## Runtime notes
- Logs go to the Windows Service log (and console when run interactively).
- Poll interval defaults to 60s; reduce for near-real-time.
- On failure, orders are retried next poll; add a dead-letter mechanism if needed.
