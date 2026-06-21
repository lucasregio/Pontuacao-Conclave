# AGENTS.md — Pontuação Conclave (Web)

Guide for AI agents contributing to this repository. The project itself is in Brazilian Portuguese, so **UI strings, user-facing messages, commit messages, and code comments must stay in pt-BR**. Internal agent reasoning and PR descriptions may be in English.

## Overview

A **100% static web application** for Conclave scoring (**Pontuação Conclave**). Runs in the browser from `index.html`, with no backend at runtime. Event/project data is loaded/exported as JSON and persisted in `localStorage`.

> Legacy Python artifacts must not be reintroduced. Historical scripts live under `referencia/scripts/`.

## Repository layout

- `index.html` — main entry point (Dashboard, Config, Participation, Podium, Ranking, Reports tabs).
- `web/engine.js` — **pure scoring engine** (`window.ConclaveEngine`). No DOM.
- `web/app.js` — UI / DOM / state / persistence.
- `web/styles.css` — MR/ER themes, presentation mode, print.
- `schema/evento.schema.json` / `schema/projeto.schema.json` — canonical JSON contracts.
- `static/` — PDF regulamento, imagens de fundo (servidos pelo app).
- `eventos/` — sample event and project files + `.evento.embedded.js` (generated).
- `docs/usuario/` — manual, FAQ, glossário, troubleshooting, atalhos, regulamento mapeado.
- `docs/operacional/` — metrics-baseline, performance-budget, release-checklist.
- `docs/index.html` — documentation landing.
- `referencia/` — historical xlsx/docx (excluded from GitHub Pages deploy).
- `pen-drive/` — offline launcher scripts.
- `tests/` — engine, roundtrip, escape, schema, embedded, perf.
- `scripts/build-embedded.mjs`, `scripts/quality-check.mjs`, `scripts/publicar-github.ps1`.

Root metadata: `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `package.json`, ESLint/Prettier configs.
The `.cursor/` folder is gitignored (local Cursor IDE config only).

## Commands

| Task                | Command                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Lint                | `npm run lint`                                                                                            |
| Tests               | `npm test`                                                                                                |
| Format check        | `npm run format:check`                                                                                    |
| Format apply        | `npm run format`                                                                                          |
| Serve local         | `npm run serve`                                                                                           |
| Regenerate embedded | `npm run build:embedded`                                                                                  |
| Quality without npm | `node scripts/quality-check.mjs`                                                                          |
| Publish to GitHub   | `.\scripts\publicar-github.ps1` (requires `gh auth login`; default repo: `lucasregio/Pontuacao-Conclave`) |

Before finalizing changes in `web/`, `tests/`, or configs: **lint + test + format:check**. CI (Node 22) runs the same.

## Gitflow

- **`main`** — production; GitHub Pages deploys on push here.
- **`develop`** — integration branch; default target for feature PRs.
- Prefixes: `feature/`, `release/`, `hotfix/` (see [`docs/operacional/gitflow.md`](docs/operacional/gitflow.md)).

Agents: branch from `develop`, open PRs to `develop` unless doing a release/hotfix.

## Required conventions

- **No native dialogs** in `web/app.js` — use modal-confirm / feedback banners.
- **No framework, no bundler** — vanilla HTML/CSS/JS with `defer`.
- **Accessibility** — keyboard nav, `aria-*`, visible focus.
- **Performance** — see `docs/operacional/performance-budget.md` (≤ 150ms derived updates; RAF + `markComputeDirty`).
- **Language** — pt-BR for UI, messages, commits, comments.

## Scoring engine (`web/engine.js`)

Public API: `computeTotals`, `classificacaoOrdenada`, `rankList`, `validateEventoMinimal`, `emptyDadosTemplate`, `avisosPodiumDuplicado`, `contarMedalhasPorIgreja`.

Tiebreak provas matched by **normalized title** — preserve `tiebreakProvaBucket` keywords when renaming provas.

## Data and schemas

Changes to `evento` / `projeto` shape → update `schema/*.schema.json` **and** `eventos/conclave-2026-1.evento.json`.

Keep `window.ConclaveEngine`, `window.ConclaveDefaultEvento`, and `localStorage` keys stable for backward compatibility.

## Subagents

See table in previous versions — paths now use `schema/` and `docs/usuario|operacional/`.

## Pre-PR checklist

Align with `.github/pull_request_template.md` and `docs/operacional/release-checklist.md`.

## What to avoid

- Recreating Python scoring code.
- Adding bundlers or runtime dependencies without discussion.
- Breaking `ConclaveEngine` without updating `tests/engine.test.js`.
