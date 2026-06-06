import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CompanyCard } from '../components/CompanyCard';
import type { Company } from '../types';

const company: Company = {
  cnpj: '12345678000100',
  nome: 'Empresa Teste',
  pfxPath: 'C:\\certs\\t.pfx',
  pfxPassword: 'pass',
  outputFolder: 'C:\\NFSe',
  baseUrl: 'https://adn.example.com',
  ambiente: 'HOMOLOGACAO',
  lastNsu: 500,
  lastSync: '2026-06-05T10:00:00.000Z',
};

describe('CompanyCard', () => {
  it('exibe nome e CNPJ formatado', () => {
    render(<CompanyCard company={company} syncing={false} onSync={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Empresa Teste')).toBeInTheDocument();
    expect(screen.getByText(/12\.345\.678\/0001-00/)).toBeInTheDocument();
  });

  it('chama onSync ao clicar em Sincronizar', () => {
    const onSync = vi.fn();
    render(<CompanyCard company={company} syncing={false} onSync={onSync} onEdit={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).toHaveBeenCalledWith('12345678000100');
  });

  it('desabilita botão Sincronizar quando syncing=true', () => {
    render(<CompanyCard company={company} syncing={true} onSync={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /sincronizando/i })).toBeDisabled();
  });
});
