import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadDanfsePdf, resetDanfseBreaker, isDanfseBreakerOpen } from '../src/services/danfse-downloader.js';

const CHAVE = '5'.repeat(50);
beforeEach(() => resetDanfseBreaker());

describe('danfse-downloader', () => {
  it('retorna o PDF quando o ADN responde 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 conteudo').buffer,
    });
    const buf = await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
    expect(buf!.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('uma única tentativa por chamada (sem escada de retries)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    const buf = await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
    expect(buf).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('abre o breaker após 3 falhas consecutivas e para de chamar a rede', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    for (let i = 0; i < 3; i++) await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
    expect(isDanfseBreakerOpen()).toBe(true);
    await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
    expect(fetchImpl).toHaveBeenCalledTimes(3);   // 4ª chamada não foi à rede
  });

  it('sucesso zera o contador de falhas', async () => {
    const fail = { ok: false, status: 503, text: async () => '' };
    const okRes = { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4').buffer };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fail).mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(okRes).mockResolvedValueOnce(fail);
    for (let i = 0; i < 4; i++) await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
    expect(isDanfseBreakerOpen()).toBe(false);    // sucesso no meio resetou
  });
});
