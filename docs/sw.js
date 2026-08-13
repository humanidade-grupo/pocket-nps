/* Pocket NPS — Parque da Saudade
Service worker: offline + instalação PWA.
Gerado em: 12/08/2026 23:20
Alterações: Rev. 12/08/2026 23:20 — só bump de cache (tela nova "Carteira do Dia").
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
const CACHE = 'pocket-nps-260812-2320';

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
// Área da gestão (/gestao/): fora do app do time — o SW não intercepta
// nem guarda nada dela no cache do Pocket.
if (url.pathname.includes('/gestao/')) return;

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
