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
  // Tributação
  tribISSQN: string;
  tpRetISSQN: string;
  vBC: string;
  pISSQN: string;
  vISSQN: string;
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

export function buildDanfseHtml(d: DanfseData): string {
  const retISSQN = d.tpRetISSQN === '1' ? 'Retido' : 'Não Retido';
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
    <td style="width:18%; border:1px solid #555; text-align:center; padding:6px 4px">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 80" style="width:100%;max-width:110px">
        <!-- N com bandeira -->
        <text x="2" y="62" font-family="Arial Black,Arial" font-weight="900" font-size="62" fill="#3a7d3a">N</text>
        <polygon points="14,8 28,8 28,28" fill="#009c3b" opacity="0.7"/>
        <polygon points="14,8 28,8 14,28" fill="#ffdf00" opacity="0.8"/>
        <circle cx="21" cy="18" r="5" fill="#002776" opacity="0.6"/>
        <!-- F -->
        <text x="48" y="62" font-family="Arial Black,Arial" font-weight="900" font-size="62" fill="#3a7d3a">F</text>
        <!-- S -->
        <text x="88" y="62" font-family="Arial Black,Arial" font-weight="900" font-size="62" fill="#3a7d3a">S</text>
        <!-- e -->
        <text x="135" y="62" font-family="Arial Black,Arial" font-weight="900" font-size="55" fill="#1a2e6e">e</text>
        <!-- subtítulo -->
        <text x="110" y="76" font-family="Arial" font-size="9" fill="#666" text-anchor="middle">Nota Fiscal de Serviço Eletrônica</text>
      </svg>
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
      <span class="val">${d.tribISSQN === '1' ? 'Tributável' : fmt(d.tribISSQN)}</span>
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
    <td><span class="lbl">Alíquota Aplicada</span><span class="val">${fmt(d.pISSQN)}</span></td>
    <td><span class="lbl">Retenção do ISSQN</span><span class="val">${retISSQN}</span></td>
    <td><span class="lbl">ISSQN Apurado</span><span class="val">${fmtMoeda(d.vISSQN)}</span></td>
  </tr>
</table>

<!-- TRIBUTAÇÃO FEDERAL -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">TRIBUTAÇÃO FEDERAL</td></tr>
  <tr>
    <td style="width:25%"><span class="lbl">IRRF</span><span class="val">-</span></td>
    <td style="width:25%"><span class="lbl">CP</span><span class="val">-</span></td>
    <td style="width:25%"><span class="lbl">CSLL</span><span class="val">-</span></td>
    <td style="width:25%"></td>
  </tr>
  <tr>
    <td><span class="lbl">PIS</span><span class="val">-</span></td>
    <td><span class="lbl">COFINS</span><span class="val">-</span></td>
    <td><span class="lbl">Retenção do PIS/COFINS</span><span class="val">-</span></td>
    <td><span class="lbl"><strong>TOTAL TRIBUTAÇÃO FEDERAL</strong></span><span class="val">-</span></td>
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
    <td style="width:33%; text-align:center"><span class="lbl">Federais</span><span class="val">-</span></td>
    <td style="width:33%; text-align:center"><span class="lbl">Estaduais</span><span class="val">-</span></td>
    <td style="width:34%; text-align:center"><span class="lbl">Municipais</span><span class="val">-</span></td>
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
