/* ============================================
   grupo-humanidade / parque da saudade
   Pocket NPS — Escala da Equipe · API (Google Apps Script)
   Bound à planilha "Pocket NPS — Escala da Equipe (base)".
   Alterações: + check-in "Cheguei" — doGet aceita JSONP (?callback) e registrarCheckin()
   grava presença na aba Checkins. Chamado pelo Pocket NPS (roda em outro domínio → JSONP).
   ============================================ */

// -------- Configuração semeada no setup() --------
var VENDEDORES = ['Jaime', 'Guilherme', 'Ana Luiza', 'Ana Maria', 'Felipe'];
var DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
var PDVS = [
  { id: 'facilita',     nome: 'Panfletagem / Facilita',   cor: '#CC900B' },
  { id: 'ps',           nome: 'PDV Parque da Saudade',     cor: '#55684E' },
  { id: 'jardimnorte',  nome: 'PDV Shopping Jardim Norte', cor: '#B5552A' },
  { id: 'spazio',       nome: 'PDV Spazio Designer',       cor: '#3F6C74' },
  { id: 'prospeccao',   nome: 'Prospecção Individual',     cor: '#7A4A63' },
  { id: 'espontanea',   nome: 'Procura Espontânea',        cor: '#4E6A8A' },
  { id: 'instituicoes', nome: 'Instituições',              cor: '#6E4A28' }
];

// ==================== SETUP (rodar 1x) ====================
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // aba Config (editável pelo Ricardo: renomear/recolorir PDVs, trocar vendedores)
  var cfg = ss.getSheetByName('Config') || ss.insertSheet('Config');
  cfg.clear();
  cfg.getRange('A1').setValue('VENDEDORES').setFontWeight('bold');
  for (var i = 0; i < VENDEDORES.length; i++) cfg.getRange(2 + i, 1).setValue(VENDEDORES[i]);
  cfg.getRange('C1').setValue('PONTOS DE VENDA').setFontWeight('bold');
  cfg.getRange('C2').setValue('id'); cfg.getRange('D2').setValue('nome'); cfg.getRange('E2').setValue('cor');
  cfg.getRange('C2:E2').setFontWeight('bold');
  for (var j = 0; j < PDVS.length; j++) {
    cfg.getRange(3 + j, 3).setValue(PDVS[j].id);
    cfg.getRange(3 + j, 4).setValue(PDVS[j].nome);
    cfg.getRange(3 + j, 5).setValue(PDVS[j].cor).setBackground(PDVS[j].cor).setFontColor('#ffffff');
  }
  cfg.setColumnWidth(4, 240);

  // estado canônico (JSON num único campo) — fonte de verdade
  var est = ss.getSheetByName('_estado') || ss.insertSheet('_estado');
  est.clear();
  est.getRange('A1').setValue(JSON.stringify({ semana: segundaFeira(), escala: {} }));
  est.hideSheet();

  // aba Escala — espelho legível (cosmético, para você ver na planilha)
  espelhar_();

  SpreadsheetApp.getActiveSpreadsheet().toast('Setup concluído. Agora publique como Web App.');
}

// ==================== LEITURA (GET) ====================
function doGet(e) {
  var p = (e && e.parameter) || {};
  // JSONP: ?callback=fn — é assim que o Pocket NPS (outro domínio) chama o check-in.
  if (p.callback) {
    var out;
    try {
      if (p.acao === 'checkin') { out = registrarCheckin(p.vendedor, p.posto, p.dia, p.data); }
      else { out = estadoCompleto_(); }
    } catch (err) { out = { ok: false, erro: String(err) }; }
    return ContentService.createTextOutput(p.callback + '(' + JSON.stringify(out) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(estadoCompleto_());
}

// ==================== ESCRITA (POST) ====================
// body (text/plain com JSON):
//   { acao:'marcar', vendedor, dia:1..6, turno:'D'|'M'|'T', pdv:'id' | '' }
//   { acao:'limpar_semana' }
//   { acao:'nova_semana', semana:'AAAA-MM-DD' }
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
    var body = JSON.parse(e.postData.contents || '{}');
    var st = lerEstado_();

    if (body.acao === 'limpar_semana') {
      st.escala = {};
    } else if (body.acao === 'nova_semana') {
      st.semana = body.semana || segundaFeira();
      st.escala = {};
    } else { // marcar
      var v = String(body.vendedor || '');
      var dia = String(parseInt(body.dia, 10));
      var turno = (body.turno || 'D').toUpperCase(); // D=dia inteiro, M=manhã, T=tarde
      var pdv = String(body.pdv || '');
      if (!v || !(parseInt(dia,10) >= 1 && parseInt(dia,10) <= 6)) throw new Error('parâmetros inválidos');
      if (!st.escala[v]) st.escala[v] = {};
      var cel = st.escala[v][dia] || {};

      if (turno === 'D') {
        cel = pdv ? { tipo: 'full', pdv: pdv } : null; // vazio limpa o dia
      } else {
        // divide manhã/tarde: preserva o outro turno
        var m = cel.tipo === 'split' ? cel.m : (cel.tipo === 'full' ? cel.pdv : '');
        var t = cel.tipo === 'split' ? cel.t : (cel.tipo === 'full' ? cel.pdv : '');
        if (turno === 'M') m = pdv; else t = pdv;
        cel = (m || t) ? { tipo: 'split', m: m || '', t: t || '' } : null;
      }
      if (cel) st.escala[v][dia] = cel; else if (st.escala[v]) delete st.escala[v][dia];
    }

    salvarEstado_(st);
    espelhar_();
    return json_(estadoCompleto_());
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ==================== helpers ====================
function estadoCompleto_() {
  var st = lerEstado_();
  return {
    ok: true,
    semana: st.semana,
    dias: DIAS,
    vendedores: lerVendedores_(),
    pdvs: lerPdvs_(),
    escala: st.escala
  };
}
function lerEstado_() {
  var est = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_estado');
  var raw = est.getRange('A1').getValue();
  var st = raw ? JSON.parse(raw) : { semana: segundaFeira(), escala: {} };
  if (!st.escala) st.escala = {};
  if (!st.semana) st.semana = segundaFeira();
  return st;
}
function salvarEstado_(st) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_estado').getRange('A1').setValue(JSON.stringify(st));
}
function lerVendedores_() {
  var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  var vals = cfg.getRange('A2:A' + (cfg.getLastRow())).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) if (vals[i][0]) out.push(String(vals[i][0]));
  return out.length ? out : VENDEDORES;
}
function lerPdvs_() {
  var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  var vals = cfg.getRange('C3:E' + (cfg.getLastRow())).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) if (vals[i][0]) out.push({ id: String(vals[i][0]), nome: String(vals[i][1]), cor: String(vals[i][2]) });
  return out.length ? out : PDVS;
}
function espelhar_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Escala') || ss.insertSheet('Escala');
  sh.clear();
  var vend = lerVendedores_(), pdvs = lerPdvs_(), st = lerEstado_();
  var mapa = {}; for (var i = 0; i < pdvs.length; i++) mapa[pdvs[i].id] = pdvs[i];
  sh.getRange(1, 1).setValue('Semana de ' + st.semana).setFontWeight('bold');
  var head = ['Vendedor'].concat(DIAS);
  sh.getRange(2, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  for (var r = 0; r < vend.length; r++) {
    sh.getRange(3 + r, 1).setValue(vend[r]);
    for (var d = 1; d <= 6; d++) {
      var cel = (st.escala[vend[r]] || {})[String(d)];
      var rng = sh.getRange(3 + r, 1 + d);
      if (!cel) { rng.setValue(''); rng.setBackground(null); continue; }
      if (cel.tipo === 'full') {
        var p = mapa[cel.pdv] || { nome: cel.pdv, cor: null };
        rng.setValue(p.nome).setBackground(p.cor).setFontColor('#ffffff');
      } else {
        var pm = mapa[cel.m] || { nome: cel.m || '—' }, pt = mapa[cel.t] || { nome: cel.t || '—' };
        rng.setValue('M: ' + (pm.nome || '—') + '  |  T: ' + (pt.nome || '—')).setBackground('#EFEFE7').setFontColor('#42270C');
      }
    }
  }
  sh.setColumnWidth(1, 110);
  for (var c = 2; c <= 7; c++) sh.setColumnWidth(c, 150);
}
function segundaFeira() {
  var d = new Date(); var dow = d.getDay(); // 0=Dom..6=Sáb
  var diff = (dow + 6) % 7; // dias desde segunda
  d.setDate(d.getDate() - diff);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'yyyy-MM-dd');
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ==================== CHECK-IN "Cheguei" ====================
// O Pocket NPS (escala mensal) já sabe o posto de hoje e o envia; aqui só registramos.
// Sem "_" no fim (pode ser chamado por JSONP e por google.script.run).
function garantirCheckins_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Checkins');
  if (!sh) {
    sh = ss.insertSheet('Checkins');
    sh.appendRow(['Carimbo', 'Data', 'Hora', 'Dia', 'Vendedor', 'Posto']);
    sh.getRange('A1:F1').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function registrarCheckin(vendedor, posto, dia, dataISO) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
    vendedor = String(vendedor || '');
    if (!vendedor) throw new Error('vendedor vazio');
    posto = String(posto || '(fora da escala)');
    dia = String(dia || '');
    var tz = Session.getScriptTimeZone() || 'America/Sao_Paulo';
    var agora = new Date();
    garantirCheckins_().appendRow([
      Utilities.formatDate(agora, tz, 'yyyy-MM-dd HH:mm:ss'),
      dataISO ? String(dataISO) : Utilities.formatDate(agora, tz, 'yyyy-MM-dd'),
      Utilities.formatDate(agora, tz, 'HH:mm'),
      dia,
      vendedor,
      posto
    ]);
    return { ok: true, quando: Utilities.formatDate(agora, tz, 'HH:mm'), vendedor: vendedor, posto: posto };
  } catch (err) {
    return { ok: false, erro: String(err) };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
