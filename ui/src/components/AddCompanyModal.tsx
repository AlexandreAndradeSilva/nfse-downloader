import { useState, useEffect } from 'react';
import type { Company } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (company: Omit<Company, 'lastSync'>) => void;
  initial?: Company | null;
}

const EMPTY: Omit<Company, 'lastSync'> = {
  cnpj: '', nome: '', pfxPath: '', pfxPassword: '',
  outputFolder: '', baseUrl: 'https://adn.nfse.gov.br/contribuintes', ambiente: 'PRODUCAO', lastNsu: 0,
};

// Classe base para todos os inputs da modal (força text-gray-900 sobre o tema dark global)
const INPUT_CLASS = 'w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 mb-1';

export function AddCompanyModal({ open, onClose, onSave, initial }: Props) {
  const [form, setForm] = useState<Omit<Company, 'lastSync'>>(EMPTY);

  useEffect(() => {
    setForm(initial ? { ...initial } : { ...EMPTY });
  }, [initial, open]);

  if (!open) return null;

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, cnpj: form.cnpj.replace(/\D/g, '') });
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900">
          {initial ? 'Editar Empresa' : 'Adicionar Empresa'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {[
            { label: 'Nome da Empresa',    field: 'nome'        as const, type: 'text' },
            { label: 'CNPJ',               field: 'cnpj'        as const, type: 'text' },
            { label: 'Caminho do .pfx',    field: 'pfxPath'     as const, type: 'text' },
            { label: 'Senha do Certificado',field:'pfxPassword' as const, type: 'password' },
            { label: 'Pasta de Saída',     field: 'outputFolder'as const, type: 'text' },
            { label: 'URL Base da API',    field: 'baseUrl'     as const, type: 'text' },
          ].map(({ label, field, type }) => (
            <div key={field}>
              <label className={LABEL_CLASS} htmlFor={field}>{label}</label>
              <input
                id={field}
                type={type}
                value={String(form[field])}
                onChange={set(field)}
                className={INPUT_CLASS}
                required={field !== 'pfxPassword'}
              />
            </div>
          ))}

          <div>
            <label className={LABEL_CLASS} htmlFor="ambiente">Ambiente</label>
            <select
              id="ambiente"
              value={form.ambiente}
              onChange={set('ambiente')}
              className={INPUT_CLASS}
            >
              <option value="PRODUCAO">Produção</option>
              <option value="HOMOLOGACAO">Homologação</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="lastNsu">NSU Inicial (opcional)</label>
            <input
              id="lastNsu"
              type="number"
              min={0}
              value={form.lastNsu}
              onChange={e => setForm(prev => ({ ...prev, lastNsu: parseInt(e.target.value, 10) || 0 }))}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
