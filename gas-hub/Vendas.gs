/**
 * Vendas.gs — módulo de vendas do cofre (sucessor do Codigo_Ponte.gs).
 * Mesmo contrato do script-ponte antigo (headers + vendas em JSON),
 * mas lendo/gravando na ABA 'Vendas' do cofre único (não mais na
 * primeira aba de uma planilha dedicada).
 */

var ABA_VENDAS = 'Vendas';

function _abaVendas() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_VENDAS);
  if (!sh) throw new Error('Aba "' + ABA_VENDAS + '" não encontrada — rode setupCofre() primeiro.');
  return sh;
}

/** Lista todas as vendas. Retorno: {ok, headers, vendas:[{coluna:valor}]} */
function Vendas_list() {
  var sh = _abaVendas();
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  var vendas = values
    .filter(function (r) { return r.join('').toString().trim() !== ''; })
    .map(function (r) {
      var o = {};
      headers.forEach(function (h, i) {
        var val = r[i];
        // Datas viram texto AAAA-MM-DD para o painel entender fácil.
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
        o[h] = val;
      });
      return o;
    });
  return { ok: true, headers: headers, vendas: vendas };
}

/** Grava uma venda. O corpo JSON traz as colunas pelo nome (e o token, que é ignorado aqui). */
function Vendas_add(body) {
  var sh = _abaVendas();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    return body[h] !== undefined && body[h] !== null ? body[h] : '';
  });
  sh.appendRow(row);
  // Jazigo como texto (preserva zero à esquerda, ex.: "07")
  var col = headers.indexOf('Jazigo') + 1;
  if (col > 0) sh.getRange(sh.getLastRow(), col).setNumberFormat('@');
  var gravado = {};
  headers.forEach(function (h, i) { gravado[h] = row[i]; });
  return { ok: true, gravado: gravado };
}
