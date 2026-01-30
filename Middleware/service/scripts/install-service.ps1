param(
    [string]$PublishOutput = (Resolve-Path (Join-Path $PSScriptRoot "..") -ErrorAction SilentlyContinue).Path,
    [string]$InstallPath = "C:\\Program Files\\UltraAutomaticScreenSaver",
    [string]$ConfigRoot = (Join-Path $env:LOCALAPPDATA "Ultra Automatic Screen Saver"),
    [switch]$SkipPublish
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

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

# 2) Copy binaries
Write-Info "Ensuring install path $InstallPath"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Write-Info "Copying binaries from $PublishOutput to $InstallPath"
Copy-Item -Recurse -Force (Join-Path $PublishOutput '*') $InstallPath

# 3) Ensure config root exists
Write-Info "Ensuring config root $ConfigRoot"
New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
if (-not (Test-Path "$ConfigRoot\appsettings.json")) {
    Write-Warn "No appsettings.json at $ConfigRoot. Copying template from publish output. Edit it before starting the service."
    Copy-Item (Join-Path $PublishOutput 'appsettings.json') (Join-Path $ConfigRoot 'appsettings.json')
}

$svcName = "UltraAutomaticScreenSaver"
$svcExe = Join-Path $InstallPath "UltraAutomaticScreenSaver.exe"
$binArgs = '"' + $svcExe + '" --run-as-service --contentRoot "' + $ConfigRoot + '"'

# 4) Install service
if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
    Write-Info "Service $svcName already exists. Stopping and updating BinaryPathName."
    Stop-Service -Name $svcName -ErrorAction SilentlyContinue
    sc.exe config $svcName binPath= $binArgs | Out-Null
} else {
    Write-Info "Creating service $svcName"
    New-Service -Name $svcName -BinaryPathName $binArgs -DisplayName "Ultra Automatic Screen Saver" -Description "POS sync and stock update service" -StartupType Automatic
}

# 5) Start service
Write-Info "Starting service $svcName"
Start-Service -Name $svcName
Write-Info "Service status:"
Get-Service -Name $svcName | Format-Table Name,Status,StartType -AutoSize
