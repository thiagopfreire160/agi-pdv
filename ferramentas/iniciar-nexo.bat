@echo off
title NEXO PDV
cd /d "%~dp0.."
echo Ligando o banco de dados em outra janela...
start "NEXO PDV - banco de dados (deixe aberta)" cmd /k npm run db:local
timeout /t 10 /nobreak >nul
call npm run db:migrar
echo.
echo Ligando o NEXO PDV. Deixe esta janela aberta enquanto a loja estiver funcionando.
echo Neste computador: http://localhost:3333
call npm run loja
pause
