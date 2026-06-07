import { useState } from 'react';

export interface SyncOptions {
  dataInicio: string;
  dataFim: string;
  gerarPdf: boolean;
}

interface Props {
  open: boolean;
  companyName: string;
  onClose: () => void;
  onSync: (opts: SyncOptions) => void;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function SyncModal({ open, companyName, onClose, onSync }: Props) {
  const [dataInicio, setDataInicio] = useState(firstOfMonth);
  const [dataFim, setDataFim] = useState(today);
  const [gerarPdf, setGerarPdf] = useState(true);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSync({ dataInicio, dataFim, gerarPdf });
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold mb-4 text-gray-900">Sincronizar: {companyName}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dataInicio" className="block text-sm font-medium text-gray-700 mb-1">
              Data início
            </label>
            <input
              id="dataInicio"
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white"
            />
          </div>
          <div>
            <label htmlFor="dataFim" className="block text-sm font-medium text-gray-700 mb-1">
              Data fim
            </label>
            <input
              id="dataFim"
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="gerarPdf"
              type="checkbox"
              checked={gerarPdf}
              onChange={e => setGerarPdf(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="gerarPdf" className="text-sm font-medium text-gray-700">
              Gerar PDF junto com XML
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Deixe as datas em branco para baixar todos os documentos disponíveis.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
              Sincronizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
