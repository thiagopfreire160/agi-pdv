@echo off
rem Cria uma tarefa no Agendador do Windows que faz o backup todo dia as 22h.
rem Para mudar o horario, troque 22:00 abaixo e rode este arquivo de novo.
schtasks /Create /F /SC DAILY /ST 22:00 /TN "agi pdv - Backup diario" /TR "\"%~dp0backup.bat\""
if %errorlevel%==0 (
  echo Pronto. O backup vai rodar todo dia as 22h e fica na pasta backups.
  echo O computador precisa estar ligado e o Docker Desktop aberto nesse horario.
) else (
  echo Nao foi possivel agendar. Clique com o botao direito neste arquivo e escolha "Executar como administrador".
)
pause
