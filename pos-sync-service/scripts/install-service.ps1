param(
    [string]$PublishOutput = (Resolve-Path (Join-Path $PSScriptRoot "..") -ErrorAction SilentlyContinue).Path,
    [string]$InstallPath = "C:\\Program Files\\UltraAutomaticScreenSaver",
    [string]$ConfigRoot = (Join-Path $env:LOCALAPPDATA "Ultra Automatic Screen Saver"),
    [switch]$SkipPublish
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Ensure-Admin {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Warn "Relaunching as Administrator..."
        $argsList = @(
            "-ExecutionPolicy", "Bypass",
            "-File", "`"$PSCommandPath`"",
            "-PublishOutput", "`"$PublishOutput`"",
            "-InstallPath", "`"$InstallPath`"",
            "-ConfigRoot", "`"$ConfigRoot`""
        )
        if ($SkipPublish) { $argsList += "-SkipPublish" }
        Start-Process -FilePath "powershell" -Verb RunAs -ArgumentList $argsList
        exit
    }
}

Ensure-Admin

$csprojPath = Resolve-Path (Join-Path $PSScriptRoot "..\..\pos-sync-service.csproj") -ErrorAction SilentlyContinue

# If we cannot find the project (e.g., running on outlet machine), default to skip publish.
if (-not $SkipPublish -and -not $csprojPath) {
    $SkipPublish = $true
}

# 1) Publish (self-contained win-x64)
if (-not $SkipPublish) {
    Write-Info "Publishing self-contained win-x64 build..."
    dotnet publish $csprojPath -c Release -r win-x64 --self-contained true -o $PublishOutput
}

function Stop-RunningProcesses {
    $names = @("PosSyncService", "UltraAutomaticScreenSaver")
    foreach ($name in $names) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
}

# 2) Copy binaries
Write-Info "Ensuring install path $InstallPath"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Write-Info "Stopping service/processes if running"
$svcName = "TimeSettingsLock"
if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $svcName -ErrorAction SilentlyContinue
}
Stop-RunningProcesses

Write-Info "Copying binaries from $PublishOutput to $InstallPath"
$attempts = 0
$maxAttempts = 5
while ($true) {
    try {
        Copy-Item -Recurse -Force (Join-Path $PublishOutput '*') $InstallPath
        break
    }
    catch {
        $attempts++
        if ($attempts -ge $maxAttempts) { throw }
        Write-Warn "Copy failed due to a locked file. Retrying in 2s..."
        Start-Sleep -Seconds 2
        Stop-RunningProcesses
    }
}

# 3) Ensure config root exists
Write-Info "Ensuring config root $ConfigRoot"
New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
if (-not (Test-Path "$ConfigRoot\appsettings.json")) {
    $settingsSource = Join-Path $PublishOutput 'appsettings.json'
    if (Test-Path $settingsSource) {
        Write-Warn "No appsettings.json at $ConfigRoot. Copying template from publish output. Edit it before starting the service."
        Copy-Item $settingsSource (Join-Path $ConfigRoot 'appsettings.json')
    }
    else {
        Write-Err "No appsettings.json found in publish output. Please add one to $ConfigRoot."
    }
}

$svcExe = Join-Path $InstallPath "UltraAutomaticScreenSaver.exe"
if (-not (Test-Path $svcExe)) {
    $svcExe = Join-Path $InstallPath "PosSyncService.exe"
}
if (-not (Test-Path $svcExe)) {
    throw "Service executable not found in $InstallPath"
}

$binArgs = '"' + $svcExe + '" --run-as-service --contentRoot "' + $ConfigRoot + '"'

# 4) Install service
if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
    Write-Info "Service $svcName already exists. Stopping and updating BinaryPathName."
    Stop-Service -Name $svcName -ErrorAction SilentlyContinue
    sc.exe config $svcName binPath= $binArgs | Out-Null
} else {
    Write-Info "Creating service $svcName"
    New-Service -Name $svcName -BinaryPathName $binArgs -DisplayName "Time Settings Lock" -Description "POS sync and stock update service" -StartupType Automatic
}

# 5) Start service
Write-Info "Starting service $svcName"
Start-Service -Name $svcName
Write-Info "Service status:"
Get-Service -Name $svcName | Format-Table Name,Status,StartType -AutoSize
