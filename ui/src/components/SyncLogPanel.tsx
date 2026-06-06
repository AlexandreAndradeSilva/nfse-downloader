import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

export interface LogEntry {
  id: number;
  text: string;
  type: 'progress' | 'done' | 'error';
}

interface Props {
  logs: LogEntry[];
}

export function SyncLogPanel({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-950 p-4 h-48 overflow-y-auto font-mono text-xs">
      {logs.length === 0 ? (
        <p className="text-gray-500">Aguardando sincronização...</p>
      ) : (
        logs.map(entry => (
          <div key={entry.id} className={cn(
            'mb-0.5',
            entry.type === 'done' && 'text-green-400',
            entry.type === 'error' && 'text-red-400',
            entry.type === 'progress' && 'text-gray-300',
          )}>
            {entry.text}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
