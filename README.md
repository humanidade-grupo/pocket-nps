<!--
  grupo-humanidade / parque da saudade / sistemas
  Pocket NPS — README do repositório (monorepo)
  Gerado em: 05/08/2026
  Resumo: estrutura docs/ (PWA no GitHub Pages) + gas/ (backend da Escala via clasp).
-->

# Pocket NPS

App de bolso da equipe de vendas do Parque da Saudade — **um único app** com quatro
telas (Simulador de financiamento, Escala, IQ de Venda, Tabela de Preços). PWA que
instala na tela inicial do celular e funciona **offline**.

Ao vivo: **https://humanidade-grupo.github.io/pocket-nps/**

> ⚠️ **Acesso:** por ora o app é **público**. Tabela de Preços e config do IQ são
> dados comerciais internos — depois migramos para login/senha.

## Estrutura do repositório

| Pasta | O que é | Deploy |
|---|---|---|
| [`docs/`](docs/) | A PWA (HTML/CSS/JS/ícones num `index.html`). **Fonte do GitHub Pages.** | `git push` (Pages serve `/docs`) |
| [`gas/`](gas/) | Backend da tela **Escala** (Google Apps Script) — o check-in "Cheguei". | `clasp push` + `clasp deploy` |

As duas partes são o **mesmo app**; ficam em pastas separadas só porque têm
destinos de deploy diferentes (Pages para a web, Google/Apps Script para o backend).

> **O backend do Cofre não mora mais aqui.** A pasta `gas-hub/` saiu em 17/08/2026
> para o repositório privado **`humanidade-grupo/cofre`**, com o histórico junto.
> O Cofre não é parte deste app: é a camada que o Pocket e o Painel Comercial leem.
> Não confunda com `gas/` acima, que é outro projeto Apps Script (o da Escala) e
> continua neste repositório.

## Deploy da PWA (docs/)

1. Editar os arquivos em `docs/`.
2. **Bumpar o cache** em `docs/sw.js` (`const CACHE = 'pocket-nps-AAMMDD-HHMM'`) e
   atualizar o carimbo **"Atualizado em"** na home (`docs/index.html`).
3. `git push`. O Pages republica em segundos (fonte: branch `main`, pasta `/docs`).

## Deploy do backend (gas/)

Ver [`gas/README.md`](gas/README.md) — sobe por `clasp` (nunca colar no editor).
Depois de publicar, colar a URL `/exec` na constante `ESCALA_API` em `docs/index.html`.

## Instalar no celular

- **Android (Chrome):** abrir a URL → **Instalar app**.
- **iPhone (Safari):** abrir a URL → **Compartilhar → Adicionar à Tela de Início**.

Funciona offline depois de abrir uma vez.
