# Changelog

Todas as mudanças relevantes deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

A versão registrada em `package.json` reflete a versão da aplicação web. Como
não há build e o app é 100% estático, o "release" corresponde a um deploy do
GitHub Pages.

## [2.0.0] - 2026-06-20

### Removido

- Campo **Imagem de fundo** em Configuração → Geral e toda a lógica CSS/JS
  associada (`meta.tema.backgroundImage`, `body.has-bg`). O fundo fixo do tema
  MR/ER permanece.

### Adicionado

- Campo **`tipo`** em cada prova (`oral` | `escrita`): coluna em Configuração,
  seções separadas no pódio/relatórios e coluna «Tipo» no CSV do pódio.
  Eventos antigos inferem o tipo pelo título («escrita» → escrita; demais → oral).

- **Renomeação** do produto para **Pontuação Conclave** (UI, PWA, documentação).
- **Reorganização** de pastas: `schema/`, `static/`, `docs/usuario/`, `docs/operacional/`,
  `referencia/` (excluída do deploy Pages).
- Botão **Regulamento** na topbar; campo **Local** em Configuração → Geral.
- **Exportar evento** (somente configuração) no menu Mais.
- Confirmação ao trocar para tema **ER** (preset sobrescreve pesos/medalhas).
- Modo apresentação atualiza scoreboard em tempo real durante edição.
- Reordenar categorias/provas por teclado: **Alt+Seta** no grip ⠿.
- Testes: `schema.test.js`, `embedded.test.js`, `perf.test.js`; cobertura ampliada
  em `engine.test.js`.
- Service worker bumpado para `pontuacao-conclave-v2` (Fase 0 — identidade e estrutura).
- Baseline datada em `docs/operacional/metrics-baseline.md`.
- Limpeza de duplicatas: planilhas em `referencia/planilhas/` com nomes ASCII;
  removido backup duplicado por encoding quebrado no macOS.

- Suite de documentação do usuário em `docs/usuario/` (`manual-uso.md`, `faq.md`,
  `glossario.md`, `troubleshooting.md`, `atalhos-teclado.md`,
  `regulamento-mapeado.md`) e landing page estática `docs/index.html`
  reusando `web/styles.css` (sem build, sem JS). Ponto de entrada a partir
  do app: link "Documentação" na sidebar e no rodapé de `index.html`.
- Desclutter do header: toolbar reduzida a "Novo evento",
  "Carregar projeto", "Exportar projeto" e o popover **"Mais ações"**
  (`#btn-mais` / `#more-menu`) que consolida "Carregar evento",
  "Eventos salvos", "Modo apresentação", "Imprimir / Salvar como PDF" e
  "Limpar dados do evento". Menu com roving tabindex, `aria-expanded`,
  fechamento via clique externo / `Esc` / mudança de foco. Hint do
  protocolo `file://` agora aparece só quando relevante (`initFileProtocolHint`).
- **Relatório oficial** em PDF na aba Relatórios: botão "Gerar relatório
  oficial" monta um documento de 9 seções via `renderRelatorioOficial()`
  em `web/app.js` (capa, sumário executivo, classificação geral com top 3
  destacado, medalhas por igreja, pódio por prova, detalhe de participação,
  avisos, apêndice de critérios e rodapé). Bloco `.relatorio-oficial` com
  layout A4 em `web/styles.css` e regras `@media print` que escondem a
  interface enquanto o relatório está visível (`body:has(.relatorio-oficial)`).
- **Exportar CSV (pódio)** na aba Relatórios: `exportPodioCsv()` gera
  `{slug}-podio.csv` com as colunas Categoria, Prova, Posição, Igreja e
  Competidor — uma linha por (prova × ouro/prata/bronze), UTF-8 com BOM e
  separador `;` (Excel pt-BR abre direto).
- **Copiar resumo (Markdown)** na aba Relatórios: `buildResumoMarkdown()` +
  `copyResumoMarkdown()` copiam para a área de transferência um resumo
  enxuto com Top 3 da classificação e vencedoras por prova agrupadas por
  categoria. Usa Clipboard API com fallback `textarea` + `execCommand`
  para contexto `file://`.
- **Reformulação completa do shell** (`index.html` + `web/styles.css` +
  `web/app.js`): novo layout em CSS Grid com **sidebar fixa em desktop**
  (≥ 1024 px) e **bottom-nav fixa em mobile** (≤ 768 px), populadas a
  partir do mesmo `TAB_ORDER`. Topbar enxuta com nome do evento, sub-título,
  chips de KPI (`#kpi-strip`) e menu "Mais ações". `TAB_ORDER` ganhou
  **`dashboard`** como primeira aba (`#panel-dashboard`).
- **Painel Dashboard** (`renderDashboard()` / `wireDashboard()`):
  - **Sem evento**: hero de boas-vindas + 3 CTAs grandes (Novo evento,
    Carregar projeto, Carregar exemplo 2026/1) + lista resumida de eventos
    salvos no `localStorage` + card "Comece pela documentação".
  - **Com evento**: cabeçalho com nome/data, cards KPI (igrejas, provas,
    % pódios preenchidos, líder atual) e linha de ações para continuar em
    Participação, Pódio, Classificação ou abrir o relatório oficial.
- **Sistema de design tokens semânticos** em `web/styles.css`:
  `--space-1..8`, `--radius-sm/md/lg/pill`, `--shadow-xs..lg`,
  `--type-xs..5xl`, `--surface`/`--surface-elevated`/`--surface-sunken`,
  `--on-surface`/`--on-surface-muted`, `--border`/`--border-strong`,
  `--brand`/`--brand-strong`/`--brand-soft`/`--accent`, e estados
  `--info`/`--success`/`--warn`/`--error` (com pares `-bg`/`-border`/`-on`).
  Temas MR/ER agora sobrescrevem apenas `--brand`/`--accent`/`--on-surface`,
  reaproveitando todo o resto. Os tokens legados (`--card`, `--theme-*`,
  `--feedback-*`) continuam como aliases dos novos para preservar o CSS
  ainda não migrado.
- **Dark mode automático** via `@media (prefers-color-scheme: dark)`:
  overrides apenas dos tokens semânticos de superfície, tinta e estados
  (light reaplicável manualmente via `data-color-scheme="light"` no `<html>`).
- **Modo apresentação como scoreboard** (`#presentation-host` +
  `renderScoreboard()`): cards gigantes para o top 3 com fundos de
  ouro/prata/bronze (o ouro fica um pouco mais alto em desktop) e tabela
  compacta para as demais classificadas. Tipografia em `clamp()` se
  adapta ao tamanho da tela; `Esc` continua saindo.
- Service worker em `conclave-mr-v7`: `APP_SHELL` agora inclui
  `docs/index.html` para que a documentação fique disponível offline e
  remove a entrada da planilha rápida descontinuada.
- Fundo do app neutralizado: `--theme-body-fallback` (era `#3d7c1f` no MR e
  `#1565c0` no ER) e `--theme-config-head-bg` (eram verdes/azuis leitosos)
  passam a apontar para tokens sunken/brand-soft, evitando o "flash" verde
  ou azul que acontecia quando a imagem de fundo opcional do evento não
  carrega (cenário comum em `file://`).
- `--card` agora aponta para `--surface-elevated` sólido (antes era um
  `rgba(255, 253, 248, 0.94)` "glass" que vazava a cor do body). Os cards
  ficam consistentes em qualquer fundo, com ou sem dark mode.
- Painel Configuração ganha contorno e fundo `--surface` próprios,
  destacando-se como um cartão único; section-heads passam a usar
  `--surface-sunken` com borda em `--border`.
- Sidebar redesenhada como **superfície clara** (`--surface` + texto em
  `--on-surface-muted`, item ativo em `--brand-soft` com texto na cor do
  brand). O fundo verde/azul cheio que estava atrapalhando a leitura foi
  substituído por uma faixa neutra com destaque colorido só onde importa
  (marca, item ativo, foco). O hero do Dashboard ficou em
  `--surface-elevated` com uma fina barra brand→accent na esquerda em vez
  do gradiente cheio.
- **Modo pen-drive (`file://` totalmente funcional)**:
  - Novo `scripts/build-embedded.mjs` (+ npm script `build:embedded`) que
    gera `eventos/conclave-2026-1.evento.embedded.js` expondo o evento
    como `window.ConclaveDefaultEvento`. `index.html` carrega esse script
    antes do `app.js` e `tryLoadDefaultEventoWeb()` agora prefere a
    constante embarcada (cai no `fetch()` apenas se o embed não existir).
    Resultado: clicar duas vezes em `index.html` no pen-drive carrega o
    exemplo Conclave 2026/1 automaticamente, sem servidor.
  - Nova pasta `pen-drive/` com `iniciar.command` (macOS/Linux),
    `iniciar.bat` (Windows) e `LEIA-ME.txt`. Os scripts detectam Python 3,
    sobem `python3 -m http.server` numa porta livre a partir da 8765 e
    abrem o navegador automaticamente — habilitando PWA, cache offline e
    auto-load via `fetch()` quando o usuário quiser o setup completo.
  - Novo npm script `serve` (`python3 -m http.server 8765 --bind 127.0.0.1`)
    como atalho conveniente para o servidor local.
  - Service worker bumpado para `conclave-mr-v8` incluindo
    `eventos/conclave-2026-1.evento.embedded.js` no `APP_SHELL`.

### Removido

- **`pontuacao_conclave.html`** (planilha rápida autocontida): substituída
  pela aba Dashboard em `index.html`, que oferece a mesma entrada rápida
  (CTAs de novo evento / carregar / carregar exemplo) sem duplicar regras
  nem markup. Referências removidas de `sw.js`, `index.html`,
  `docs/index.html`, `docs/manual-uso.md`, `README.md`, `AGENTS.md`,
  `CONTRIBUTING.md`, `scripts/quality-check.mjs` e
  `.github/workflows/lighthouse.yml`.

### Documentação

- `docs/release-checklist.md` ganhou smoke test do relatório oficial.
- `docs/manual-uso.md` ganhou as seções "Gerar relatório oficial" e
  "Outras formas de compartilhar" (CSV pódio + copiar resumo) e perdeu a
  seção da planilha rápida descontinuada.
- Corrigida concordância de gênero em `docs/faq.md` e `docs/manual-uso.md`:
  MR é **Mensageiras do Rei** (não "Mensageiros").

## [2.0.0] — 2026-06-19

Refator profundo após uma revisão completa do projeto. Esta versão consolida
quatro ondas de melhorias (P0–P3), com foco em qualidade, acessibilidade,
robustez e processo. Schema bumped para 2 (com migração automática em memória).

### Adicionado

#### P0 — fundação de qualidade

- Workflow de CI (`.github/workflows/ci.yml`) com Node 22 rodando lint, testes
  e format:check em todo PR/push.
- ESLint 9 (flat config) com regra `no-alert: error` para banir dialogs nativos.
- Prettier (config + ignore) para formatação consistente.
- Script de fallback `scripts/quality-check.mjs` que valida sem `npm install`.
- Banco de testes inicial em `tests/engine.test.js` cobrindo regras de
  pontuação, ranking, desempate e validação mínima.
- Documentação base: `README.md`, `AGENTS.md`, `docs/metrics-baseline.md`,
  `docs/performance-budget.md`, `docs/release-checklist.md`.
- Template de PR (`.github/pull_request_template.md`) alinhado com a checklist.

#### P1 — robustez de motor e dados

- Suporte a decimais com vírgula no parsing numérico (`engine.js:num`), para
  copiar/colar de planilhas pt-BR.
- Helper `peso()` no engine garante que pesos ausentes/`NaN` virem 0.
- `validateEventoMinimal` agora detecta tipos errados (`igrejas`/`provas` não
  serem arrays) e lista todas as chaves faltantes.
- `classificacaoOrdenada` ordena por nome com `localeCompare("pt", { sensitivity: "base", numeric: true })`.
- Round-trip de JSON: `tests/roundtrip.test.js` garante que exportar e
  reimportar preserva totais, ranks e contagem de medalhas.
- `findProjetoOrphanRefs()` em `app.js` reporta IDs de igrejas/provas presentes
  em `dados` mas ausentes do evento como **avisos** (não erros).
- `flushScheduledSave()` evita perda de alterações ao trocar de projeto.
- `FileReader.onerror` e tratamento de falha de `localStorage` reportados via
  feedback acessível, sem `alert()`.
- Engine consolidado: `pontuacao_conclave.html` agora usa `window.ConclaveEngine`
  (sem duplicação de regras de pontuação/desempate).

#### P2 — acessibilidade e mobile

- Foco visível global com `:focus-visible` e token `--focus-ring` por tema.
- Suporte a `prefers-reduced-motion` (desliga animações/transições).
- Skip-link para "Conteúdo principal" com foco gerenciado.
- `withFocusPreserved()` evita perder o cursor durante re-renderizações.
- Modo de apresentação com `Escape` para sair, `aria-pressed` e foco no botão
  de saída.
- Estilos de impressão refinados (`@media print`) escondendo UI e expandindo
  tabelas — gera PDF legível direto do navegador.
- Layout mobile-first (≥360px) com ajustes em headers, toolbar, inputs e
  tabelas.
- PWA: `manifest.webmanifest`, ícones SVG (`icons/icon.svg`,
  `icons/icon-maskable.svg`) e service worker (`sw.js`) com estratégia
  cache-first (app shell) + network-first (dados).

#### P3 — funcionalidades e processo

- `meta.schemaVersion = 2` com `migrateEvento()` para upgrade automático em
  memória de eventos antigos (sem versão).
- Botão **"Exportar CSV"** na aba Classificação (`text/csv`, UTF-8 com BOM,
  separador `;` para abrir no Excel pt-BR direto).
- Modal **"Eventos salvos"**: lista, carrega, exporta e remove projetos do
  `localStorage` com confirmação acessível.
- Workflow `.github/workflows/pages.yml` para deploy automático no GitHub
  Pages após CI verde em `main`.
- Componente CSS reutilizável `.pill-btn` com modificadores
  `--primary` / `--danger`.
- Refatoração interna: `buildProvaCardBase`, `buildMedalRow*` e
  `buildConfig*Section` reduzem duplicação entre cards de pódio e seções de
  configuração.

### Mudado

- `engine.js`: `pontosParticipacao` e `pontosPunicoes` usam `peso()` em vez de
  acessar `pesos[k]` direto. Comportamento semanticamente equivalente quando
  todos os pesos são finitos, mas não quebra com dados parciais.
- Engine não toca DOM nem usa APIs de browser fora de `(window || globalThis)`
  — invariante reforçado e testado.
- `pontuacao_conclave.html` agora delega regras ao engine compartilhado;
  só mantém localmente o que é específico desta tela (formato de medalhas
  array → contagem).

### Removido

- Artefatos legados Python (`engine.py`, `calcular_conclave.py`,
  `tests/test_engine.py`, `requirements.txt`) — projeto migrado para 100% web.
- Diretórios `build/`, `dist/`, `.pytest_cache/` (resíduos de empacotamento
  desktop antigo). Ignorados via `.gitignore`.

### Segurança

- Content-Security-Policy declarada via `<meta http-equiv>` em `index.html` e
  `pontuacao_conclave.html` (default-src 'self'; object/frame-ancestors 'none').
- Imagens externas restritas ao protocolo `https:` (configurável pelo usuário
  no campo de tema, sem inline base64 vindo de fora).

### Acessibilidade

- `<th scope="col">` em todas as tabelas principais (config, participação,
  classificação, gincana e a tabela completa em `pontuacao_conclave.html`).
- Helper `.visually-hidden` para rótulos de coluna que não devem aparecer
  visualmente, mas precisam ser lidos por leitor de tela.

## [1.0.0] — 2026-04-25

- Versão inicial em produção (referência histórica): app desktop empacotado
  via PyInstaller + planilha web autocontida (`pontuacao_conclave.html`).
  Deprecada nesta release por completo em favor da experiência 100% web.
