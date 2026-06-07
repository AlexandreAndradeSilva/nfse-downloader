export interface DanfseData {
  chaveAcesso: string;
  numeroNFSe: string;
  competencia: string;
  dhEmissao: string;
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
  emitCep: string;
  emitSimplesNac: string;
  // Tomador
  tomaCnpj: string;
  tomaNome: string;
  tomaEndereco: string;
  tomaMunicipio: string;
  tomaCep: string;
  tomaTelefone: string;
  tomaEmail: string;
  // Serviço
  cTribNac: string;
  xTribNac: string;
  cTribMun: string;
  xTribMun: string;
  xDescServ: string;
  xLocPrestacao: string;
  // Tributação ISSQN
  tribISSQN: string;
  tpRetISSQN: string;
  vBC: string;
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
  xMunicipioIncid: string;
}

function fmt(v: string | undefined | null): string {
  return v?.toString().trim() || '-';
}

function fmtCnpj(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v;
}

function fmtCep(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : v;
}

function fmtMoeda(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return '-';
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function fmtFone(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return v;
}

const TRIB_ISSQN: Record<string, string> = {
  '1': 'Tributável', '2': 'Fora do Município', '3': 'Imunidade',
  '4': 'Exportação de Serviços', '5': 'Não Incidência', '6': 'Diferimento',
};

// Padrão nacional NFS-e: 1=ISS Não Retido, 2=ISS Retido pelo Tomador
const TP_RET_ISSQN: Record<string, string> = {
  '1': 'Não Retido',
  '2': 'Retido pelo Tomador',
  '3': 'Não Incide ISSQN',
};

// tpRetPisCofins — campo dentro de piscofins (DPS.infDPS.valores.trib.tribFed.piscofins)
const TP_RET_PISCOFINS: Record<string, string> = {
  '0': '0 - PIS/COFINS/CSLL Não Retidos',
  '1': '1 - PIS/COFINS Retidos',
  '2': '2 - PIS/COFINS Não Retidos',
  '3': '3 - PIS/COFINS/CSLL Retidos',
  '4': '4 - PIS/COFINS Retidos, CSLL Não Retido',
  '5': '5 - PIS Retido',
  '6': '6 - COFINS Retido',
  '7': '7 - COFINS e CSLL Retidos',
  '8': '8 - Apenas CSLL Retido',
  '9': '9 - PIS e CSLL Retidos',
};

export function buildDanfseHtml(d: DanfseData, logoDataUrl?: string): string {
  const retISSQN = TP_RET_ISSQN[d.tpRetISSQN] ?? (d.tpRetISSQN ? `${d.tpRetISSQN}` : '-');
  const tribISSQNDesc = TRIB_ISSQN[d.tribISSQN] ?? (d.tribISSQN || '-');
  const retPisCofinsDesc = TP_RET_PISCOFINS[d.tpRetPisCofins] ?? (d.tpRetPisCofins ? `${d.tpRetPisCofins} - PIS/COFINS` : '-');
  const simpNac = d.emitSimplesNac === '1' ? 'Simples Nacional' : d.emitSimplesNac === '2' ? 'Simples Nacional - Excesso' : 'Não optante';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #000; background: #fff; }
  .page { width: 210mm; padding: 4mm 6mm; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #555; padding: 2px 4px; vertical-align: top; }
  .lbl { font-size: 6pt; color: #444; display: block; margin-bottom: 1px; }
  .val { font-size: 7.5pt; font-weight: bold; }
  .sec { background: #1a1a2e; color: #fff; font-weight: bold; font-size: 7pt;
         padding: 3px 6px; letter-spacing: 0.5px; }
  .sec-light { background: #e8e8e8; font-weight: bold; font-size: 7pt; padding: 2px 6px; }
  .hdr-center { text-align: center; padding: 4px; }
  .hdr-logo { font-size: 14pt; font-weight: 900; color: #1565c0; padding: 6px; }
  .hdr-title { font-size: 11pt; font-weight: bold; }
  .hdr-sub { font-size: 8pt; }
  .chave { font-family: monospace; font-size: 8pt; word-break: break-all; }
  .banner { text-align: center; font-size: 7pt; font-style: italic;
            border: 1px solid #555; padding: 2px; background: #f5f5f5; }
  .info-complementar { min-height: 20mm; border: 1px solid #555; padding: 3px; }
</style>
</head>
<body>
<div class="page">

<!-- CABEÇALHO -->
<table style="margin-bottom:1mm">
  <tr>
    <td style="width:18%; border:1px solid #555; text-align:center; padding:4px">
      ${logoDataUrl
        ? `<img src="${logoDataUrl}" style="max-width:120px;max-height:50px;object-fit:contain" alt="NFS-e"/>`
        : `<div style="font-size:14pt;font-weight:900;color:#3a7d3a">NFS<span style="color:#1a2e6e">e</span></div><div style="font-size:6pt;color:#555">Nota Fiscal de<br>Serviço Eletrônica</div>`
      }
    </td>
    <td style="border:1px solid #555" class="hdr-center">
      <div class="hdr-title">DANFSe v1.0</div>
      <div class="hdr-sub">Documento Auxiliar da NFS-e</div>
    </td>
    <td style="width:25%; border:1px solid #555; text-align:center; padding:4px; font-size:7pt; font-weight:bold">
      ${fmt(d.xMunicipioIncid)}
    </td>
  </tr>
</table>

<!-- CHAVE DE ACESSO -->
<table style="margin-bottom:1mm">
  <tr>
    <td>
      <span class="lbl">Chave de Acesso da NFS-e</span>
      <span class="val chave">${fmt(d.chaveAcesso)}</span>
    </td>
  </tr>
</table>

<!-- NÚMERO / COMPETÊNCIA / EMISSÃO -->
<table style="margin-bottom:0">
  <tr>
    <td style="width:20%">
      <span class="lbl">Número da NFS-e</span>
      <span class="val">${fmt(d.numeroNFSe)}</span>
    </td>
    <td style="width:20%">
      <span class="lbl">Competência da NFS-e</span>
      <span class="val">${fmt(d.competencia)}</span>
    </td>
    <td style="width:35%">
      <span class="lbl">Data e Hora da emissão da NFS-e</span>
      <span class="val">${fmt(d.dhEmissao)}</span>
    </td>
    <td style="width:25%; font-size:6pt; color:#555; font-style:italic" rowspan="2">
      A autenticidade desta NFS-e pode ser verificada pela leitura do QR Code ou pela consulta da chave de acesso no portal nacional da NFS-e.
    </td>
  </tr>
  <tr>
    <td>
      <span class="lbl">Número da DPS</span>
      <span class="val">${fmt(d.numeroDPS)}</span>
    </td>
    <td>
      <span class="lbl">Série da DPS</span>
      <span class="val">${fmt(d.serieDPS)}</span>
    </td>
    <td>
      <span class="lbl">Data e Hora da emissão da DPS</span>
      <span class="val">${fmt(d.dhEmissao)}</span>
    </td>
  </tr>
</table>

<!-- EMITENTE -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">EMITENTE DA NFS-e / Prestador do Serviço</td></tr>
  <tr>
    <td style="width:35%">
      <span class="lbl">CNPJ / CPF / NIF</span>
      <span class="val">${fmtCnpj(d.emitCnpj)}</span>
    </td>
    <td style="width:35%">
      <span class="lbl">Inscrição Municipal</span>
      <span class="val">${fmt(d.emitIm)}</span>
    </td>
    <td style="width:30%">
      <span class="lbl">Telefone</span>
      <span class="val">${fmtFone(d.emitTelefone)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Nome / Nome Empresarial</span>
      <span class="val">${fmt(d.emitNome)}</span>
    </td>
    <td>
      <span class="lbl">E-mail</span>
      <span class="val">${fmt(d.emitEmail)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Endereço</span>
      <span class="val">${fmt(d.emitEndereco)}</span>
    </td>
    <td>
      <span class="lbl">Município / CEP</span>
      <span class="val">${fmt(d.emitMunicipio)} — ${fmtCep(d.emitCep)}</span>
    </td>
  </tr>
  <tr>
    <td style="width:50%">
      <span class="lbl">Simples Nacional na Data da Competência</span>
      <span class="val">${simpNac}</span>
    </td>
    <td colspan="2">
      <span class="lbl">Regime de Apuração Tributária pelo SN</span>
      <span class="val">-</span>
    </td>
  </tr>
</table>

<!-- TOMADOR -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">TOMADOR DO SERVIÇO</td></tr>
  <tr>
    <td style="width:35%">
      <span class="lbl">CNPJ / CPF / NIF</span>
      <span class="val">${fmtCnpj(d.tomaCnpj)}</span>
    </td>
    <td style="width:35%">
      <span class="lbl">Inscrição Municipal</span>
      <span class="val">-</span>
    </td>
    <td style="width:30%">
      <span class="lbl">Telefone</span>
      <span class="val">${fmtFone(d.tomaTelefone)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Nome / Nome Empresarial</span>
      <span class="val">${fmt(d.tomaNome)}</span>
    </td>
    <td>
      <span class="lbl">E-mail</span>
      <span class="val">${fmt(d.tomaEmail)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Endereço</span>
      <span class="val">${fmt(d.tomaEndereco)}</span>
    </td>
    <td>
      <span class="lbl">Município / CEP</span>
      <span class="val">${fmt(d.tomaMunicipio)} — ${fmtCep(d.tomaCep)}</span>
    </td>
  </tr>
</table>

<!-- INTERMEDIARIO -->
<div class="banner" style="margin:1mm 0">INTERMEDIARIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e</div>

<!-- SERVIÇO PRESTADO -->
<table style="margin-bottom:0">
  <tr><td colspan="4" class="sec">SERVIÇO PRESTADO</td></tr>
  <tr>
    <td style="width:30%">
      <span class="lbl">Código de Tributação Nacional</span>
      <span class="val">${fmt(d.cTribNac)} - ${fmt(d.xTribNac)}</span>
    </td>
    <td style="width:30%">
      <span class="lbl">Código de Tributação Municipal</span>
      <span class="val">${fmt(d.cTribMun)} - ${fmt(d.xTribMun)}</span>
    </td>
    <td style="width:20%">
      <span class="lbl">Local da Prestação</span>
      <span class="val">${fmt(d.xLocPrestacao)}</span>
    </td>
    <td style="width:20%">
      <span class="lbl">País da Prestação</span>
      <span class="val">-</span>
    </td>
  </tr>
  <tr>
    <td colspan="4">
      <span class="lbl">Descrição do Serviço</span>
      <span class="val">${fmt(d.xDescServ)}</span>
    </td>
  </tr>
</table>

<!-- TRIBUTAÇÃO MUNICIPAL -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">TRIBUTAÇÃO MUNICIPAL</td></tr>
  <tr>
    <td style="width:25%">
      <span class="lbl">Tributação do ISSQN</span>
      <span class="val">${tribISSQNDesc}</span>
    </td>
    <td style="width:25%">
      <span class="lbl">País Resultado da Prestação do Serviço</span>
      <span class="val">-</span>
    </td>
    <td style="width:25%">
      <span class="lbl">Município de Incidência do ISSQN</span>
      <span class="val">${fmt(d.xMunicipioIncid)}</span>
    </td>
    <td style="width:25%">
      <span class="lbl">Regime Especial de Tributação</span>
      <span class="val">Nenhum</span>
    </td>
  </tr>
  <tr>
    <td><span class="lbl">Tipo de Imunidade</span><span class="val">-</span></td>
    <td><span class="lbl">Suspensão da Exigibilidade do ISSQN</span><span class="val">-</span></td>
    <td><span class="lbl">Número Processo Suspensão</span><span class="val">-</span></td>
    <td><span class="lbl">Benefício Municipal</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">Valor do Serviço</span><span class="val">${fmtMoeda(d.vServico)}</span></td>
    <td><span class="lbl">Desconto Incondicionado</span><span class="val">-</span></td>
    <td><span class="lbl">Total Deduções/Reduções</span><span class="val">-</span></td>
    <td><span class="lbl">Cálculo do BM</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">BC ISSQN</span><span class="val">${fmtMoeda(d.vBC)}</span></td>
    <td><span class="lbl">Alíquota Aplicada</span><span class="val">${d.pISSQN && d.pISSQN !== '-' ? d.pISSQN + '%' : '-'}</span></td>
    <td><span class="lbl">Retenção do ISSQN</span><span class="val">${retISSQN}</span></td>
    <td><span class="lbl">ISSQN Apurado</span><span class="val">${fmtMoeda(d.vISSQN)}</span></td>
  </tr>
</table>

<!-- TRIBUTAÇÃO FEDERAL -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">TRIBUTAÇÃO FEDERAL</td></tr>
  <tr>
    <td style="width:25%"><span class="lbl">IRRF</span><span class="val">${fmtMoeda(d.vIRRF)}</span></td>
    <td style="width:25%"><span class="lbl">Contribuição Previdenciária - Retida</span><span class="val">${fmtMoeda(d.vCP)}</span></td>
    <td style="width:25%"><span class="lbl">Contribuições Sociais - Retidas (CSLL)</span><span class="val">${fmtMoeda(d.vCSLL)}</span></td>
    <td style="width:25%"><span class="lbl">Descrição Contrib. Sociais - Retidas</span><span class="val">${retPisCofinsDesc}</span></td>
  </tr>
  <tr>
    <td><span class="lbl">PIS - Débito Apuração Própria</span><span class="val">${fmtMoeda(d.vPIS)}</span></td>
    <td><span class="lbl">COFINS - Débito Apuração Própria</span><span class="val">${fmtMoeda(d.vCOFINS)}</span></td>
    <td><span class="lbl">Retenção do PIS/COFINS</span><span class="val">-</span></td>
    <td style="background:#f5f5f5"><span class="lbl"><strong>TOTAL TRIBUTAÇÃO FEDERAL</strong></span><span class="val">${fmtMoeda(d.vTotTribFed)}</span></td>
  </tr>
</table>

<!-- VALOR TOTAL DA NFS-E -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">VALOR TOTAL DA NFS-E</td></tr>
  <tr>
    <td style="width:25%"><span class="lbl">Valor do Serviço</span><span class="val">${fmtMoeda(d.vServico)}</span></td>
    <td style="width:25%"><span class="lbl">Desconto Condicionado</span><span class="val">R$</span></td>
    <td style="width:25%"><span class="lbl">Desconto Incondicionado</span><span class="val">R$</span></td>
    <td style="width:25%"><span class="lbl">ISSQN Retido</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">IRRF, CP, CSLL - Retidos</span><span class="val">R$ 0,00</span></td>
    <td><span class="lbl">PIS/COFINS Retidos</span><span class="val">-</span></td>
    <td></td>
    <td style="background:#fffde7">
      <span class="lbl"><strong>Valor Líquido da NFS-e</strong></span>
      <span class="val" style="font-size:10pt">${fmtMoeda(d.vLiq)}</span>
    </td>
  </tr>
</table>

<!-- TOTAIS TRIBUTOS -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="3" class="sec-light">TOTAIS APROXIMADOS DOS TRIBUTOS</td></tr>
  <tr>
    <td style="width:33%; text-align:center"><span class="lbl">Federais</span><span class="val">${fmtMoeda(d.vTotTribFed)}</span></td>
    <td style="width:33%; text-align:center"><span class="lbl">Estaduais</span><span class="val">${fmtMoeda(d.vTotTribEst)}</span></td>
    <td style="width:34%; text-align:center"><span class="lbl">Municipais</span><span class="val">${fmtMoeda(d.vTotTribMun)}</span></td>
  </tr>
</table>

<!-- INFORMAÇÕES COMPLEMENTARES -->
<table style="margin-top:1mm">
  <tr><td class="sec-light">INFORMAÇÕES COMPLEMENTARES</td></tr>
  <tr><td class="info-complementar" style="font-size:7pt; color:#333">
    Chave: ${fmt(d.chaveAcesso)}
  </td></tr>
</table>

</div>
</body>
</html>`;
}
