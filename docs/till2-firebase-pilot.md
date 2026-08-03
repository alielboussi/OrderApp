# Till 2 Firebase pilot

Outlet ID: `a655b0a1-a37a-43d6-aa55-7f97377b2660`  
Sales API: `https://<portal>/api/outlet-middleware-sales/tills`  
Firebase project: `afterten-portal-system`

Till 1 stays on Supabase during the pilot. Only Till 2 writes new sales to Firestore.

---

## HQ (do first)

### 1. Seed Till 2 in Firestore

```powershell
cd C:\Projects\Afterten\firebase

# Pull warehouse UUIDs from Supabase
node scripts/sync-outlet-warehouse-ids-from-supabase.cjs

# Create outlet + heartbeat + counter docs
node scripts/seed-outlets.cjs
```

### 2. Build SCPGT (if exe is outdated)

```powershell
cd C:\Projects\Afterten\pos-sync-service
dotnet publish -c Release
# Output: publish\SCPGT.exe
```

### 3. Prepare files for Till 2 PC

Copy to USB / RDP:

| File | Purpose |
|------|---------|
| `publish\SCPGT.exe` | Middleware (latest build) |
| `secrets\afterten-firebase-adminsdk.json` | Firebase Admin credentials |
| `pos-sync-service\appsettings.till2.firebase.template.json` | Config template |

---

## On the Till 2 PC

### 4. Stop the service

```powershell
Stop-Service SCPGT
```

### 5. Copy Firebase credentials

```powershell
New-Item -ItemType Directory -Force C:\ProgramData\SCPGT
Copy-Item "\\path\to\afterten-firebase-adminsdk.json" "C:\ProgramData\SCPGT\afterten-firebase-adminsdk.json"
```

### 6. Update `C:\ProgramData\SCPGT\appsettings.json`

Use `appsettings.till2.firebase.template.json` as base. Set:

```json
{
  "PosDb": {
    "Server": "<Till 2 SQL Server hostname>",
    "Database": "MINTPOS",
    "Username": "<mintpos sql user>",
    "Password": "<password>",
    "TrustServerCertificate": true,
    "IntegratedSecurity": false,
    "Encrypt": false
  },
  "Outlet": {
    "Id": "a655b0a1-a37a-43d6-aa55-7f97377b2660"
  },
  "Cloud": {
    "Backend": "Firebase"
  },
  "Firebase": {
    "ProjectId": "afterten-portal-system",
    "CredentialsPath": "C:\\ProgramData\\SCPGT\\afterten-firebase-adminsdk.json"
  },
  "Sync": {
    "PollSeconds": 60,
    "BatchSize": 200,
    "MaxBatchesPerCycle": 50,
    "ReclaimProcessedLookbackDays": 3,
    "ReclaimProcessedBatchSize": 400,
    "BlockOnSaleSyncFailure": true,
    "SaleSyncFailureRetries": 2,
    "SaleSyncFailureRetryDelayMs": 500,
    "SourceSystem": "afterten-pos",
    "IncludeProcessed": false,
    "PosCatalogSyncMinutes": 5
  }
}
```

**Remove** the `Supabase` section (not needed on Firebase backend).

Keep existing `PosDb` values from the current Till 2 config — only change `Cloud`, `Firebase`, and `Outlet.Id` if needed.

### 7. Start the service

```powershell
Start-Service SCPGT
Get-EventLog -LogName Application -Source SCPGT -Newest 20
```

Look for: `Firebase Firestore initialized for project afterten-portal-system`

### 8. Test one sale

1. Ring a test sale on Till 2 POS
2. Wait ~60 seconds (poll interval)
3. Check Firestore: `pos_sales/a655b0a1-a37a-43d6-aa55-7f97377b2660/bills`
4. Check portal (Firebase mode): Middleware heartbeat + POS sync failures pages

---

## Parallel validation (2 weeks)

Compare Till 2 bill counts:

| Source | Where |
|--------|-------|
| MintPOS | Pending queue should drain |
| Supabase | Should **stop** receiving new Till 2 sales |
| Firestore | `pos_sales/.../bills` count should grow |
| Portal | `/api/outlet-middleware-sales/tills?outlet_id=a655b0a1-...` |

---

## Rollback

```powershell
Stop-Service SCPGT
# Restore previous appsettings.json (Cloud.Backend = Supabase)
Start-Service SCPGT
```

Till 2 sales resume to Supabase. Firestore bills from pilot remain but won't update.

---

## Notes

- Installer wizard still asks for Supabase — edit `appsettings.json` manually for Firebase cutover.
- Catalog push from portal works on Firebase; test after cutover.
