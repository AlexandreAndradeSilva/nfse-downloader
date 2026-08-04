import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { unlinkSync, existsSync, readdirSync, statSync } from 'fs';

const execAsync = promisify(exec);

// PowerShell 5.1 (windows) — necessário para o drive Cert: e Export-PfxCertificate
const PS5 = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

// Abre o seletor nativo do Windows de certificados digitais
// (mesmo painel que aparece no Chrome quando um site requer certificado)
export interface PickedCert {
  cnpj: string;
  nome: string;
  thumbprint: string;
  tempPfxPath: string;
  tempPassword: string;
  needsPassword: boolean; // true = cert não exportável, usou .pfx do disco
}

export async function pickCertificateFromStore(): Promise<PickedCert | null> {
  const ps = `
Add-Type -AssemblyName System.Security;
Add-Type -AssemblyName System.Windows.Forms;
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('My','CurrentUser');
$store.Open('ReadOnly');
if ($store.Certificates.Count -eq 0) { $store.Close(); Write-Output '{\"empty\":true}'; exit 0 }
$selected = [System.Security.Cryptography.X509Certificates.X509Certificate2UI]::SelectFromCollection(
  $store.Certificates,
  'Certificado NFS-e',
  'Selecione o certificado digital para acessar o Portal Nacional NFS-e',
  [System.Security.Cryptography.X509Certificates.X509SelectionFlag]::SingleSelection
);
$store.Close();
if ($selected -eq $null -or $selected.Count -eq 0) { Write-Output '{}'; exit 0 }
$cert = $selected[0];
$subject = $cert.Subject;
$thumbprint = $cert.Thumbprint;
$certsDir = [System.IO.Path]::Combine($env:APPDATA, "nfse-downloader", "certs");
[System.IO.Directory]::CreateDirectory($certsDir) | Out-Null;
$certPath = [System.IO.Path]::Combine($certsDir, "cert_" + $thumbprint.Substring(0,8) + ".pfx");
$passPath = [System.IO.Path]::Combine($certsDir, "cert_" + $thumbprint.Substring(0,8) + ".pass");
if ((Test-Path $certPath) -and (Test-Path $passPath)) {
  $certPass = [System.IO.File]::ReadAllText($passPath).Trim();
  @{subject=$subject;thumbprint=$thumbprint;certPath=$certPath;certPass=$certPass;exportable=$true} | ConvertTo-Json -Compress;
} else {
  $certPass = [System.Guid]::NewGuid().ToString();
  try {
    $secPass = ConvertTo-SecureString $certPass -AsPlainText -Force;
    if (Test-Path $certPath) { Remove-Item $certPath -Force };
    try { Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $secPass -CryptoAlgorithmOption TripleDES_SHA1 | Out-Null; } catch { Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $secPass | Out-Null; };
    [System.IO.File]::WriteAllText($passPath, $certPass);
    @{subject=$subject;thumbprint=$thumbprint;certPath=$certPath;certPass=$certPass;exportable=$true} | ConvertTo-Json -Compress
  } catch {
    @{subject=$subject;thumbprint=$thumbprint;exportable=$false;erro=$_.Exception.Message} | ConvertTo-Json -Compress
  }
}
  `.trim();

  let raw: string;
  try {
    const { stdout } = await execAsync(`"${PS5}" -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 60000, windowsHide: true });
    raw = stdout.trim();
  } catch {
    return null;
  }

  if (!raw || raw === '{}') return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (data.empty) {
    throw new Error('Nenhum certificado encontrado no repositório Pessoal do Windows.\n\nUse o botão "+ Cadastro manual" para informar o arquivo .pfx manualmente.');
  }

  if (!data.exportable) {
    console.log('[cert-scanner] exportação falhou:', data.erro ?? 'motivo desconhecido');
  }

  const subject = String(data.subject ?? '');
  const cnpj = extractCnpj(subject);
  if (!cnpj) {
    // Debug: mostra o subject para diagnóstico
    throw new Error(`Certificado selecionado não possui CNPJ reconhecível.\n\nSubject: ${subject}\n\nSelecione um certificado ICP-Brasil tipo CNPJ (emitido para pessoa jurídica).`);
  }

  const nome = extractNome(subject);

  // Certificado exportável — usa o arquivo permanente gerado em TripleDES_SHA1
  // (compatível com Node.js, salvo em AppData\Roaming\nfse-downloader\certs\)
  if (data.exportable) {
    return {
      cnpj,
      nome,
      thumbprint: String(data.thumbprint),
      tempPfxPath: String(data.certPath),
      tempPassword: String(data.certPass),
      needsPassword: false,
    };
  }

  // Certificado não exportável — busca .pfx correspondente no disco
  const pfxFiles = scanPfxFiles();
  const pfxPath = pfxFiles.find(p =>
    p.toLowerCase().includes(cnpj) || matchesNome(p, nome)
  );

  if (!pfxPath) {
    throw new Error(
      `O certificado selecionado não é exportável pelo Windows.\n\n` +
      `Arquivo .pfx não encontrado automaticamente nas pastas comuns.\n\n` +
      `Use o botão "+ Cadastro manual" e informe o caminho do arquivo .pfx manualmente.`
    );
  }

  return {
    cnpj,
    nome,
    thumbprint: String(data.thumbprint ?? ''),
    tempPfxPath: pfxPath,
    tempPassword: '',     // usuário precisará informar
    needsPassword: true,  // pede senha no formulário
  };
}

export async function exportCertByThumbprint(thumbprint: string): Promise<PickedCert | null> {
  const safeTp = thumbprint.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
  const ps = `
Add-Type -AssemblyName System.Security;
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('My','CurrentUser');
$store.Open('ReadOnly');
$cert = $store.Certificates | Where-Object { $_.Thumbprint -eq '${safeTp}' } | Select-Object -First 1;
$store.Close();
if (-not $cert) { Write-Output '{}'; exit 0 }
$subject = $cert.Subject;
$certsDir = [System.IO.Path]::Combine($env:APPDATA, "nfse-downloader", "certs");
[System.IO.Directory]::CreateDirectory($certsDir) | Out-Null;
$certPath = [System.IO.Path]::Combine($certsDir, "cert_${safeTp.substring(0, 8)}.pfx");
$passPath = [System.IO.Path]::Combine($certsDir, "cert_${safeTp.substring(0, 8)}.pass");
if ((Test-Path $certPath) -and (Test-Path $passPath)) {
  $certPass = [System.IO.File]::ReadAllText($passPath).Trim();
  @{subject=$subject;thumbprint=$cert.Thumbprint;certPath=$certPath;certPass=$certPass;exportable=$true} | ConvertTo-Json -Compress;
} else {
  $certPass = [System.Guid]::NewGuid().ToString();
  try {
    $secPass = ConvertTo-SecureString $certPass -AsPlainText -Force;
    if (Test-Path $certPath) { Remove-Item $certPath -Force };
    try { Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $secPass -CryptoAlgorithmOption TripleDES_SHA1 | Out-Null; } catch { Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $secPass | Out-Null; };
    [System.IO.File]::WriteAllText($passPath, $certPass);
    @{subject=$subject;thumbprint=$cert.Thumbprint;certPath=$certPath;certPass=$certPass;exportable=$true} | ConvertTo-Json -Compress
  } catch {
    @{subject=$subject;thumbprint=$cert.Thumbprint;exportable=$false;erro=$_.Exception.Message} | ConvertTo-Json -Compress
  }
}
  `.trim();

  let raw: string;
  try {
    const { stdout } = await execAsync(`"${PS5}" -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 60000, windowsHide: true });
    raw = stdout.trim();
  } catch {
    return null;
  }

  if (!raw || raw === '{}') return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const subject = String(data.subject ?? '');
  const cnpj = extractCnpj(subject);
  if (!cnpj) {
    throw new Error(`Certificado não possui CNPJ reconhecível.\n\nSubject: ${subject}`);
  }

  const nome = extractNome(subject);

  if (data.exportable) {
    return {
      cnpj,
      nome,
      thumbprint: String(data.thumbprint),
      tempPfxPath: String(data.certPath),
      tempPassword: String(data.certPass),
      needsPassword: false,
    };
  }

  // Não exportável — busca .pfx no disco
  const pfxFiles = scanPfxFiles();
  const pfxPath = pfxFiles.find(p => p.toLowerCase().includes(cnpj) || matchesNome(p, nome));

  if (!pfxPath) {
    throw new Error(
      `O certificado não é exportável pelo Windows.\n\n` +
      `Arquivo .pfx não encontrado automaticamente.\n\n` +
      `Use "+ Cadastro manual" e informe o caminho do .pfx manualmente.`
    );
  }

  return {
    cnpj,
    nome,
    thumbprint: String(data.thumbprint ?? ''),
    tempPfxPath: pfxPath,
    tempPassword: '',
    needsPassword: true,
  };
}

export function cleanupTempCert(tempPfxPath: string): void {
  if (existsSync(tempPfxPath)) {
    try { unlinkSync(tempPfxPath); } catch { /* ignora */ }
  }
}

function extractCnpj(subject: string): string | null {
  // 1. CNPJ sem formatação: 14 dígitos seguidos
  const plain = subject.match(/\b(\d{14})\b/);
  if (plain) return plain[1];

  // 2. CNPJ formatado: XX.XXX.XXX/XXXX-XX
  const formatted = subject.match(/(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-\s]?(\d{2})/);
  if (formatted) return formatted.slice(1).join('');

  // 3. Padrão ICP-Brasil OID: OID.2.16.76.1.3.3=CNPJ ou serialNumber contém CNPJ
  const oid = subject.match(/(?:OID\.2\.16\.76\.1\.3\.3|serialNumber)[=\s]+(\d+)/i);
  if (oid) return oid[1].padStart(14, '0');

  return null;
}

function extractNome(subject: string): string {
  const cnMatch = subject.match(/CN=([^,]+)/i);
  if (cnMatch) {
    return cnMatch[1].replace(/:\d{14}.*$/, '').trim();
  }
  return subject.split(',')[0] ?? 'Empresa';
}

function matchesNome(pfxPath: string, nome: string): boolean {
  const fileName = pfxPath.toLowerCase();
  const words = nome.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return words.some(w => fileName.includes(w));
}

function scanPfxFiles(): string[] {
  const userProfile = process.env.USERPROFILE ?? '';
  const dirs = [
    join(userProfile, 'Documents', 'certificados'),
    join(userProfile, 'Documents', 'Certificados'),
    join(userProfile, 'Documents'),
    join(userProfile, 'Desktop'),
    join(userProfile, 'Downloads'),
    join(userProfile, 'OneDrive', 'Documentos', 'certificados'),
    join(userProfile, 'OneDrive', 'Documentos', 'Certificados'),
    join(userProfile, 'OneDrive', 'Documentos'),
    join(userProfile, 'OneDrive', 'Documents'),
  ];
  const found: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const f of readdirSync(dir)) {
        const fullPath = join(dir, f);
        if (f.toLowerCase().endsWith('.pfx')) {
          found.push(fullPath);
        } else {
          // Escaneia subpastas (1 nível) — necessário para certificados\imprimefestas\cert.pfx
          try {
            if (statSync(fullPath).isDirectory()) {
              for (const sub of readdirSync(fullPath)) {
                if (sub.toLowerCase().endsWith('.pfx')) found.push(join(fullPath, sub));
              }
            }
          } catch { /* sem permissão */ }
        }
      }
    } catch { /* sem permissão */ }
  }
  return found;
}

export async function openFolderDialog(): Promise<string | null> {
  // Usa Shell.Application.BrowseForFolder — abre o explorador nativo do Windows
  // sem precisar de STA thread e sem mostrar terminal
  const ps = `$sh = New-Object -ComObject Shell.Application; $f = $sh.BrowseForFolder(0, 'Selecione a pasta para salvar as notas NFS-e', 0, 0); if ($f) { $f.Self.Path } else { '' }`;
  try {
    const { stdout } = await execAsync(`"${PS5}" -NoProfile -Command "${ps}"`, { timeout: 120000, windowsHide: true });
    const path = stdout.trim();
    return path || null;
  } catch {
    return null;
  }
}

// Mantido para o /scan (listagem sem seleção)
export async function scanWindowsCerts(): Promise<Array<{cnpj: string; nome: string; thumbprint: string; validoAte: string}>> {
  // Usa .NET diretamente — não depende do PSDrive Cert: (que pode não carregar via exec)
  const psScript = [
    'Add-Type -AssemblyName System.Security;',
    '$s = New-Object System.Security.Cryptography.X509Certificates.X509Store(\'My\',\'CurrentUser\');',
    '$s.Open(\'ReadOnly\');',
    '$s.Certificates | Select-Object Thumbprint,Subject,@{N=\'ValidTo\';E={$_.NotAfter.ToString(\'yyyy-MM-dd\')}} | ConvertTo-Json -Compress;',
    '$s.Close()',
  ].join(' ');
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  try {
    const { stdout } = await execAsync(`"${PS5}" -NoProfile -EncodedCommand ${encoded}`, { windowsHide: true, timeout: 15000 });
    // Remove prefixo CLIXML se presente
    const jsonStart = stdout.indexOf('[');
    const jsonStartObj = stdout.indexOf('{');
    const start = jsonStart === -1 ? jsonStartObj : (jsonStartObj === -1 ? jsonStart : Math.min(jsonStart, jsonStartObj));
    const raw = start >= 0 ? stdout.slice(start).trim() : stdout.trim();
    if (!raw || raw === 'null') return [];
    const items = JSON.parse(raw);
    const arr = Array.isArray(items) ? items : [items];
    return arr
      .map((i: Record<string, string>) => {
        const cnpj = extractCnpj(i.Subject ?? '');
        if (!cnpj) return null;
        return { cnpj, nome: extractNome(i.Subject ?? ''), thumbprint: i.Thumbprint ?? '', validoAte: i.ValidTo ?? '' };
      })
      .filter(Boolean) as Array<{cnpj: string; nome: string; thumbprint: string; validoAte: string}>;
  } catch (e) {
    console.error('[cert-scanner] scanWindowsCerts erro:', (e as Error).message);
    return [];
  }
}
