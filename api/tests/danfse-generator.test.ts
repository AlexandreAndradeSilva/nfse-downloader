import { describe, it, expect } from 'vitest';
import { generateDanfse } from '../src/services/danfse-generator.js';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS31062001219068927000191230000000002523049575199774">
    <xLocEmi>BELO HORIZONTE</xLocEmi>
    <xLocPrestacao>BELO HORIZONTE</xLocPrestacao>
    <nNFSe>2300000000025</nNFSe>
    <cLocIncid>3106200</cLocIncid>
    <xLocIncid>BELO HORIZONTE</xLocIncid>
    <xTribNac>Assistência técnica.</xTribNac>
    <xTribMun>Assistência técnica</xTribMun>
    <dhProc>2023-04-13T10:12:22-03:00</dhProc>
    <emit>
      <CNPJ>19068927000191</CNPJ>
      <IM>12283260010</IM>
      <xNome>DATABRAND COMERCIO E SERVICOS LTDA</xNome>
      <enderNac><xLgr>RUA FICUS</xLgr><nro>117</nro><xBairro>Inconfidência</xBairro><cMun>3106200</cMun><UF>MG</UF><CEP>30820220</CEP></enderNac>
      <fone>3136560689</fone>
      <email>contato@databrand.com.br</email>
    </emit>
    <valores><vBC>2866.67</vBC><vLiq>2866.67</vLiq></valores>
    <DPS versao="1.00">
      <infDPS Id="DPS1">
        <dhEmi>2023-04-13T10:12:22-03:00</dhEmi>
        <serie>75000</serie>
        <nDPS>2300000000025</nDPS>
        <dCompet>2023-04-13</dCompet>
        <prest>
          <CNPJ>19068927000191</CNPJ>
          <regTrib><opSimpNac>3</opSimpNac></regTrib>
        </prest>
        <toma>
          <CNPJ>02495060000158</CNPJ>
          <xNome>IMPRINT 2001 LTDA</xNome>
          <end><endNac><cMun>3304557</cMun><CEP>20756121</CEP></endNac><xLgr>RUA GOIÁS</xLgr><nro>618</nro><xBairro>PIEDADE</xBairro></end>
          <fone>21999899107</fone>
          <email>andre@aerographic.com.br</email>
        </toma>
        <serv>
          <locPrest><cLocPrestacao>3106200</cLocPrestacao></locPrest>
          <cServ><cTribNac>140201</cTribNac><cTribMun>001</cTribMun><xDescServ>SERVIÇO DE PRÉ-IMPRESSÃO</xDescServ></cServ>
        </serv>
        <valores>
          <vServPrest><vServ>2866.67</vServ></vServPrest>
          <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun></trib>
        </valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;

describe('danfse-generator', () => {
  it('gera um Buffer PDF não vazio a partir de XML válido', async () => {
    const pdf = await generateDanfse(sampleXml);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.slice(0, 4).toString()).toBe('%PDF');
  }, 30000);

  it('não lança erro com XML sem todos os campos', async () => {
    const minimalXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS123"><nNFSe>1</nNFSe><emit><CNPJ>00000000000000</CNPJ></emit><valores><vBC>0</vBC><vLiq>0</vLiq></valores></infNFSe>
</NFSe>`;
    await expect(generateDanfse(minimalXml)).resolves.toBeDefined();
  }, 30000);
});
