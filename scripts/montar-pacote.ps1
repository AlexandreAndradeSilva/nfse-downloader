# Monta o pacote de distribuicao (NFS-e-Downloader.zip) a partir do fonte.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\montar-pacote.ps1
#
# Produz na raiz do repositorio um zip pronto para extrair na maquina destino
# e rodar o instalar.bat.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP ('nfse-pacote-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$saida = Join-Path $repo 'NFS-e-Downloader.zip'

New-Item -ItemType Directory -Force $stage | Out-Null

function Invoke-Build {
  param([string]$Pasta, [string]$Ferramenta)

  Push-Location $Pasta
  # O npm escreve avisos no stderr; com ErrorActionPreference=Stop isso viraria
  # excecao. O veredito vem do codigo de saida, nao do stderr.
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # Checar a ferramenta, e nao apenas node_modules: um `npm install --omit=dev`
    # feito por engano remove as devDependencies e o build passaria batido.
    if (-not (Test-Path (Join-Path 'node_modules' $Ferramenta))) {
      Write-Host "      instalando dependencias de $(Split-Path $Pasta -Leaf)..."
      npm ci 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "npm ci falhou em $Pasta" }
    }

    npm run build 2>&1 | Out-Null
    # Sem esta checagem o script seguiria empacotando um dist antigo
    if ($LASTEXITCODE -ne 0) { throw "build falhou em $Pasta" }
  }
  finally {
    $ErrorActionPreference = $anterior
    Pop-Location
  }
}

try {
  Write-Host '[1/3] Compilando o backend...'
  Invoke-Build (Join-Path $repo 'api') 'typescript'
  # O tsc nao copia assets: o logo e a tabela IBGE precisam ir junto
  Push-Location (Join-Path $repo 'api')
  New-Item -ItemType Directory -Force dist\assets | Out-Null
  Copy-Item src\assets\nfse-logo.b64, src\assets\municipios-ibge.json dist\assets\ -Force
  Pop-Location

  Write-Host '[2/3] Compilando a extensao...'
  Invoke-Build (Join-Path $repo 'ui') 'vite'

  Write-Host '[3/3] Montando o pacote...'
  # Backend: apenas o compilado e os manifestos (o instalador roda npm install)
  New-Item -ItemType Directory -Force (Join-Path $stage 'api') | Out-Null
  Copy-Item -Recurse (Join-Path $repo 'api\dist') (Join-Path $stage 'api\dist')
  Copy-Item (Join-Path $repo 'api\package.json'), (Join-Path $repo 'api\package-lock.json') (Join-Path $stage 'api')

  # Extensao: o build ja inclui manifest, icones e background (vem de ui/public)
  Copy-Item -Recurse (Join-Path $repo 'ui\dist') (Join-Path $stage 'extensao')

  New-Item -ItemType Directory -Force (Join-Path $stage 'scripts') | Out-Null
  Copy-Item (Join-Path $repo 'scripts\start-backend.vbs') (Join-Path $stage 'scripts')
  Copy-Item (Join-Path $repo 'instalar.bat') $stage

  if (Test-Path -LiteralPath $saida) { Remove-Item -LiteralPath $saida -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $saida -CompressionLevel Optimal

  $kb = [math]::Round((Get-Item -LiteralPath $saida).Length / 1KB)
  Write-Host ''
  Write-Host "Pacote gerado: $saida ($kb KB)"
  Write-Host 'Extraia na maquina destino e execute instalar.bat.'
}
finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
