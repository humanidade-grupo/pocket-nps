/**
 * Setup.gs — funções de instalação do cofre. Rodam UMA VEZ, no editor
 * do Apps Script (ou via clasp run), nunca pelas rotas web.
 *
 * Ordem de uso:
 *   1. setupCofre()                    -> cria as abas com cabeçalhos
 *   2. importarVendasDaPlanilhaAntiga() -> copia o histórico da "(Vendas)" antiga
 *   3. gerarToken()  (em Auth.gs)      -> gera o TOKEN_GESTAO
 */

// Planilha antiga "Painel de Vendas — Parque da Saudade (Vendas)"
var ID_PLANILHA_ANTIGA = '1LrUban6l531wlW5p0JB2jnA7_foqnaCFqepgpivojgo';

var ABAS = {
  'Vendas': ['Data da Venda', 'Quadra', 'Jazigo', 'Vendedor', 'Valor Face', 'Valor Venda', 'Desconto', 'Condição Pagamento', 'Forma Pagamento', 'Canal de Venda'],
  'Leads': ['Deal ID', 'Criado em', 'Atualizado em', 'Estágio', 'Status', 'Origem do Lead', 'Valor', 'Vendedor', 'Funil'],
  'Gastos Mídia': ['Mês (AAAA-MM)', 'Canal', 'Investimento (R$)', 'Observação'],
  'Escala (base)': ['Data', 'Posto', 'Vendedor'],
  'Config': ['Chave', 'Valor', 'Observação']
};

/** Cria as abas do cofre (só as que faltarem) com cabeçalho formatado. */
function setupCofre() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      var headers = ABAS[nome];
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#1f4d3a').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  // apaga a "Página1"/"Sheet1" vazia que nasce com a planilha
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && padrao.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(padrao);
  Logger.log('Cofre pronto: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
}

/**
 * Importa o histórico da planilha antiga para a aba Vendas.
 * Idempotente na prática: só roda se a aba Vendas estiver vazia (além do cabeçalho).
 * A coluna Jazigo vira texto para preservar zeros à esquerda.
 */
function importarVendasDaPlanilhaAntiga() {
  var destino = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendas');
  if (!destino) throw new Error('Rode setupCofre() antes.');
  if (destino.getLastRow() > 1) throw new Error('A aba Vendas já tem dados — importação abortada para não duplicar.');

  var origem = SpreadsheetApp.openById(ID_PLANILHA_ANTIGA).getSheets()[0];
  var values = origem.getDataRange().getValues();
  var headersOrigem = values.shift();
  var headersDestino = ABAS['Vendas'];

  // mapeia coluna a coluna pelo NOME (tolera ordem diferente)
  var idx = headersDestino.map(function (h) { return headersOrigem.indexOf(h); });
  var linhas = values
    .filter(function (r) { return r.join('').toString().trim() !== ''; })
    .map(function (r) {
      return idx.map(function (i, j) {
        if (i < 0) return '';
        var v = r[i];
        if (headersDestino[j] === 'Jazigo') v = String(v); // preserva "07"
        return v;
      });
    });

  if (linhas.length) {
    destino.getRange(2, headersDestino.indexOf('Jazigo') + 1, linhas.length, 1).setNumberFormat('@');
    destino.getRange(2, 1, linhas.length, headersDestino.length).setValues(linhas);
  }
  Logger.log('Importadas ' + linhas.length + ' vendas da planilha antiga.');
}
