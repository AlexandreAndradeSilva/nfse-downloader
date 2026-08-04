import { useState } from 'react';
import type { Company } from '../types';
import { startGeneratePdfs, type GeneratePdfsOptions } from '../lib/api';
import { IconX } from './Icons';

interface Props {
  open: boolean;
  companies: Company[];
  defaultCnpj: string | null;
  onClose: () => void;
}

/**
 * Gera os DANFSe (PDF) das notas já baixadas, sob demanda.
 * A busca de notas baixa só XMLs — é isto que a torna rápida; o PDF vem depois,
 * por este modal, e só para as notas que ainda não têm arquivo .pdf.
 */
export function GeneratePdfsModal({ open, companies, defaultCnpj, onClose }: Props) {
  const [cnpj, setCnpj] = useState<string>('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tipo, setTipo] = useState<GeneratePdfsOptions['tipo']>('todos');
  const [incluirEncerradas, setIncluirEncerradas] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  if (!open) return null;

  const cnpjSelecionado = cnpj || defaultCnpj || companies[0]?.cnpj || '';

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnpjSelecionado) return;
    setRunning(true);
    setLog([]);
    startGeneratePdfs(
      cnpjSelecionado,
      { dataInicio, dataFim, tipo, incluirEncerradas },
      ev => setLog(prev => [...prev.slice(-60), ev.message]),
      () => setRunning(false),
    );
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Gerar PDFs (DANFSe)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <IconX size={16} />
          </button>
        </div>

        <form onSubmit={handleStart} className="space-y-4">
          <div>
            <label htmlFor="pdfEmpresa" className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <select
              id="pdfEmpresa"
              value={cnpjSelecionado}
              onChange={e => setCnpj(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white"
            >
              {companies.map(c => <option key={c.cnpj} value={c.cnpj}>{c.nome}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pdfDataInicio" className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
              <input id="pdfDataInicio" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900" />
            </div>
            <div>
              <label htmlFor="pdfDataFim" className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
              <input id="pdfDataFim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900" />
            </div>
          </div>

          <div>
            <label htmlFor="pdfTipo" className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select id="pdfTipo" value={tipo}
              onChange={e => setTipo(e.target.value as GeneratePdfsOptions['tipo'])}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white">
              <option value="todos">Prestados e tomados</option>
              <option value="prestados">Só prestados</option>
              <option value="tomados">Só tomados</option>
            </select>
          </div>

          <label htmlFor="pdfEncerradas" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input id="pdfEncerradas" type="checkbox" checked={incluirEncerradas}
              onChange={e => setIncluirEncerradas(e.target.checked)} className="w-4 h-4" />
            Incluir canceladas e substituídas (com carimbo)
          </label>

          <p className="text-xs text-gray-500">
            Gera o DANFSe apenas das notas que ainda não têm PDF. Deixe as datas em
            branco para cobrir todo o histórico.
          </p>

          {log.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-600 max-h-32 overflow-y-auto font-mono">
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={running}
              className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Fechar
            </button>
            <button type="submit" disabled={running || !cnpjSelecionado}
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
              {running ? 'Gerando…' : 'Gerar PDFs'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
