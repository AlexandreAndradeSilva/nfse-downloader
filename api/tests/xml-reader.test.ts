import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { readCompanyStats } from '../src/services/xml-reader.js';

const OUTPUT = join(process.cwd(), 'test-xml-reader');

const makeTomadoXml = (vLiq: string, vServ: string, pAliq: string, tpRet: string, vPis: string, vCofins: string) => `
<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS12345678000000000000000000000001">
    <emit><CNPJ>98765432000199</CNPJ><xNome>Prestador X</xNome><enderNac><CEP>01001000</CEP></enderNac></emit>
    <valores><vBC>${vServ}</vBC><vLiq>${vLiq}</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS1">
      <dhEmi>2026-06-10T10:00:00-03:00</dhEmi><dCompet>2026-06-10</dCompet>
      <prest><CNPJ>98765432000199</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
      <toma><CNPJ>12345678000100</CNPJ><xNome>Empresa Y</xNome>
        <end><endNac><cMun>3550308</cMun><CEP>01001000</CEP></endNac><xLgr>R</xLgr><nro>1</nro><xBairro>B</xBairro></end>
      </toma>
      <serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
        <cServ><cTribNac>010100</cTribNac><cTribMun>001</cTribMun><xDescServ>Serv</xDescServ></cServ>
      </serv>
      <valores>
        <vServPrest><vServ>${vServ}</vServ></vServPrest>
        <trib>
          <tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${tpRet}</tpRetISSQN><pAliq>${pAliq}</pAliq></tribMun>
          <tribFed><piscofins><vPis>${vPis}</vPis><vCofins>${vCofins}</vCofins><tpRetPisCofins>2</tpRetPisCofins></piscofins></tribFed>
        </trib>
      </valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;

afterEach(() => { if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true }); });

describe('xml-reader', () => {
  it('soma valores financeiros de XMLs tomados', () => {
    const dir = join(OUTPUT, 'Empresa Teste', '062026', 'tomados');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '000000001-abc.xml'), makeTomadoXml('95.00', '100.00', '5.00', '2', '1.65', '7.60'));
    writeFileSync(join(dir, '000000002-def.xml'), makeTomadoXml('190.00', '200.00', '5.00', '2', '3.30', '15.20'));

    const stats = readCompanyStats(OUTPUT, 'Empresa Teste');
    expect(stats.tomados.count).toBe(2);
    expect(stats.tomados.totalServico).toBeCloseTo(300.00);
    expect(stats.tomados.liquido).toBeCloseTo(285.00);
    expect(stats.tomados.pisCofins).toBeCloseTo(27.75);
  });

  it('retorna zeros quando não há arquivos', () => {
    const stats = readCompanyStats(OUTPUT, 'Empresa Vazia');
    expect(stats.tomados.count).toBe(0);
    expect(stats.tomados.totalServico).toBe(0);
    expect(stats.prestados.count).toBe(0);
  });

  it('separa prestados de tomados pelo diretório', () => {
    const dirT = join(OUTPUT, 'Emp', '062026', 'tomados');
    const dirP = join(OUTPUT, 'Emp', '062026', 'prestados');
    mkdirSync(dirT, { recursive: true });
    mkdirSync(dirP, { recursive: true });
    writeFileSync(join(dirT, '001.xml'), makeTomadoXml('100.00', '100.00', '2.00', '1', '0', '0'));
    writeFileSync(join(dirP, '002.xml'), makeTomadoXml('200.00', '200.00', '2.00', '1', '0', '0'));

    const stats = readCompanyStats(OUTPUT, 'Emp');
    expect(stats.tomados.count).toBe(1);
    expect(stats.prestados.count).toBe(1);
  });
});
