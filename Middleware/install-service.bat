@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "INSTALL_PATH=C:\Program Files\UltraAutomaticScreenSaver"
set "CONFIG_ROOT=%LOCALAPPDATA%\Ultra Automatic Screen Saver"

set "PS_ARGS=-NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-service.ps1" -SourcePath "%SCRIPT_DIR%" -InstallPath "%INSTALL_PATH%" -ConfigRoot "%CONFIG_ROOT%""

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath 'powershell' -ArgumentList '%PS_ARGS%' -Verb RunAs"
  exit /b
)

powershell %PS_ARGS%
endlocal
