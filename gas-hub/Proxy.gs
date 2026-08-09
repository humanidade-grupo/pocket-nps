/**
 * Proxy.gs — STUB (FAROL, ainda não ativo).
 * Proxy do "Pergunte ao Farol": recebe a pergunta do dashboard, chama a
 * API da Anthropic com a chave guardada em Script Properties
 * (ANTHROPIC_API_KEY — NUNCA no cliente) e devolve a resposta.
 * Entra em produção junto com o FAROL.
 */

function Proxy_chat(body) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, error: 'chat ainda não ativo (sem ANTHROPIC_API_KEY)' };
  // Implementação real entra com o FAROL:
  // UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {...})
  return { ok: false, error: 'Proxy_chat ainda não implementado — aguarda FAROL.' };
}
