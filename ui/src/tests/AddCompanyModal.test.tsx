import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddCompanyModal } from '../components/AddCompanyModal';

describe('AddCompanyModal', () => {
  it('não renderiza quando open=false', () => {
    render(<AddCompanyModal open={false} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renderiza campos quando open=true', () => {
    render(<AddCompanyModal open={true} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByLabelText(/nome da empresa/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cnpj/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/caminho do .pfx/i)).toBeInTheDocument();
  });

  it('chama onSave com os dados preenchidos', () => {
    const onSave = vi.fn();
    render(<AddCompanyModal open={true} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/nome da empresa/i), { target: { value: 'Empresa X' } });
    fireEvent.change(screen.getByLabelText(/cnpj/i), { target: { value: '12345678000100' } });
    fireEvent.change(screen.getByLabelText(/caminho do .pfx/i), { target: { value: 'C:\\cert.pfx' } });
    fireEvent.change(screen.getByLabelText(/senha do certificado/i), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText(/pasta de saída/i), { target: { value: 'C:\\NFSe' } });
    fireEvent.change(screen.getByLabelText(/url base da api/i), { target: { value: 'https://adn.test' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Empresa X', cnpj: '12345678000100' }));
  });
});
