import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SyncLogPanel } from '../components/SyncLogPanel';

const logs = [
  { id: 1, text: 'Iniciando sync...', type: 'progress' as const },
  { id: 2, text: 'NSU 101 → prestados salvo', type: 'progress' as const },
  { id: 3, text: 'Concluído: 1 prestados, 0 tomados', type: 'done' as const },
];

describe('SyncLogPanel', () => {
  it('exibe todas as mensagens de log', () => {
    render(<SyncLogPanel logs={logs} />);
    expect(screen.getByText('Iniciando sync...')).toBeInTheDocument();
    expect(screen.getByText('NSU 101 → prestados salvo')).toBeInTheDocument();
    expect(screen.getByText('Concluído: 1 prestados, 0 tomados')).toBeInTheDocument();
  });

  it('exibe painel vazio quando sem logs', () => {
    render(<SyncLogPanel logs={[]} />);
    expect(screen.getByText(/aguardando/i)).toBeInTheDocument();
  });
});
