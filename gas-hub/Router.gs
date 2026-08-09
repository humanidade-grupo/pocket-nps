/**
 * Router.gs — porta de entrada única do backend do Hub Comercial.
 * Todas as chamadas passam por aqui: ?app=<módulo>&fn=<função>.
 *
 * Rotas atuais:
 *   GET  ?app=vendas&fn=list&token=...   -> lista as vendas (dashboard lê)
 *   POST ?app=vendas&fn=add              -> grava uma venda (lançamento manda; token no corpo)
 *   GET  ?app=ping                       -> {ok:true} sem token (teste de vida)
 *
 * Rotas futuras (stubs em Coletor.gs / Proxy.gs):
 *   ?app=leads&fn=list                   -> leads coletados do Facilita (FAROL)
 *   ?app=farol&fn=chat                   -> proxy do chat IA (FAROL)
 *
 * Segurança: toda rota (exceto ping) exige token — ver Auth.gs.
 * POST vem com Content-Type text/plain (evita preflight CORS); o token vai no corpo JSON.
 * A cada alteração: clasp push + Implantar > Gerenciar implantações > Nova versão (mantém a URL).
 */

function doGet(e) {
  return _route(e, 'get');
}

function doPost(e) {
  return _route(e, 'post');
}

function _route(e, method) {
  try {
    var p = (e && e.parameter) || {};
    var app = String(p.app || 'vendas');
    var fn = String(p.fn || (method === 'get' ? 'list' : 'add'));

    // corpo (só em POST)
    var body = {};
    if (method === 'post' && e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    // teste de vida, sem token
    if (app === 'ping') return _json({ ok: true, hub: 'comercial', ts: new Date().toISOString() });

    // autenticação (token na query OU no corpo)
    var token = String(p.token || body.token || '');
    if (!Auth_ok(token)) {
      return _json({ ok: false, error: 'token ausente ou inválido' });
    }

    // despacho
    if (app === 'vendas' && fn === 'list') return _json(Vendas_list());
    if (app === 'vendas' && fn === 'add') return _json(Vendas_add(body));
    if (app === 'leads' && fn === 'list') return _json(Coletor_listLeads());
    if (app === 'farol' && fn === 'chat') return _json(Proxy_chat(body));

    return _json({ ok: false, error: 'rota desconhecida: ' + app + '/' + fn });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
