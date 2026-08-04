export interface DanfseData {
  chaveAcesso: string;
  numeroNFSe: string;
  competencia: string;
  dhEmissao: string;
  dhEmissaoDps: string;
  numeroDPS: string;
  serieDPS: string;
  // Emitente
  emitCnpj: string;
  emitIm: string;
  emitTelefone: string;
  emitNome: string;
  emitEmail: string;
  emitEndereco: string;
  emitMunicipio: string;
  emitUF: string;
  emitCep: string;
  emitSimplesNac: string;
  emitRegEspTrib: string;
  // Tomador
  tomaCnpj: string;
  tomaIm: string;
  tomaNome: string;
  tomaEndereco: string;
  tomaMunicipio: string;
  tomaUF: string;
  tomaCep: string;
  tomaTelefone: string;
  tomaEmail: string;
  // Serviço
  cTribNac: string;
  xTribNac: string;
  cTribMun: string;
  xTribMun: string;
  xDescServ: string;
  cNBS: string;
  xLocPrestacao: string;
  xLocEmi: string;
  xMunicipioIncid: string;
  xInfComp: string;
  // Tributação ISSQN
  tribISSQN: string;
  tpRetISSQN: string;
  vBC: string;
  pAliqAplic: string;
  pISSQN: string;
  vISSQN: string;
  // Tributação Federal
  vPIS: string;
  vCOFINS: string;
  tpRetPisCofins: string;
  vCSLL: string;
  vCP: string;
  vIRRF: string;
  // Totais aproximados
  vTotTribFed: string;
  vTotTribEst: string;
  vTotTribMun: string;
  // Valores
  vServico: string;
  vLiq: string;
  vISSQNNfse: string;
}

function d(v: string | undefined | null): string {
  const s = v?.toString().trim() ?? '';
  return s || '-';
}

function fmtCnpj(v: string): string {
  const n = v.replace(/\D/g, '');
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v || '-';
}

function fmtCep(v: string): string {
  const n = v.replace(/\D/g, '');
  return n.length === 8 ? n.replace(/^(\d{5})(\d{3})$/, '$1-$2') : (v || '-');
}

function fmtMoeda(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return '-';
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function fmtFone(v: string): string {
  const n = v.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (n.length === 10) return n.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return v || '-';
}

const TRIB_ISSQN: Record<string, string> = {
  '1': 'Operação Tributável', '2': 'Fora do Município', '3': 'Imunidade',
  '4': 'Exportação de Serviços', '5': 'Não Incidência', '6': 'Diferimento',
};

const TP_RET_ISSQN: Record<string, string> = {
  '1': 'Não Retido',
  '2': 'Retido pelo Tomador',
  '3': 'Não Incide ISSQN',
};

export function buildDanfseHtml(data: DanfseData, logoDataUrl?: string, cancelada = false): string {
  const tribISSQNDesc = TRIB_ISSQN[data.tribISSQN] ?? (data.tribISSQN || 'Operação Tributável');
  const retISSQN = TP_RET_ISSQN[data.tpRetISSQN] ?? (data.tpRetISSQN || 'Não Retido');
  const simpNacDesc: Record<string, string> = {
    '1': 'Não optante',
    '2': 'Optante - Microempreendedor Individual (MEI)',
    '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
  };
  const simpNac = simpNacDesc[data.emitSimplesNac] ?? 'Não optante';
  const regEspTribDesc = data.emitRegEspTrib || '-';
  const pAliqDisplay = data.pISSQN && data.pISSQN !== '-'
    ? `${parseFloat(data.pISSQN).toFixed(2).replace('.', ',')}%`
    : (data.pAliqAplic ? `${parseFloat(data.pAliqAplic).toFixed(2).replace('.', ',')}%` : '-');
  const vIssqnDisplay = fmtMoeda(data.vISSQNNfse || data.vISSQN);
  const municipioEmit = [data.emitMunicipio, data.emitUF].filter(v => v && v !== '-').join(' - ') || '-';
  const municipioToma = [data.tomaMunicipio, data.tomaUF].filter(v => v && v !== '-').join(' - ') || '-';
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="max-width:150px;max-height:50px;object-fit:contain" alt="NFS-e"/>`
    : `<div style="font-size:12pt;font-weight:900;color:#4a7a4a">NFS<span style="color:#1a3070">e</span></div>`
      + `<div style="font-size:5pt;color:#555">Nota Fiscal de Serviço Eletrônica</div>`;
  const infCompParts: string[] = [];
  if (data.xInfComp && data.xInfComp !== '-') infCompParts.push(data.xInfComp);
  if (data.cNBS && data.cNBS !== '-') infCompParts.push(`<strong>NBS:</strong> ${data.cNBS}`);
  if (cancelada) infCompParts.push('<span style="color:#c00;font-weight:bold">NOTA FISCAL CANCELADA</span>');
  const infCompHtml = infCompParts.map(p => `<div>${p}</div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #000; background: #fff; }
  .page { width: 210mm; padding: 5mm 6mm; position: relative; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { border: 1px solid #999; padding: 2px 3px; vertical-align: top; word-break: break-word; }
  .lbl { font-size: 6pt; font-weight: bold; display: block; margin-bottom: 1px; }
  .val { font-size: 7.5pt; display: block; }
  .sec { font-weight: bold; font-size: 7.5pt; padding: 2px 4px; background: #d9d9d9; }
  .sec-hd { background: #d9d9d9; }
  .sec-label { font-weight: bold; font-size: 7.5pt; display: block; }
  .sec-sub   { font-size: 6.5pt; display: block; }
  .mt  { margin-top: 0; }
  .ctr { text-align: center; }
  .cancelada-stamp {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-55deg);
    font-size: 76pt; font-weight: 900;
    color: rgba(185, 28, 28, 0.38);
    letter-spacing: 6px; white-space: nowrap;
    pointer-events: none; z-index: 9999;
    font-family: Arial Black, Arial, sans-serif;
    text-transform: uppercase;
  }
</style>
</head>
<body>
<div class="page">

${cancelada ? '<div class="cancelada-stamp">CANCELADA</div>' : ''}

<!-- CABEÇALHO -->
<table>
  <colgroup><col style="width:18%"/><col style="width:54%"/><col style="width:28%"/></colgroup>
  <tr>
    <td style="border:1px solid #999;text-align:center;vertical-align:middle;padding:4px 6px">${logoHtml}</td>
    <td style="border-top:1px solid #999;border-bottom:1px solid #999;border-left:none;border-right:none;text-align:center;vertical-align:middle;padding:5px 4px">
      <div style="font-size:11pt;font-weight:bold">DANFSe v1.0</div>
      <div style="font-size:8.5pt;font-weight:bold">Documento Auxiliar da NFS-e</div>
    </td>
    <td style="border:1px solid #999;text-align:left;vertical-align:middle;padding:4px 6px;font-size:7pt">
      <div style="font-weight:bold;font-size:7.5pt">${d(data.xLocEmi || data.emitMunicipio)}</div>
      <div style="font-size:6.5pt">Secretaria Municipal da Fazenda</div>
    </td>
  </tr>
</table>

<!-- CHAVE DE ACESSO + QR CODE -->
<table>
  <colgroup><col style="width:19%"/><col style="width:19%"/><col style="width:24%"/><col style="width:38%"/></colgroup>
  <tr>
    <td colspan="3">
      <span class="lbl">Chave de Acesso da NFS-e</span>
      <span style="font-family:monospace;font-size:7pt;word-break:break-all;display:block;margin-top:1px">${data.chaveAcesso || '-'}</span>
    </td>
    <td rowspan="3" style="text-align:center;vertical-align:middle;padding:3px">
      <div style="width:22mm;height:22mm;border:1px solid #999;margin:0 auto 3px;display:flex;align-items:center;justify-content:center;background:#fafafa">
        <span style="font-size:5pt;color:#ccc">QR Code</span>
      </div>
      <div style="font-size:5.5pt;color:#444;line-height:1.5;text-align:left">
        A autenticidade desta NFS-e pode ser verificada<br/>
        pela leitura deste código QR ou pela consulta da<br/>
        chave de acesso no portal nacional da NFS-e
      </div>
    </td>
  </tr>
  <tr>
    <td><span class="lbl">Número da NFS-e</span><span class="val" style="font-size:9.5pt;font-weight:bold">${d(data.numeroNFSe)}</span></td>
    <td><span class="lbl">Competência da NFS-e</span><span class="val">${d(data.competencia)}</span></td>
    <td><span class="lbl">Data e Hora da emissão da NFS-e</span><span class="val">${d(data.dhEmissao)}</span></td>
  </tr>
  <tr>
    <td><span class="lbl">Número da DPS</span><span class="val">${d(data.numeroDPS)}</span></td>
    <td><span class="lbl">Série da DPS</span><span class="val">${d(data.serieDPS)}</span></td>
    <td><span class="lbl">Data e Hora da emissão da DPS</span><span class="val">${d(data.dhEmissaoDps || data.dhEmissao)}</span></td>
  </tr>
</table>

<!-- EMITENTE -->
<table class="mt">
  <colgroup><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/></colgroup>
  <tr>
    <td class="sec-hd">
      <span class="sec-label">EMITENTE DA NFS-e</span>
      <span class="sec-sub">Prestador do Serviço</span>
    </td>
    <td><span class="lbl">CNPJ / CPF / NIF</span><span class="val">${fmtCnpj(data.emitCnpj)}</span></td>
    <td><span class="lbl">Inscrição Municipal</span><span class="val">${d(data.emitIm)}</span></td>
    <td><span class="lbl">Telefone</span><span class="val">${fmtFone(data.emitTelefone)}</span></td>
  </tr>
  <tr>
    <td colspan="3"><span class="lbl">Nome / Nome Empresarial</span><span class="val">${d(data.emitNome)}</span></td>
    <td><span class="lbl">E-mail</span><span class="val" style="font-size:6.5pt">${d(data.emitEmail)}</span></td>
  </tr>
  <tr>
    <td colspan="2"><span class="lbl">Endereço</span><span class="val">${d(data.emitEndereco)}</span></td>
    <td><span class="lbl">Município</span><span class="val">${municipioEmit}</span></td>
    <td><span class="lbl">CEP</span><span class="val">${fmtCep(data.emitCep)}</span></td>
  </tr>
  <tr>
    <td colspan="2"><span class="lbl">Simples Nacional na Data de Competência</span><span class="val">${simpNac}</span></td>
    <td colspan="2"><span class="lbl">Regime de Apuração Tributária pelo SN</span><span class="val">${regEspTribDesc}</span></td>
  </tr>
</table>

<!-- TOMADOR -->
<table class="mt">
  <colgroup><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/></colgroup>
  <tr>
    <td class="sec-hd"><span class="sec-label">TOMADOR DO SERVIÇO</span></td>
    <td><span class="lbl">CNPJ / CPF / NIF</span><span class="val">${fmtCnpj(data.tomaCnpj)}</span></td>
    <td><span class="lbl">Inscrição Municipal</span><span class="val">${d(data.tomaIm)}</span></td>
    <td><span class="lbl">Telefone</span><span class="val">${fmtFone(data.tomaTelefone)}</span></td>
  </tr>
  <tr>
    <td colspan="3"><span class="lbl">Nome / Nome Empresarial</span><span class="val">${d(data.tomaNome)}</span></td>
    <td><span class="lbl">E-mail</span><span class="val" style="font-size:6.5pt">${d(data.tomaEmail)}</span></td>
  </tr>
  <tr>
    <td colspan="2"><span class="lbl">Endereço</span><span class="val">${d(data.tomaEndereco)}</span></td>
    <td><span class="lbl">Município</span><span class="val">${municipioToma}</span></td>
    <td><span class="lbl">CEP</span><span class="val">${fmtCep(data.tomaCep)}</span></td>
  </tr>
  <tr>
    <td colspan="4" style="text-align:center;font-style:normal;font-size:6.5pt;background:#f0f0f0;letter-spacing:0.3px">
      INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e
    </td>
  </tr>
</table>

<!-- SERVIÇO PRESTADO -->
<table class="mt">
  <colgroup><col style="width:34%"/><col style="width:22%"/><col style="width:22%"/><col style="width:22%"/></colgroup>
  <tr><td colspan="4" class="sec">SERVIÇO PRESTADO</td></tr>
  <tr>
    <td>
      <span class="lbl">Código de Tributação Nacional</span>
      <span class="val">${d(data.cTribNac)}${data.xTribNac && data.xTribNac !== '-' ? ' - ' + data.xTribNac : ''}</span>
    </td>
    <td><span class="lbl">Código de Tributação Municipal</span><span class="val">${d(data.cTribMun)}${data.xTribMun && data.xTribMun !== '-' ? ' - ' + data.xTribMun : ''}</span></td>
    <td><span class="lbl">Local da Prestação</span><span class="val">${d(data.xLocPrestacao)}</span></td>
    <td><span class="lbl">País da Prestação</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td colspan="4"><span class="lbl">Descrição do Serviço</span><span class="val" style="white-space:pre-wrap">${d(data.xDescServ)}</span></td>
  </tr>
</table>

<!-- TRIBUTAÇÃO MUNICIPAL -->
<table class="mt">
  <colgroup><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/></colgroup>
  <tr><td colspan="4" class="sec">TRIBUTAÇÃO MUNICIPAL</td></tr>
  <tr>
    <td><span class="lbl">Tributação do ISSQN</span><span class="val">${tribISSQNDesc}</span></td>
    <td><span class="lbl">País Resultado da Prestação do Serviço</span><span class="val">-</span></td>
    <td><span class="lbl">Município de Incidência do ISSQN</span><span class="val">${d(data.xMunicipioIncid) === '-' ? 'Nenhum' : d(data.xMunicipioIncid)}</span></td>
    <td><span class="lbl">Regime Especial de Tributação</span><span class="val">${regEspTribDesc === '-' ? 'Nenhum' : regEspTribDesc}</span></td>
  </tr>
  <tr>
    <td><span class="lbl">Tipo de Imunidade</span><span class="val">-</span></td>
    <td><span class="lbl">Suspensão da Exigibilidade do ISSQN</span><span class="val">Não</span></td>
    <td><span class="lbl">Número Processo Suspensão</span><span class="val">-</span></td>
    <td><span class="lbl">Benefício Municipal</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">Valor do Serviço</span><span class="val">${fmtMoeda(data.vServico)}</span></td>
    <td><span class="lbl">Desconto Incondicionado</span><span class="val">-</span></td>
    <td><span class="lbl">Total Deduções/Reduções</span><span class="val">-</span></td>
    <td><span class="lbl">Cálculo do BM</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">BC ISSQN</span><span class="val">${fmtMoeda(data.vBC)}</span></td>
    <td><span class="lbl">Alíquota Aplicada</span><span class="val">${pAliqDisplay}</span></td>
    <td><span class="lbl">Retenção do ISSQN</span><span class="val">${retISSQN}</span></td>
    <td><span class="lbl">ISSQN Apurado</span><span class="val">${vIssqnDisplay}</span></td>
  </tr>
</table>

<!-- TRIBUTAÇÃO FEDERAL -->
<table class="mt">
  <colgroup><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/></colgroup>
  <tr><td colspan="4" class="sec">TRIBUTAÇÃO FEDERAL</td></tr>
  <tr>
    <td><span class="lbl">IRRF</span><span class="val">${fmtMoeda(data.vIRRF)}</span></td>
    <td><span class="lbl">Contribuição Previdenciária - Retida</span><span class="val">${fmtMoeda(data.vCP)}</span></td>
    <td><span class="lbl">Contribuições Sociais - Retidas</span><span class="val">${fmtMoeda(data.vCSLL)}</span></td>
    <td><span class="lbl">Descrição Contrib. Sociais - Retidas</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">PIS - Débito Apuração Própria</span><span class="val">${fmtMoeda(data.vPIS)}</span></td>
    <td><span class="lbl">COFINS - Débito Apuração Própria</span><span class="val">${fmtMoeda(data.vCOFINS)}</span></td>
    <td></td><td></td>
  </tr>
</table>

<!-- VALOR TOTAL DA NFS-E -->
<table class="mt">
  <colgroup><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/></colgroup>
  <tr><td colspan="4" class="sec">VALOR TOTAL DA NFS-E</td></tr>
  <tr>
    <td><span class="lbl">Valor do Serviço</span><span class="val">${fmtMoeda(data.vServico)}</span></td>
    <td><span class="lbl">Desconto Condicionado</span><span class="val">-</span></td>
    <td><span class="lbl">Desconto Incondicionado</span><span class="val">-</span></td>
    <td><span class="lbl">ISSQN Retido</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">Total das Retenções Federais</span><span class="val">${fmtMoeda(data.vTotTribFed)}</span></td>
    <td><span class="lbl">PIS/COFINS - Débito Apur. Própria</span><span class="val">-</span></td>
    <td></td>
    <td>
      <span class="lbl" style="font-weight:bold">Valor Líquido da NFS-e</span>
      <span class="val" style="font-size:9.5pt;font-weight:bold">${fmtMoeda(data.vLiq)}</span>
    </td>
  </tr>
</table>

<!-- TOTAIS APROXIMADOS DOS TRIBUTOS -->
<table class="mt">
  <colgroup><col style="width:34%"/><col style="width:33%"/><col style="width:33%"/></colgroup>
  <tr><td colspan="3" class="sec ctr">TOTAIS APROXIMADOS DOS TRIBUTOS</td></tr>
  <tr>
    <td class="ctr"><span class="lbl">Federais</span><span class="val">${fmtMoeda(data.vTotTribFed)}</span></td>
    <td class="ctr"><span class="lbl">Estaduais</span><span class="val">${fmtMoeda(data.vTotTribEst)}</span></td>
    <td class="ctr"><span class="lbl">Municipais</span><span class="val">${fmtMoeda(data.vTotTribMun)}</span></td>
  </tr>
</table>

<!-- INFORMAÇÕES COMPLEMENTARES -->
<table class="mt">
  <tr><td class="sec">INFORMAÇÕES COMPLEMENTARES</td></tr>
  <tr><td style="min-height:14mm;font-size:7pt">${infCompHtml}</td></tr>
</table>

</div>
</body>
</html>`;
}
