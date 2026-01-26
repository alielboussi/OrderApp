@echo off
setlocal EnableExtensions

rem Base folder is the parent of this scripts folder
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "BASE_DIR=%%~fI"

set "INSTALL_PATH=C:\Program Files\UltraAutomaticScreenSaver"
set "CONFIG_ROOT=%LOCALAPPDATA%\Ultra Automatic Screen Saver"

set "PS_SCRIPT=%BASE_DIR%\scripts\install-service.ps1"
set "PS_ARGS=-NoProfile -ExecutionPolicy Bypass -File \"%PS_SCRIPT%\" -PublishOutput \"%BASE_DIR%\" -InstallPath \"%INSTALL_PATH%\" -ConfigRoot \"%CONFIG_ROOT%\""

rem Elevate to admin if needed
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath 'powershell' -ArgumentList '%PS_ARGS%' -Verb RunAs"
  exit /b
)

powershell %PS_ARGS%
endlocal
