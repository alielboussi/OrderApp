@echo off
setlocal EnableExtensions
set "LOG_FILE=%~dp0install-service.log"
echo [INFO] Starting installer at %date% %time% > "%LOG_FILE%"

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "INSTALL_PATH=C:\Program Files\UltraAutomaticScreenSaver"
set "CONFIG_ROOT=%LOCALAPPDATA%\Ultra Automatic Screen Saver"

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%SCRIPT_DIR%\install-service.ps1"" -SourcePath ""%SCRIPT_DIR%"" -InstallPath ""%INSTALL_PATH%"" -ConfigRoot ""%CONFIG_ROOT%""' -Verb RunAs -Wait"
  exit /b
)

rem Stop and delete existing service if present
sc.exe stop UltraAutomaticScreenSaver >nul 2>&1
sc.exe delete UltraAutomaticScreenSaver >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\install-service.ps1" -SourcePath "%SCRIPT_DIR%" -InstallPath "%INSTALL_PATH%" -ConfigRoot "%CONFIG_ROOT%" >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Installer failed. See %LOG_FILE% for details.
  pause
  exit /b 1
)
echo [INFO] Installer completed. See %LOG_FILE% for details.
pause
endlocal
