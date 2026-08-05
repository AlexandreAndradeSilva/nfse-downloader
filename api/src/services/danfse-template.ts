/**
 * Template do DANFSe v1.0 — Documento Auxiliar da NFS-e.
 *
 * Reproduz o layout do DANFSe emitido pelo Portal Nacional / prefeituras: blocos
 * empilhados com grade de 4 colunas, rótulos em negrito e valores abaixo, campos
 * sem conteúdo exibidos como "-".
 *
 * Notas encerradas por evento recebem marca d'água diagonal (CANCELADA ou
 * SUBSTITUÍDA) sobre o documento.
 */

export interface DanfseData {
  chaveAcesso: string;
  numeroNFSe: string;
  competencia: string;
  dhEmissao: string;
  dhEmissaoDps: string;
  numeroDPS: string;
  serieDPS: string;
  tpEmit: string;
  // Emitente / prestador
  emitCnpj: string;
  emitIm: string;
  emitTelefone: string;
  emitNome: string;
  emitEmail: string;
  emitEndereco: string;
  emitMunicipio: string;
  emitCep: string;
  emitSimplesNac: string;
  emitRegApTribSN: string;
  emitRegEspTrib: string;
  // Tomador
  tomaCnpj: string;
  tomaIm: string;
  tomaTelefone: string;
  tomaNome: string;
  tomaEmail: string;
  tomaEndereco: string;
  tomaMunicipio: string;
  tomaCep: string;
  // Intermediário
  intermCnpj: string;
  intermIm: string;
  intermTelefone: string;
  intermNome: string;
  // Serviço prestado
  cTribNac: string;
  xTribNac: string;
  cTribMun: string;
  xTribMun: string;
  xLocPrestacao: string;
  xPaisPrestacao: string;
  xDescServ: string;
  // Tributação municipal
  tribISSQN: string;
  xPaisResult: string;
  xMunicipioIncid: string;
  tpImunidade: string;
  tpSuspensao: string;
  nProcessoSusp: string;
  tpBM: string;
  vServico: string;
  vDescIncond: string;
  vDR: string;
  vCalcBM: string;
  vBC: string;
  pAliqAplic: string;
  tpRetISSQN: string;
  vISSQN: string;
  // Tributação federal
  vIRRF: string;
  vCP: string;
  vCSLL: string;
  xDescricaoRetFed: string;
  vPIS: string;
  vCOFINS: string;
  // Tributação IBS / CBS (NT 008/2026 — reforma tributária)
  cstIbsCbs: string;
  cClassTrib: string;
  cIndOp: string;
  cLocalidadeIncid: string;
  xLocalidadeIncid: string;
  vExclusoesBC: string;
  vBCIbsCbs: string;
  pRedAliqIbsCbs: string;
  pIbsUfMun: string;
  pAliqEfetMun: string;
  vIBSMun: string;
  pAliqEfetUF: string;
  vIBSUF: string;
  vIBSTot: string;
  pCBS: string;
  pAliqEfetCBS: string;
  vCBS: string;
  // Valor total
  vDescCond: string;
  vISSQNRetido: string;
  vTotalRetFed: string;
  vPisCofinsDebito: string;
  vLiq: string;
  vIbsCbsTot: string;
  vTotNF: string;
  // Totais aproximados dos tributos
  vTotTribFed: string;
  vTotTribEst: string;
  vTotTribMun: string;
  // Informações complementares
  xInfComp: string;
  cNBS: string;
}

export type DanfseStamp = 'CANCELADA' | 'SUBSTITUIDA' | undefined;

function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Valor vazio vira "-", como no DANFSe oficial. */
function ou(v: string): string {
  const t = String(v ?? '').trim();
  return t === '' ? '-' : t;
}

interface CelulaOpts {
  span?: 1 | 2 | 3 | 4;   // quantas colunas ocupa (de 4)
  center?: boolean;
  bold?: boolean;         // valor em negrito (valor líquido)
  titulo?: boolean;       // célula de título de bloco (EMITENTE / TOMADOR)
  sub?: string;           // segunda linha do título (ex.: "Prestador do Serviço")
  minH?: number;          // altura mínima em mm, para linhas com texto longo
}

function celula(label: string, valor: string, opts: CelulaOpts = {}): string {
  const span = opts.span ?? 1;
  const cls = [
    'cel', `s${span}`,
    opts.center ? 'ctr' : '',
    opts.bold ? 'b' : '',
    opts.titulo ? 'tit' : '',
  ].filter(Boolean).join(' ');
  const style = opts.minH ? ` style="min-height:${opts.minH}mm"` : '';
  const l = label ? `<div class="lb">${esc(label)}</div>` : '';
  const v = `<div class="vl">${esc(valor)}</div>`;
  const s = opts.sub ? `<div class="sub">${esc(opts.sub)}</div>` : '';
  return `<div class="${cls}"${style}>${l}${v}${s}</div>`;
}

function linha(...celulas: string[]): string {
  return `<div class="ln">${celulas.join('')}</div>`;
}

function barra(texto: string): string {
  return `<div class="barra">${esc(texto)}</div>`;
}

/**
 * Agrupa linhas num bloco. Só o bloco recebe borda inferior — dentro dele as
 * linhas não são separadas, como no DANFSe oficial.
 */
function secao(...partes: string[]): string {
  return `<div class="sec">${partes.join('')}</div>`;
}

export function buildDanfseHtml(
  d: DanfseData,
  logoDataUrl?: string,
  stamp?: DanfseStamp,
  qrDataUrl?: string,
): string {
  const municipioPrefeitura = d.emitMunicipio.replace(/\s*-\s*[A-Z]{2}$/, '');

  const cabecalho = `
<div class="cab">
  <div class="cab-logo">${logoDataUrl ? `<img src="${logoDataUrl}" alt="NFS-e">` : ''}</div>
  <div class="cab-tit">
    <div class="t1">DANFSe v1.0</div>
    <div class="t2">Documento Auxiliar da NFS-e</div>
  </div>
  <div class="cab-pref">
    <div class="p1">${esc(municipioPrefeitura ? `Prefeitura de ${municipioPrefeitura}` : 'Prefeitura Municipal')}</div>
    <div class="p2">Secretaria Municipal da Fazenda</div>
  </div>
</div>`;

  const identificacao = `
<div class="ident">
  <div class="ident-esq">
    ${linha(celula('Chave de Acesso da NFS-e', ou(d.chaveAcesso), { span: 4 }))}
    ${linha(
      celula('Número da NFS-e', ou(d.numeroNFSe), { span: 1 }),
      celula('Competência da NFS-e', ou(d.competencia), { span: 1 }),
      celula('Data e Hora da emissão da NFS-e', ou(d.dhEmissao), { span: 2 }),
    )}
    ${linha(
      celula('Número da DPS', ou(d.numeroDPS), { span: 1 }),
      celula('Série da DPS', ou(d.serieDPS), { span: 1 }),
      celula('Data e Hora da emissão da DPS', ou(d.dhEmissaoDps), { span: 2 }),
    )}
  </div>
  <div class="ident-qr">
    ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code">` : '<div class="qr-vazio"></div>'}
    <div class="qr-txt">A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e</div>
  </div>
</div>`;

  const temInterm = Boolean(d.intermCnpj || d.intermNome);

  const corpo = [
    // ─── Emitente ───────────────────────────────────────────────────────────
    secao(
      linha(
        celula('EMITENTE DA NFS-e', '', { titulo: true, sub: 'Prestador do Serviço' }),
        celula('CNPJ / CPF / NIF', ou(d.emitCnpj)),
        celula('Inscrição Municipal', ou(d.emitIm)),
        celula('Telefone', ou(d.emitTelefone)),
      ),
      linha(
        celula('Nome / Nome Empresarial', ou(d.emitNome), { span: 2 }),
        celula('E-mail', ou(d.emitEmail), { span: 2 }),
      ),
      linha(
        celula('Endereço', ou(d.emitEndereco), { span: 2 }),
        celula('Município', ou(d.emitMunicipio)),
        celula('CEP', ou(d.emitCep)),
      ),
      linha(
        celula('Simples Nacional na Data de Competência', ou(d.emitSimplesNac), { span: 2 }),
        celula('Regime de Apuração Tributária pelo SN', ou(d.emitRegApTribSN), { span: 2 }),
      ),
    ),

    // ─── Tomador ────────────────────────────────────────────────────────────
    secao(
      linha(
        celula('TOMADOR DO SERVIÇO', '', { titulo: true }),
        celula('CNPJ / CPF / NIF', ou(d.tomaCnpj)),
        celula('Inscrição Municipal', ou(d.tomaIm)),
        celula('Telefone', ou(d.tomaTelefone)),
      ),
      linha(
        celula('Nome / Nome Empresarial', ou(d.tomaNome), { span: 2 }),
        celula('E-mail', ou(d.tomaEmail), { span: 2 }),
      ),
      linha(
        celula('Endereço', ou(d.tomaEndereco), { span: 2 }),
        celula('Município', ou(d.tomaMunicipio)),
        celula('CEP', ou(d.tomaCep)),
      ),
    ),

    // ─── Intermediário ──────────────────────────────────────────────────────
    secao(
      temInterm
        ? linha(
          celula('INTERMEDIÁRIO DO SERVIÇO', '', { titulo: true }),
          celula('CNPJ / CPF / NIF', ou(d.intermCnpj)),
          celula('Inscrição Municipal', ou(d.intermIm)),
          celula('Telefone', ou(d.intermTelefone)),
        ) + linha(celula('Nome / Nome Empresarial', ou(d.intermNome), { span: 4 }))
        : '<div class="ln"><div class="cel s4 ctr semint">INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e</div></div>',
    ),

    // ─── Serviço prestado ───────────────────────────────────────────────────
    secao(
      barra('SERVIÇO PRESTADO'),
      linha(
        celula('Código de Tributação Nacional', ou(d.cTribNac ? `${d.cTribNac}${d.xTribNac ? ' - ' + d.xTribNac : ''}` : ''), { minH: 11 }),
        celula('Código de Tributação Municipal', ou(d.cTribMun ? `${d.cTribMun}${d.xTribMun ? ' - ' + d.xTribMun : ''}` : ''), { minH: 11 }),
        celula('Local da Prestação', ou(d.xLocPrestacao), { minH: 11 }),
        celula('País da Prestação', ou(d.xPaisPrestacao), { minH: 11 }),
      ),
      linha(celula('Descrição do Serviço', ou(d.xDescServ), { span: 4, minH: 9 })),
    ),

    // ─── Tributação municipal ───────────────────────────────────────────────
    secao(
      barra('TRIBUTAÇÃO MUNICIPAL (ISSQN)'),
      linha(
        celula('Tributação do ISSQN', ou(d.tribISSQN)),
        celula('País Resultado da Prestação do Serviço', ou(d.xPaisResult)),
        celula('Município de Incidência do ISSQN', ou(d.xMunicipioIncid)),
        celula('Regime Especial de Tributação', ou(d.emitRegEspTrib)),
      ),
      linha(
        celula('Tipo de Imunidade', ou(d.tpImunidade)),
        celula('Suspensão da Exigibilidade do ISSQN', ou(d.tpSuspensao)),
        celula('Número Processo Suspensão', ou(d.nProcessoSusp)),
        celula('Benefício Municipal', ou(d.tpBM)),
      ),
      linha(
        celula('Valor do Serviço', ou(d.vServico)),
        celula('Desconto Incondicionado', ou(d.vDescIncond)),
        celula('Total Deduções/Reduções', ou(d.vDR)),
        celula('Cálculo do BM', ou(d.vCalcBM)),
      ),
      linha(
        celula('BC ISSQN', ou(d.vBC)),
        celula('Alíquota Aplicada', ou(d.pAliqAplic)),
        celula('Retenção do ISSQN', ou(d.tpRetISSQN)),
        celula('ISSQN Apurado', ou(d.vISSQN)),
      ),
    ),

    // ─── Tributação federal ─────────────────────────────────────────────────
    secao(
      barra('TRIBUTAÇÃO FEDERAL (EXCETO CBS)'),
      linha(
        celula('IRRF', ou(d.vIRRF)),
        celula('Contribuição Previdenciária - Retida', ou(d.vCP)),
        celula('Contribuições Sociais - Retidas', ou(d.vCSLL)),
        celula('Descrição Contrib. Sociais - Retidas', ou(d.xDescricaoRetFed)),
      ),
      linha(
        celula('PIS - Débito Apuração Própria', ou(d.vPIS)),
        celula('COFINS - Débito Apuração Própria', ou(d.vCOFINS)),
        celula('', '', { span: 2 }),
      ),
    ),

    // ─── Tributação IBS / CBS (NT 008/2026 — reforma tributária) ────────────
    secao(
      barra('TRIBUTAÇÃO IBS / CBS'),
      linha(
        celula('CST / cClassTrib', ou([d.cstIbsCbs, d.cClassTrib].filter(Boolean).join(' / '))),
        celula('Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF',
          ou([d.cIndOp, d.cLocalidadeIncid, d.xLocalidadeIncid].filter(Boolean).join(' / ')), { span: 3 }),
      ),
      linha(
        celula('Exclusões e Reduções da Base de Cálculo', ou(d.vExclusoesBC)),
        celula('Base de Cálculo Após Exclusões e Reduções', ou(d.vBCIbsCbs)),
        celula('Red. Alíquota IBS / Red. Alíquota CBS', ou(d.pRedAliqIbsCbs)),
        celula('Alíquota – IBS UF / IBS Mun', ou(d.pIbsUfMun)),
      ),
      linha(
        celula('Alíq. Efetiva Municipal – IBS', ou(d.pAliqEfetMun)),
        celula('Valor Apurado Municipal – IBS', ou(d.vIBSMun)),
        celula('Alíq. Efetiva Estadual – IBS', ou(d.pAliqEfetUF)),
        celula('Valor Apurado Estadual – IBS', ou(d.vIBSUF)),
      ),
      linha(
        celula('Valor Total Apurado – IBS', ou(d.vIBSTot)),
        celula('Alíquota - CBS', ou(d.pCBS)),
        celula('Alíquota Efetiva – CBS', ou(d.pAliqEfetCBS)),
        celula('Valor Total Apurado – CBS', ou(d.vCBS)),
      ),
    ),

    // ─── Valor total ────────────────────────────────────────────────────────
    secao(
      barra('VALOR TOTAL DA NFS-E'),
      linha(
        celula('Valor da Operação / Serviço', ou(d.vServico)),
        celula('Desconto Condicionado', ou(d.vDescCond)),
        celula('Desconto Incondicionado', ou(d.vDescIncond)),
        celula('ISSQN Retido', ou(d.vISSQNRetido)),
      ),
      linha(
        celula('Total das Retenções (ISSQN / Federais)', ou(d.vTotalRetFed)),
        celula('Valor Líquido da NFS-e', ou(d.vLiq), { bold: true }),
        celula('Total do IBS/CBS', ou(d.vIbsCbsTot)),
        celula('Valor Líquido da NFS-e + IBS/CBS', ou(d.vTotNF), { bold: true }),
      ),
    ),

    // ─── Totais aproximados dos tributos ────────────────────────────────────
    secao(
      barra('TOTAIS APROXIMADOS DOS TRIBUTOS'),
      `<div class="ln">
        <div class="cel s1-3 ctr"><div class="lb">Federais</div><div class="vl">${esc(ou(d.vTotTribFed))}</div></div>
        <div class="cel s1-3 ctr"><div class="lb">Estaduais</div><div class="vl">${esc(ou(d.vTotTribEst))}</div></div>
        <div class="cel s1-3 ctr"><div class="lb">Municipais</div><div class="vl">${esc(ou(d.vTotTribMun))}</div></div>
      </div>`,
    ),

    // ─── Informações complementares ─────────────────────────────────────────
    secao(barra('INFORMAÇÕES COMPLEMENTARES')),
    `<div class="infocompl">${
      [d.cNBS ? `<b>NBS:</b> ${esc(d.cNBS)}` : '', esc(d.xInfComp)].filter(Boolean).join('<br>')
    }</div>`,
  ].join('\n');

  const marca = stamp
    ? `<div class="marca">${stamp === 'CANCELADA' ? 'CANCELADA' : 'SUBSTITUÍDA'}</div>`
    : '';

  return `<meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  /* Altura fixa de uma folha A4: o DANFSe nunca deve quebrar em duas páginas */
  body {
    margin: 0; width: 21cm; height: 29.7cm; overflow: hidden; position: relative;
    padding: 2mm;
    font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Moldura externa do documento. Fica acima da marca d'água e sem fundo,
     para que a marca apareça através dela como no DANFSe oficial. */
  .folha {
    position: relative; z-index: 1;
    border: 1.8pt solid #000;
    padding: 2mm 2mm 0;
    background: transparent;
    /* Ocupa exatamente a área útil da folha, sem transbordar */
    height: 100%; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .sec, .cab, .ident, .infocompl { flex-shrink: 0; }

  /* Cabeçalho */
  .cab { display: flex; align-items: center; gap: 4mm; padding-bottom: 1.5mm; }
  .cab-logo { width: 44mm; flex-shrink: 0; }
  .cab-logo img { width: 100%; height: auto; }
  .cab-tit { flex: 1; text-align: center; }
  .cab-tit .t1 { font-size: 12.5pt; font-weight: bold; }
  .cab-tit .t2 { font-size: 10pt; font-weight: bold; }
  .cab-pref { width: 54mm; flex-shrink: 0; font-size: 7.2pt; line-height: 1.25; }
  .cab-pref .p1 { font-weight: bold; }

  /* Bloco de identificação (chave + QR) — sem linhas internas, como no original */
  .ident {
    display: flex; align-items: flex-start;
    border-top: 0.5pt solid #000; border-bottom: 0.5pt solid #000;
    padding-bottom: 1mm;
  }
  .ident-esq { flex: 1; min-width: 0; }
  .ident .cel { border-bottom: none; min-height: 5.6mm; }
  .ident-qr {
    width: 44mm; flex-shrink: 0; padding: 0.8mm 2mm 0;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .ident-qr img { width: 16mm; height: 16mm; }
  .qr-vazio { width: 16mm; height: 16mm; }
  .qr-txt { font-size: 5.2pt; line-height: 1.2; margin-top: 0.8mm; }

  /* Grade — a borda pertence à seção, não à linha */
  /* Divisões internas finas — só a moldura externa (.folha) é forte */
  .sec { border-bottom: 0.5pt solid #000; }
  .ln { display: flex; width: 100%; }
  .cel {
    padding: 0.7mm 1.5mm;
    min-height: 7mm;
    overflow: hidden;
  }
  .cel.s1   { width: 25%; }
  .cel.s2   { width: 50%; }
  .cel.s3   { width: 75%; }
  .cel.s4   { width: 100%; }
  .cel.s1-3 { width: 33.3333%; }
  .cel.ctr  { text-align: center; }
  .lb  { font-size: 6.4pt; font-weight: bold; line-height: 1.15; }
  .vl  { font-size: 8.4pt; line-height: 1.2; word-break: break-word; }
  .cel.b .vl { font-weight: bold; font-size: 9.2pt; }
  .sub { font-size: 8.4pt; line-height: 1.2; }
  /* Títulos de bloco: peso normal e menores, como no documento oficial */
  .cel.tit .lb { font-size: 7.4pt; font-weight: normal; }

  /* Linha do intermediário ausente: rente, sem a altura mínima das células */
  .semint {
    font-size: 7.6pt; text-align: center;
    padding: 0.4mm 1.5mm; min-height: 0;
  }

  /* Barras de seção */
  .barra {
    font-size: 7.4pt; font-weight: normal;
    padding: 0.5mm 1.5mm;
  }

  /* Ocupa o espaço restante até a moldura inferior */
  .infocompl {
    font-size: 7.6pt; line-height: 1.3; padding: 1.5mm;
    flex: 1 1 auto; min-height: 15mm; overflow: hidden;
  }

  /* Marca d'água de nota encerrada por evento — traço fino, cinza claro,
     desenhada atrás do conteúdo (z-index 0) como no documento oficial. */
  .marca {
    position: absolute; top: 38%; left: 0; z-index: 0;
    width: 21cm; text-align: center;
    font-size: 76pt; font-weight: normal; color: #c8c8c8;
    letter-spacing: 6pt;
    transform: rotate(-45deg); transform-origin: center;
    pointer-events: none;
  }
</style>
${marca}
<div class="folha">
${cabecalho}
${identificacao}
${corpo}
</div>
`;
}
