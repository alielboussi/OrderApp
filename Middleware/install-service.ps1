param(
    [string]$SourcePath = $PSScriptRoot,
    [string]$InstallPath = "C:\Program Files\UltraAutomaticScreenSaver",
    [string]$ConfigRoot = (Join-Path $env:LOCALAPPDATA "Ultra Automatic Screen Saver")
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

$svcName = "UltraAutomaticScreenSaver"
$svcExeName = "UltraAutomaticScreenSaver.exe"
$svcExe = Join-Path $InstallPath $svcExeName

# 1) Copy binaries
Write-Info "Ensuring install path $InstallPath"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Write-Info "Copying binaries from $SourcePath to $InstallPath"
Copy-Item -Recurse -Force (Join-Path $SourcePath '*') $InstallPath

# 2) Ensure config root exists
Write-Info "Ensuring config root $ConfigRoot"
New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
if (-not (Test-Path "$ConfigRoot\appsettings.json")) {
    Write-Warn "No appsettings.json at $ConfigRoot. Copying template. Edit it before starting the service."
    Copy-Item (Join-Path $SourcePath 'appsettings.template.json') (Join-Path $ConfigRoot 'appsettings.json')
}

$binArgs = '"' + $svcExe + '" --run-as-service --contentRoot "' + $ConfigRoot + '"'

# 3) Install service
if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
    Write-Info "Service $svcName already exists. Stopping and updating BinaryPathName."
    Stop-Service -Name $svcName -ErrorAction SilentlyContinue
    sc.exe config $svcName binPath= $binArgs | Out-Null
} else {
    Write-Info "Creating service $svcName"
    New-Service -Name $svcName -BinaryPathName $binArgs -DisplayName "Ultra Automatic Screen Saver" -Description "POS sync and stock update service" -StartupType Automatic
}

# 4) Start service
Write-Info "Starting service $svcName"
Start-Service -Name $svcName
Write-Info "Service status:"
Get-Service -Name $svcName | Format-Table Name,Status,StartType -AutoSize
