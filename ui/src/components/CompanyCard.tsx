import type { Company } from '../types';
import { cn } from '../lib/utils';

interface Props {
  company: Company;
  syncing: boolean;
  onSync: (cnpj: string) => void;
  onEdit: (company: Company) => void;
  onDelete: (cnpj: string) => void;
}

function formatCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function CompanyCard({ company, syncing, onSync, onEdit, onDelete }: Props) {
  const lastSync = company.lastSync
    ? new Date(company.lastSync).toLocaleString('pt-BR')
    : 'nunca';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{company.nome}</h3>
          <p className="text-sm text-gray-500">CNPJ: {formatCnpj(company.cnpj)}</p>
          <p className="text-sm text-gray-500">Último sync: {lastSync}</p>
          <p className="text-sm text-gray-500">NSU atual: {company.lastNsu}</p>
          <p className="text-xs text-gray-400 truncate mt-1">{company.outputFolder}</p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => onSync(company.cnpj)}
            disabled={syncing}
            className={cn(
              'px-3 py-1.5 rounded text-sm font-medium text-white transition-colors',
              syncing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            onClick={() => onEdit(company)}
            className="px-3 py-1.5 rounded text-sm font-medium border border-gray-300 hover:bg-gray-50"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(company.cnpj)}
            className="px-3 py-1.5 rounded text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}
