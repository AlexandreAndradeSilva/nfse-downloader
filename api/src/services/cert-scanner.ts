import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

const execAsync = promisify(exec);

export interface PickedCert {
  cnpj: string;
  nome: string;
  thumbprint: string;
  tempPfxPath: string;
  tempPassword: string;
}

// Abre o seletor nativo do Windows de certificados digitais
// (mesmo painel que aparece no Chrome quando um site requer certificado)
export async function pickCertificateFromStore(): Promise<PickedCert | null> {
  const ps = `
Add-Type -AssemblyName System.Security;
Add-Type -AssemblyName System.Windows.Forms;
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('My','CurrentUser');
$store.Open('ReadOnly');
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
$tempPass = [System.Guid]::NewGuid().ToString();
$tempPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "nfse_" + $thumbprint.Substring(0,8) + ".pfx");
try {
  $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $tempPass);
  [System.IO.File]::WriteAllBytes($tempPath, $bytes);
  @{subject=$subject;thumbprint=$thumbprint;tempPath=$tempPath;tempPass=$tempPass} | ConvertTo-Json -Compress
} catch {
  @{error=$_.Exception.Message} | ConvertTo-Json -Compress
}
  `.trim();

  let raw: string;
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 60000 });
    raw = stdout.trim();
  } catch {
    return null;
  }

  if (!raw || raw === '{}') return null;

  let data: Record<string, string>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (data.error) throw new Error(data.error);

  const subject = data.subject ?? '';
  const cnpj = extractCnpj(subject);
  if (!cnpj) throw new Error('Certificado selecionado não possui CNPJ. Selecione um certificado ICP-Brasil tipo CNPJ.');

  return {
    cnpj,
    nome: extractNome(subject),
    thumbprint: data.thumbprint,
    tempPfxPath: data.tempPath,
    tempPassword: data.tempPass,
  };
}

export function cleanupTempCert(tempPfxPath: string): void {
  if (existsSync(tempPfxPath)) {
    try { unlinkSync(tempPfxPath); } catch { /* ignora */ }
  }
}

function extractCnpj(subject: string): string | null {
  const match = subject.match(/\b(\d{14})\b/);
  return match ? match[1] : null;
}

function extractNome(subject: string): string {
  const cnMatch = subject.match(/CN=([^,]+)/i);
  if (cnMatch) {
    return cnMatch[1].replace(/:\d{14}.*$/, '').trim();
  }
  return subject.split(',')[0] ?? 'Empresa';
}

export async function openFolderDialog(): Promise<string | null> {
  const ps = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Selecione a pasta para salvar as notas NFS-e'; $d.ShowNewFolderButton = $true; $r = $d.ShowDialog(); if ($r -eq 'OK') { $d.SelectedPath } else { '' }`;
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps}"`, { timeout: 120000 });
    const path = stdout.trim();
    return path || null;
  } catch {
    return null;
  }
}

// Mantido para o /scan (listagem sem seleção)
export async function scanWindowsCerts(): Promise<Array<{cnpj: string; nome: string; thumbprint: string; validoAte: string}>> {
  const ps = `Get-ChildItem Cert:\\CurrentUser\\My | Select-Object Thumbprint,Subject,@{N='ValidTo';E={$_.NotAfter.ToString('yyyy-MM-dd')}} | ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps}"`);
    const raw = stdout.trim();
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
  } catch {
    return [];
  }
}

// Suprime aviso de importação não usada
export type { tmpdir as _tmpdir };

