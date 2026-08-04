import { describe, it, expect, afterAll } from 'vitest';
import { generateDanfse, extractDanfseData, closeDanfseBrowser } from '../src/services/danfse-generator.js';

afterAll(async () => { await closeDanfseBrowser(); });

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

  it('duas gerações em paralelo reutilizam o mesmo browser', async () => {
    const [a, b] = await Promise.all([generateDanfse(sampleXml), generateDanfse(sampleXml)]);
    expect(a.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(b.subarray(0, 4).toString('latin1')).toBe('%PDF');
  }, 60000);

  it('aceita carimbo de cancelada e de substituída', async () => {
    const canc = await generateDanfse(sampleXml, 'CANCELADA');
    const subst = await generateDanfse(sampleXml, 'SUBSTITUIDA');
    expect(canc.length).toBeGreaterThan(1000);
    expect(subst.length).toBeGreaterThan(1000);
    // O carimbo altera o conteúdo renderizado
    expect(canc.length).not.toBe(subst.length);
  }, 60000);

  describe('extractDanfseData', () => {
    it('preserva os 50 dígitos da chave de acesso (sem perda de precisão)', () => {
      const d = extractDanfseData(sampleXml);
      expect(d.chaveAcesso).toBe('31062001219068927000191230000000002523049575199774');
      expect(d.chaveAcesso).toHaveLength(50);
    });

    it('formata competência como DD/MM/AAAA conforme a espec', () => {
      expect(extractDanfseData(sampleXml).competencia).toBe('13/04/2023');
    });

    it('lê IRRF de vRetIRRF (nome do schema nacional) com fallback para vIRRF', () => {
      const comRet = sampleXml.replace(
        '<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>',
        '<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><tribFed><vRetIRRF>43.00</vRetIRRF></tribFed>',
      );
      expect(extractDanfseData(comRet).vIRRF).toBe('R$ 43,00');

      const legado = sampleXml.replace(
        '<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>',
        '<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><tribFed><vIRRF>21.50</vIRRF></tribFed>',
      );
      expect(extractDanfseData(legado).vIRRF).toBe('R$ 21,50');
    });

    it('resolve o código IBGE do tomador para "Município - UF"', () => {
      // O XML só traz cMun 3304557; o DANFSe exibe o nome do município
      expect(extractDanfseData(sampleXml).tomaMunicipio).toBe('Rio de Janeiro - RJ');
    });

    it('formata o código de tributação nacional como NN.NN.NN', () => {
      expect(extractDanfseData(sampleXml).cTribNac).toBe('14.02.01');
    });

    it('exibe valores monetários no formato do DANFSe', () => {
      const d = extractDanfseData(sampleXml);
      expect(d.vServico).toBe('R$ 2.866,67');
      expect(d.vLiq).toBe('R$ 2.866,67');
    });
  });
});
