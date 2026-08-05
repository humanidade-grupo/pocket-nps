<!--
  grupo-humanidade / parque da saudade / sistemas
  Pocket NPS — backend da tela Escala (Google Apps Script) — deploy via clasp
  Gerado em: 05/08/2026
  Resumo: passo a passo do clasp para publicar o Web App do check-in.
-->

# Pocket NPS — backend da Escala (Apps Script)

Backend da tela **Escala** do Pocket NPS (não é um app à parte — é o servidor do
check-in "Cheguei"). É um Web App do Apps Script **vinculado** à planilha
*"Pocket NPS — Escala da Equipe (base)"*, que grava a presença dos vendedores na
aba `Checkins`.

- Código: [`escala-Code.gs`](escala-Code.gs)
- Manifesto: [`appsscript.json`](appsscript.json) (Web App, acesso "Qualquer pessoa")
- `.clasp.json` = scriptId (versionado) · `.clasprc.json` = credencial (no `.gitignore` da raiz)

> **Regra (sistemas/CLAUDE.md):** Apps Script **sobe sempre por `clasp`** — colar no
> editor não é permitido, e `push` sem `deploy` **não** atualiza o `/exec`.

## Uma vez

```bash
npm i -g @google/clasp
clasp login          # abre o navegador; você autoriza (gera ~/.clasprc.json — não versionar)
```
Ligar a API: https://script.google.com/home/usersettings → "Google Apps Script API".

## Configurar

1. Script ID: planilha → **Extensões → Apps Script** → engrenagem **Configurações do
   projeto** → copie o **"ID do script"**.
2. Cole em [`.clasp.json`](.clasp.json) no campo `scriptId` (troca `COLE_AQUI_O_SCRIPT_ID`).

## Publicar (rodando de dentro de `gas/`)

> ⚠️ Se o projeto no editor tiver o código num arquivo de outro nome (ex.: `Código.gs`),
> um `clasp push` cria um `escala-Code` **além** do existente. Rode `clasp pull` primeiro
> e reconcilie, ou apague o arquivo antigo no editor após o 1º push.

```bash
clasp push                 # sobe escala-Code.gs + appsscript.json
clasp deploy               # publica NOVA versão do Web App
# para manter a MESMA URL /exec de uma implantação:
# clasp deployments ; clasp deploy -i <deploymentId>
```

Depois: copie a URL `/exec` e cole na constante `ESCALA_API` em `../docs/index.html`
(e republique a PWA). Sem ela, o card de check-in mostra o posto do dia mas não registra.
