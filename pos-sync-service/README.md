# SCPGT (POS → Firebase Sync Windows Service)

A .NET 8 Worker Service that polls the local POS SQL Server database, posts orders to Firebase/Firestore, and marks POS rows processed. Installable as a Windows Service (visible in services.msc).

## Build
```
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```
(This produces single-file `SCPGT.exe` in `publish/`.)

## Configure
Edit `publish/appsettings.json` per outlet:
- `PosDb.ConnectionString`: optional full SQL Server connection string.
- `PosDb.Server`, `PosDb.Database`, `PosDb.Username`, `PosDb.Password`: preferred explicit SQL credentials.
- `PosDb.TrustServerCertificate`, `PosDb.IntegratedSecurity`, `PosDb.Encrypt`: SQL connection behavior.
- `Outlet.Id`: outlet UUID in Firestore.
- `Firebase.ProjectId`: Firebase project ID.
- `Firebase.CredentialsPath`: path to service account JSON (or leave empty to use `GOOGLE_APPLICATION_CREDENTIALS`).
- `Sync.BatchSize`, `Sync.SourceSystem`: sync idempotency settings.

Ready-to-fill template:
- `appsettings.outlet.template.json` (copy to `%ProgramData%\SCPGT\appsettings.json` on each outlet PC).
- Website scheduling UI: `Warehouse Backoffice -> Middleware updates`.

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

## Install with EXE wizard only (no scripts/commands)
Transfer only `SCPGT.exe` to outlet machine, then double-click it.
- Opens setup wizard with **Back/Next** flow.
- Lets user choose install folder and config folder.
- Collects outlet UUID, Firebase project/credentials, and POS SQL values in UI.
- Prompts for admin (UAC), then installs/updates service and starts it.
- Auto-saves config to `%ProgramData%\SCPGT\appsettings.json`.

To uninstall with EXE:
```
SCPGT.exe --uninstall-service
```

Double-click behavior:
- Double-clicking `SCPGT.exe` opens setup wizard:
  - choose **Install / Update** or **Uninstall**
  - use Next/Back navigation
  - Finish applies action

To uninstall manually:
```
Stop-Service -Name "SCPGT"
sc delete SCPGT
```

## Hotkey listener
- The installer registers a hidden listener at Windows startup to show the UI when the hotkey is pressed.
- Default hotkey: Shift + `A` + `1` + `0`.
- UI is status-only (no sync/close buttons). Use the **Minimize** button to hide; press the hotkey to show it again.

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
- Ensure Firestore sync enforces idempotency on `source_event_id`.
- Map POS item IDs to catalog/variant IDs inside the payload generation.

## Firebase alignment checklist
Before deployment, confirm:
- Outlet has `has_pos_middleware = true` and catalog SKUs on POS (`MenuItem.Code`).
- Service account JSON has Firestore read/write access for the outlet.
- POS orders are separate from warehouse app orders (`orders.source_event_id` set; status `synced`).

## Runtime notes
- Logs go to the Windows Service log (and console when run interactively).
- Poll interval defaults to 60s; reduce for near-real-time.
- On failure, orders are retried next poll; add a dead-letter mechanism if needed.
