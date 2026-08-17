/* Pocket NPS — Parque da Saudade
Service worker: offline + instalação PWA.
Gerado em: 14/08/2026 17:10
Alterações: Rev. 17/08/2026 14:20 — só bump de cache (guarda-corpo da entrada
adicional: modal de confirmação quando o valor digitado é quase a parcela).
Rev. 17/08/2026 12:57 — só bump de cache (campo "Entrada" do simulador
passa a se chamar "Entrada adicional", com microcopy e cronograma explícito).
Rev. 16/08/2026 21:05 — o Emissor de Recibos sai do Pocket e vira
utilitário avulso (humanidade-grupo/ferramentas). /recibo/ agora é só um
redirect. A regra que ignora /recibo/ continua valendo: é ela que impede o
redirect de ficar preso no cache do aparelho.
Rev. 16/08/2026 — página /recibo/ (Emissor de Recibos da secretaria)
entra no ar; SW passa a ignorar /recibo/, como já faz com /gestao/.
Rev. 14/08/2026 17:10 — só bump de cache (nota da Quadra Mista some
em Reserva e Temporário; Quadra Mista é só do Perpétuo).
Rev. 14/08/2026 15:30 — só bump de cache (simulador ganha o produto
Temporário, teto de 21x, Uso Temporário a 20% do Perpétuo; correção dos links
das tabelas M-20 e M-21).
Rev. 13/08/2026 12:43 — só bump de cache (app deixa de abrir direto
no lead; tela do lead ganha saída; textos da planilha chegam ao retomar).
Rev. 13/08/2026 11:57 — corrige app morto ao abrir
direto em #carteira ou #escala).
Rev. 13/08/2026 11:29 — Sair limpa o lote do
aparelho; textos das mensagens recarregam a cada lista).
Rev. 13/08/2026 11:12 — Ricardo entra na lista de login da Carteira.
Rev. 13/08/2026 10:56 — só bump de cache (nomes do mailing em CAIXA
ALTA passam a sair em caixa normal na mensagem e no card).
Rev. 12/08/2026 23:20 — só bump de cache (tela nova "Carteira do Dia").
Nada a mudar na lógica: as chamadas da carteira vão para o Apps Script, que é
outra origem, e o SW já deixa cross-origin passar direto (linha do url.origin).
É isso que faz a chamada falhar de forma limpa quando o vendedor está sem sinal,
em vez de o SW responder do cache — a fila offline depende desse comportamento.
Rev. 11/08/2026 — corrige bug em que QUALQUER navegação era
gravada no cache como a home ('./'), o que podia servir outra página no
lugar do app offline; o SW agora ignora tudo sob /gestao/ (área da gestão,
fora do app do time) e só regrava './' quando a navegação é a própria home.
Rev. 12/08/2026 — só bump de cache (mudança na home: tela IQ desabilitada).
IMPORTANTE: a cada novo deploy, troque a versão em CACHE (abaixo) para que a
equipe receba a atualização. Basta bumpar a data/hora do sufixo. */
const CACHE = 'pocket-nps-260817-1420';

const CORE = [
'./',
'./index.html',
'./manifest.webmanifest',
'./logo-ps.svg',
'./apple-touch-icon.png',
'./icons/icon-192.png',
'./icons/icon-512.png'
];

self.addEventListener('install', e => {
e.waitUntil(
caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
);
});

self.addEventListener('activate', e => {
e.waitUntil(
caches.keys()
.then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
.then(() => self.clients.claim())
);
});

self.addEventListener('fetch', e => {
const req = e.request;
if (req.method !== 'GET') return;
const url = new URL(req.url);
// Deixa passar direto o que não é do próprio site (ex.: JSONP do Web App
// do Apps Script para o check-in) — o SW não intercepta cross-origin.
if (url.origin !== self.location.origin) return;
// Área da gestão (/gestao/) e o emissor de recibos (/recibo/): fora do app
// do time — o SW não intercepta nem guarda nada delas no cache do Pocket.
if (url.pathname.includes('/gestao/') || url.pathname.includes('/recibo/')) return;

// Navegações (abrir/atualizar o app): rede primeiro (pega a versão nova
// quando online), com a cópia em cache como reserva offline.
if (req.mode === 'navigate') {
e.respondWith(
fetch(req)
.then(res => {
// Só regrava a home quando a navegação É a home (bug corrigido em 11/08:
// antes, qualquer página visitada era gravada como './').
if (url.pathname.endsWith('/pocket-nps/') || url.pathname.endsWith('/index.html')) {
const copy = res.clone();
caches.open(CACHE).then(c => c.put('./', copy));
}
return res;
})
.catch(() => caches.match('./').then(r => r || caches.match('./index.html')))
);
return;
}

// Demais assets (ícones, manifest): cache primeiro, rede como reserva.
e.respondWith(
caches.match(req).then(cached => {
if (cached) return cached;
return fetch(req).then(res => {
if (res && res.status === 200 && res.type === 'basic') {
const copy = res.clone();
caches.open(CACHE).then(c => c.put(req, copy));
}
return res;
});
})
);
});
