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

:: ── 2b. Encerra instancia anterior ────────────────────────────────────────
:: Numa atualizacao, o supervisor antigo continuaria segurando a porta 3002 e
:: servindo o codigo velho. Encerra so os processos deste app.
echo.
echo [..] Encerrando instancia anterior, se houver...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='wscript.exe'\" | Where-Object { $_.CommandLine -like '*start-backend.vbs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*api\\dist\\server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 3 /nobreak >nul
echo [OK] Instancia anterior encerrada.

:: ── 3. Instala dependencias do backend ────────────────────────────────────
:: Roda sempre: numa atualizacao a pasta node_modules ja existe, mas pode estar
:: sem as dependencias novas (foi assim que o 'qrcode' faltou numa atualizacao).
:: O npm nao rebaixa nada quando ja esta tudo instalado.
echo.
echo [..] Instalando/atualizando dependencias npm ^(aguarde^)...
cd /d "%INSTALL_DIR%\api"
call npm install --omit=dev
IF ERRORLEVEL 1 (
    echo.
    echo [ERRO] npm install falhou. Verifique a conexao com a internet e tente novamente.
    pause
    exit /b 1
)
echo [OK] Dependencias em dia.

:: ── 4. Cria pastas e arquivos necessarios ──────────────────────────────────
if not exist "%APPDATA%\nfse-downloader\certs" (
    mkdir "%APPDATA%\nfse-downloader\certs" >nul 2>&1
    echo [OK] Pasta de certificados criada.
)

if not exist "%INSTALL_DIR%\api\config.json" (
    echo {"companies":[]} > "%INSTALL_DIR%\api\config.json"
    echo [OK] Arquivo config.json criado.
)

:: ── 5. Configura o supervisor ──────────────────────────────
echo.
echo [..] Configurando inicializacao automatica...

set VBS_PATH=%INSTALL_DIR%\scripts\start-backend.vbs
if not exist "%VBS_PATH%" (
    echo [ERRO] Arquivo scripts\start-backend.vbs nao encontrado no pacote.
    pause
    exit /b 1
)
echo [OK] Supervisor: %VBS_PATH%

:: ── 6. Tarefa agendada (inicio no logon) ──────────────────────
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

:: ── 7. Sobe o backend e verifica ───────────────────────────
:: Uma unica subida, pelo supervisor. A versao anterior tentava um "teste" com
:: `node ... &`, que no cmd nao roda em segundo plano e travava a instalacao.
echo.
echo [..] Iniciando o backend...
start "" /b wscript.exe "%VBS_PATH%"
timeout /t 8 /nobreak >nul

netstat -ano | findstr ":3002 " | findstr "LISTENING" >nul
IF ERRORLEVEL 1 (
    echo.
    echo [ERRO] Backend nao respondeu na porta 3002. Log de erro:
    echo ─────────────────────────────────────────────
    if exist "%INSTALL_DIR%\api\server.err" type "%INSTALL_DIR%\api\server.err"
    echo ─────────────────────────────────────────────
    echo.
    pause
    exit /b 1
)
echo [OK] Backend rodando na porta 3002.

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
