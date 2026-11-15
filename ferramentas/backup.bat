@echo off
cd /d "%~dp0.."
if not exist backups mkdir backups
echo ==== %date% %time% >> backups\backup.log
call npm run backup >> backups\backup.log 2>&1
