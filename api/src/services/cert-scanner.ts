import { exec } from 'child_process';
import { promisify } from 'util';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

export interface CertInfo {
  thumbprint: string;
  subject: string;
  cnpj: string;
  nome: string;
  validoAte: string;
  pfxPath?: string;
}

export async function scanWindowsCerts(): Promise<CertInfo[]> {
  const ps = `
    Get-ChildItem Cert:\\CurrentUser\\My |
    Select-Object Thumbprint,Subject,FriendlyName,@{N='ValidTo';E={$_.NotAfter.ToString('yyyy-MM-dd')}} |
    ConvertTo-Json -Compress
  `;

  let raw: string;
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/\n\s*/g, ' ')}"`);
    raw = stdout.trim();
  } catch {
    return [];
  }

  if (!raw || raw === 'null') return [];

  let items: Array<Record<string, string>>;
  try {
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }

  const pfxFiles = scanPfxFiles();
  const results: CertInfo[] = [];

  for (const item of items) {
    const subject = item.Subject ?? '';
    const cnpj = extractCnpj(subject);
    if (!cnpj) continue;

    const nome = extractNome(subject, item.FriendlyName ?? '');
    const pfxPath = pfxFiles.find(p => p.toLowerCase().includes(cnpj) || matchesNome(p, nome));

    results.push({
      thumbprint: item.Thumbprint ?? '',
      subject,
      cnpj,
      nome,
      validoAte: item.ValidTo ?? '',
      pfxPath,
    });
  }

  return results;
}

function extractCnpj(subject: string): string | null {
  // Padrão ICP-Brasil: CNPJ de 14 dígitos no Subject
  const match = subject.match(/\b(\d{14})\b/);
  return match ? match[1] : null;
}

function extractNome(subject: string, friendlyName: string): string {
  // Tenta extrair o nome da empresa do campo CN
  const cnMatch = subject.match(/CN=([^,]+)/i);
  if (cnMatch) {
    // Remove o CNPJ do CN se estiver junto: "EMPRESA X:12345678000100"
    return cnMatch[1].replace(/:\d{14}.*$/, '').trim();
  }
  return friendlyName || subject.split(',')[0] || 'Empresa';
}

function matchesNome(pfxPath: string, nome: string): boolean {
  const fileName = pfxPath.toLowerCase();
  const nomeWords = nome.toLowerCase().split(' ').filter(w => w.length > 3);
  return nomeWords.some(w => fileName.includes(w));
}

function scanPfxFiles(): string[] {
  const userProfile = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const searchDirs = [
    join(userProfile, 'Documents'),
    join(userProfile, 'Documents', 'certificados'),
    join(userProfile, 'Documents', 'Certificados'),
    join(userProfile, 'Desktop'),
    join(userProfile, 'Downloads'),
    join(userProfile, 'OneDrive', 'Documentos'),
    join(userProfile, 'OneDrive', 'Documentos', 'certificados'),
    join(userProfile, 'OneDrive', 'Documentos', 'Certificados'),
    join(userProfile, 'OneDrive', 'Documents'),
  ];

  const found: string[] = [];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir);
      for (const f of files) {
        if (f.toLowerCase().endsWith('.pfx')) {
          found.push(join(dir, f));
        }
      }
    } catch { /* sem permissão */ }
  }
  return found;
}

export async function openFolderDialog(): Promise<string | null> {
  const ps = `
    Add-Type -AssemblyName System.Windows.Forms;
    $d = New-Object System.Windows.Forms.FolderBrowserDialog;
    $d.Description = 'Selecione a pasta para salvar as notas NFS-e';
    $d.ShowNewFolderButton = $true;
    $result = $d.ShowDialog();
    if ($result -eq 'OK') { $d.SelectedPath } else { '' }
  `;
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/\n\s*/g, ' ')}"`);
    const path = stdout.trim();
    return path || null;
  } catch {
    return null;
  }
}
