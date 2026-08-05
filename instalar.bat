@echo off
setlocal EnableDelayedExpansion
title Instalador NFS-e Downloader
color 0A

echo.
echo  ============================================
echo   NFS-e Downloader - Instalador
echo  ============================================
echo.

:: ── 1. Verifica Node.js ────────────────────────────────────────────────────
where node >nul 2>&1
IF ERRORLEVEL 1 (
    echo [ERRO] Node.js nao encontrado.
    echo.
    echo  Baixe e instale o Node.js em: https://nodejs.org
    echo  Versao recomendada: 20 LTS ou superior
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER% encontrado.

:: ── 2. Define pasta de instalacao ─────────────────────────────────────────
set INSTALL_DIR=%~dp0
if "%INSTALL_DIR:~-1%"=="\" set INSTALL_DIR=%INSTALL_DIR:~0,-1%
echo [OK] Pasta de instalacao: %INSTALL_DIR%

:: ── 3. Instala dependencias do backend ────────────────────────────────────
echo.
echo [..] Verificando dependencias do backend...
if not exist "%INSTALL_DIR%\api\node_modules" (
    echo [..] Instalando dependencias npm ^(aguarde^)...
    cd /d "%INSTALL_DIR%\api"
    call npm install --omit=dev
    IF ERRORLEVEL 1 (
        echo.
        echo [ERRO] npm install falhou. Verifique a conexao com a internet e tente novamente.
        pause
        exit /b 1
    )
    echo [OK] Dependencias instaladas com sucesso.
) else (
    echo [OK] Dependencias ja instaladas.
)

:: ── 4. Cria pastas e arquivos necessarios ──────────────────────────────────
if not exist "%APPDATA%\nfse-downloader\certs" (
    mkdir "%APPDATA%\nfse-downloader\certs" >nul 2>&1
    echo [OK] Pasta de certificados criada.
)

if not exist "%INSTALL_DIR%\api\config.json" (
    echo {"companies":[]} > "%INSTALL_DIR%\api\config.json"
    echo [OK] Arquivo config.json criado.
)

:: ── 5. Testa se o backend inicia corretamente ──────────────────────────────
echo.
echo [..] Testando inicializacao do backend...
cd /d "%INSTALL_DIR%\api"
node dist\server.js >"%INSTALL_DIR%\api\server.log" 2>"%INSTALL_DIR%\api\server.err" &
timeout /t 5 /nobreak >nul

netstat -ano | findstr ":3002 " | findstr "LISTENING" >nul
IF ERRORLEVEL 1 (
    echo.
    echo [ERRO] Backend nao iniciou. Erro encontrado:
    echo ─────────────────────────────────────────────
    type "%INSTALL_DIR%\api\server.err"
    echo ─────────────────────────────────────────────
    echo.
    echo  Verifique se o Node.js esta instalado corretamente
    echo  e se a pasta api\node_modules existe.
    echo.
    pause
    exit /b 1
)
echo [OK] Backend iniciando corretamente na porta 3002.

:: Para o processo de teste
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3002 " ^| findstr "LISTENING"') do (
    taskkill /pid %%p /f >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── 6. Cria VBS para iniciar backend sem janela ────────────────────────────
echo.
echo [..] Configurando inicializacao automatica...

set VBS_PATH=%INSTALL_DIR%\scripts\start-backend.vbs
if not exist "%INSTALL_DIR%\scripts" mkdir "%INSTALL_DIR%\scripts"

:: O supervisor e um arquivo versionado: tem instancia unica, registra a saida
:: em api\server.log e espera progressivamente quando o backend cai em sequencia.
:: (A versao gerada aqui dentro nao tinha nada disso e acumulava um laco por
::  execucao do instalador, todos disputando a porta 3002.)
if not exist "%VBS_PATH%" (
    echo [ERRO] Arquivo scripts\start-backend.vbs nao encontrado no pacote.
    pause
    exit /b 1
)

echo [OK] Supervisor: %VBS_PATH%

:: Encerra supervisores antigos antes de seguir, para nao empilhar instancias
taskkill /f /im wscript.exe >nul 2>&1

:: ── 7. Cria Tarefa Agendada ────────────────────────────────────────────────
schtasks /query /tn "\NFS-e\NFS-e Backend" >nul 2>&1
IF ERRORLEVEL 1 (
    schtasks /create /tn "\NFS-e\NFS-e Backend" ^
        /tr "wscript.exe \"%VBS_PATH%\"" ^
        /sc onlogon ^
        /delay 0000:10 ^
        /ru "%USERNAME%" ^
        /f >nul 2>&1
    echo [OK] Tarefa de inicializacao automatica criada.
) ELSE (
    schtasks /change /tn "\NFS-e\NFS-e Backend" ^
        /tr "wscript.exe \"%VBS_PATH%\"" >nul 2>&1
    echo [OK] Tarefa de inicializacao automatica atualizada.
)

:: ── 8. Inicia o backend em modo oculto ────────────────────────────────────
start /b "" wscript.exe "%VBS_PATH%"
timeout /t 4 /nobreak >nul

netstat -ano | findstr ":3002 " | findstr "LISTENING" >nul
IF ERRORLEVEL 1 (
    echo [AVISO] Backend demorando para responder. Aguarde 10 segundos antes de usar.
) ELSE (
    echo [OK] Backend rodando na porta 3002.
)

:: ── 9. Instrucoes para a extensao Chrome ──────────────────────────────────
echo.
echo  ============================================
echo   Instalacao concluida!
echo  ============================================
echo.
echo  Para instalar a extensao no Chrome:
echo.
echo  1. Abra o Chrome e acesse: chrome://extensions
echo  2. Ative o "Modo do desenvolvedor" (canto superior direito)
echo  3. Clique em "Carregar sem compactacao"
echo  4. Selecione a pasta: %INSTALL_DIR%\extensao
echo.
echo  O backend iniciara automaticamente toda vez
echo  que voce fizer login no Windows.
echo.
pause
