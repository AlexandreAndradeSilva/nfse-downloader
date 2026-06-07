import { useState, useEffect } from 'react';
import { browseFolder } from '../lib/api';

export interface CertSyncParams {
  cnpj: string;
  nome: string;
  tempPfxPath: string;
  tempPassword: string;
  outputFolder: string;
  dataInicio: string;
  dataFim: string;
  gerarPdf: boolean;
}

interface PickedCert {
  cnpj: string;
  nome: string;
  thumbprint: string;
  tempPfxPath: string;
  tempPassword: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSync: (params: CertSyncParams) => void;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fmtCnpj(v: string): string {
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function CertificateSyncModal({ open, onClose, onSync }: Props) {
  const [phase, setPhase] = useState<'picking' | 'form' | 'error'>('picking');
  const [cert, setCert] = useState<PickedCert | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [dataInicio, setDataInicio] = useState(firstOfMonth);
  const [dataFim, setDataFim] = useState(today);
  const [gerarPdf, setGerarPdf] = useState(true);
  const [browsingFolder, setBrowsingFolder] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase('picking');
    setCert(null);
    setErrorMsg('');

    // Abre o seletor nativo do Windows imediatamente
    fetch('/api/certificates/pick')
      .then(async res => {
        if (res.status === 204) { onClose(); return; } // usuário cancelou
        if (!res.ok) {
          const err = await res.json() as { error: string };
          throw new Error(err.error);
        }
        return res.json() as Promise<PickedCert>;
      })
      .then(picked => {
        if (!picked) return;
        setCert(picked);
        setPhase('form');
      })
      .catch(err => {
        setErrorMsg((err as Error).message);
        setPhase('error');
      });
  }, [open]);

  if (!open) return null;

  const handleBrowseFolder = async () => {
    setBrowsingFolder(true);
    try {
      const path = await browseFolder();
      if (path) setOutputFolder(path);
    } finally {
      setBrowsingFolder(false);
    }
  };

  const handleSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cert) return;
    if (!outputFolder.trim()) { setErrorMsg('Selecione a pasta de destino.'); return; }
    onSync({
      cnpj: cert.cnpj,
      nome: cert.nome,
      tempPfxPath: cert.tempPfxPath,
      tempPassword: cert.tempPassword,
      outputFolder,
      dataInicio,
      dataFim,
      gerarPdf,
    });
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">

        {phase === 'picking' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔐</div>
            <p className="font-medium text-gray-900">Abrindo seletor de certificados...</p>
            <p className="text-sm text-gray-400 mt-1">Selecione o certificado na janela do Windows</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-red-700">Erro ao selecionar certificado</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mb-4">{errorMsg}</div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50">Fechar</button>
            </div>
          </div>
        )}

        {phase === 'form' && cert && (
          <>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold">Buscar Notas</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="mb-4 bg-blue-50 rounded p-2 text-sm">
              <div className="font-medium text-blue-900">{cert.nome}</div>
              <div className="text-blue-700 text-xs">CNPJ: {fmtCnpj(cert.cnpj)}</div>
            </div>

            <form onSubmit={handleSync} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pasta de Destino</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={outputFolder}
                    onChange={e => setOutputFolder(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                    placeholder="Ex: C:\NFSe"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    disabled={browsingFolder}
                    className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50 whitespace-nowrap"
                  >
                    {browsingFolder ? '...' : '📁 Escolher'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
                  <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
                  <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
                </div>
              </div>
              <p className="text-xs text-gray-400">Deixe em branco para baixar todos os documentos disponíveis.</p>

              <div className="flex items-center gap-2">
                <input id="gerarPdfCert" type="checkbox" checked={gerarPdf} onChange={e => setGerarPdf(e.target.checked)} className="w-4 h-4" />
                <label htmlFor="gerarPdfCert" className="text-sm font-medium text-gray-700">Gerar PDF (DANFSE) junto com XML</label>
              </div>

              {errorMsg && <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{errorMsg}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Buscar Notas</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
