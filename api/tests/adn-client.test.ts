import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDFeLote, __setSleepForTests } from '../src/services/adn-client.js';

const opts = { baseUrl: 'https://fake', pfxPath: '', pfxPassword: '' };
// pfxPath vazio → getCachedAgent deve ser pulado (agent undefined em teste)

const okResponse = (overrides: Partial<Record<string, unknown>> = {}) => ({
  status: 200,
  ok: true,
  headers: { get: () => null },
  json: async () => ({ StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: [], Alertas: null, Erros: null }),
  ...overrides,
});

describe('adn-client', () => {
  beforeEach(() => {
    // por padrão, sleep instantâneo (sem esperar tempo real em testes que não o inspecionam)
    __setSleepForTests(async () => {});
  });

  it('respeita Retry-After em 429 e depois retorna ok', async () => {
    const sleeps: number[] = [];
    __setSleepForTests(async (ms) => { sleeps.push(ms); });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 429, ok: false, headers: { get: (h: string) => h === 'retry-after' ? '7' : null } })
      .mockResolvedValueOnce(okResponse());
    const res = await fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never);
    expect(res.StatusProcessamento).toBe('DOCUMENTOS_LOCALIZADOS');
    expect(sleeps[0]).toBeGreaterThanOrEqual(7000);    // Retry-After: 7s
    expect(sleeps[0]).toBeLessThanOrEqual(7000 * 1.3); // + jitter máx 30%
  });

  it('404 → NENHUM_DOCUMENTO_LOCALIZADO', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ status: 404, ok: false, headers: { get: () => null } });
    const res = await fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never);
    expect(res.StatusProcessamento).toBe('NENHUM_DOCUMENTO_LOCALIZADO');
  });

  it('503 é retryável e usa a escada padrão quando não há Retry-After', async () => {
    const sleeps: number[] = [];
    __setSleepForTests(async (ms) => { sleeps.push(ms); });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 503, ok: false, headers: { get: () => null } })
      .mockResolvedValueOnce(okResponse());
    const res = await fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never);
    expect(res.StatusProcessamento).toBe('DOCUMENTOS_LOCALIZADOS');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);    // 1º degrau da escada padrão
    expect(sleeps[0]).toBeLessThanOrEqual(3000 * 1.3);
  });

  it('Retry-After com valor inválido cai na escada padrão', async () => {
    const sleeps: number[] = [];
    __setSleepForTests(async (ms) => { sleeps.push(ms); });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 429, ok: false, headers: { get: (h: string) => h === 'retry-after' ? 'lixo-nao-numerico' : null } })
      .mockResolvedValueOnce(okResponse());
    const res = await fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never);
    expect(res.StatusProcessamento).toBe('DOCUMENTOS_LOCALIZADOS');
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
    expect(sleeps[0]).toBeLessThanOrEqual(3000 * 1.3);
  });

  it('escada progressiva (3s, 8s, 15s + jitter) quando 429 se repete sem Retry-After', async () => {
    const sleeps: number[] = [];
    __setSleepForTests(async (ms) => { sleeps.push(ms); });
    const retry429 = { status: 429, ok: false, headers: { get: () => null } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(retry429)
      .mockResolvedValueOnce(retry429)
      .mockResolvedValueOnce(retry429)
      .mockResolvedValueOnce(okResponse());
    const res = await fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never);
    expect(res.StatusProcessamento).toBe('DOCUMENTOS_LOCALIZADOS');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleeps).toHaveLength(3);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
    expect(sleeps[0]).toBeLessThanOrEqual(3000 * 1.3);
    expect(sleeps[1]).toBeGreaterThanOrEqual(8000);
    expect(sleeps[1]).toBeLessThanOrEqual(8000 * 1.3);
    expect(sleeps[2]).toBeGreaterThanOrEqual(15000);
    expect(sleeps[2]).toBeLessThanOrEqual(15000 * 1.3);
  });

  it('esgota as tentativas e lança o último erro', async () => {
    const retry429 = { status: 429, ok: false, headers: { get: () => null } };
    const fetchImpl = vi.fn().mockResolvedValue(retry429);
    await expect(fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never)).rejects.toThrow(/ADN 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // tentativa inicial + 3 retries da escada
  });

  it('erro não-retryável lança Error com status e corpo, sem retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ status: 500, ok: false, headers: { get: () => null }, text: async () => 'boom interno' });
    await expect(fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never)).rejects.toThrow('ADN 500: boom interno');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('limpa o CNPJ e monta a URL do feed corretamente', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(okResponse());
    await fetchDFeLote(opts, 42, '11.111.111/0001-11', fetchImpl as never);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://fake/DFe/42?cnpjConsulta=11111111000111&lote=true',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
  });
});
