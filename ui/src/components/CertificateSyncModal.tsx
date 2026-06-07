import { useState, useEffect } from 'react';
import { scanCertificates, browseFolder, type CertInfo } from '../lib/api';

export interface CertSyncParams {
  cnpj: string;
  nome: string;
  pfxPath: string;
  pfxPassword: string;
  outputFolder: string;
  dataInicio: string;
  dataFim: string;
  gerarPdf: boolean;
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
  const [step, setStep] = useState<'scan' | 'form'>('scan');
  const [loading, setLoading] = useState(false);
  const [certs, setCerts] = useState<CertInfo[]>([]);
  const [selected, setSelected] = useState<CertInfo | null>(null);
  const [password, setPassword] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [dataInicio, setDataInicio] = useState(firstOfMonth);
  const [dataFim, setDataFim] = useState(today);
  const [gerarPdf, setGerarPdf] = useState(true);
  const [error, setError] = useState('');
  const [browsingFolder, setBrowsingFolder] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('scan');
      setSelected(null);
      setPassword('');
      setError('');
      setCerts([]);
      setLoading(true);
      scanCertificates()
        .then(setCerts)
        .catch(() => setError('Não foi possível ler o repositório de certificados do Windows.'))
        .finally(() => setLoading(false));
    }
  }, [open]);

  if (!open) return null;

  const handleSelectCert = (cert: CertInfo) => {
    setSelected(cert);
    setStep('form');
    setError('');
  };

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
    if (!selected) return;
    if (!outputFolder.trim()) { setError('Selecione a pasta de destino.'); return; }
    if (!password.trim()) { setError('Informe a senha do certificado.'); return; }
    const pfxPath = selected.pfxPath ?? '';
    if (!pfxPath) { setError('Arquivo .pfx não encontrado automaticamente. Use o cadastro manual.'); return; }
    onSync({ cnpj: selected.cnpj, nome: selected.nome, pfxPath, pfxPassword: password, outputFolder, dataInicio, dataFim, gerarPdf });
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">

        {step === 'scan' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Certificados encontrados</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {loading && (
              <div className="text-center py-8 text-gray-400 text-sm">Lendo repositório de certificados...</div>
            )}

            {!loading && error && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
            )}

            {!loading && !error && certs.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                Nenhum certificado ICP-Brasil com CNPJ encontrado no repositório do Windows.
              </div>
            )}

            {!loading && certs.length > 0 && (
              <div className="space-y-2">
                {certs.map(cert => (
                  <button
                    key={cert.thumbprint}
                    onClick={() => handleSelectCert(cert)}
                    className="w-full text-left rounded border border-gray-200 p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-medium text-gray-900 text-sm">{cert.nome}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      CNPJ: {fmtCnpj(cert.cnpj)} · Válido até: {cert.validoAte}
                    </div>
                    {cert.pfxPath && (
                      <div className="text-xs text-green-600 mt-0.5 truncate">✓ {cert.pfxPath}</div>
                    )}
                    {!cert.pfxPath && (
                      <div className="text-xs text-orange-500 mt-0.5">⚠ Arquivo .pfx não localizado automaticamente</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'form' && selected && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setStep('scan')} className="text-gray-400 hover:text-gray-600">←</button>
              <h2 className="text-base font-semibold">Buscar Notas — {selected.nome}</h2>
            </div>
            <div className="text-xs text-gray-500 mb-4">CNPJ: {fmtCnpj(selected.cnpj)}</div>

            <form onSubmit={handleSync} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha do Certificado</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                  placeholder="Senha do .pfx"
                  required
                />
              </div>

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
              <p className="text-xs text-gray-400">Deixe as datas em branco para baixar todos os documentos disponíveis.</p>

              <div className="flex items-center gap-2">
                <input id="gerarPdfCert" type="checkbox" checked={gerarPdf} onChange={e => setGerarPdf(e.target.checked)} className="w-4 h-4" />
                <label htmlFor="gerarPdfCert" className="text-sm font-medium text-gray-700">Gerar PDF (DANFSE) junto com XML</label>
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{error}</div>}

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
