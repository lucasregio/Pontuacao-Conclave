# Checklist de Release

> Esta checklist é a referência **única** para validar uma mudança antes de
> publicar. O template de PR (`.github/pull_request_template.md`) lista um
> subconjunto focado em revisão de código; aqui ficam os passos de release
> propriamente dito (smoke tests manuais e publicação).

## 1. Qualidade automatizada

Tudo deve passar localmente **e** no CI antes do merge:

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run format:check`
- [ ] (Opcional, sem `npm install`) `node scripts/quality-check.mjs`

## 2. Smoke tests manuais

Em `index.html` servido via `http(s)://` (preferir; `file://` desativa SW):

- [ ] **Novo evento** cria evento com igrejas/provas mínimas e abre na aba
      Configuração sem erros no console.
- [ ] **Carregar evento** importa `eventos/conclave-2026-1.evento.json` e a
      aba Configuração mostra todos os campos.
- [ ] **Carregar projeto** importa
      `eventos/conclave-2026-1.projeto.exemplo.json` e o ranking aparece
      consistente em Classificação.
- [ ] **Edição de participação** atualiza totais em ≤ 150ms (sem travas
      perceptíveis).
- [ ] **Pódio**: atribuir ouro/prata/bronze atualiza medalhas e
      classificação corretamente.
- [ ] **Desempate**: dois grupos empatados são desempatados na ordem
      ouro → prata → CG Bíblia → Debate → CG Organização → nome.
- [ ] **Classificação → Exportar CSV** baixa um `.csv` legível (UTF-8 com BOM,
      separador `;`).
- [ ] **Exportar projeto** baixa `.projeto.json` que reabre sem perdas
      (round-trip).
- [ ] **Eventos salvos**: lista, carrega, exporta e remove projetos do
      `localStorage`.
- [ ] **Relatório — Resumo** e **Oficial completo**: gerar e imprimir cada um
      separadamente; PDF contém só o documento escolhido (sem UI).
- [ ] **Modo apresentação** entra/sai com botão e com `Escape`.
- [ ] **Mobile (≥ 360px)**: toolbar quebra corretamente; tabelas rolam
      horizontalmente sem cortar conteúdo.
- [ ] `docs/index.html` abre na URL do Pages; links para `docs/usuario/*.html` funcionam.
- [ ] Smoke test de links da documentação após mover pastas (usuario/ vs operacional/).

## 3. Acessibilidade e UX

- [ ] Sem `alert/confirm/prompt` nativos (lint enforça, mas confirmar no
      console no caso de mudança recente).
- [ ] Foco visível em todos os botões/inputs com `Tab`.
- [ ] Skip-link funciona (Tab no início pula para o conteúdo).
- [ ] Mudanças destrutivas têm modal-confirm acessível (não silenciosas).
- [ ] Feedback (`#errors`/`#warnings`) cobre erros de import e falha de
      `localStorage`.

## 4. Documentação

- [ ] `README.md` atualizado se mudou comando/fluxo.
- [ ] `AGENTS.md` atualizado se mudou invariante/contrato (engine/UI/dados).
- [ ] Se a mudança afeta o fluxo do organizador, atualizar `docs/usuario/manual-uso.md`,
      `docs/usuario/faq.md`, `docs/usuario/glossario.md`, `docs/usuario/troubleshooting.md` ou
      `docs/usuario/regulamento-mapeado.md` conforme aplicável.
- [ ] `CHANGELOG.md` recebe entrada nova (versão + data + tipo de mudança).
- [ ] `docs/operacional/metrics-baseline.md` revisado se houve mudança que afete
      tempos/tamanho.
- [ ] Bump de `version` em `package.json` (semver).

## 5. Publicação

- [ ] Release mergeada em `main` (via branch `release/*` no Gitflow).
- [ ] Push em `main` aciona o workflow `pages.yml` (Settings → Pages →
      Source: GitHub Actions já configurado).
- [ ] CI verde nos workflows (`ci.yml`; `pages.yml` só em `main`).
- [ ] URL do GitHub Pages abre `index.html` corretamente.
- [ ] Tag anotada `vX.Y.Z` criada no commit de release (quando aplicável).
- [ ] Branch `release/*` mergeada de volta em `develop`.
- [ ] Service worker registra (DevTools → Application → Service Workers).

## 6. Pós-release

- [ ] Smoke test no ambiente publicado com um evento real.
- [ ] Verificar `Lighthouse` (workflow `lighthouse.yml` é warn-only — apenas
      alerta sobre regressões).
- [ ] Registrar incidentes e ações de melhoria como issues.
