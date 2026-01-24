# Ultra Automatic Screen Saver (POS → Supabase Sync Windows Service)

A .NET 8 Worker Service that polls the local POS SQL Server database, posts orders to Supabase via an RPC, and marks POS rows processed. Installable as a Windows Service (visible in services.msc).

## Build
```
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```
(This produces `UltraAutomaticScreenSaver.exe` in `publish/`.)

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
- Binary to `C:\Program Files\UltraAutomaticScreenSaver` (configurable via `-InstallPath`)
- Config at `%LOCALAPPDATA%\Ultra Automatic Screen Saver` (configurable via `-ConfigRoot`)
- Publishes self-contained win-x64; use `-SkipPublish` to reuse existing `publish` folder.

Manual install (if you prefer):
```
New-Service -Name "UltraAutomaticScreenSaver" -BinaryPathName "\"C:\\Program Files\\UltraAutomaticScreenSaver\\UltraAutomaticScreenSaver.exe\" --run-as-service --contentRoot \"%LOCALAPPDATA%\\Ultra Automatic Screen Saver\"" -DisplayName "Ultra Automatic Screen Saver" -Description "POS sync and stock update service" -StartupType Automatic
Start-Service -Name "UltraAutomaticScreenSaver"
```

To uninstall manually:
```
Stop-Service -Name "UltraAutomaticScreenSaver"
sc delete UltraAutomaticScreenSaver
```

## Quick status UI
- Double-click `UltraAutomaticScreenSaver.exe` (no arguments) to run a hidden-on-demand status UI: it performs one immediate sync pass and prints the last five processed sales, then exits.
- To call it explicitly, run `UltraAutomaticScreenSaver.exe --status-ui`.
- If your config lives outside the executable directory, add `--contentRoot "C:\\Users\\<you>\\AppData\\Local\\XtZ"` so the app picks up `appsettings.json` from that folder.

## Deploy as a single folder
1) Run `dotnet publish -c Release -r win-x64 --self-contained true -o publish` (already done) — this produces the `publish` folder with binaries **and** the `scripts` subfolder.
2) Optionally rename the `publish` folder to `installation` (or similar) for transport to the outlet.
3) Copy that single folder to the outlet machine.
4) On the outlet, open PowerShell as Administrator, `cd` into the folder, then run:
```
pwsh -File .\scripts\install-service.ps1 -PublishOutput . -InstallPath "C:\\Program Files\\UltraAutomaticScreenSaver" -ConfigRoot "%LOCALAPPDATA%\\Ultra Automatic Screen Saver"
```
- The script will skip rebuilding if it does not find the `.csproj` (typical on the outlet). To force no-build locally, add `-SkipPublish`.

## What to adapt
- Update the SQL queries in `PosRepository` to match your POS tables (e.g., `BillType`, `Saledetails`, payments, customers).
- Ensure the Supabase RPC `sync_pos_order` exists and enforces idempotency on `source_event_id`.
- Map POS item IDs to Supabase catalog/variant IDs inside the payload generation.

## Supabase schema alignment checklist
This service posts to the RPCs defined in Supabase Schema.sql. Before deployment, confirm:
- RPCs exist: `sync_pos_order(payload jsonb)`, `validate_pos_order(payload jsonb)`, `log_pos_sync_failure(payload jsonb)`.
- `pos_item_map` is populated for the outlet (pos_item_id → catalog_item_id, catalog_variant_key, warehouse_id).
- `outlet_item_routes` and `outlet_warehouses` are set so each routed item/variant resolves to a warehouse.
- `outlets.deduct_on_pos_sale` is true (or per-route `deduct_enabled` is true) for deduction testing.
- An open stock period exists for the warehouse used for deduction (required by validation).
- Items in POS are mapped to catalog items that exist in `catalog_items` and the variant keys are valid.

## Runtime notes
- Logs go to the Windows Service log (and console when run interactively).
- Poll interval defaults to 60s; reduce for near-real-time.
- On failure, orders are retried next poll; add a dead-letter mechanism if needed.
