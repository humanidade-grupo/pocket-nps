/**
 * Auth.gs — verificação de token do Hub Comercial.
 *
 * Um único token de gestão (leitura + escrita), decisão de 09/08/2026:
 * quem lança venda é a gestão, então a face do time não fala com o /exec.
 *
 * O token vive SÓ em Script Properties (chave TOKEN_GESTAO) — nunca no
 * código, nunca no HTML (o repositório é público). Ricardo e Rodrigo
 * digitam o token uma vez no aparelho; a página guarda em localStorage.
 *
 * Para gerar/rotacionar: rode gerarToken() no editor do Apps Script
 * (menu Executar) e copie o valor do log. Rodar de novo SOBRESCREVE
 * (rotação) — os aparelhos precisam digitar o novo.
 */

function Auth_ok(token) {
  var esperado = PropertiesService.getScriptProperties().getProperty('TOKEN_GESTAO');
  if (!esperado) return false; // sem token configurado, nada passa
  return String(token) === String(esperado);
}

/** Gera um token aleatório e grava em Script Properties. Rode no editor e copie do log. */
function gerarToken() {
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var t = '';
  for (var i = 0; i < 28; i++) {
    t += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  }
  PropertiesService.getScriptProperties().setProperty('TOKEN_GESTAO', t);
  Logger.log('TOKEN_GESTAO gerado (copie e guarde): ' + t);
  return t;
}
