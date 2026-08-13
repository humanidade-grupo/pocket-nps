/**
 * Carteira.gs — Carteira do Dia (Pocket NPS) · Frente 1
 * Parque da Saudade / Grupo Humanidade — gerado em 12/08/2026 22:05.
 *
 * Escopo desta versão: login por PIN, sessão por token, carteira_hoje com
 * LockService e marcar_desfecho com log idempotente. `status_carteira` ainda
 * NÃO está feito — responde erro explícito para o front não achar que funcionou.
 *
 * Contrato (POST no /exec, corpo JSON, sem header customizado):
 *   {acao:'login', vendedor, pin}   -> {ok, token, vendedor, papel, limite_diario,
 *                                       expira_em, janela:{inicio,fim,dias[]}, mensagens[]}
 *   {acao:'carteira_hoje', token}   -> {ok, data, limite, restantes_base, janela_aberta, leads[]}
 *   {acao:'marcar_desfecho', token, itens:[{id,desfecho,obs,ts}]}
 *                                   -> {ok, aplicados, repetidos, rejeitados, resultados[]}
 *
 * Erros: {ok:false, erro:'CODIGO', msg:'texto para o usuário'} com CODIGO em
 * PIN_INVALIDO · BLOQUEADO · TOKEN_INVALIDO · VENDEDOR_INATIVO · FORA_JANELA ·
 * KILL_SWITCH · SEM_LEADS · LIMITE_ATINGIDO · ERRO_INTERNO.
 *
 * Lê e grava nas abas que o script de setup já criou no cofre — Mailing,
 * Log_Abordagem, Config_Carteira, Sessoes. Não cria nem altera a estrutura delas.
 *
 * Segredo: o salt do PIN vive em Script Properties, chave CARTEIRA_SALT.
 * pin_hash = SHA-256(pin + salt) em hex minúsculo. PIN em claro não entra em
 * log, em retorno nem em planilha, em hipótese nenhuma.
 *
 * Três decisões que o briefing deixou em aberto (confirmar com o Ricardo):
 *  1. O Router já exigia TOKEN_GESTAO em toda rota. As ações da carteira usam
 *     o token de sessão, então elas são despachadas ANTES desse portão — senão
 *     nenhum vendedor entraria. As rotas app=/fn= antigas seguem intactas.
 *  2. Fora da janela, carteira_hoje NÃO reserva lead novo, mas devolve o lote
 *     já reservado hoje (com janela_aberta:false) para o app conseguir mostrar
 *     a lista com a faixa de aviso. Só devolve FORA_JANELA quando não há lote.
 *  3. O parâmetro @validade_reserva_horas ganhou uso: lead que ficou 'reservado'
 *     além do prazo e ninguém trabalhou volta para status 'novo' na próxima
 *     montagem de lista. Sem isso, lead reservado e não abordado morre na base.
 *  4. Lead pulado volta para a base (como manda o briefing) mas entra no fim da
 *     fila. Sem isso ele reaparece no topo da lista do mesmo vendedor no refresh
 *     seguinte — o vendedor pula e ele volta, parecendo defeito.
 *  5. Desfecho 'optout' é aceito mesmo quando o lead já não é do vendedor.
 *     Alguém pediu para não receber mais; isso vale acima da regra de posse,
 *     ainda mais numa base que fala com família enlutada. Os outros desfechos
 *     exigem posse.
 */

var CARTEIRA_ABAS = {
  mailing: 'Mailing',
  log: 'Log_Abordagem',
  config: 'Config_Carteira',
  sessoes: 'Sessoes'
};

var CARTEIRA_VALIDADE_SESSAO_DIAS = 30;
var CARTEIRA_MAX_PIN_ERRADO = 5;      // do 6º erro em diante -> BLOQUEADO
var CARTEIRA_BLOQUEIO_SEG = 3600;     // 1 hora

// Ganchos usados só pelo Carteira_Teste.gs (planilha descartável + salt de mentira).
// Em produção ficam nulos e valem a planilha do cofre e o Script Property.
var CARTEIRA_SS_TESTE = null;
var CARTEIRA_SALT_TESTE = null;

/* ------------------------------------------------------------------ *
 * Porta de entrada (chamada pelo Router)
 * ------------------------------------------------------------------ */

/** Trata uma ação da carteira. Nunca lança: erro vira {ok:false, erro:'ERRO_INTERNO'}. */
function Carteira_acao(acao, body) {
  try {
    switch (String(acao)) {
      case 'login': return Carteira_login(body);
      case 'carteira_hoje': return Carteira_hoje(body);
      case 'marcar_desfecho': return Carteira_marcarDesfecho(body);
      case 'status_carteira':
        return _cErro('ERRO_INTERNO', 'Ação "' + acao + '" ainda não implementada no servidor.');
      default:
        return _cErro('ERRO_INTERNO', 'Ação desconhecida: ' + acao);
    }
  } catch (err) {
    console.error('Carteira_acao(' + acao + '): ' + (err && err.stack ? err.stack : err));
    return _cErro('ERRO_INTERNO', 'Falha no servidor. Tente de novo em instantes.');
  }
}

/* ------------------------------------------------------------------ *
 * login
 * ------------------------------------------------------------------ */

/**
 * {acao:'login', vendedor, pin} -> token de sessão (30 dias).
 * O kill switch não derruba o login: quem já está na rua precisa entrar para
 * registrar o que fez. Quem bloqueia a lista é o carteira_hoje.
 */
function Carteira_login(body) {
  var nome = String((body && body.vendedor) || '').trim();
  var pin = String((body && body.pin) || '').trim();
  if (!nome || !pin) return _cErro('PIN_INVALIDO', 'Informe o vendedor e o PIN.');

  var cfg = _cLerConfig();
  var pessoa = _cAcharPessoa(cfg, nome);

  // Resposta idêntica para vendedor inexistente e PIN errado: não entregamos
  // a lista de quem existe no cofre para quem está chutando.
  if (!pessoa) {
    _cContarErroPin(nome);
    return _cErro('PIN_INVALIDO', 'Vendedor ou PIN incorreto.');
  }

  var bloqueio = _cBloqueioAtivo(pessoa.vendedor);
  if (bloqueio) {
    return _cErro('BLOQUEADO', 'Muitas tentativas erradas. Tente novamente após ' + bloqueio + '.');
  }

  if (!pessoa.ativo) return _cErro('VENDEDOR_INATIVO', 'Este acesso está desativado. Fale com a coordenação.');

  var hashInformado = _cHashPin(pin);
  if (!pessoa.pinHash || hashInformado !== pessoa.pinHash) {
    var n = _cContarErroPin(pessoa.vendedor);
    if (n > CARTEIRA_MAX_PIN_ERRADO) {
      return _cErro('BLOQUEADO', 'Muitas tentativas erradas. Tente novamente em 1 hora.');
    }
    return _cErro('PIN_INVALIDO', 'Vendedor ou PIN incorreto.');
  }

  _cLimparErroPin(pessoa.vendedor);

  var agora = new Date();
  var expira = new Date(agora.getTime() + CARTEIRA_VALIDADE_SESSAO_DIAS * 24 * 3600 * 1000);
  var token = Utilities.getUuid();

  var sh = _cAba(CARTEIRA_ABAS.sessoes);
  var H = _cCabecalho(sh);
  var linha = [];
  for (var i = 0; i < H.ordem.length; i++) linha.push('');
  linha[H.i('token')] = token;
  linha[H.i('vendedor')] = pessoa.vendedor;
  linha[H.i('criado_em')] = agora;
  linha[H.i('expira_em')] = expira;
  linha[H.i('ultimo_uso')] = agora;
  sh.appendRow(linha);

  var params = _cParametros(cfg);
  return {
    ok: true,
    token: token,
    vendedor: pessoa.vendedor,
    papel: pessoa.papel,
    limite_diario: pessoa.limite,
    expira_em: expira.toISOString(),
    janela: { inicio: params.janelaInicio, fim: params.janelaFim, dias: params.dias },
    mensagens: _cMensagens(cfg)
  };
}

/* ------------------------------------------------------------------ *
 * carteira_hoje
 * ------------------------------------------------------------------ */

/**
 * {acao:'carteira_hoje', token} -> lote do dia do vendedor da sessão.
 *
 * Idempotente no dia: se já existe lote reservado hoje, devolve exatamente ele
 * (inclusive os já abordados) e só completa o que falta para o limite diário.
 * Toda a reserva roda dentro do lock do script — os 6 vendedores puxam a lista
 * no mesmo minuto de manhã e sem lock dois receberiam o mesmo lead.
 */
function Carteira_hoje(body) {
  var sessao = _cSessao(body && body.token);
  if (sessao.erro) return sessao.erro;

  var cfg = sessao.cfg;
  var pessoa = sessao.pessoa;
  var params = _cParametros(cfg);
  if (params.killSwitch) {
    return _cErro('KILL_SWITCH', 'A carteira está pausada pela coordenação. Nenhuma abordagem hoje.');
  }

  var agora = new Date();
  var hoje = _cDia(agora);
  var janelaAberta = _cJanelaAberta(params, agora);
  var mensagens = _cMensagens(cfg);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return _cErro('ERRO_INTERNO', 'O sistema está ocupado montando outra lista. Tente de novo em alguns segundos.');
  }

  try {
    var sh = _cAba(CARTEIRA_ABAS.mailing);
    var H = _cCabecalho(sh);
    var ultima = sh.getLastRow();
    var dados = ultima > 1 ? sh.getRange(2, 1, ultima - 1, H.ordem.length).getValues() : [];

    var iStatus = H.i('status');
    var iVend = H.i('vendedor');
    var iRes = H.i('reservado_em');
    var iOptout = H.i('optout_em');
    var iCap = H.i('data_captacao');
    var iDesf = H.i('ultimo_desfecho');

    var lote = [];        // {linha (1-based na aba), row}
    var candidatos = [];  // idem, disponíveis para reserva
    var restantesBase = 0;
    var liberados = 0;
    var limiteReserva = agora.getTime() - params.validadeReservaHoras * 3600 * 1000;

    for (var r = 0; r < dados.length; r++) {
      var row = dados[r];
      if (String(row[H.i('id')] || '').trim() === '' && String(row[H.i('telefone')] || '').trim() === '') continue;

      var status = _cTexto(row[iStatus]).toLowerCase();
      var temOptout = String(row[iOptout] || '').trim() !== '' || status === 'optout';
      if (temOptout) continue; // optout não volta à fila em consulta nenhuma

      if (_cMesmoNome(row[iVend], pessoa.vendedor) && _cDia(row[iRes]) === hoje) {
        lote.push({ linha: r + 2, row: row });
        continue;
      }

      // Reserva vencida (@validade_reserva_horas) que ninguém trabalhou volta
      // para a base — senão o lead que o vendedor não abordou morre reservado.
      // Só mexe em 'reservado': abordado, respondeu, invalido ficam como estão.
      if (status === 'reservado') {
        var res = _cData(row[iRes]);
        if (!res || res.getTime() < limiteReserva) {
          row[iStatus] = 'novo';
          row[iVend] = '';
          row[iRes] = '';
          _cGravarCelulas(sh, r + 2, row, [iStatus, iVend, iRes]);
          liberados++;
          status = 'novo';
        }
      }

      if (status === 'novo') {
        restantesBase++;
        candidatos.push({
          linha: r + 2,
          row: row,
          cap: _cData(row[iCap]),
          pulado: _cTexto(row[iDesf]).toLowerCase() === 'pulado'
        });
      }
    }

    if (liberados) console.log('carteira_hoje: ' + liberados + ' reserva(s) vencida(s) devolvida(s) à base.');

    var falta = Math.max(0, pessoa.limite - lote.length);
    if (falta > 0 && janelaAberta && candidatos.length) {
      candidatos.sort(function (a, b) {
        // lead que alguém já pulou vai para o fim: sem isso ele volta ao topo
        // da lista do mesmo vendedor no refresh seguinte, e o app parece quebrado
        if (a.pulado !== b.pulado) return a.pulado ? 1 : -1;
        var ta = a.cap ? a.cap.getTime() : -Infinity;
        var tb = b.cap ? b.cap.getTime() : -Infinity;
        if (tb !== ta) return tb - ta;          // data_captacao desc
        return a.linha - b.linha;               // desempate estável
      });

      var novos = candidatos.slice(0, falta);
      for (var k = 0; k < novos.length; k++) {
        var alvo = novos[k];
        alvo.row[iStatus] = 'reservado';
        alvo.row[iVend] = pessoa.vendedor;
        alvo.row[iRes] = agora;
        _cGravarCelulas(sh, alvo.linha, alvo.row, [iStatus, iVend, iRes]);
        lote.push(alvo);
        restantesBase--;
      }
    }

    var leads = lote.map(function (item) {
      var row = item.row;
      var id = _cTexto(row[H.i('id')]);
      return {
        id: id,
        nome: _cTexto(row[H.i('nome')]),
        telefone: _cTelefone(row[H.i('telefone')]),
        origem: _cTexto(row[H.i('origem')]),
        data_captacao: _cDia(row[iCap]),
        tentativas: Number(row[H.i('tentativas')]) || 0,
        status: _cTexto(row[iStatus]).toLowerCase(),
        ultimo_desfecho: _cTexto(row[H.i('ultimo_desfecho')]),
        msg_versao: _cVersaoMsg(id, pessoa.vendedor, mensagens.length)
      };
    });

    leads.sort(function (a, b) { return (b.data_captacao || '').localeCompare(a.data_captacao || ''); });

    if (!leads.length && !janelaAberta) {
      return _cErro('FORA_JANELA', 'Fora do horário de abordagem (' + params.janelaInicio + ' às ' + params.janelaFim + ').');
    }

    return {
      ok: true,
      data: hoje,
      limite: pessoa.limite,
      restantes_base: Math.max(0, restantesBase),
      janela_aberta: janelaAberta,
      janela: { inicio: params.janelaInicio, fim: params.janelaFim, dias: params.dias },
      mensagens: mensagens,
      leads: leads
    };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ *
 * marcar_desfecho
 * ------------------------------------------------------------------ */

var CARTEIRA_DESFECHOS = ['enviado', 'invalido', 'respondeu', 'optout', 'pulado'];
var CARTEIRA_MAX_ITENS = 200;

/**
 * {acao:'marcar_desfecho', token, itens:[{id, desfecho, obs, ts}]}
 *
 * Aceita lote porque é assim que o app sobe o que fez offline — e o app reenvia
 * a mesma fila mais de uma vez. Por isso o par (id_lead + ts arredondado ao
 * segundo) é chave: item já registrado volta como 'repetido' e não mexe em nada,
 * nem no Log_Abordagem nem em tentativas.
 *
 * O kill switch NÃO bloqueia esta ação: quem já abordou precisa conseguir
 * registrar o que fez, senão a base fica mentindo.
 *
 * Cada item volta com uma situação. O app pode tirar da fila tudo que voltou —
 * 'aplicado', 'repetido' e 'rejeitado' são todos definitivos; só falha de rede
 * mantém o item na fila.
 */
function Carteira_marcarDesfecho(body) {
  var sessao = _cSessao(body && body.token);
  if (sessao.erro) return sessao.erro;

  var itens = (body && body.itens) || [];
  if (!itens.length) return { ok: true, aplicados: 0, repetidos: 0, rejeitados: 0, resultados: [] };
  if (itens.length > CARTEIRA_MAX_ITENS) {
    return _cErro('ERRO_INTERNO', 'Fila grande demais (' + itens.length + '). Mande em lotes de até ' + CARTEIRA_MAX_ITENS + '.');
  }

  var pessoa = sessao.pessoa;
  var mensagens = _cMensagens(sessao.cfg);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return _cErro('ERRO_INTERNO', 'O sistema está ocupado. Seus registros continuam na fila — tente de novo em instantes.');
  }

  try {
    var sh = _cAba(CARTEIRA_ABAS.mailing);
    var H = _cCabecalho(sh);
    var ultima = sh.getLastRow();
    var dados = ultima > 1 ? sh.getRange(2, 1, ultima - 1, H.ordem.length).getValues() : [];

    var iId = H.i('id');
    var porId = {};
    for (var r = 0; r < dados.length; r++) {
      var id = _cTexto(dados[r][iId]);
      if (id && porId[id] === undefined) porId[id] = r;
    }

    var jaRegistrados = _cChavesDoLog();
    var novasLinhas = [];
    var resultados = [];
    var aplicados = 0, repetidos = 0, rejeitados = 0;

    for (var k = 0; k < itens.length; k++) {
      var item = itens[k] || {};
      var idItem = _cTexto(item.id);
      var desfecho = _cTexto(item.desfecho).toLowerCase();
      var quando = _cData(item.ts) || new Date();
      var chave = _cChaveLog(idItem, quando);

      if (!idItem || CARTEIRA_DESFECHOS.indexOf(desfecho) < 0) {
        resultados.push({ id: idItem, situacao: 'rejeitado', msg: 'desfecho inválido: "' + desfecho + '"' });
        rejeitados++;
        continue;
      }

      if (jaRegistrados[chave]) {
        resultados.push({ id: idItem, situacao: 'repetido' });
        repetidos++;
        continue;
      }

      var linha = porId[idItem];
      if (linha === undefined) {
        resultados.push({ id: idItem, situacao: 'rejeitado', msg: 'lead não está na base' });
        rejeitados++;
        continue;
      }

      var row = dados[linha];
      var dono = _cMesmoNome(row[H.i('vendedor')], pessoa.vendedor);

      // Optout passa mesmo sem ser o dono: alguém pediu para não receber mais,
      // e isso vale acima de qualquer regra de posse. O resto exige posse —
      // é o que impede um token mexer na carteira do outro.
      if (!dono && desfecho !== 'optout') {
        resultados.push({ id: idItem, situacao: 'rejeitado', msg: 'este lead não está mais com você' });
        rejeitados++;
        continue;
      }

      _cAplicarDesfecho(row, H, desfecho, quando);
      _cGravarCelulas(sh, linha + 2, row, _cColunasDesfecho(H));

      novasLinhas.push([
        quando,
        idItem,
        pessoa.vendedor,
        'desfecho',
        desfecho,
        _cVersaoMsg(idItem, pessoa.vendedor, mensagens.length),
        _cTexto(item.obs).slice(0, 500)
      ]);
      jaRegistrados[chave] = true;   // protege contra id+ts repetido dentro do MESMO lote
      resultados.push({ id: idItem, situacao: 'aplicado', desfecho: desfecho });
      aplicados++;
    }

    if (novasLinhas.length) {
      var shLog = _cAba(CARTEIRA_ABAS.log);
      var HL = _cCabecalho(shLog);
      shLog.getRange(shLog.getLastRow() + 1, 1, novasLinhas.length, HL.ordem.length).setValues(novasLinhas);
    }

    return {
      ok: true,
      aplicados: aplicados,
      repetidos: repetidos,
      rejeitados: rejeitados,
      resultados: resultados
    };
  } finally {
    lock.releaseLock();
  }
}

/** Aplica na linha (em memória) o efeito de cada desfecho. */
function _cAplicarDesfecho(row, H, desfecho, quando) {
  var tentativas = Number(row[H.i('tentativas')]) || 0;
  row[H.i('ultimo_desfecho')] = desfecho;

  if (desfecho === 'enviado' || desfecho === 'respondeu') {
    row[H.i('status')] = desfecho === 'enviado' ? 'abordado' : 'respondeu';
    row[H.i('abordado_em')] = quando;
    row[H.i('tentativas')] = tentativas + 1;
    return;
  }
  if (desfecho === 'invalido') {
    row[H.i('status')] = 'invalido';
    return;
  }
  if (desfecho === 'optout') {
    row[H.i('status')] = 'optout';
    row[H.i('optout_em')] = quando;
    return;
  }
  // pulado: devolve o lead para a base, sem dono
  row[H.i('status')] = 'novo';
  row[H.i('vendedor')] = '';
  row[H.i('reservado_em')] = '';
}

/** Colunas que qualquer desfecho pode mexer — gravadas de uma vez só. */
function _cColunasDesfecho(H) {
  return [H.i('status'), H.i('vendedor'), H.i('reservado_em'), H.i('abordado_em'),
    H.i('tentativas'), H.i('ultimo_desfecho'), H.i('optout_em')];
}

/**
 * Chave de idempotência: id do lead + instante arredondado ao segundo. O
 * arredondamento existe porque a planilha não devolve o milissegundo do jeito
 * que entrou; e dois desfechos do mesmo lead no mesmo segundo não acontecem —
 * quem aperta o botão é uma pessoa.
 */
function _cChaveLog(id, quando) {
  var d = _cData(quando);
  return _cTexto(id) + '|' + (d ? Utilities.formatDate(d, _cTz(), 'yyyy-MM-dd HH:mm:ss') : '');
}

/** Todas as chaves já gravadas no Log_Abordagem, para não registrar duas vezes. */
function _cChavesDoLog() {
  var sh = _cAba(CARTEIRA_ABAS.log);
  var ultima = sh.getLastRow();
  if (ultima < 2) return {};

  var H = _cCabecalho(sh);
  var iTs = H.i('timestamp');
  var iId = H.i('id_lead');
  var min = Math.min(iTs, iId);
  var max = Math.max(iTs, iId);
  var bloco = sh.getRange(2, min + 1, ultima - 1, max - min + 1).getValues();

  var chaves = {};
  for (var r = 0; r < bloco.length; r++) {
    chaves[_cChaveLog(bloco[r][iId - min], bloco[r][iTs - min])] = true;
  }
  return chaves;
}

/* ------------------------------------------------------------------ *
 * Sessão
 * ------------------------------------------------------------------ */

/**
 * Resolve o vendedor pelo token. O cliente NUNCA informa quem é — é isso que
 * impede um vendedor puxar a carteira de outro trocando um campo do JSON.
 * Retorna {vendedor, papel, pessoa, cfg, linha} ou {erro:{...}}.
 */
function _cSessao(token) {
  var t = String(token || '').trim();
  if (!t) return { erro: _cErro('TOKEN_INVALIDO', 'Sessão expirada. Entre de novo com o seu PIN.') };

  var sh = _cAba(CARTEIRA_ABAS.sessoes);
  var ultima = sh.getLastRow();
  if (ultima < 2) return { erro: _cErro('TOKEN_INVALIDO', 'Sessão expirada. Entre de novo com o seu PIN.') };

  var H = _cCabecalho(sh);
  var dados = sh.getRange(2, 1, ultima - 1, H.ordem.length).getValues();
  var iToken = H.i('token');
  var agora = new Date();

  for (var r = 0; r < dados.length; r++) {
    if (String(dados[r][iToken] || '').trim() !== t) continue;

    var expira = _cData(dados[r][H.i('expira_em')]);
    if (expira && expira.getTime() < agora.getTime()) {
      return { erro: _cErro('TOKEN_INVALIDO', 'Sua sessão venceu. Entre de novo com o seu PIN.') };
    }

    var vendedor = _cTexto(dados[r][H.i('vendedor')]);
    var cfg = _cLerConfig();
    var pessoa = _cAcharPessoa(cfg, vendedor);
    if (!pessoa) return { erro: _cErro('TOKEN_INVALIDO', 'Sessão expirada. Entre de novo com o seu PIN.') };
    if (!pessoa.ativo) return { erro: _cErro('VENDEDOR_INATIVO', 'Este acesso está desativado. Fale com a coordenação.') };

    sh.getRange(r + 2, H.i('ultimo_uso') + 1).setValue(agora);
    return { vendedor: pessoa.vendedor, papel: pessoa.papel, pessoa: pessoa, cfg: cfg, linha: r + 2 };
  }

  return { erro: _cErro('TOKEN_INVALIDO', 'Sessão expirada. Entre de novo com o seu PIN.') };
}

/* ------------------------------------------------------------------ *
 * Config_Carteira
 * ------------------------------------------------------------------ */

/** Lê a Config_Carteira inteira uma vez: {H, linhas:[[...]]}. */
function _cLerConfig() {
  var sh = _cAba(CARTEIRA_ABAS.config);
  var H = _cCabecalho(sh);
  var ultima = sh.getLastRow();
  var linhas = ultima > 1 ? sh.getRange(2, 1, ultima - 1, H.ordem.length).getValues() : [];
  return { H: H, linhas: linhas };
}

/**
 * Acha a pessoa por nome, ignorando caixa e acento.
 *
 * Só descarta linha de parâmetro. O papel é normalizado e, se não for gestão,
 * vale como vendedor — de propósito: exigir o papel escrito exatamente como no
 * briefing transformava um "gestão" com til, ou uma célula em branco, em
 * "Vendedor ou PIN incorreto", uma mensagem que manda procurar o erro no lugar
 * errado. Quem guarda a porta é o pin_hash, não a grafia desta coluna.
 */
function _cAcharPessoa(cfg, nome) {
  var H = cfg.H;
  for (var r = 0; r < cfg.linhas.length; r++) {
    var row = cfg.linhas[r];
    var vend = _cTexto(row[H.i('vendedor')]);
    if (vend.charAt(0) === '@') continue;                 // linha de parâmetro
    if (!_cMesmoNome(vend, nome)) continue;
    var papel = _cNormalizar(row[H.i('papel')]);
    if (papel === 'parametro') continue;
    papel = (papel === 'gestao') ? 'gestao' : 'vendedor';
    return {
      vendedor: vend,
      papel: papel,
      pinHash: _cTexto(row[H.i('pin_hash')]).toLowerCase(),
      limite: Math.max(0, parseInt(row[H.i('limite_diario')], 10) || 0),
      ativo: _cAtivo(row[H.i('ativo')]),
      linha: r + 2
    };
  }
  return null;
}

/** Parâmetros (@janela_inicio, @kill_switch, ...). O valor mora em limite_diario. */
function _cParametros(cfg) {
  var H = cfg.H;
  var mapa = {};   // valor cru: a célula de hora pode vir como Date, não como texto
  for (var r = 0; r < cfg.linhas.length; r++) {
    var chave = _cTexto(cfg.linhas[r][H.i('vendedor')]);
    if (chave.charAt(0) !== '@') continue;
    mapa[chave.toLowerCase()] = cfg.linhas[r][H.i('limite_diario')];
  }

  var dias = String(_cTexto(mapa['@dias_da_semana']) || '1,2,3,4,5')
    .split(',')
    .map(function (d) { return parseInt(String(d).trim(), 10); })
    .filter(function (d) { return !isNaN(d); });

  return {
    janelaInicio: _cHora(mapa['@janela_inicio'], '09:00'),
    janelaFim: _cHora(mapa['@janela_fim'], '18:00'),
    dias: dias.length ? dias : [1, 2, 3, 4, 5],
    validadeReservaHoras: parseInt(_cTexto(mapa['@validade_reserva_horas']), 10) || 30,
    killSwitch: _cTexto(mapa['@kill_switch']).toUpperCase().indexOf('SIM') === 0,
    versaoApp: _cTexto(mapa['@versao_app'])
  };
}

/** Mensagens @msg_v1..@msg_vN (texto na coluna observacao), na ordem da chave. */
function _cMensagens(cfg) {
  var H = cfg.H;
  var achadas = [];
  for (var r = 0; r < cfg.linhas.length; r++) {
    var chave = _cTexto(cfg.linhas[r][H.i('vendedor')]);
    if (!/^@msg_/i.test(chave)) continue;
    var texto = _cTexto(cfg.linhas[r][H.i('observacao')]);
    if (!texto) continue;
    achadas.push({ id: chave.replace(/^@/, '').toLowerCase(), texto: texto });
  }
  achadas.sort(function (a, b) { return a.id.localeCompare(b.id); });
  return achadas;
}

/* ------------------------------------------------------------------ *
 * PIN: hash e rate limit
 * ------------------------------------------------------------------ */

/** SHA-256(pin + salt) em hex minúsculo. O PIN só existe aqui dentro. */
function _cHashPin(pin) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin) + _cSalt(),
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]).toString(16);
    hex += b.length === 1 ? '0' + b : b;
  }
  return hex;
}

function _cSalt() {
  if (CARTEIRA_SALT_TESTE) return CARTEIRA_SALT_TESTE;
  var salt = PropertiesService.getScriptProperties().getProperty('CARTEIRA_SALT');
  if (!salt) throw new Error('CARTEIRA_SALT ausente em Script Properties.');
  return salt;
}

function _cChaveBloqueio(vendedor) {
  return 'carteira_pin_' + _cNormalizar(vendedor);
}

/** Bloqueado? Devolve o horário de liberação (HH:mm) ou '' se liberado. */
function _cBloqueioAtivo(vendedor) {
  var bruto = CacheService.getScriptCache().get(_cChaveBloqueio(vendedor));
  if (!bruto) return '';
  var reg = JSON.parse(bruto);
  if (reg.n <= CARTEIRA_MAX_PIN_ERRADO) return '';
  if (Date.now() >= reg.ate) return '';
  return Utilities.formatDate(new Date(reg.ate), _cTz(), 'HH:mm');
}

/** Soma 1 erro e devolve o total na janela de 1 hora. */
function _cContarErroPin(vendedor) {
  var cache = CacheService.getScriptCache();
  var chave = _cChaveBloqueio(vendedor);
  var bruto = cache.get(chave);
  var agora = Date.now();
  var reg = bruto ? JSON.parse(bruto) : { n: 0, ate: agora + CARTEIRA_BLOQUEIO_SEG * 1000 };
  if (agora >= reg.ate) reg = { n: 0, ate: agora + CARTEIRA_BLOQUEIO_SEG * 1000 };
  reg.n++;
  // A hora corre a partir do 1º erro; renovar o TTL não estende o bloqueio.
  var restante = Math.max(1, Math.ceil((reg.ate - agora) / 1000));
  cache.put(chave, JSON.stringify(reg), restante);
  return reg.n;
}

function _cLimparErroPin(vendedor) {
  CacheService.getScriptCache().remove(_cChaveBloqueio(vendedor));
}

/* ------------------------------------------------------------------ *
 * Utilitários
 * ------------------------------------------------------------------ */

function _cErro(codigo, msg) {
  return { ok: false, erro: codigo, msg: msg };
}

/** Planilha do cofre (ou a descartável do teste). */
function _cSS() {
  return CARTEIRA_SS_TESTE || SpreadsheetApp.getActiveSpreadsheet();
}

function _cAba(nome) {
  var sh = _cSS().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada no cofre.');
  return sh;
}

/** Cabeçalho da aba -> {ordem:[nomes], i(nome):índice 0-based}. */
function _cCabecalho(sh) {
  var ordem = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var mapa = {};
  ordem.forEach(function (h, i) { if (h) mapa[h.toLowerCase()] = i; });
  return {
    ordem: ordem,
    i: function (nome) {
      var idx = mapa[String(nome).toLowerCase()];
      if (idx === undefined) throw new Error('Coluna "' + nome + '" não existe na aba ' + sh.getName() + '.');
      return idx;
    }
  };
}

/**
 * Grava só as colunas alteradas de uma linha, em uma única chamada:
 * pega o menor e o maior índice e regrava o trecho a partir da linha em memória.
 */
function _cGravarCelulas(sh, linha, row, indices) {
  var min = Math.min.apply(null, indices);
  var max = Math.max.apply(null, indices);
  sh.getRange(linha, min + 1, 1, max - min + 1).setValues([row.slice(min, max + 1)]);
}

function _cTz() {
  return Session.getScriptTimeZone() || 'America/Sao_Paulo';
}

function _cTexto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Converte para Date o que a planilha devolver (Date, número serial ou texto). */
function _cData(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = _cTexto(v);
  if (!s) return null;
  var d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
}

/** Dia no fuso do script, 'AAAA-MM-DD'. Vazio se não for data. */
function _cDia(v) {
  var d = _cData(v);
  return d ? Utilities.formatDate(d, _cTz(), 'yyyy-MM-dd') : '';
}

/**
 * Hora 'HH:mm' vinda da planilha. Se a célula estiver formatada como hora, o
 * Sheets devolve um Date de 1899 — aí lemos hora/minuto direto do objeto, sem
 * passar por formatDate (em 1899 o fuso de São Paulo ainda era -03:06, e a
 * conversão devolveria 08:53 no lugar de 09:00).
 */
function _cHora(v, padrao) {
  if (v instanceof Date) {
    return ('0' + v.getHours()).slice(-2) + ':' + ('0' + v.getMinutes()).slice(-2);
  }
  var m = _cTexto(v).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return padrao;
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}

/** Janela = dia da semana permitido E hora entre início e fim. */
function _cJanelaAberta(params, agora) {
  var dow = new Date(_cDia(agora) + 'T12:00:00Z').getUTCDay(); // 0=dom .. 6=sáb
  var ok = params.dias.some(function (d) {
    return d === dow || (dow === 0 && d === 7);               // aceita 0 ou 7 para domingo
  });
  if (!ok) return false;
  var hhmm = Utilities.formatDate(agora, _cTz(), 'HH:mm');
  return hhmm >= params.janelaInicio && hhmm <= params.janelaFim;
}

/** Só um "não" explícito desativa; célula vazia continua ativa. */
function _cAtivo(v) {
  var s = _cNormalizar(v);
  return !(s === 'nao' || s === 'n' || s === 'false' || s === '0' || s === 'inativo');
}

/**
 * minúsculas, sem acento, espaços colapsados — para comparar nome de vendedor.
 * O NFD separa a letra do acento e o replace varre o bloco de diacríticos
 * combinantes (U+0300–U+036F); o arquivo é UTF-8, não mexer na classe.
 */
function _cNormalizar(v) {
  return _cTexto(v)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function _cMesmoNome(a, b) {
  var na = _cNormalizar(a);
  return na !== '' && na === _cNormalizar(b);
}

/** Telefone em E.164 só com dígitos, do jeito que o wa.me quer. */
function _cTelefone(v) {
  var d = _cTexto(v).replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) return '55' + d;           // DDD + número
  if (d.length > 13 && d.indexOf('55') === 0) return d.slice(0, 13); // lixo colado no fim
  return d;
}

/**
 * Versão da mensagem: hash estável de (id_lead + vendedor) % nº de versões.
 * Estável = o lead mantém o mesmo texto se a lista recarregar; e os 6 números
 * não disparam o mesmo texto no mesmo dia.
 */
function _cVersaoMsg(id, vendedor, total) {
  if (!total || total < 2) return 0;
  var s = String(id) + '|' + _cNormalizar(vendedor);
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h % total;
}
