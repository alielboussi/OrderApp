# SCPGT (POS → Supabase Sync Windows Service)

A .NET 8 Worker Service that polls the local POS SQL Server database, posts orders to Supabase via an RPC, and marks POS rows processed. Installable as a Windows Service (visible in services.msc).

## Build
```
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```
(This produces `SCPGT.exe` in `publish/`.)

## Configure
Edit `publish/appsettings.json` per outlet:
- `PosDb.ConnectionString`: SQL Server for the POS at that outlet.
- `Outlet.Id`: Supabase outlet UUID.
- `Supabase.Url`: Supabase project URL.
- `Supabase.AnonKey`: Anonymous key (preferred if RPCs allow anon access).
- `Supabase.ServiceKey`: Service role key (optional; used if provided).
- `Sync.BatchSize`, `Sync.SourceSystem`: sync idempotency settings.

## Install as Windows Service (PowerShell as Administrator)
Quick installer script (publishes, copies, installs service, seeds config):
```
pwsh -File scripts/install-service.ps1
```
Defaults:
- Binary to `C:\Program Files\SCPGT` (configurable via `-InstallPath`)
- Config at `%ProgramData%\SCPGT` (configurable via `-ConfigRoot`)
- Publishes self-contained win-x64; use `-SkipPublish` to reuse existing `publish` folder.

Manual install (if you prefer):
```
New-Service -Name "SCPGT" -BinaryPathName "\"C:\\Program Files\\SCPGT\\SCPGT.exe\" --run-as-service --contentRoot \"%ProgramData%\\SCPGT\"" -DisplayName "SCPGT" -Description "Background sync service" -StartupType Automatic
Start-Service -Name "SCPGT"
```

To uninstall manually:
```
Stop-Service -Name "SCPGT"
sc delete SCPGT
```

## Hotkey listener
- The installer registers a hidden listener at Windows startup to show the UI when the hotkey is pressed.
- Default hotkey: Shift + `+` + Backspace.

## Deploy as a single folder
1) Run `dotnet publish -c Release -r win-x64 --self-contained true -o publish` (already done) — this produces the `publish` folder with binaries **and** the `scripts` subfolder.
2) Optionally rename the `publish` folder to `installation` (or similar) for transport to the outlet.
3) Copy that single folder to the outlet machine.
4) On the outlet, open PowerShell as Administrator, `cd` into the folder, then run:
```
pwsh -File .\scripts\install-service.ps1 -PublishOutput . -InstallPath "C:\\Program Files\\SCPGT" -ConfigRoot "%ProgramData%\\SCPGT"
```
- The script will skip rebuilding if it does not find the `.csproj` (typical on the outlet). To force no-build locally, add `-SkipPublish`.

## What to adapt
- Update the SQL queries in `PosRepository` to match your POS tables (e.g., `BillType`, `Saledetails`, payments, customers).
- Ensure the Supabase RPC `sync_pos_order` exists and enforces idempotency on `source_event_id`.
- Map POS item IDs to Supabase catalog/variant IDs inside the payload generation.

## Supabase schema alignment checklist
This service posts to the RPCs defined in Supabase Schema.sql. Before deployment, confirm:
- RPCs exist: `sync_pos_order(payload jsonb)`, `validate_pos_order(payload jsonb)`, `log_pos_sync_failure(payload jsonb)`.
- Migration `20260617100000_middleware_pos_sync_alignment.sql` applied (sync window + `uses_orders_app` guards).
- Outlet has `has_pos_middleware = true` and catalog SKUs on POS (`MenuItem.Code`).
- An **outlet stocktake period** is open in the Afterten Orders app (sets `pos_sync_opening` counter).
- For POS sale deductions: `uses_orders_app = true` and rules in `outlet_pos_deduction_rules`.
- POS orders are separate from warehouse app orders (`orders.source_event_id` set; status `synced`).

## Runtime notes
- Logs go to the Windows Service log (and console when run interactively).
- Poll interval defaults to 60s; reduce for near-real-time.
- On failure, orders are retried next poll; add a dead-letter mechanism if needed.
