import { useState, useEffect } from 'react';
import { browseFolder } from '../lib/api';

const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
import { IconLock, IconFolder, IconX } from './Icons';

export interface CertSyncParams {
  cnpj: string;
  nome: string;
  tempPfxPath: string;
  tempPassword: string;
  outputFolder: string;
  dataInicio: string;
  dataFim: string;
  prestados: boolean;
  tomados: boolean;
}

interface PickedCert {
  cnpj: string;
  nome: string;
  thumbprint: string;
  tempPfxPath: string;
  tempPassword: string;
  needsPassword: boolean;
  defaultOutputFolder?: string;
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
  const [prestados, setPrestados] = useState(true);
  const [tomados, setTomados] = useState(true);
  const [pfxPassword, setPfxPassword] = useState('');
  const [browsingFolder, setBrowsingFolder] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase('picking');
    setCert(null);
    setErrorMsg('');

    // Abre o seletor nativo do Windows imediatamente
    fetch(`${API}/api/certificates/pick`)
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
        // Pré-preenche a pasta com o default sugerido pelo backend
        if (picked.defaultOutputFolder) setOutputFolder(picked.defaultOutputFolder);
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
    if (cert.needsPassword && !pfxPassword.trim()) { setErrorMsg('Informe a senha do arquivo .pfx.'); return; }
    if (!prestados && !tomados) { setErrorMsg('Selecione ao menos um tipo de nota.'); return; }
    onSync({
      cnpj: cert.cnpj,
      nome: cert.nome,
      tempPfxPath: cert.tempPfxPath,
      tempPassword: cert.needsPassword ? pfxPassword : cert.tempPassword,
      outputFolder,
      dataInicio,
      dataFim,
      prestados,
      tomados,
    });
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">

        {phase === 'picking' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3" style={{color:'#6366f1'}}><IconLock size={40} /></div>
            <p className="font-medium text-gray-900">Abrindo seletor de certificados...</p>
            <p className="text-sm text-gray-400 mt-1">Selecione o certificado na janela do Windows</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-red-700">Erro ao selecionar certificado</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={16} /></button>
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
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={16} /></button>
            </div>
            <div className={`mb-4 rounded p-2 text-sm ${cert.needsPassword ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50'}`}>
              <div className="font-medium text-gray-900">{cert.nome}</div>
              <div className="text-xs text-gray-500">CNPJ: {fmtCnpj(cert.cnpj)}</div>
              {cert.needsPassword && (
                <div className="text-xs text-amber-700 mt-1">
                  ⚠ Certificado não exportável — usando arquivo .pfx localizado em disco
                </div>
              )}
            </div>

            <form onSubmit={handleSync} className="space-y-4">
              {cert.needsPassword && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha do arquivo .pfx</label>
                  <input
                    type="password"
                    value={pfxPassword}
                    onChange={e => setPfxPassword(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
                    placeholder="Senha do certificado"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pasta de Destino</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={outputFolder}
                    onChange={e => setOutputFolder(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
                    placeholder="Ex: C:\NFSe"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    disabled={browsingFolder}
                    className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50 whitespace-nowrap"
                  >
                    {browsingFolder ? '...' : <><IconFolder size={13} /> Escolher</>}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
                  <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
                  <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900" />
                </div>
              </div>
              <p className="text-xs text-gray-400">Deixe em branco para baixar todos os documentos disponíveis.</p>

              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-1">Tipos de nota</legend>
                <div className="flex items-center gap-4">
                  <label htmlFor="tipoPrestadosCert" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input id="tipoPrestadosCert" type="checkbox" checked={prestados}
                      onChange={e => setPrestados(e.target.checked)} className="w-4 h-4" />
                    Prestados
                  </label>
                  <label htmlFor="tipoTomadosCert" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input id="tipoTomadosCert" type="checkbox" checked={tomados}
                      onChange={e => setTomados(e.target.checked)} className="w-4 h-4" />
                    Tomados
                  </label>
                </div>
              </fieldset>
              <p className="text-xs text-gray-400">
                Baixa apenas os XMLs — use "Gerar PDFs" depois para emitir os DANFSe.
              </p>

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
