# Contribuindo com o Pontuação Conclave

Obrigada por considerar contribuir! Este projeto é mantido como uma
**aplicação web 100% estática** em vanilla HTML/CSS/JS. As regras abaixo
existem para preservar essa simplicidade enquanto a base cresce.

> Para um guia mais profundo voltado a agentes de IA, veja [`AGENTS.md`](AGENTS.md).
> Para o histórico de mudanças, veja [`CHANGELOG.md`](CHANGELOG.md).

## Tipos de contribuição

- **Bug**: abra uma issue usando o template de bug em
  `.github/ISSUE_TEMPLATE/bug.md`.
- **Melhoria/feature**: abra uma issue de melhoria em
  `.github/ISSUE_TEMPLATE/melhoria.md` antes de codar — alinhamos escopo
  primeiro, especialmente quando envolve mudanças no schema/engine.
- **Documentação**: pull request direto está OK.

## Antes de começar

1. Tenha **Node.js 22+** instalado (o CI usa Node 22).
2. Clone o repositório e instale dependências de desenvolvimento:
   ```bash
   git clone https://github.com/lucasregio/Pontuacao-Conclave.git
   cd Pontuacao-Conclave
   npm install
   ```
3. Para validar tudo localmente sem `npm install`, use:
   ```bash
   node scripts/quality-check.mjs
   ```

## Identidade Git

Configure nome e e-mail antes do primeiro commit neste clone:

```bash
git config user.name "Seu Nome"
git config user.email "seu@email.com"
```

Use UTF-8 no terminal ao escrever mensagens de commit (no PowerShell:
`chcp 65001`) para evitar caracteres corrompidos nos logs.

A pasta `.cursor/` é ignorada pelo Git — configuração local do editor Cursor,
não versionada.

## Fluxo de trabalho

1. Crie uma branch a partir de `main`. Sugestão de nomenclatura:
   `fix/...`, `feat/...`, `docs/...`, `refactor/...`.
2. Faça mudanças pequenas e focadas — prefira PRs reviewables (≤ ~400 linhas
   alteradas).
3. Antes de abrir o PR, rode **localmente**:
   ```bash
   npm run lint
   npm test
   npm run format:check
   ```
4. Se a mudança envolve UI/dados, faça smoke test manual em `index.html`.
   A checklist completa está em [`docs/operacional/release-checklist.md`](docs/operacional/release-checklist.md).
5. Abra o PR usando o template — ele já lista o mínimo a revisar.

## Convenções

### Idioma

- UI, mensagens de feedback, commits, comentários e títulos de PR em **pt-BR**.
- Discussão e descrição estendida do PR podem ser em inglês quando ajudar
  revisores externos.

### Estilo de código

- **Prettier** (`.prettierrc.json`) é a fonte da verdade — `printWidth: 100`,
  `singleQuote: false`, `trailingComma: "es5"`, `semi: true`.
- **ESLint 9** flat config (`eslint.config.js`):
  - `web/**/*.js`: globals de browser, `sourceType: "script"`.
  - `tests/**/*.js`: globals de Node, `sourceType: "commonjs"`.
  - `no-alert: error` (banimos dialogs nativos).
- Identificadores: `snake_case` para campos de dados (`mr_total`,
  `pontuacao_extra`); `camelCase` para variáveis JS.
- **Comentários** apenas para intenção/trade-offs/regras não óbvias. Não
  narrar o que o código já mostra.

### Engine vs. UI

- `web/engine.js` é puro: **não toca DOM**, **não usa APIs de browser** fora
  de `(window || globalThis)`. Mudanças nele exigem teste correspondente em
  `tests/engine.test.js`.
- `web/app.js` cuida de UI/estado/persistência. Reaproveite a API pública do
  engine via `window.ConclaveEngine`.

### Acessibilidade

- Sem `alert()`, `confirm()` ou `prompt()`. Use `showFeedback()` e o sistema
  de modal-confirm já em `app.js`.
- Preserve `aria-*`, navegação por teclado, foco visível e
  `prefers-reduced-motion`.
- Tabelas grandes mantêm `<th scope="col">`.

### Dados e schema

- Qualquer mudança em forma de evento ou projeto **deve** ser refletida em
  `schema/evento.schema.json` / `schema/projeto.schema.json` **e** nos arquivos amostra em
  `eventos/`.
- IDs de igrejas/provas seguem `^[a-z0-9_-]+$` e são únicos.
- Se a mudança quebra o formato anterior, bump `meta.schemaVersion` e
  estenda `migrateEvento(ev)` em `web/app.js`.

## Mensagens de commit

Convencional, em pt-BR, no imperativo:

```
feat(engine): adiciona desempate por categoria
fix(app): preserva foco ao reordenar provas
docs(readme): atualiza seção de deploy
refactor(styles): tokeniza cores de feedback
test(engine): cobre num com vírgula decimal
chore(ci): muda Node para 22
```

Prefira commits pequenos e atômicos. Inclua o **escopo** entre parênteses
quando ajudar a localizar a área (`engine`, `app`, `styles`, `tests`,
`docs`, `ci`).

## Não fazer

- Reintroduzir Python (`engine.py`, `requirements.txt`, etc.). O projeto é
  100% web.
- Adicionar bundler, framework SPA ou dependência de runtime.
- Quebrar a API `window.ConclaveEngine` sem atualizar testes.
- Editar arquivos binários (`.xlsx`, `.docx`, `.PNG`) — são referência
  histórica.
- Usar dialogs nativos do browser.

## Dúvidas

Abra uma issue com a label `pergunta` ou comente em uma issue existente
relacionada.
