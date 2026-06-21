@echo off
REM ------------------------------------------------------------------
REM Pontuacao Conclave -- iniciar servidor local (Windows)
REM
REM Sobe um servidor HTTP simples na porta 8765 (ou na proxima livre)
REM e abre o navegador apontando para http://127.0.0.1:8765/. Para parar,
REM feche esta janela do Prompt de Comando ou pressione Ctrl+C.
REM
REM Pre-requisito: Python 3 instalado.
REM ------------------------------------------------------------------

setlocal enabledelayedexpansion

REM Garante que o script roda a partir da raiz do projeto
REM (uma pasta acima de pen-drive\), independente de onde for clicado.
cd /d "%~dp0..\"

set "PORT_PRIMARIA=8765"

REM Detecta um Python 3 disponivel.
set "PY="
for %%P in (python3 python py) do (
  where %%P >nul 2>nul
  if not errorlevel 1 (
    %%P -c "import sys; sys.exit(0 if sys.version_info.major>=3 else 1)" >nul 2>nul
    if not errorlevel 1 (
      set "PY=%%P"
      goto :py_ok
    )
  )
)

echo.
echo ERRO: Python 3 nao foi encontrado neste computador.
echo.
echo Opcoes rapidas:
echo   1^) Instale Python 3 ^(https://www.python.org/downloads/^) e tente de novo.
echo   2^) Use o app via file:// ^(clique duas vezes em index.html^). Tudo funciona,
echo      mas voce precisara escolher manualmente o evento em "Mais ^> Carregar evento".
echo.
pause
exit /b 1

:py_ok

REM Procura uma porta livre a partir da primaria.
set "PORT=%PORT_PRIMARIA%"
for /L %%I in (0,1,19) do (
  set /a "CAND=%PORT_PRIMARIA%+%%I"
  netstat -ano -p TCP | findstr /R /C:":!CAND! .*LISTENING" >nul 2>nul
  if errorlevel 1 (
    set "PORT=!CAND!"
    goto :port_ok
  )
)
:port_ok

set "URL=http://127.0.0.1:%PORT%/index.html"

echo ============================================================
echo  Pontuacao Conclave -- servidor local
echo ------------------------------------------------------------
echo  URL : %URL%
echo  Pasta servida: %CD%
echo  Python      :
%PY% --version
echo ------------------------------------------------------------
echo  Para parar: feche esta janela ou pressione Ctrl+C.
echo ============================================================

REM Abre o navegador apos um pequeno delay.
start "" /B cmd /c "timeout /T 1 /NOBREAK >nul && start """" ""%URL%"""

REM Sobe o servidor (Ctrl+C derruba).
%PY% -m http.server %PORT% --bind 127.0.0.1
