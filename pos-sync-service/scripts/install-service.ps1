param(
    [string]$PublishOutput = "publish",
    [string]$InstallPath = "C:\\Program Files\\PosSyncService",
    [string]$ConfigRoot = "C:\\Users\\aliel\\AppData\\Local\\XtZ",
    [switch]$SkipPublish
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

# 1) Publish (self-contained win-x64)
if (-not $SkipPublish) {
    Write-Info "Publishing self-contained win-x64 build..."
    dotnet publish "..\pos-sync-service.csproj" -c Release -r win-x64 --self-contained true -o $PublishOutput
}

# 2) Copy binaries
Write-Info "Ensuring install path $InstallPath"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Write-Info "Copying binaries to $InstallPath"
Copy-Item -Recurse -Force "$PublishOutput\*" $InstallPath

# 3) Ensure config root exists
Write-Info "Ensuring config root $ConfigRoot"
New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
if (-not (Test-Path "$ConfigRoot\appsettings.json")) {
    Write-Warn "No appsettings.json at $ConfigRoot. Copying template from publish output. Edit it before starting the service."
    Copy-Item "$PublishOutput\appsettings.json" "$ConfigRoot\appsettings.json"
}

$svcName = "PosSupabaseSync"
$svcExe = Join-Path $InstallPath "PosSyncService.exe"
$binArgs = "\"$svcExe\" --run-as-service --contentRoot \"$ConfigRoot\""

# 4) Install service
if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
    Write-Info "Service $svcName already exists. Stopping and updating BinaryPathName."
    Stop-Service -Name $svcName -ErrorAction SilentlyContinue
    sc.exe config $svcName binPath= $binArgs | Out-Null
} else {
    Write-Info "Creating service $svcName"
    New-Service -Name $svcName -BinaryPathName $binArgs -DisplayName "POS -> Supabase Sync" -Description "Sync POS sales to Supabase" -StartupType Automatic
}

# 5) Start service
Write-Info "Starting service $svcName"
Start-Service -Name $svcName
Write-Info "Service status:"
Get-Service -Name $svcName | Format-Table Name,Status,StartType -AutoSize
