/**
 * URL base do backend local.
 *
 * O app roda como extensão Chrome, cuja origem é `chrome-extension://<id>`.
 * Nesse contexto um caminho relativo (`/api/...`) resolve contra a própria
 * extensão e nunca alcança a API — daí o build de produção precisar de URL
 * absoluta. Em desenvolvimento o proxy do Vite faz o roteamento, então a base
 * fica vazia.
 *
 * `VITE_API_URL` sobrepõe os dois casos (usado para acesso via tunnel).
 */
const PADRAO_PRODUCAO = 'http://localhost:3002';

const configurada = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE = (
  configurada || (import.meta.env.PROD ? PADRAO_PRODUCAO : '')
).replace(/\/$/, '');
