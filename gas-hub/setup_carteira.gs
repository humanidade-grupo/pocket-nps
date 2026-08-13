/**
 * Carteira do Dia — setup do cofre
 * Grupo Humanidade · Parque da Saudade · 13/08/2026
 *
 * O QUE FAZ
 *   Cria e formata as 4 abas que a Carteira do Dia usa dentro do
 *   "Cofre — Hub Comercial (Grupo Humanidade)": Mailing, Log_Abordagem,
 *   Config_Carteira e Sessoes. Não apaga nada: aba que já existe é preservada.
 *
 * COMO RODAR (uma vez só)
 *   1. Abrir o cofre → Extensões → Apps Script.
 *   2. Colar este arquivo, salvar.
 *   3. Rodar  criarAbasCarteira()  e autorizar quando pedir.
 *   4. Rodar  sortearPins()  e copiar os PINs do log (aparecem UMA vez).
 *   5. Conferir a aba Config_Carteira e ajustar limites/janela se quiser.
 *
 * DEPOIS
 *   A base de leads entra na aba Mailing na higienização (etapa separada).
 *   O backend das ações fica em gas-hub/ no repo pocket-nps.
 */

// Deixe vazio para usar a planilha em que o script está acoplado.
// Se rodar de um script standalone, cole aqui o ID do cofre.
var PLANILHA_ID = '';

var VENDEDORES = [
  // Conferir a lista oficial dos 6 com o Ricardo antes de rodar.
  // A Escala de agosto/2026 lista 5 nomes e não inclui o Jaime.
  'Ana Luiza',
  'Ana Maria',
  'Guilherme',
  'Wanderson',
  'Felipe',
  'Jaime'
];

var GESTAO = ['Ricardo'];  // recebe papel "gestao" (vê o painel, não recebe carteira)

// ---------------------------------------------------------------- estrutura

var ABAS = {
  Mailing: {
    cabecalho: ['id', 'telefone', 'nome', 'origem', 'data_captacao', 'campanha',
                'status', 'vendedor', 'reservado_em', 'abordado_em', 'tentativas',
                'ultimo_desfecho', 'optout_em', 'deal_facilita'],
    larguras: [90, 140, 140, 110, 110, 110, 110, 120, 150, 150, 90, 200, 110, 110],
    congelar: 1
  },
  Log_Abordagem: {
    cabecalho: ['timestamp', 'id_lead', 'vendedor', 'acao', 'desfecho', 'versao_msg', 'obs'],
    larguras: [160, 90, 130, 120, 110, 100, 260],
    congelar: 1
  },
  Config_Carteira: {
    cabecalho: ['vendedor', 'papel', 'pin_hash', 'limite_diario', 'ativo', 'observacao'],
    larguras: [150, 100, 320, 110, 80, 240],
    congelar: 1
  },
  Sessoes: {
    cabecalho: ['token', 'vendedor', 'criado_em', 'expira_em', 'ultimo_uso'],
    larguras: [280, 140, 160, 160, 160],
    congelar: 1,
    ocultar: true
  }
};

var STATUS_VALIDOS = ['novo', 'reservado', 'abordado', 'respondeu',
                      'invalido', 'optout', 'cliente', 'descartado'];

// Parâmetros gerais — gravados como linhas especiais no Config_Carteira,
// com o vendedor no formato "@parametro".
var PARAMETROS = [
  ['@janela_inicio',          '09:00',  'Antes disso o botão de abrir o WhatsApp fica travado'],
  ['@janela_fim',             '18:00',  'Idem depois disso'],
  ['@dias_da_semana',         '1,2,3,4,5', 'Seg a sex. 0 = domingo'],
  ['@validade_reserva_horas', '30',     'Reserva não abordada volta para a fila'],
  ['@kill_switch',            'NAO',    'SIM pausa a operação inteira na hora'],
  ['@versao_app',             '1',      'Bump força o app a recarregar a config']
];

// As versões da mensagem. O texto vai na coluna "observacao"; o servidor sorteia
// uma por lead. Marcadores: {{saudacao}} {{nome}} {{vendedor}}.
// Validar com o Rodrigo antes do piloto — editar aqui na planilha é seguro.
var MENSAGENS = [
  ['@msg_v1', 'ATIVA',
   '{{saudacao}} {{nome}}, tudo bem? Aqui é o {{vendedor}}, do Parque da Saudade, em Juiz de Fora. Vi que você deixou seu contato com a gente e acabamos não conversando na época. Posso te passar as informações por aqui mesmo?\n\nSe preferir não receber mensagens, é só me avisar.'],
  ['@msg_v2', 'ATIVA',
   '{{saudacao}} {{nome}}. Meu nome é {{vendedor}}, sou consultor do Parque da Saudade, aqui em Juiz de Fora. Você chegou até a gente pelo nosso site e ficou sem retorno. Ainda faz sentido conversar sobre isso?\n\nSe não fizer, me diz que eu não te procuro mais.'],
  ['@msg_v3', 'ATIVA',
   '{{saudacao}} {{nome}}, aqui é {{vendedor}}, do Parque da Saudade (Juiz de Fora). Você deixou seu contato conosco e eu passei para perguntar uma coisa só: essa questão do jazigo da família você já resolveu, ou ainda está em aberto?\n\nSe preferir não receber mensagem, é só falar.'],
  ['@msg_v4', 'ATIVA',
   '{{saudacao}} {{nome}}, tudo certo? {{vendedor}} falando, do Parque da Saudade, em Juiz de Fora. Estou retomando os contatos que ficaram para trás. Se ainda tiver interesse em entender como funciona, me responde que eu te explico sem compromisso.\n\nSe não for o caso, me avisa que eu encerro por aqui.'],
  ['@msg_followup', 'ATIVA',
   '{{saudacao}} {{nome}}, {{vendedor}} do Parque da Saudade. Passei aqui de novo só para não deixar sem resposta. Se não for o momento, sem problema nenhum — é só me dizer e eu encerro. E se quiser retomar mais para frente, fico à disposição.']
];

// ---------------------------------------------------------------- principal

function criarAbasCarteira() {
  var ss = PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID)
                       : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Não achei a planilha. Preencha PLANILHA_ID.');

  var criadas = [], mantidas = [];

  Object.keys(ABAS).forEach(function (nome) {
    var def = ABAS[nome];
    var aba = ss.getSheetByName(nome);

    if (aba) { mantidas.push(nome); }
    else {
      aba = ss.insertSheet(nome);
      criadas.push(nome);
      aba.getRange(1, 1, 1, def.cabecalho.length).setValues([def.cabecalho]);
    }

    // formatação do cabeçalho (idempotente)
    var head = aba.getRange(1, 1, 1, def.cabecalho.length);
    head.setFontWeight('bold')
        .setBackground('#f2c744')      // amarelo da marca
        .setFontColor('#1a1a1a')
        .setVerticalAlignment('middle');
    aba.setFrozenRows(def.congelar);
    aba.setRowHeight(1, 34);
    def.larguras.forEach(function (w, i) { aba.setColumnWidth(i + 1, w); });
    if (def.ocultar) aba.hideSheet();
  });

  aplicarValidacaoMailing_(ss);
  semearConfig_(ss);
  garantirSalt_();

  var msg = 'Abas criadas: ' + (criadas.join(', ') || '(nenhuma)') +
            '\nJá existiam: ' + (mantidas.join(', ') || '(nenhuma)') +
            '\n\nPróximo passo: rodar sortearPins().';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function aplicarValidacaoMailing_(ss) {
  var aba = ss.getSheetByName('Mailing');
  var ultima = Math.max(aba.getMaxRows() - 1, 1);

  var regra = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_VALIDOS, true)
      .setAllowInvalid(false)
      .setHelpText('Status válidos: ' + STATUS_VALIDOS.join(', '))
      .build();
  aba.getRange(2, 7, ultima, 1).setDataValidation(regra);   // coluna G = status

  aba.getRange(2, 2, ultima, 1).setNumberFormat('@');       // telefone como texto
  aba.getRange(2, 5, ultima, 1).setNumberFormat('yyyy-mm-dd');

  // destaque de quem pediu para não receber
  var faixa = aba.getRange(2, 1, ultima, ABAS.Mailing.cabecalho.length);
  var regraCond = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$G2="optout"')
      .setBackground('#fce8e6')
      .setRanges([faixa])
      .build();
  // substitui em vez de empilhar — rodar o setup de novo não duplica a regra
  aba.setConditionalFormatRules([regraCond]);
}

function semearConfig_(ss) {
  var aba = ss.getSheetByName('Config_Carteira');
  var existentes = {};
  if (aba.getLastRow() > 1) {
    aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues()
       .forEach(function (r) { existentes[String(r[0]).trim()] = true; });
  }

  var novas = [];
  VENDEDORES.forEach(function (v) {
    if (!existentes[v]) novas.push([v, 'vendedor', '', 8, 'SIM', 'aquecimento: 8 → 12 → 20']);
  });
  GESTAO.forEach(function (g) {
    if (!existentes[g]) novas.push([g, 'gestao', '', 0, 'SIM', 'vê o painel, não recebe carteira']);
  });
  PARAMETROS.forEach(function (p) {
    if (!existentes[p[0]]) novas.push([p[0], 'parametro', '', p[1], 'SIM', p[2]]);
  });
  MENSAGENS.forEach(function (m) {
    if (!existentes[m[0]]) novas.push([m[0], 'parametro', '', m[1], 'SIM', m[2]]);
  });

  if (novas.length) {
    aba.getRange(aba.getLastRow() + 1, 1, novas.length, 6).setValues(novas);
  }
  // os textos das mensagens são longos: cortar em vez de esticar a linha
  aba.getRange(2, 6, Math.max(aba.getLastRow() - 1, 1), 1)
     .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
}

// ---------------------------------------------------------------- PINs

/**
 * Sorteia um PIN de 6 dígitos para cada vendedor sem PIN definido,
 * grava só o hash na planilha e mostra os PINs em claro UMA vez.
 * Anote e entregue pessoalmente. Rodar de novo NÃO revela os antigos.
 */
function sortearPins() {
  var ss = PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID)
                       : SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('Config_Carteira');
  if (!aba || aba.getLastRow() < 2) throw new Error('Rode criarAbasCarteira() primeiro.');

  var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 6).getValues();
  var saida = [];

  dados.forEach(function (linha, i) {
    var nome = String(linha[0]).trim();
    var papel = String(linha[1]).trim();
    var temHash = String(linha[2]).trim() !== '';
    if (papel === 'parametro' || nome === '' || temHash) return;

    var pin = ('' + Math.floor(100000 + Math.random() * 900000));
    aba.getRange(i + 2, 3).setValue(hashPin_(pin));
    saida.push(nome + ': ' + pin);
  });

  var msg = saida.length
      ? 'PINs gerados (anote agora, não aparecem de novo):\n\n' + saida.join('\n')
      : 'Todo mundo já tem PIN. Para trocar o de alguém, apague o pin_hash da linha e rode de novo.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function hashPin_(pin) {
  var salt = garantirSalt_();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin + salt, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

function garantirSalt_() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('CARTEIRA_SALT');
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('CARTEIRA_SALT', salt);
  }
  return salt;   // nunca versionar; vive só nas propriedades do script
}

// ---------------------------------------------------------------- manutenção

/**
 * Devolve à fila as reservas que ninguém abordou.
 * Instalar como gatilho diário às 05:00 (Acionadores → Adicionar acionador).
 */
function devolverReservasVencidas() {
  var ss = PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID)
                       : SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('Mailing');
  if (aba.getLastRow() < 2) return;

  var horas = Number(lerParametro_(ss, '@validade_reserva_horas') || 30);
  var limite = new Date(Date.now() - horas * 3600 * 1000);

  var n = aba.getLastRow() - 1;
  var faixa = aba.getRange(2, 7, n, 3);          // status, vendedor, reservado_em
  var v = faixa.getValues();
  var mudou = 0;

  for (var i = 0; i < v.length; i++) {
    if (v[i][0] !== 'reservado') continue;
    var quando = v[i][2] ? new Date(v[i][2]) : null;
    if (quando && quando > limite) continue;
    v[i][0] = 'novo'; v[i][1] = ''; v[i][2] = '';
    mudou++;
  }
  if (mudou) faixa.setValues(v);
  Logger.log('Reservas devolvidas à fila: ' + mudou);
}

function lerParametro_(ss, chave) {
  var aba = ss.getSheetByName('Config_Carteira');
  var v = aba.getRange(2, 1, aba.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() === chave) return v[i][3];
  }
  return null;
}

/** Trava a operação inteira na hora. Use se algum número receber aviso do WhatsApp. */
function pausarOperacao() { escreverParametro_('@kill_switch', 'SIM'); }
function retomarOperacao() { escreverParametro_('@kill_switch', 'NAO'); }

function escreverParametro_(chave, valor) {
  var ss = PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID)
                       : SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('Config_Carteira');
  var v = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() === chave) {
      aba.getRange(i + 2, 4).setValue(valor);
      Logger.log(chave + ' = ' + valor);
      return;
    }
  }
  throw new Error('Parâmetro não encontrado: ' + chave);
}
function mostrarSalt() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('CARTEIRA_SALT'));
}