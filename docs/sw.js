/* Pocket NPS — Parque da Saudade
   Service worker: offline + instalação PWA.
   Gerado em: 06/08/2026 20:49
   IMPORTANTE: a cada novo deploy, troque a versão em CACHE (abaixo) para que a
   equipe receba a atualização. Basta bumpar a data/hora do sufixo. */
const CACHE = 'pocket-nps-260806-2049';

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
  // Deixa passar direto o que não é do próprio site (ex.: JSONP do Web App
  // do Apps Script para o check-in) — o SW não intercepta cross-origin.
  if (new URL(req.url).origin !== self.location.origin) return;

  // Navegações (abrir/atualizar o app): rede primeiro (pega a versão nova
  // quando online), com a cópia em cache como reserva offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./', copy));
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
