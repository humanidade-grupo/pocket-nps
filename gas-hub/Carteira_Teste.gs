/**
 * Carteira_Teste.gs — banco de provas da Carteira do Dia (Frente 1)
 * Parque da Saudade / Grupo Humanidade — gerado em 12/08/2026 22:05.
 *
 * Roda TUDO numa planilha descartável, criada na hora com dados de mentira.
 * O cofre "Hub Comercial" não é lido nem escrito em momento nenhum — é o
 * ponto: dá para testar a lógica antes de existir um único lead de verdade.
 *
 * Como usar (editor do Apps Script):
 *   1. Selecione a função `testeCarteira` e clique em Executar.
 *   2. Abra Execuções (ou Ctrl+Enter) e leia o registro: cada linha é um
 *      critério de aceite, com OK ou FALHOU.
 *   3. A última linha traz o link da planilha de teste. Confira se quiser e
 *      mande para a lixeira — o script não apaga nada sozinho (apagar exigiria
 *      dar ao projeto permissão sobre todo o seu Drive, o que não vale a pena).
 *
 * Nada aqui vai para produção; o arquivo pode ficar no repo como rede de
 * segurança para as próximas frentes.
 */

var TESTE_PIN = '123456';
var TESTE_PIN_ERRADO = '999999';

/** Roda a bateria inteira. Não para no primeiro erro: reporta todos. */
function testeCarteira() {
  var t = _tNovo();
  var ss = null;

  try {
    CARTEIRA_SALT_TESTE = 'salt-de-mentira-so-para-teste';
    ss = _tCriarPlanilha();
    CARTEIRA_SS_TESTE = ss;

    _tSemear(ss);

    _tLogin(t);
    _tBloqueioPin(t);
    _tSessao(t);
    _tLote(t);
    _tConcorrencia(t);
    _tOptout(t);
    _tJanela(t);
    _tKillSwitch(t);
    _tReservaVencida(t);
    _tDesfechos(t);
    _tDesfechoIdempotente(t);
    _tDesfechoPosse(t);
    _tDesfechoOptout(t);
    _tDesfechoPulado(t);
    _tDesfechoComKillSwitch(t);
    _tNaoImplementado(t);
  } catch (err) {
    t.falhas.push('EXCEÇÃO: ' + (err && err.stack ? err.stack : err));
  } finally {
    CARTEIRA_SS_TESTE = null;
    CARTEIRA_SALT_TESTE = null;
  }

  _tRelatorio(t, ss);
}

/* ------------------------------------------------------------------ *
 * Os testes
 * ------------------------------------------------------------------ */

function _tLogin(t) {
  var r = Carteira_login({ vendedor: 'Ana Teste', pin: TESTE_PIN });
  t.ok(r.ok === true, 'login com PIN certo entra');
  t.ok(!!r.token, 'login devolve token de sessão');
  t.ok(r.vendedor === 'Ana Teste' && r.papel === 'vendedor', 'login devolve nome e papel');
  t.ok(r.limite_diario === 3, 'login devolve o limite diário da planilha (3)');
  t.ok(r.janela && r.janela.inicio === '00:00' && r.janela.fim === '23:59', 'login devolve a janela');
  t.ok(r.mensagens.length === 2, 'login devolve as 2 mensagens do Config (@msg_v1, @msg_v2)');
  t.ok(JSON.stringify(r).indexOf(TESTE_PIN) < 0, 'o PIN não aparece na resposta');
  t.tokenAna = r.token;

  t.ok(_tErro(Carteira_login({ vendedor: 'Ana Teste', pin: TESTE_PIN_ERRADO })) === 'PIN_INVALIDO',
    'PIN errado devolve PIN_INVALIDO');
  t.ok(_tErro(Carteira_login({ vendedor: 'Ninguém', pin: TESTE_PIN })) === 'PIN_INVALIDO',
    'vendedor inexistente devolve PIN_INVALIDO (não denuncia quem existe)');
  t.ok(_tErro(Carteira_login({ vendedor: 'Inativo Teste', pin: TESTE_PIN })) === 'VENDEDOR_INATIVO',
    'vendedor com ativo=NÃO devolve VENDEDOR_INATIVO');

  _cLimparErroPin('Ana Teste'); // os erros de propósito acima não podem sujar o resto
}

/** Critério de aceite: 6 PINs errados -> BLOQUEADO; o certo na 7ª ainda barra. */
function _tBloqueioPin(t) {
  var nome = 'Ana Teste';
  _cLimparErroPin(nome);

  var codigos = [];
  for (var i = 0; i < 6; i++) {
    codigos.push(_tErro(Carteira_login({ vendedor: nome, pin: TESTE_PIN_ERRADO })));
  }
  t.ok(codigos.slice(0, 5).join(',') === 'PIN_INVALIDO,PIN_INVALIDO,PIN_INVALIDO,PIN_INVALIDO,PIN_INVALIDO',
    'os 5 primeiros erros devolvem PIN_INVALIDO');
  t.ok(codigos[5] === 'BLOQUEADO', 'o 6º erro devolve BLOQUEADO');
  t.ok(_tErro(Carteira_login({ vendedor: nome, pin: TESTE_PIN })) === 'BLOQUEADO',
    'o PIN certo na 7ª tentativa ainda barra (bloqueio de 1 hora)');

  _cLimparErroPin(nome);
  t.ok(Carteira_login({ vendedor: nome, pin: TESTE_PIN }).ok === true,
    'liberado o bloqueio, o PIN certo entra de novo');
}

function _tSessao(t) {
  t.ok(_tErro(Carteira_hoje({ token: 'token-de-mentira' })) === 'TOKEN_INVALIDO',
    'token desconhecido devolve TOKEN_INVALIDO');
  t.ok(_tErro(Carteira_hoje({})) === 'TOKEN_INVALIDO', 'sem token devolve TOKEN_INVALIDO');

  var r = Carteira_login({ vendedor: 'Inativo Teste', pin: TESTE_PIN });
  t.ok(r.ok !== true, 'vendedor inativo não consegue nem criar sessão');
}

function _tLote(t) {
  var r1 = Carteira_hoje({ token: t.tokenAna });
  t.ok(r1.ok === true, 'carteira_hoje devolve o lote do dia');
  t.ok(r1.leads.length === 3, 'o lote respeita o limite diário (3 leads)');
  t.ok(r1.data === Utilities.formatDate(new Date(), _cTz(), 'yyyy-MM-dd'), 'carteira_hoje carimba a data de hoje');

  var caps = r1.leads.map(function (l) { return l.data_captacao; });
  var ordenado = caps.slice().sort().reverse();
  t.ok(caps.join(',') === ordenado.join(','), 'o lote vem por data_captacao desc');

  var tel = r1.leads[0].telefone;
  t.ok(/^55\d{10,11}$/.test(tel), 'telefone sai em E.164 só com dígitos (' + tel + ')');

  // Idempotência: fechar e reabrir o app não pode gerar lote novo.
  var r2 = Carteira_hoje({ token: t.tokenAna });
  t.ok(_tIds(r1) === _tIds(r2), 'dois carteira_hoje seguidos devolvem o MESMO lote');
  t.ok(_tVersoes(r1) === _tVersoes(r2), 'a versão da mensagem de cada lead não muda entre chamadas');

  // Sessão nova do mesmo vendedor também não gera lote novo.
  var novoLogin = Carteira_login({ vendedor: 'Ana Teste', pin: TESTE_PIN });
  var r3 = Carteira_hoje({ token: novoLogin.token });
  t.ok(_tIds(r1) === _tIds(r3), 'novo login no mesmo dia continua com o mesmo lote');

  t.idsAna = _tIds(r1);
}

function _tConcorrencia(t) {
  var login = Carteira_login({ vendedor: 'Bruno Teste', pin: TESTE_PIN });
  var r = Carteira_hoje({ token: login.token });
  t.ok(r.ok === true && r.leads.length === 2, 'o segundo vendedor recebe o próprio lote (limite 2)');

  var idsB = r.leads.map(function (l) { return l.id; });
  var idsA = t.idsAna.split(',');
  var comum = idsB.filter(function (id) { return idsA.indexOf(id) >= 0; });
  t.ok(comum.length === 0, 'os dois vendedores NUNCA recebem o mesmo lead');

  // O cliente não escolhe de quem é a carteira: quem manda é o token.
  var tentativa = Carteira_hoje({ token: login.token, vendedor: 'Ana Teste' });
  t.ok(_tIds(tentativa) === idsB.join(','),
    'mandar vendedor no corpo não dá acesso à carteira do outro');

  t.tokenBruno = login.token;
}

function _tOptout(t) {
  var todos = t.idsAna.split(',').concat(
    Carteira_hoje({ token: t.tokenBruno }).leads.map(function (l) { return l.id; })
  );
  t.ok(todos.indexOf('L-OPTOUT') < 0, 'lead com optout_em preenchido não entra em lote nenhum');
  t.ok(todos.indexOf('L-INVALIDO') < 0, 'lead com status inválido não entra em lote nenhum');
}

function _tJanela(t) {
  var hoje = new Date(Utilities.formatDate(new Date(), _cTz(), 'yyyy-MM-dd') + 'T12:00:00Z').getUTCDay();
  var outroDia = (hoje + 3) % 7;

  _tParametro('@dias_da_semana', String(outroDia));
  var r = Carteira_hoje({ token: t.tokenAna });
  t.ok(r.ok === true && r.janela_aberta === false,
    'fora da janela, quem já tem lote continua vendo a lista (janela_aberta:false)');
  t.ok(_tIds(r) === t.idsAna, 'fora da janela o lote não muda');

  var login = Carteira_login({ vendedor: 'Carla Teste', pin: TESTE_PIN });
  t.ok(_tErro(Carteira_hoje({ token: login.token })) === 'FORA_JANELA',
    'fora da janela, quem ainda não tem lote recebe FORA_JANELA (nada é reservado)');

  _tParametro('@dias_da_semana', '0,1,2,3,4,5,6');
}

function _tKillSwitch(t) {
  _tParametro('@kill_switch', 'SIM');
  t.ok(_tErro(Carteira_hoje({ token: t.tokenAna })) === 'KILL_SWITCH',
    'kill switch bloqueia carteira_hoje para todo mundo');
  t.ok(Carteira_login({ vendedor: 'Ana Teste', pin: TESTE_PIN }).ok === true,
    'kill switch NÃO derruba o login (o vendedor precisa registrar o que já fez)');
  _tParametro('@kill_switch', 'NAO');
}

/**
 * Lê a Mailing direto: a reserva vencida do Bruno tinha que ter voltado a
 * circular na primeira montagem de lista; a de ontem (dentro das 30h) não.
 */
function _tReservaVencida(t) {
  var vencido = _tLinhaMailing('L-VENCIDO');
  t.ok(vencido.vendedor !== 'Bruno Teste',
    'reserva parada além de @validade_reserva_horas sai do dono antigo e volta a circular');

  var ontem = _tLinhaMailing('L-RESERVADO-ONTEM');
  t.ok(ontem.status === 'reservado' && ontem.vendedor === 'Bruno Teste',
    'reserva ainda dentro do prazo continua com o dono original');
}

/** Devolve o retrato de um lead da Mailing de teste. */
function _tLinhaMailing(id) {
  var sh = CARTEIRA_SS_TESTE.getSheetByName('Mailing');
  var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues();
  for (var r = 0; r < dados.length; r++) {
    if (String(dados[r][0]).trim() === id) {
      return {
        status: String(dados[r][6]).trim().toLowerCase(),
        vendedor: String(dados[r][7]).trim(),
        reservado_em: String(dados[r][8]).trim(),
        abordado_em: String(dados[r][9]).trim(),
        tentativas: Number(dados[r][10]) || 0,
        ultimo_desfecho: String(dados[r][11]).trim().toLowerCase(),
        optout_em: String(dados[r][12]).trim()
      };
    }
  }
  throw new Error('lead de teste não encontrado na Mailing: ' + id);
}

/** Quantas linhas o Log_Abordagem tem (sem o cabeçalho). */
function _tContarLog() {
  return Math.max(0, CARTEIRA_SS_TESTE.getSheetByName('Log_Abordagem').getLastRow() - 1);
}

/* ------------------------------------------------------------------ *
 * marcar_desfecho
 * ------------------------------------------------------------------ */

function _tDesfechos(t) {
  t.ok(_tErro(Carteira_marcarDesfecho({ token: 'nada', itens: [] })) === 'TOKEN_INVALIDO',
    'marcar_desfecho sem sessão válida devolve TOKEN_INVALIDO');
  t.ok(Carteira_marcarDesfecho({ token: t.tokenAna, itens: [] }).aplicados === 0,
    'fila vazia não é erro, só não faz nada');

  t.ts = new Date();
  t.lote = [
    { id: 'L-001', desfecho: 'enviado', obs: '', ts: t.ts },
    { id: 'L-002', desfecho: 'invalido', obs: 'número não existe', ts: t.ts },
    { id: 'L-VENCIDO', desfecho: 'respondeu', obs: 'quer visitar', ts: t.ts },
    { id: 'L-001', desfecho: 'jogar_fora', obs: '', ts: t.ts }
  ];

  var logAntes = _tContarLog();
  var r = Carteira_marcarDesfecho({ token: t.tokenAna, itens: t.lote });
  t.ok(r.ok === true && r.aplicados === 3 && r.rejeitados === 1,
    'lote com 3 desfechos válidos e 1 inválido: aplica 3 e rejeita 1');
  t.ok(_tContarLog() === logAntes + 3, 'grava uma linha no Log_Abordagem por item aplicado');

  var enviado = _tLinhaMailing('L-001');
  t.ok(enviado.status === 'abordado' && enviado.tentativas === 1 && enviado.abordado_em !== '' &&
    enviado.ultimo_desfecho === 'enviado', 'enviado -> status abordado, abordado_em e tentativas+1');

  var invalido = _tLinhaMailing('L-002');
  t.ok(invalido.status === 'invalido' && invalido.tentativas === 0,
    'invalido -> status invalido, sem somar tentativa');

  var respondeu = _tLinhaMailing('L-VENCIDO');
  t.ok(respondeu.status === 'respondeu' && respondeu.tentativas === 1 && respondeu.abordado_em !== '',
    'respondeu -> status respondeu, abordado_em e tentativas+1');

  var lote = Carteira_hoje({ token: t.tokenAna });
  t.ok(_tIds(lote) === t.idsAna, 'marcar desfecho não tira o lead do lote do dia');
}

/** Critério de aceite: reenviar a mesma fila não duplica nada. */
function _tDesfechoIdempotente(t) {
  var logAntes = _tContarLog();
  var r = Carteira_marcarDesfecho({ token: t.tokenAna, itens: t.lote });
  t.ok(r.aplicados === 0 && r.repetidos === 3, 'reenviar a mesma fila não aplica nada de novo');
  t.ok(_tContarLog() === logAntes, 'reenviar a mesma fila não cria linha no Log_Abordagem');
  t.ok(_tLinhaMailing('L-001').tentativas === 1, 'reenviar a mesma fila não soma tentativas duas vezes');

  var repetidoNoMesmoLote = Carteira_marcarDesfecho({
    token: t.tokenBruno,
    itens: [
      { id: 'L-003', desfecho: 'enviado', ts: t.ts },
      { id: 'L-003', desfecho: 'enviado', ts: t.ts }
    ]
  });
  t.ok(repetidoNoMesmoLote.aplicados === 1 && repetidoNoMesmoLote.repetidos === 1,
    'item repetido dentro do MESMO lote entra uma vez só');
  t.ok(_tLinhaMailing('L-003').tentativas === 1, 'item repetido no mesmo lote não soma tentativa duas vezes');
}

function _tDesfechoPosse(t) {
  // ts diferente do lote da Ana de propósito: com o mesmo instante isto cairia
  // na regra de repetido (id+segundo) e não testaria a posse.
  var depois = new Date(t.ts.getTime() + 60000);
  var r = Carteira_marcarDesfecho({
    token: t.tokenBruno,
    itens: [{ id: 'L-001', desfecho: 'enviado', ts: depois }]
  });
  t.ok(r.rejeitados === 1 && r.aplicados === 0,
    'vendedor não marca desfecho em lead que é de outro');
  t.ok(_tLinhaMailing('L-001').tentativas === 1, 'a tentativa de mexer no lead alheio não altera nada');

  // A ordem importa: já registrado vence a checagem de posse. Se o lead trocou
  // de dono depois, o reenvio da fila offline responde "repetido" (que é a
  // verdade) em vez de um erro de posse que confundiria o vendedor.
  var reenvio = Carteira_marcarDesfecho({
    token: t.tokenBruno,
    itens: [{ id: 'L-001', desfecho: 'enviado', ts: t.ts }]
  });
  t.ok(reenvio.repetidos === 1 && reenvio.rejeitados === 0,
    'item já registrado volta como repetido mesmo vindo de outro vendedor');

  var fantasma = Carteira_marcarDesfecho({
    token: t.tokenAna,
    itens: [{ id: 'L-NAO-EXISTE', desfecho: 'enviado', ts: new Date() }]
  });
  t.ok(fantasma.rejeitados === 1, 'id que não está na base é rejeitado sem derrubar o lote');
}

/** Critério de aceite: optout some da fila para sempre, inclusive em lotes futuros. */
function _tDesfechoOptout(t) {
  var r = Carteira_marcarDesfecho({
    token: t.tokenBruno,
    itens: [{ id: 'L-005', desfecho: 'optout', obs: 'pediu para não receber', ts: new Date() }]
  });
  t.ok(r.aplicados === 1, 'optout é aceito mesmo em lead que não está com o vendedor');

  var lead = _tLinhaMailing('L-005');
  t.ok(lead.status === 'optout' && lead.optout_em !== '', 'optout -> status optout e optout_em carimbado');

  var carla = Carteira_login({ vendedor: 'Carla Teste', pin: TESTE_PIN });
  var lote = Carteira_hoje({ token: carla.token });
  t.ok(_tIds(lote).indexOf('L-005') < 0, 'lead com optout não entra em lote futuro de ninguém');
  t.tokenCarla = carla.token;
}

function _tDesfechoPulado(t) {
  var r = Carteira_marcarDesfecho({
    token: t.tokenBruno,
    itens: [{ id: 'L-004', desfecho: 'pulado', ts: new Date() }]
  });
  t.ok(r.aplicados === 1, 'pulado é aceito');

  var lead = _tLinhaMailing('L-004');
  t.ok(lead.status === 'novo' && lead.vendedor === '' && lead.reservado_em === '',
    'pulado -> volta para novo, sem vendedor e sem reserva');

  var lote = Carteira_hoje({ token: t.tokenBruno });
  t.ok(_tIds(lote).indexOf('L-004') < 0,
    'lead pulado não volta na hora para a lista de quem pulou');
  t.ok(lote.leads.length === 2, 'a vaga aberta pelo pulado é preenchida com outro lead');
}

/** Critério de aceite: kill switch bloqueia a lista mas ainda deixa registrar desfecho. */
function _tDesfechoComKillSwitch(t) {
  var alvo = _tPrimeiroLeadDe(t.tokenCarla);   // pega o lead ANTES de bloquear a lista
  _tParametro('@kill_switch', 'SIM');
  var r = Carteira_marcarDesfecho({
    token: t.tokenCarla,
    itens: [{ id: alvo, desfecho: 'enviado', ts: new Date() }]
  });
  t.ok(r.aplicados === 1, 'com kill switch ligado o vendedor ainda registra o que já fez');
  t.ok(_tErro(Carteira_hoje({ token: t.tokenCarla })) === 'KILL_SWITCH',
    'e a lista continua bloqueada');
  _tParametro('@kill_switch', 'NAO');
}

function _tPrimeiroLeadDe(token) {
  var lote = Carteira_hoje({ token: token });
  return lote.leads[0].id;
}

function _tNaoImplementado(t) {
  var r = Carteira_acao('status_carteira', { token: t.tokenAna });
  t.ok(r.ok === false && r.erro === 'ERRO_INTERNO' && /não implementada/.test(r.msg),
    'status_carteira responde "ainda não implementada" (etapa 5)');
  t.ok(Carteira_acao('xpto', {}).ok === false, 'ação desconhecida não derruba o servidor');
  t.ok(Carteira_acao('marcar_desfecho', { token: t.tokenAna, itens: [] }).ok === true,
    'marcar_desfecho chega pelo despachante Carteira_acao');
}

/* ------------------------------------------------------------------ *
 * Andaime: planilha de mentira
 * ------------------------------------------------------------------ */

function _tCriarPlanilha() {
  var carimbo = Utilities.formatDate(new Date(), _cTz(), 'ddMMyy_HHmm');
  var ss = SpreadsheetApp.create('TESTE Carteira do Dia ' + carimbo + ' (pode apagar)');

  var abas = {
    'Mailing': ['id', 'telefone', 'nome', 'origem', 'data_captacao', 'campanha', 'status', 'vendedor',
      'reservado_em', 'abordado_em', 'tentativas', 'ultimo_desfecho', 'optout_em', 'deal_facilita'],
    'Log_Abordagem': ['timestamp', 'id_lead', 'vendedor', 'acao', 'desfecho', 'versao_msg', 'obs'],
    'Config_Carteira': ['vendedor', 'papel', 'pin_hash', 'limite_diario', 'ativo', 'observacao'],
    'Sessoes': ['token', 'vendedor', 'criado_em', 'expira_em', 'ultimo_uso']
  };

  Object.keys(abas).forEach(function (nome) {
    var sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, abas[nome].length).setValues([abas[nome]]);
    sh.setFrozenRows(1);
  });
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao) ss.deleteSheet(padrao);

  return ss;
}

function _tSemear(ss) {
  var hash = _cHashPin(TESTE_PIN);
  // coluna limite_diario como texto: senão o Sheets converte "00:00" em hora
  ss.getSheetByName('Config_Carteira').getRange(2, 4, 20, 1).setNumberFormat('@');
  ss.getSheetByName('Config_Carteira').getRange(2, 1, 9, 6).setValues([
    ['Ana Teste', 'vendedor', hash, 3, 'SIM', ''],
    ['Bruno Teste', 'vendedor', hash, 2, 'SIM', ''],
    ['Carla Teste', 'vendedor', hash, 2, 'SIM', ''],
    ['Inativo Teste', 'vendedor', hash, 3, 'NÃO', 'desligado em 01/08'],
    ['@janela_inicio', 'parametro', '', '00:00', '', ''],
    ['@janela_fim', 'parametro', '', '23:59', '', ''],
    ['@dias_da_semana', 'parametro', '', '0,1,2,3,4,5,6', '', ''],
    ['@validade_reserva_horas', 'parametro', '', 30, '', ''],
    ['@kill_switch', 'parametro', '', 'NAO', '', '']
  ]);
  // as mensagens moram na coluna observacao
  ss.getSheetByName('Config_Carteira').getRange(11, 1, 2, 6).setValues([
    ['@msg_v1', 'parametro', '', '', '', 'Olá {nome}, aqui é do Parque da Saudade.'],
    ['@msg_v2', 'parametro', '', '', '', 'Bom dia, {nome}. Falo do Parque da Saudade.']
  ]);

  var agora = new Date();
  // ontem às 23h: garantidamente "não é hoje" e garantidamente dentro das 30h,
  // rode o teste na hora que rodar.
  var ontem = new Date(agora.getTime() - 24 * 3600 * 1000);
  ontem.setHours(23, 0, 0, 0);
  var vencida = new Date(agora.getTime() - 40 * 3600 * 1000); // além das 30h

  var leads = [];
  // 10 leads livres, data_captacao decrescente (o mais novo é o L-001)
  for (var i = 1; i <= 10; i++) {
    var d = new Date(agora.getTime() - i * 24 * 3600 * 1000);
    leads.push(['L-' + ('00' + i).slice(-3), '(32) 98888-' + (1000 + i), 'Lead ' + i, 'Panfletagem',
      d, 'Campanha Teste', 'novo', '', '', '', 0, '', '', '']);
  }
  // casos especiais
  leads.push(['L-OPTOUT', '32988887777', 'Pediu para não receber', 'Site',
    new Date(agora.getTime() - 2 * 3600 * 1000), 'Campanha Teste', 'novo', '', '', '', 1, 'optout',
    new Date(agora.getTime() - 3600 * 1000), '']);
  leads.push(['L-INVALIDO', '32988886666', 'Número errado', 'Site',
    new Date(agora.getTime() - 2 * 3600 * 1000), 'Campanha Teste', 'invalido', '', '', '', 1, 'invalido', '', '']);
  leads.push(['L-VENCIDO', '5532988885555', 'Reserva abandonada', 'Indicação',
    new Date(agora.getTime() - 1800 * 1000), 'Campanha Teste', 'reservado', 'Bruno Teste',
    vencida, '', 0, '', '', '']);
  leads.push(['L-RESERVADO-ONTEM', '32988884444', 'Reserva recente de outro', 'Indicação',
    new Date(agora.getTime() - 1800 * 1000), 'Campanha Teste', 'reservado', 'Bruno Teste',
    ontem, '', 0, '', '', '']);

  ss.getSheetByName('Mailing').getRange(2, 1, leads.length, 14).setValues(leads);
  SpreadsheetApp.flush();
}

/** Troca o valor de um parâmetro @ na Config_Carteira de teste. */
function _tParametro(chave, valor) {
  var sh = CARTEIRA_SS_TESTE.getSheetByName('Config_Carteira');
  var col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var r = 0; r < col.length; r++) {
    if (String(col[r][0]).trim().toLowerCase() === chave.toLowerCase()) {
      sh.getRange(r + 2, 4).setValue(valor);
      SpreadsheetApp.flush();
      return;
    }
  }
  throw new Error('parâmetro de teste não encontrado: ' + chave);
}

/* ------------------------------------------------------------------ *
 * Andaime: asserções e relatório
 * ------------------------------------------------------------------ */

function _tNovo() {
  return {
    linhas: [],
    falhas: [],
    ok: function (condicao, descricao) {
      this.linhas.push((condicao ? 'OK      ' : 'FALHOU  ') + descricao);
      if (!condicao) this.falhas.push(descricao);
    }
  };
}

function _tErro(r) {
  return r && r.ok === false ? r.erro : '(sem erro)';
}

function _tIds(r) {
  return (r.leads || []).map(function (l) { return l.id; }).join(',');
}

function _tVersoes(r) {
  return (r.leads || []).map(function (l) { return l.id + ':' + l.msg_versao; }).join(',');
}

function _tRelatorio(t, ss) {
  var linhas = ['', '=== Carteira do Dia — Frente 1 ===', ''];
  linhas = linhas.concat(t.linhas);
  linhas.push('');
  linhas.push(t.falhas.length === 0
    ? 'TUDO PASSOU — ' + t.linhas.length + ' verificações.'
    : t.falhas.length + ' de ' + t.linhas.length + ' FALHARAM:');
  t.falhas.forEach(function (f) { linhas.push('  - ' + f); });
  if (ss) {
    linhas.push('');
    linhas.push('Planilha de teste (confira e mande para a lixeira): ' + ss.getUrl());
  }
  Logger.log(linhas.join('\n'));
}

/* ------------------------------------------------------------------ *
 * Utilitários de manutenção (rodar à mão quando precisar)
 * ------------------------------------------------------------------ */

/**
 * Confere o cofre DE VERDADE antes da primeira chamada real. SOMENTE LEITURA:
 * não reserva lead, não cria sessão, não grava nada em lugar nenhum.
 *
 * Serve para pegar o desencontro mais provável — uma coluna que o script de
 * setup nomeou diferente do que este código procura. Rode e leia o registro.
 * Não imprime salt nem pin_hash; sobre segredo, só diz "sim" ou "não".
 */
function carteiraDiagnostico() {
  var esperado = {
    'Mailing': ['id', 'telefone', 'nome', 'origem', 'data_captacao', 'campanha', 'status', 'vendedor',
      'reservado_em', 'abordado_em', 'tentativas', 'ultimo_desfecho', 'optout_em', 'deal_facilita'],
    'Log_Abordagem': ['timestamp', 'id_lead', 'vendedor', 'acao', 'desfecho', 'versao_msg', 'obs'],
    'Config_Carteira': ['vendedor', 'papel', 'pin_hash', 'limite_diario', 'ativo', 'observacao'],
    'Sessoes': ['token', 'vendedor', 'criado_em', 'expira_em', 'ultimo_uso']
  };

  var out = ['', '=== Diagnóstico do cofre (somente leitura) ===', ''];
  var problemas = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  out.push('Planilha: ' + ss.getName());

  var salt = PropertiesService.getScriptProperties().getProperty('CARTEIRA_SALT');
  out.push('CARTEIRA_SALT configurado: ' + (salt ? 'SIM' : 'NÃO — o login não funciona sem isso'));
  if (!salt) problemas.push('CARTEIRA_SALT ausente em Script Properties');

  // 1. abas e colunas
  out.push('');
  Object.keys(esperado).forEach(function (aba) {
    var sh = ss.getSheetByName(aba);
    if (!sh) {
      out.push('[X] aba "' + aba + '" NÃO existe');
      problemas.push('aba ausente: ' + aba);
      return;
    }
    var tem = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim().toLowerCase(); });
    var faltando = esperado[aba].filter(function (c) { return tem.indexOf(c) < 0; });
    if (faltando.length) {
      out.push('[X] ' + aba + ': faltam as colunas ' + faltando.join(', '));
      out.push('    cabeçalho encontrado: ' + tem.join(' · '));
      problemas.push(aba + ' sem as colunas: ' + faltando.join(', '));
    } else {
      out.push('[ok] ' + aba + ' — ' + esperado[aba].length + ' colunas conferem, ' +
        Math.max(0, sh.getLastRow() - 1) + ' linha(s)');
    }
  });

  if (problemas.length) {
    out.push('');
    out.push('Pare aqui e resolva o que está marcado com [X] — o resto depende disso.');
    Logger.log(out.join('\n'));
    return;
  }

  // 2. pessoas
  var cfg = _cLerConfig();
  var H = cfg.H;
  out.push('');
  out.push('Pessoas na Config_Carteira:');
  var vendedores = 0;
  for (var r = 0; r < cfg.linhas.length; r++) {
    var nome = _cTexto(cfg.linhas[r][H.i('vendedor')]);
    if (!nome || nome.charAt(0) === '@') continue;
    var papel = _cTexto(cfg.linhas[r][H.i('papel')]).toLowerCase();
    var hash = _cTexto(cfg.linhas[r][H.i('pin_hash')]);
    var limite = parseInt(cfg.linhas[r][H.i('limite_diario')], 10) || 0;
    var ativo = _cAtivo(cfg.linhas[r][H.i('ativo')]);
    var alerta = [];
    if (papel !== 'vendedor' && papel !== 'gestao') alerta.push('papel "' + papel + '" não é vendedor|gestao — não consegue entrar');
    if (!/^[0-9a-f]{64}$/.test(hash.toLowerCase())) alerta.push('pin_hash não parece um SHA-256 (64 hex)');
    if (ativo && limite <= 0) alerta.push('limite_diario zerado — recebe lote vazio');
    out.push('  · ' + nome + ' | ' + papel + ' | limite ' + limite + ' | ' + (ativo ? 'ativo' : 'INATIVO') +
      ' | PIN ' + (hash ? 'cadastrado' : 'EM BRANCO') + (alerta.length ? '  <-- ' + alerta.join('; ') : ''));
    vendedores++;
  }
  if (!vendedores) out.push('  (nenhuma — ninguém consegue entrar)');

  // 3. parâmetros e mensagens
  var params = _cParametros(cfg);
  var msgs = _cMensagens(cfg);
  out.push('');
  out.push('Parâmetros: janela ' + params.janelaInicio + '–' + params.janelaFim +
    ' | dias ' + params.dias.join(',') +
    ' | reserva vence em ' + params.validadeReservaHoras + 'h' +
    ' | kill switch ' + (params.killSwitch ? 'LIGADO (lista bloqueada)' : 'desligado'));
  out.push('Janela aberta agora? ' + (_cJanelaAberta(params, new Date()) ? 'sim' : 'não'));
  out.push('Mensagens cadastradas: ' + msgs.length + (msgs.length ? '' : ' — o app vai usar o texto padrão'));
  msgs.forEach(function (m) {
    out.push('  · ' + m.id + ': ' + m.texto.slice(0, 60) + (m.texto.length > 60 ? '…' : ''));
  });

  // 4. base
  var sh = ss.getSheetByName('Mailing');
  var MH = _cCabecalho(sh);
  var ultima = sh.getLastRow();
  var dados = ultima > 1 ? sh.getRange(2, 1, ultima - 1, MH.ordem.length).getValues() : [];
  var porStatus = {};
  var comOptout = 0, semTelefone = 0, disponiveis = 0, reservadosHoje = {};
  var hoje = _cDia(new Date());
  dados.forEach(function (row) {
    if (!_cTexto(row[MH.i('id')]) && !_cTexto(row[MH.i('telefone')])) return;
    var st = _cTexto(row[MH.i('status')]).toLowerCase() || '(vazio)';
    porStatus[st] = (porStatus[st] || 0) + 1;
    var optout = _cTexto(row[MH.i('optout_em')]) !== '' || st === 'optout';
    if (optout) comOptout++;
    if (!_cTelefone(row[MH.i('telefone')])) semTelefone++;
    if (!optout && st === 'novo') disponiveis++;
    if (_cDia(row[MH.i('reservado_em')]) === hoje) {
      var v = _cTexto(row[MH.i('vendedor')]) || '(sem vendedor)';
      reservadosHoje[v] = (reservadosHoje[v] || 0) + 1;
    }
  });

  out.push('');
  out.push('Mailing: ' + dados.length + ' linha(s)');
  Object.keys(porStatus).sort().forEach(function (st) { out.push('  · ' + st + ': ' + porStatus[st]); });
  out.push('  optout (fora de toda fila): ' + comOptout);
  if (semTelefone) out.push('  SEM telefone aproveitável: ' + semTelefone + ' <-- viram link de WhatsApp quebrado');
  out.push('  disponíveis para reserva agora: ' + disponiveis);
  var donos = Object.keys(reservadosHoje);
  out.push('  reservados hoje: ' + (donos.length
    ? donos.map(function (v) { return v + ' (' + reservadosHoje[v] + ')'; }).join(' · ')
    : 'nenhum'));

  // 5. sessões
  var shS = ss.getSheetByName('Sessoes');
  var vivas = 0;
  if (shS.getLastRow() > 1) {
    var SH = _cCabecalho(shS);
    shS.getRange(2, 1, shS.getLastRow() - 1, SH.ordem.length).getValues().forEach(function (row) {
      var exp = _cData(row[SH.i('expira_em')]);
      if (exp && exp.getTime() > Date.now()) vivas++;
    });
  }
  out.push('');
  out.push('Sessões válidas hoje: ' + vivas);
  out.push('');
  out.push(problemas.length ? 'Pendências: ' + problemas.join(' | ') : 'Nada bloqueando. O cofre está pronto para o primeiro login real.');

  Logger.log(out.join('\n'));
}

/**
 * "Vendedor ou PIN incorreto" e você tem certeza de que está certo? Rode isto.
 *
 * Refaz, uma por uma, as checagens do login e diz QUAL delas reprovou — o login
 * de verdade responde sempre a mesma coisa de propósito (não entregar a lista de
 * quem existe no cofre para quem está chutando), e é isso que esconde a causa.
 *
 * SOMENTE LEITURA e NÃO conta tentativa errada (não passa pelo Carteira_login),
 * então pode rodar à vontade sem arriscar bloquear ninguém.
 *
 * Não imprime o PIN nem o hash. Preencha as duas variáveis, rode, leia o
 * registro e APAGUE O PIN daqui — PIN em claro não fica versionado.
 */
function carteiraPorQueNaoEntra() {
  var VENDEDOR = '';   // exatamente como aparece na lista da tela de login
  var PIN = '';        // apague depois de rodar

  var out = ['', '=== Por que o login não passa ===', ''];
  if (!VENDEDOR || !PIN) {
    Logger.log('Preencha VENDEDOR e PIN dentro da função antes de rodar (e apague o PIN depois).');
    return;
  }

  var salt = PropertiesService.getScriptProperties().getProperty('CARTEIRA_SALT');
  out.push('1. CARTEIRA_SALT: ' + (salt ? 'configurado' : 'AUSENTE — nenhum PIN vai bater'));
  if (!salt) { Logger.log(out.join('\n')); return; }

  var cfg = _cLerConfig();
  var H = cfg.H;

  // 2. a linha existe?
  var achou = null, nomes = [];
  for (var r = 0; r < cfg.linhas.length; r++) {
    var vend = _cTexto(cfg.linhas[r][H.i('vendedor')]);
    if (!vend || vend.charAt(0) === '@') continue;
    nomes.push(vend);
    if (_cMesmoNome(vend, VENDEDOR)) achou = { row: cfg.linhas[r], nome: vend, linha: r + 2 };
  }
  if (!achou) {
    out.push('2. Nome: NÃO encontrado na Config_Carteira.');
    out.push('   Você informou: "' + VENDEDOR + '"');
    out.push('   Nomes que existem na planilha: ' + (nomes.length ? nomes.map(function (n) { return '"' + n + '"'; }).join(' · ') : '(nenhum)'));
    out.push('   >>> A lista do app (CARTEIRA_VENDEDORES no index.html) tem que bater com estes.');
    Logger.log(out.join('\n'));
    return;
  }
  out.push('2. Nome: encontrado na linha ' + achou.linha + ' como "' + achou.nome + '"');

  // 3. papel
  var papel = _cNormalizar(achou.row[H.i('papel')]);
  out.push('3. Papel: "' + _cTexto(achou.row[H.i('papel')]) + '"' +
    (papel === 'parametro' ? '  <-- linha tratada como PARÂMETRO, não como pessoa' : '  (ok)'));
  if (papel === 'parametro') { Logger.log(out.join('\n')); return; }

  // 4. ativo
  var ativo = _cAtivo(achou.row[H.i('ativo')]);
  out.push('4. Ativo: "' + _cTexto(achou.row[H.i('ativo')]) + '" -> ' + (ativo ? 'ativo' : 'INATIVO — o login recusa'));

  // 5. bloqueio por tentativas
  var bloq = _cBloqueioAtivo(achou.nome);
  out.push('5. Bloqueio por erro de PIN: ' + (bloq ? ('ATIVO até ' + bloq + ' — rode carteiraLiberarBloqueio()') : 'nenhum'));

  // 6. o hash bate?
  var guardado = _cTexto(achou.row[H.i('pin_hash')]).toLowerCase();
  var calculado = _cHashPin(PIN);
  out.push('6. pin_hash na planilha: ' + (guardado ? (guardado.length + ' caracteres') : 'VAZIO'));
  if (guardado && !/^[0-9a-f]{64}$/.test(guardado)) {
    out.push('   >>> Não parece um SHA-256: esperado 64 caracteres hexadecimais.');
    out.push('   >>> Se a célula estiver formatada como número, o Sheets pode ter mutilado o valor.');
  }
  out.push('   PIN informado bate com o hash guardado? ' + (guardado === calculado ? 'SIM' : 'NÃO'));

  if (guardado !== calculado) {
    out.push('');
    out.push('   O hash foi gerado com OUTRO salt, com outro PIN, ou por outra fórmula.');
    out.push('   A regra é: SHA-256(pin + salt), em hexadecimal minúsculo.');
    out.push('   Para regravar: rode carteiraGerarHash() com o PIN desejado e cole o');
    out.push('   resultado na coluna pin_hash desta linha.');
  }

  out.push('');
  var okTudo = ativo && !bloq && guardado === calculado;
  out.push(okTudo ? 'Todas as portas abrem — este login deveria entrar.'
                  : 'Reprovou no item marcado acima. É ali que está a causa.');
  Logger.log(out.join('\n'));
}

/** Solta o bloqueio de PIN de alguém que errou demais. Use com o nome exato do cofre. */
function carteiraLiberarBloqueio() {
  var nome = 'Fulano de Tal'; // troque antes de rodar
  _cLimparErroPin(nome);
  Logger.log('Bloqueio de PIN liberado para: ' + nome);
}

/**
 * Calcula o pin_hash para colar na Config_Carteira do cofre.
 * Digite o PIN aqui, rode, copie o hash do log e APAGUE o PIN do arquivo —
 * PIN em claro não fica versionado. Só funciona com CARTEIRA_SALT configurado.
 */
function carteiraGerarHash() {
  var pin = ''; // digite o PIN aqui, rode, e limpe de novo
  if (!pin) throw new Error('Digite o PIN na variável antes de rodar (e apague depois).');
  Logger.log('pin_hash: ' + _cHashPin(pin));
}
