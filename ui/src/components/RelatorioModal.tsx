import { useState } from 'react';
import type { Company } from '../types';
import {
  COLUNAS_RELATORIO, urlRelatorioExcel, juntarPdfs,
  type ExcelOptions, type JuntarPdfsResultado,
} from '../lib/api';
import { IconX } from './Icons';

interface Props {
  open: boolean;
  companies: Company[];
  defaultCnpj: string | null;
  onClose: () => void;
}

const TODAS = COLUNAS_RELATORIO.map(c => c.key as string);

/**
 * Relatórios da empresa: planilha Excel com escolha de colunas e a junção dos
 * PDFs por competência (que também recolhe os XMLs para a pasta "XML NFS").
 */
export function RelatorioModal({ open, companies, defaultCnpj, onClose }: Props) {
  const [cnpj, setCnpj] = useState('');
  const [tipo, setTipo] = useState<ExcelOptions['tipo']>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [colunas, setColunas] = useState<string[]>(TODAS);
  const [juntando, setJuntando] = useState(false);
  const [resultado, setResultado] = useState<JuntarPdfsResultado[] | null>(null);
  const [erro, setErro] = useState('');

  if (!open) return null;

  const cnpjSelecionado = cnpj || defaultCnpj || companies[0]?.cnpj || '';

  const alternarColuna = (key: string) => {
    setColunas(atual => atual.includes(key) ? atual.filter(c => c !== key) : [...atual, key]);
  };

  const baixarExcel = () => {
    if (!cnpjSelecionado || colunas.length === 0) return;
    // As colunas seguem a ordem da planilha, não a ordem de clique
    const ordenadas = TODAS.filter(k => colunas.includes(k));
    const a = document.createElement('a');
    a.href = urlRelatorioExcel(cnpjSelecionado, {
      tipo, dataInicio, dataFim,
      colunas: ordenadas.length === TODAS.length ? [] : ordenadas,
    });
    a.download = '';
    a.click();
  };

  const handleJuntar = async () => {
    if (!cnpjSelecionado) return;
    setJuntando(true);
    setErro('');
    setResultado(null);
    try {
      setResultado(await juntarPdfs(cnpjSelecionado));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setJuntando(false);
    }
  };

  const totalNotas = resultado?.reduce((s, r) => s + r.notas, 0) ?? 0;
  const totalXmls = resultado?.reduce((s, r) => s + r.xmls, 0) ?? 0;

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Relatórios</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <IconX size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="relEmpresa" className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <select id="relEmpresa" value={cnpjSelecionado} onChange={e => setCnpj(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white">
              {companies.map(c => <option key={c.cnpj} value={c.cnpj}>{c.nome}</option>)}
            </select>
          </div>

          {/* ─── Planilha Excel ─────────────────────────────────────────── */}
          <fieldset className="border border-gray-200 rounded p-3">
            <legend className="px-1 text-sm font-semibold text-gray-800">Planilha Excel</legend>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label htmlFor="relTipo" className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select id="relTipo" value={tipo} onChange={e => setTipo(e.target.value as ExcelOptions['tipo'])}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white">
                  <option value="todos">Todos</option>
                  <option value="prestados">Prestados</option>
                  <option value="tomados">Tomados</option>
                </select>
              </div>
              <div>
                <label htmlFor="relInicio" className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
                <input id="relInicio" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
              </div>
              <div>
                <label htmlFor="relFim" className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
                <input id="relFim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
              </div>
            </div>

            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">
                Colunas ({colunas.length}/{TODAS.length})
              </span>
              <span className="text-xs">
                <button type="button" onClick={() => setColunas(TODAS)}
                  className="text-blue-600 hover:underline">Todas</button>
                <span className="text-gray-300 mx-1">|</span>
                <button type="button" onClick={() => setColunas([])}
                  className="text-blue-600 hover:underline">Nenhuma</button>
              </span>
            </div>

            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {COLUNAS_RELATORIO.map(col => (
                <label key={col.key} className="flex items-center gap-1.5 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={colunas.includes(col.key)}
                    onChange={() => alternarColuna(col.key)}
                    className="w-3.5 h-3.5"
                  />
                  {col.label}
                </label>
              ))}
            </div>

            {colunas.length === 0 && (
              <p className="text-xs text-red-600 mt-1">Selecione ao menos uma coluna.</p>
            )}

            <button type="button" onClick={baixarExcel} disabled={colunas.length === 0 || !cnpjSelecionado}
              className="mt-3 w-full px-4 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50">
              Baixar planilha
            </button>
          </fieldset>

          {/* ─── Juntar PDFs ────────────────────────────────────────────── */}
          <fieldset className="border border-gray-200 rounded p-3">
            <legend className="px-1 text-sm font-semibold text-gray-800">Juntar PDFs</legend>

            <p className="text-xs text-gray-500 mb-3">
              Em cada competência, junta os PDFs por data de emissão em
              <b> NFS TOMADOS JUNTO.pdf</b> / <b>NFS PRESTADOS JUNTO.pdf</b> e recolhe os
              XMLs para a subpasta <b>XML NFS</b>. Os PDFs individuais são mantidos.
            </p>

            <button type="button" onClick={handleJuntar} disabled={juntando || !cnpjSelecionado}
              className="w-full px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
              {juntando ? 'Juntando…' : 'Juntar PDFs'}
            </button>

            {erro && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{erro}</div>
            )}

            {resultado && (
              <div className="mt-2">
                <p className="text-xs text-green-700 font-medium mb-1">
                  {resultado.length} arquivo(s) gerado(s) · {totalNotas} nota(s) · {totalXmls} XML(s) recolhido(s)
                </p>
                <div className="max-h-32 overflow-y-auto text-xs text-gray-600 font-mono">
                  {resultado.map((r, i) => (
                    <div key={i}>{r.periodo}/{r.tipo}: {r.notas} nota(s) → {r.arquivo}</div>
                  ))}
                </div>
              </div>
            )}
          </fieldset>
        </div>

        <div className="flex justify-end pt-4">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
