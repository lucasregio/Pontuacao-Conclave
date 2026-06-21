# Pontuação Conclave (Web)

Aplicação **100% estática** para registro e classificação de pontuação do
Conclave. Roda direto no navegador a partir de `index.html`, sem backend de
runtime. Os dados (evento + entradas) são manipulados como JSON e podem ser
exportados, importados e mantidos no `localStorage` do próprio navegador.

> Este projeto migrou de uma versão Python desktop para uma aplicação web pura.
> Os artefatos Python históricos foram removidos e **não devem ser reintroduzidos**.
> Scripts legados ficam em `referencia/scripts/` apenas como arquivo histórico.

## Sumário

- [Como usar](#como-usar)
- [Rodar de pen-drive (sem servidor)](#rodar-de-pen-drive-sem-servidor)
- [Arquitetura](#arquitetura)
- [Comandos](#comandos)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Modelo de dados](#modelo-de-dados)
- [Regras de pontuação (engine)](#regras-de-pontuação-engine)
- [Acessibilidade e UX](#acessibilidade-e-ux)
- [PWA e modo offline](#pwa-e-modo-offline)
- [Deploy (GitHub Pages)](#deploy-github-pages)
- [Convenções de contribuição](#convenções-de-contribuição)
- [Documentação adicional](#documentação-adicional)

## Como usar

1. Abra `index.html` em qualquer navegador moderno. Para PWA/offline, sirva via
   `http(s)://` em vez de `file://`.
2. Na aba **Início**, use **Novo evento**, **Carregar projeto** ou o menu **Mais**
   → **Carregar evento** / **Exportar evento** / **Exportar projeto**.
3. Edite as abas: **Configuração**, **Participação**, **Pódio**, **Classificação**,
   **Relatórios**.
4. **Exportar projeto** salva evento + dados; **Exportar evento** salva só a
   configuração. **Eventos salvos** (menu Mais) gerencia cópias no `localStorage`.
5. **Regulamento** (topbar) abre o PDF configurado em Configuração → Geral
   (ficheiros em `static/`).

## Rodar de pen-drive (sem servidor)

**Jeito rápido** — duplo clique em `index.html`. O exemplo embarcado carrega via
`window.ConclaveDefaultEvento` (sem `fetch()` em `file://`).

**Jeito completo** (PWA + cache) — `pen-drive/iniciar.command` (macOS/Linux) ou
`pen-drive/iniciar.bat` (Windows).

Regenere o embedded após editar o JSON fonte:

```bash
npm run build:embedded
```

Detalhes em `pen-drive/LEIA-ME.txt`.

## Arquitetura

1. **`web/engine.js`** — motor puro (`window.ConclaveEngine`), sem DOM.
2. **`web/app.js`** — UI, estado, persistência, modais, cache de `computeTotals`.
3. **`web/styles.css`** — temas MR/ER, responsividade, impressão, apresentação.

Esquemas em `schema/evento.schema.json` e `schema/projeto.schema.json`. Amostras
em `eventos/conclave-2026-1.*`.

## Comandos

| Tarefa             | Comando                                                  |
| ------------------ | -------------------------------------------------------- |
| Lint               | `npm run lint`                                           |
| Testes             | `npm test`                                               |
| Formatação         | `npm run format:check` / `npm run format`                |
| Servir local       | `npm run serve`                                          |
| Embedded pen-drive | `npm run build:embedded`                                 |
| Qualidade sem npm  | `node scripts/quality-check.mjs`                         |
| Publicar no GitHub | `.\scripts\publicar-github.ps1` (requer `gh auth login`) |

CI (Node 22): lint + test + format:check. Checklist de release:
[`docs/operacional/release-checklist.md`](docs/operacional/release-checklist.md).

## Estrutura de pastas

```
.
├── index.html                 # Entrada (Dashboard, Config, …)
├── manifest.webmanifest
├── sw.js
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json               # scripts npm (lint, test, build:embedded)
├── eslint.config.js
├── .prettierrc.json
├── web/                       # engine.js, app.js, styles.css
├── icons/
├── schema/                    # evento.schema.json, projeto.schema.json
├── static/                    # PDF regulamento, imagens de fundo
├── eventos/                   # amostras + .evento.embedded.js (gerado)
├── docs/
│   ├── index.html
│   ├── usuario/               # manual, faq, glossário, …
│   └── operacional/           # metrics, performance-budget, release
├── referencia/                # planilhas/docx legados (não deployado)
├── pen-drive/
├── scripts/                   # build-embedded.mjs, quality-check.mjs, publicar-github.ps1
├── tests/                     # engine, roundtrip, escape, schema, embedded, perf
└── .github/workflows/         # ci.yml, pages.yml, lighthouse.yml
```

## Modelo de dados

```jsonc
{
  "evento": {
    "meta": { "schemaVersion": 2, "nome": "Conclave 2026", "slug": "conclave-2026-1" },
    "igrejas": [{ "id": "central", "nome": "Igreja Central" }],
    "categorias": [{ "id": "junior", "nome": "Junior", "idade": "10–13" }],
    "provas": [
      { "id": "biblia-jr", "titulo": "Conhecimentos Gerais da Bíblia", "categoriaId": "junior" },
    ],
    "pesos": {
      "inscricao": 5,
      "pontualidade": 3,
      "uniforme": 4,
      "biblia": 4,
      "visitante": 1,
      "animacao": 2,
      "mau_comportamento": -3,
    },
    "medalhas": { "ou": 5, "pt": 3, "br": 1 },
  },
  "dados": {
    "participacao": {
      "central": {
        "inscricao": true,
        "mr_total": 12,
        "mr_camisa": 12,
        "mr_biblia": 10,
        "pontuacao_extra": 0,
      },
    },
    "podium": {
      "biblia-jr": { "ou": { "igrejaId": "central" } },
    },
  },
}
```

Detalhes em `schema/*.schema.json`.

## Regras de pontuação (engine)

API: `computeTotals`, `classificacaoOrdenada`, `rankList`, `validateEventoMinimal`,
`emptyDadosTemplate`, `avisosPodiumDuplicado`, `contarMedalhasPorIgreja`.

**Desempate:** total → contagem ouro → contagem prata → pontos CG Bíblia → Debate →
CG Organização → nome (collation pt).

## Acessibilidade e UX

Sem `alert`/`confirm`; skip-link; foco visível; modo apresentação com Esc; CSP em
`index.html` e `docs/index.html`.

## PWA e modo offline

`manifest.webmanifest` + `sw.js` (cache app shell). Requer `http(s)://` para registrar
o service worker.

## Deploy (GitHub Pages)

Repositório: [github.com/lucasregio/Pontuacao-Conclave](https://github.com/lucasregio/Pontuacao-Conclave)

App publicado em: [lucasregio.github.io/Pontuacao-Conclave/](https://lucasregio.github.io/Pontuacao-Conclave/)

`pages.yml` publica após CI passar; exclui `referencia/`, `tests/`, `scripts/`, etc.
Setup inicial (remote + push + Pages): `.\scripts\publicar-github.ps1` (requer
[`gh`](https://cli.github.com/) autenticado).

## Convenções de contribuição

pt-BR na UI; vanilla JS; antes de merge: `npm run lint && npm test && npm run format:check`.
Ver [`CONTRIBUTING.md`](CONTRIBUTING.md) e [`AGENTS.md`](AGENTS.md).

## Documentação adicional

**Usuário:** [`docs/index.html`](docs/index.html) — manual, FAQ, glossário, troubleshooting,
atalhos, regulamento mapeado em `docs/usuario/`.

**Operacional:** `docs/operacional/metrics-baseline.md`, `performance-budget.md`,
`release-checklist.md`.
