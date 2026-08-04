import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SyncModal } from '../components/SyncModal';

describe('SyncModal', () => {
  it('não renderiza quando open=false', () => {
    render(<SyncModal open={false} companyName="Empresa X" onClose={vi.fn()} onSync={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exibe nome da empresa e campos de data', () => {
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={vi.fn()} />);
    expect(screen.getByText(/Sincronizar: Empresa X/)).toBeInTheDocument();
    expect(screen.getByLabelText(/data início/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data fim/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prestados/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tomados/i)).toBeInTheDocument();
  });

  it('chama onSync com os valores preenchidos', () => {
    const onSync = vi.fn();
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
    fireEvent.change(screen.getByLabelText(/data início/i), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText(/data fim/i), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).toHaveBeenCalledWith({
      dataInicio: '2026-01-01',
      dataFim: '2026-06-30',
      prestados: true,
      tomados: true,
    });
  });

  it('permite sincronizar sem datas (baixa tudo)', () => {
    const onSync = vi.fn();
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
    // Clear the pre-filled dates
    fireEvent.change(screen.getByLabelText(/data início/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/data fim/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({
      dataInicio: '',
      dataFim: '',
    }));
  });

  it('marca prestados e tomados por padrão e remove a opção de PDF', () => {
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={vi.fn()} />);
    expect(screen.getByLabelText(/prestados/i)).toBeChecked();
    expect(screen.getByLabelText(/tomados/i)).toBeChecked();
    expect(screen.queryByLabelText(/gerar pdf/i)).not.toBeInTheDocument();
  });

  it('envia apenas o tipo marcado', () => {
    const onSync = vi.fn();
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
    fireEvent.click(screen.getByLabelText(/tomados/i));
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({ prestados: true, tomados: false }));
  });

  it('exige ao menos um tipo marcado', () => {
    const onSync = vi.fn();
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
    fireEvent.click(screen.getByLabelText(/prestados/i));
    fireEvent.click(screen.getByLabelText(/tomados/i));
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).not.toHaveBeenCalled();
  });
});
