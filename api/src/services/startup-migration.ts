import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { dirname, join } from 'path';
import { readConfig, writeConfig } from '../config-store.js';

/**
 * Migração executada uma vez no boot da API.
 *
 * Corrige o estado deixado por versões anteriores:
 * 1. `outputFolder` com U+FFFD (mojibake de caracteres acentuados) — o app gravava
 *    as notas numa pasta fantasma "�rea de Trabalho" em vez da real "Área de Trabalho";
 * 2. move o conteúdo da pasta fantasma para a real, sem sobrescrever;
 * 3. remove marcadores `.local`, que existiam só para distinguir PDF oficial de
 *    PDF gerado localmente — distinção que deixou de existir.
 */

/** Caracteres acentuados que o mojibake U+FFFD costuma substituir em pastas do Windows. */
const CANDIDATOS = ['Á', 'À', 'Ã', 'Â', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú', 'Ç'];

/**
 * Substitui U+FFFD no caminho pelo acentuado correspondente, quando a versão
 * corrigida existe no disco. Devolve o caminho original se não houver correção.
 */
export function fixMojibakePath(p: string): string {
  if (!p.includes('�')) return p;
  for (const ch of CANDIDATOS) {
    const candidato = p.replace(/�/g, ch);
    // O diretório final pode ainda não existir; basta o pai ser real
    if (existsSync(candidato) || existsSync(dirname(candidato))) return candidato;
  }
  return p;
}

/**
 * Move recursivamente `src` para `dst` sem sobrescrever arquivos existentes.
 * Arquivos já presentes no destino são preservados e a origem duplicada é removida.
 * Diretórios de origem que ficarem vazios são apagados.
 */
export function mergeMove(src: string, dst: string): void {
  if (!existsSync(src) || src === dst) return;
  mkdirSync(dst, { recursive: true });

  for (const entrada of readdirSync(src)) {
    const origem = join(src, entrada);
    const destino = join(dst, entrada);
    let ehDiretorio: boolean;
    try {
      ehDiretorio = statSync(origem).isDirectory();
    } catch { continue; }

    if (ehDiretorio) {
      mergeMove(origem, destino);
    } else if (!existsSync(destino)) {
      try { renameSync(origem, destino); } catch { /* arquivo em uso — deixa na origem */ }
    } else {
      try { unlinkSync(origem); } catch { /* duplicado que não pôde ser removido */ }
    }
  }

  try { rmdirSync(src); } catch { /* ainda tem conteúdo — mantém */ }
}

/** Remove marcadores `.local` órfãos deixados pelo fluxo antigo de PDF. */
function removeMarcadoresLocal(dir: string): number {
  if (!existsSync(dir)) return 0;
  let removidos = 0;
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    try {
      if (statSync(p).isDirectory()) {
        removidos += removeMarcadoresLocal(p);
      } else if (entrada.endsWith('.local')) {
        unlinkSync(p);
        removidos++;
      }
    } catch { /* sem permissão ou removido em paralelo */ }
  }
  return removidos;
}

export function runStartupMigration(): void {
  const config = readConfig();
  let alterou = false;

  for (const company of config.companies) {
    const corrigido = fixMojibakePath(company.outputFolder);
    if (corrigido !== company.outputFolder) {
      mergeMove(company.outputFolder, corrigido);
      console.log(`[migração] outputFolder corrigido: ${company.outputFolder} → ${corrigido}`);
      company.outputFolder = corrigido;
      alterou = true;
    }

    const removidos = removeMarcadoresLocal(join(company.outputFolder, company.nome));
    if (removidos > 0) {
      console.log(`[migração] ${removidos} marcador(es) .local removido(s) de ${company.nome}`);
    }
  }

  if (alterou) writeConfig(config);
}
