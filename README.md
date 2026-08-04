<!--
  grupo-humanidade / parque da saudade
  Pocket NPS — README de publicação (PWA / GitHub Pages)
  Gerado em: 03/08/2026 22:21
  Resumo: instruções de deploy no GitHub Pages e de instalação no celular.
-->

# Pocket NPS — publicação como PWA

App de bolso da equipe de vendas do Parque da Saudade (Simulador de financiamento,
Escala, IQ de Venda e Tabela de Preços). É um **PWA**: instala na tela inicial do
celular e funciona **offline**.

> ⚠️ **Acesso:** nesta fase o app é **público** (qualquer pessoa com o link abre).
> A Tabela de Preços e a configuração do IQ são dados comerciais internos — quando
> decidirmos, migramos para **login e senha** (ex.: Cloudflare Access / Netlify).

## Conteúdo desta pasta (`site/`)

| Arquivo | Função |
|---|---|
| `index.html` | O app inteiro (HTML/CSS/JS/SVG num arquivo só). É a versão corrente. |
| `manifest.webmanifest` | Metadados de instalação (nome, cores, ícones). |
| `sw.js` | Service worker: precache para offline + habilita a instalação. |
| `apple-touch-icon.png` | Ícone da tela inicial no iOS (180×180). |
| `icons/icon-192.png`, `icons/icon-512.png` | Ícones de instalação (Android/PWA). |

**Tudo é relativo** — funciona tanto em domínio próprio quanto em subpasta
(`usuario.github.io/repo/`).

## Publicar no GitHub Pages

1. Criar um repositório **novo e próprio deste ecossistema** (não usar a infra
   Mobile Digital/Vero). Ex.: `parque-da-saudade/pocket-nps`.
2. Subir o **conteúdo desta pasta `site/`** na **raiz** do repositório (ou seja,
   `index.html` na raiz — não dentro de outra subpasta).
3. No GitHub: **Settings → Pages** → *Source*: **Deploy from a branch** →
   Branch: `main` / pasta `/ (root)` → **Save**.
4. Aguardar ~1 min. A URL sai como `https://<usuario|org>.github.io/<repo>/`.
5. Abrir a URL no celular e instalar (ver abaixo).

> Domínio próprio (opcional): em **Settings → Pages → Custom domain** dá para usar
> algo como `pocket.parquedasaudade.com.br` (exige acesso ao DNS do domínio).

### A cada nova versão

1. Substituir os arquivos alterados (normalmente só o `index.html`).
2. **Bumpar a versão do cache** em `sw.js` — trocar a linha
   `const CACHE = 'pocket-nps-AAMMDD-HHMM';` para a data/hora nova. Sem isso, a
   equipe fica presa na versão antiga em cache.
3. Commitar/subir. Em segundos o Pages atualiza; ao reabrir o app (online), o time
   recebe a versão nova.

## Instalar no celular

**Android (Chrome):** abrir a URL → aparece o aviso **"Instalar app"** (ou menu ⋮ →
**Instalar app / Adicionar à tela inicial**).

**iPhone/iPad (Safari):** abrir a URL → botão **Compartilhar** → **Adicionar à Tela
de Início**.

Depois de instalado, o app abre em tela cheia (sem barra do navegador) e funciona
sem internet.

## Requisitos técnicos (já atendidos)

- ✅ HTTPS (o GitHub Pages já serve em HTTPS).
- ✅ Manifest com ícones 192 e 512 (PNG, incl. `maskable`).
- ✅ Service worker com precache do app-shell (offline real + instalável).
- ✅ Ícone de tela inicial para iOS (180 PNG).

## Teste local (opcional, para conferir antes de subir)

O service worker **não** roda via `file://` — precisa de `http`. Rodar dentro de
`site/`:

```bash
python -m http.server 8080
```

Depois abrir `http://localhost:8080/` no navegador. Em DevTools → *Application* dá
para ver o *Manifest*, o *Service Worker* e o cache.
