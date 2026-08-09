/**
 * Setup.gs — v4 (09/08/2026). SUBSTITUI o v1 do gas-hub/ (e o patch v3, que
 * não chegou a ser aplicado).
 *
 * Mudança da v4: a fonte da importação passa a ser a planilha operacional
 * "Controle de Vendas" (aba VENDAS, 256 vendas jan–ago/2026) — descoberta em
 * 09/08 como a fonte real; a "Painel de Vendas (Vendas)" era um espelho
 * desatualizado (153 linhas, até 27/06). Também: coluna Modalidade
 * (Perpétuo/Reserva/Temporário) entra no cofre; desconto é calculado em %
 * a partir de face/venda; meios de pagamento 1+2 combinados; origem do lead
 * vira Canal de Venda com normalização leve de variantes.
 *
 * Ordem de uso (no editor do Apps Script, após o clasp push):
 *   1. setupCofre()       -> atualiza cabeçalhos + semeia Config
 *   2. reimportarVendas() -> LIMPA a aba Vendas e importa do Controle
 *   3. (gerarToken já foi rodado — não repetir; o token não muda)
 */

// Fonte REAL: "Controle de Vendas", aba VENDAS
var ID_CONTROLE = '1-DBJPgUUNNkDb2bVxO32Gcxr79VzmnoPCcD1dJSCoog';
var ABA_ORIGEM = 'VENDAS';

var EMP_PARQUE = 'Parque da Saudade';
var EMP_ESTRELA = 'Estrela Urbanidade';

var ABAS = {
  'Vendas': ['Data da Venda', 'Quadra', 'Jazigo', 'Vendedor', 'Modalidade', 'Valor Face', 'Valor Venda', 'Desconto', 'Condição Pagamento', 'Forma Pagamento', 'Canal de Venda', 'Empreendimento'],
  'Leads': ['Deal ID', 'Criado em', 'Atualizado em', 'Estágio', 'Status', 'Origem do Lead', 'Valor', 'Vendedor', 'Funil', 'Empreendimento'],
  'Gastos Mídia': ['Mês (AAAA-MM)', 'Canal', 'Investimento (R$)', 'Empreendimento', 'Observação'],
  'Escala (base)': ['Data', 'Posto', 'Vendedor', 'Empreendimento'],
  'Config': ['Chave', 'Valor', 'Observação']
};

var CONFIG_SEED = [
  ['facilita.funnel_id.' + EMP_PARQUE, '2', 'Funil do Parque no CRM Facilita'],
  ['facilita.stage_won.' + EMP_PARQUE, '22', 'Venda ganha (Parque)'],
  ['facilita.stage_lost.' + EMP_PARQUE, '23', 'Venda perdida (Parque)'],
  ['facilita.funnel_id.' + EMP_ESTRELA, '1', 'Funil da Estrela no Facilita — estágios a mapear'],
  ['meta.jazigos.2026-08.' + EMP_PARQUE, '80', 'Meta oficial ago/2026 (desafio 100)'],
  ['fonte.vendas', ID_CONTROLE, 'Controle de Vendas (aba VENDAS) — fonte da importação']
];

// Normalizações (iguais à prévia validada no Cowork em 09/08)
var MAPA_FORMA = { 'PIX': 'Pix', 'CARTÃO DE CRÉDITO': 'Cartão de Crédito', 'CARTÃO DE DÉBITO': 'Cartão de Débito', 'BOLETO': 'Boleto', 'FUNAMIR': 'Funamir', 'DÉBITO': 'Débito' };
var MAPA_PRAZO = { 'MÉDIO': 'Médio', 'LONGO': 'Longo', 'CURTO': 'Curto', 'À VISTA': 'À vista', 'AMIR/FUNAMIR': 'Amir/Funamir', 'PERMUTA': 'Permuta' };
// variantes evidentes do mesmo canal (lista padronizada oficial ainda é rascunho)
var MAPA_CANAL = {
  'PANFLETO': 'Panfletagem',
  'PROSPECÇÃO PRÓRPIA': 'Prospecção própria',
  'PDV SHOPPING JARDIM NORTE': 'PDV Shopping',
  'TRÁFEGO PAGO - FACEBOOK': 'Tráfego pago - Facebook'
};

/** Cria/atualiza as abas (reescreve cabeçalhos; acrescenta colunas novas) e semeia a Config. */
function setupCofre() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    var headers = ABAS[nome];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1f4d3a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  var cfg = ss.getSheetByName('Config');
  if (cfg.getLastRow() === 1) {
    cfg.getRange(2, 1, CONFIG_SEED.length, 3).setValues(CONFIG_SEED);
  }
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && padrao.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(padrao);
  Logger.log('Cofre atualizado: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
}

/**
 * LIMPA a aba Vendas e importa do Controle de Vendas (aba VENDAS).
 * Espera ~256 linhas (jan–ago/2026). Confira o total no log.
 */
function reimportarVendas() {
  var destino = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendas');
  if (!destino) throw new Error('Rode setupCofre() antes.');
  var H = ABAS['Vendas'];

  if (destino.getLastRow() > 1) {
    destino.getRange(2, 1, destino.getLastRow() - 1, destino.getMaxColumns()).clear();
  }

  var src = SpreadsheetApp.openById(ID_CONTROLE).getSheetByName(ABA_ORIGEM);
  if (!src) throw new Error('Aba "' + ABA_ORIGEM + '" não encontrada no Controle de Vendas.');
  var values = src.getDataRange().getValues();

  // linha de cabeçalho = a primeira que contém 'VENDEDOR'
  var hi = -1;
  for (var i = 0; i < values.length; i++) {
    if (values[i].map(function (c) { return String(c).trim(); }).indexOf('VENDEDOR') >= 0) { hi = i; break; }
  }
  if (hi < 0) throw new Error('Cabeçalho (VENDEDOR) não encontrado na aba ' + ABA_ORIGEM);
  var hdr = values[hi].map(function (c) { return String(c).trim(); });
  function col(nome) { var j = hdr.indexOf(nome); if (j < 0) throw new Error('Coluna não encontrada: ' + nome); return j; }
  var I = {
    vend: col('VENDEDOR'), modal: col('MODALIDADE'), jaz: col('NÚMERO DO JAZIGO'),
    data: col('DATA DA VENDA'), face: col('VALOR DE TABELA'), venda: col('VALOR DE VENDA'),
    m1: col('MEIO DE PAGAMENTO 1'), m2: col('MEIO DE PAGAMENTO 2'),
    prazo: col('PRAZO'), origem: col('ORIGEM DO LEAD')
  };

  var linhas = [];
  for (var r = hi + 1; r < values.length; r++) {
    var row = values[r];
    var d = row[I.data];
    if (!(d instanceof Date)) continue;                    // sem data válida = não é venda
    var vend = String(row[I.vend] || '').trim();
    if (!vend || vend.toLowerCase() === 'x') continue;     // linha de lixo

    var jazRaw = String(row[I.jaz] || '').trim();
    var m = jazRaw.match(/^(M-\d+)-(\S+)$/);
    var quadra = m ? m[1] : (jazRaw === '' || jazRaw === 'N/A' ? 'N/A' : jazRaw);
    var jazigo = m ? m[2] : '';

    var face = Number(row[I.face]) || 0;
    var venda = Number(row[I.venda]) || 0;
    var desc = face > 0 ? Math.round((face - venda) / face * 10000) / 100 : 0;

    var m1 = _norm(row[I.m1], MAPA_FORMA), m2 = _norm(row[I.m2], MAPA_FORMA);
    var forma = m1 ? (m2 ? m1 + ' + ' + m2 : m1) : 'Não informado';
    var prazo = MAPA_PRAZO[String(row[I.prazo] || '').trim().toUpperCase()] || 'Não informado';

    var orig = String(row[I.origem] || '').trim().replace(/\s+/g, ' ');
    var canal = (orig === '' || orig.toUpperCase() === 'OK') ? 'Não informado'
      : (MAPA_CANAL[orig.toUpperCase()] || orig);

    var modal = String(row[I.modal] || '').trim() || 'Não informado';

    linhas.push([d, quadra, jazigo, vend, modal, face, venda, desc, prazo, forma, canal, EMP_PARQUE]);
  }

  if (linhas.length) {
    destino.getRange(2, H.indexOf('Jazigo') + 1, linhas.length, 1).setNumberFormat('@');
    ['Valor Face', 'Valor Venda', 'Desconto'].forEach(function (c) {
      destino.getRange(2, H.indexOf(c) + 1, linhas.length, 1).setNumberFormat('0.##');
    });
    destino.getRange(2, H.indexOf('Data da Venda') + 1, linhas.length, 1).setNumberFormat('yyyy-mm-dd');
    destino.getRange(2, 1, linhas.length, H.length).setValues(linhas);
  }
  Logger.log('Importadas ' + linhas.length + ' vendas do Controle (esperado: ~256).');
}

function _norm(v, mapa) {
  var s = String(v || '').trim();
  if (!s) return '';
  return mapa[s.toUpperCase()] || s;
}
