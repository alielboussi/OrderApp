@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "BASE_DIR=%%~fI"

set "INSTALL_PATH=C:\Program Files\SCPGT"
set "CONFIG_ROOT=%ProgramData%\SCPGT"
set "EXE=%BASE_DIR%\SCPGT.exe"

if not exist "%EXE%" (
  echo [ERROR] "%EXE%" not found.
  echo Run this from the publish folder where SCPGT.exe exists.
  exit /b 1
)

"%EXE%" --install-service --installPath "%INSTALL_PATH%" --configRoot "%CONFIG_ROOT%"
if %errorlevel% neq 0 (
  echo [ERROR] Installation failed.
  exit /b %errorlevel%
)
echo [OK] SCPGT installed and started.
endlocal
