/**
 * Coletor.gs — STUB (FAROL, ainda não ativo).
 * Coletor Facilita -> aba Leads. Entra em produção quando o FAROL sair
 * da concepção. Deixado aqui para o Router já conhecer a rota.
 *
 * Quando ativar:
 *   - credenciais do Facilita em Script Properties (FACILITA_TOKEN etc.
 *     — ver Sistemas/CRM Facilita.md no projeto claude.ai)
 *   - GET /deals?funnel_id=2 · venda ganha = stage 22 · perdida = 23
 *   - gatilho de tempo (1x/dia) chamando Coletor_executar()
 *   - o campo "Origem do Lead" ainda precisa ser criado na interface do
 *     Facilita (bloqueio nº 1 do FAROL)
 */

function Coletor_listLeads() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads');
  if (!sh || sh.getLastRow() < 2) return { ok: true, leads: [], aviso: 'coletor ainda não ativo' };
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  var leads = values.map(function (r) {
    var o = {};
    headers.forEach(function (h, i) {
      var v = r[i];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      o[h] = v;
    });
    return o;
  });
  return { ok: true, leads: leads };
}

/** Futuro: busca deals no Facilita e despeja na aba Leads. */
function Coletor_executar() {
  throw new Error('Coletor ainda não implementado — aguarda ativação do FAROL.');
}
