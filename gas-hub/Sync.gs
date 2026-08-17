/**
 * Sync.gs — sincronização automática do Cofre (17/08/2026).
 *
 * PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * O reimportarVendas() do Setup.gs é manual. Foi rodado uma vez em 09/08 e
 * nunca mais. Em 17/08 o Cofre ainda mostrava 11 vendas de agosto (o número
 * daquele dia) contra 21 reais — e ninguém percebeu por oito dias, porque
 * nada no Cofre dizia quando ele tinha sido atualizado pela última vez.
 *
 * O QUE FAZ
 *   1. sincronizarVendas()        -> reimporta e CARIMBA a data/hora na Config
 *   2. instalarGatilhoImportacao() -> instala o gatilho periódico (rodar UMA vez)
 *   3. removerGatilhoImportacao()  -> desinstala, se precisar
 *   4. statusSincronizacao()       -> mostra no log quando foi a última
 *
 * COMO ATIVAR (uma vez só, no editor do Apps Script):
 *   - clasp push
 *   - rodar instalarGatilhoImportacao()
 *   - conferir em "Acionadores" (ícone de relógio) que o gatilho apareceu
 *
 * DEPOIS DISSO o Cofre se atualiza sozinho e a Config guarda o carimbo em
 * `cofre.ultima_importacao` e `cofre.total_vendas`. O Painel Comercial deve
 * LER essas duas chaves e exibi-las — número sem procedência é número que o
 * Rodrigo contesta uma vez e derruba a confiança no painel inteiro.
 */

var SYNC_FUNCAO = 'sincronizarVendas';
var SYNC_INTERVALO_HORAS = 4;

/**
 * Reimporta as vendas do Controle e carimba o resultado na Config.
 * É esta função que o gatilho chama — não a reimportarVendas() direto.
 */
function sincronizarVendas() {
  var inicio = new Date();
  var erro = '';
  var total = 0;

  try {
    reimportarVendas();                       // definida no Setup.gs
    total = _contarVendas();
  } catch (e) {
    erro = String(e && e.message ? e.message : e);
  }

  var tz = Session.getScriptTimeZone();
  var carimbo = Utilities.formatDate(inicio, tz, 'yyyy-MM-dd HH:mm');

  _setConfig('cofre.ultima_importacao', carimbo,
             erro ? 'FALHOU: ' + erro : 'Importação automática, a cada ' + SYNC_INTERVALO_HORAS + 'h');
  _setConfig('cofre.total_vendas', String(total),
             'Linhas na aba Vendas na última importação');

  if (erro) {
    Logger.log('FALHA na sincronização: ' + erro);
    throw new Error(erro);                    // deixa o Apps Script te notificar por e-mail
  }
  Logger.log('Sincronizado em ' + carimbo + ' — ' + total + ' vendas.');
}

/** Instala o gatilho periódico. Idempotente: remove o antigo antes de criar. */
function instalarGatilhoImportacao() {
  removerGatilhoImportacao();
  ScriptApp.newTrigger(SYNC_FUNCAO)
    .timeBased()
    .everyHours(SYNC_INTERVALO_HORAS)
    .create();
  Logger.log('Gatilho instalado: ' + SYNC_FUNCAO + ' a cada ' + SYNC_INTERVALO_HORAS + 'h.');
  sincronizarVendas();                        // roda agora, para não esperar o 1º ciclo
}

/** Remove o gatilho, se existir. */
function removerGatilhoImportacao() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === SYNC_FUNCAO) { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('Gatilhos removidos: ' + n);
}

/** Mostra no log o estado da última sincronização. */
function statusSincronizacao() {
  var quando = _getConfig('cofre.ultima_importacao') || '(nunca)';
  var total = _getConfig('cofre.total_vendas') || '(desconhecido)';
  var ativos = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === SYNC_FUNCAO;
  }).length;
  Logger.log('Última importação: ' + quando + ' | Vendas: ' + total + ' | Gatilhos ativos: ' + ativos);
}

// ---------- auxiliares ----------

function _contarVendas() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendas');
  if (!sh) return 0;
  var ultima = sh.getLastRow();
  return ultima > 1 ? ultima - 1 : 0;
}

function _cfgSheet() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  if (!sh) throw new Error('Aba "Config" não encontrada — rode setupCofre() antes.');
  return sh;
}

function _setConfig(chave, valor, obs) {
  var sh = _cfgSheet();
  var ultima = sh.getLastRow();
  if (ultima > 1) {
    var chaves = sh.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < chaves.length; i++) {
      if (String(chaves[i][0]).trim() === chave) {
        sh.getRange(i + 2, 2, 1, 2).setValues([[valor, obs || '']]);
        return;
      }
    }
  }
  sh.appendRow([chave, valor, obs || '']);
}

function _getConfig(chave) {
  var sh = _cfgSheet();
  var ultima = sh.getLastRow();
  if (ultima < 2) return '';
  var dados = sh.getRange(2, 1, ultima - 1, 2).getValues();
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === chave) return String(dados[i][1]);
  }
  return '';
}
