@echo off
title NEXO PDV
cd /d "%~dp0.."
echo Ligando o banco de dados...
call npm run db:up
echo Ligando o NEXO PDV. Deixe esta janela aberta enquanto a loja estiver funcionando.
echo Neste computador: http://localhost:3333
call npm run iniciar
pause
