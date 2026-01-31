@echo off
set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process PowerShell -Verb RunAs -ArgumentList '-ExecutionPolicy','Bypass','-File','%ROOT%scripts\install-service.ps1','-PublishOutput','%ROOT%','-InstallPath','C:\Program Files\UltraAutomaticScreenSaver','-ConfigRoot','%ProgramData%\Ultra Automatic Screen Saver'"
