' Supervisor do backend do NFS-e Downloader.
'
' Mantém "node api\dist\server.js" no ar sem janela visível. Corrige três
' problemas da versão anterior:
'   1. instância única — antes cada execução do instalador (e cada logon)
'      deixava mais um laço rodando, e eles disputavam a porta 3002;
'   2. registro de saída — antes stdout/stderr iam para lugar nenhum, então
'      uma falha de inicialização era invisível;
'   3. espera progressiva — antes um erro fatal virava um laço de reinício a
'      cada 3 segundos, indefinidamente.
'
' O script se localiza sozinho: fica em <raiz>\scripts\ e deduz a raiz dali.

Option Explicit

Dim fso, shell, wmi
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")

' ── Instância única ─────────────────────────────────────────────────────────
Dim procs, p, iguais
iguais = 0
Set procs = wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='wscript.exe'")
For Each p In procs
  If Not IsNull(p.CommandLine) Then
    If InStr(LCase(p.CommandLine), "start-backend.vbs") > 0 Then iguais = iguais + 1
  End If
Next
If iguais > 1 Then WScript.Quit 0   ' outro supervisor já está no ar

' ── Caminhos ────────────────────────────────────────────────────────────────
Dim raiz, servidor, logSaida, logErro, comando
raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
servidor = fso.BuildPath(raiz, "api\dist\server.js")
logSaida = fso.BuildPath(raiz, "api\server.log")
logErro  = fso.BuildPath(raiz, "api\server.err")

' cmd /c permite redirecionar a saída; as aspas triplas escapam as internas
comando = "cmd /c """"node"" """ & servidor & """ >> """ & logSaida & """ 2>> """ & logErro & """"""

' ── Laço de supervisão ──────────────────────────────────────────────────────
Dim espera, inicio, duracao
espera = 3000

Do
  inicio = Timer
  shell.Run comando, 0, True
  duracao = Timer - inicio
  If duracao < 0 Then duracao = duracao + 86400   ' virada de meia-noite

  If duracao < 10 Then
    ' Caiu rápido demais: provável erro de inicialização. Espera mais a cada
    ' tentativa, até 1 minuto, para não encher o log nem consumir CPU.
    If espera < 60000 Then espera = espera * 2
  Else
    espera = 3000
  End If

  WScript.Sleep espera
Loop
