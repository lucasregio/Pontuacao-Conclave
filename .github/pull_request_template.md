# Pull Request

## Objetivo

<!-- Qual problema resolve e por quê. Vincule issues quando houver: "Fixes #N". -->

## O que mudou

<!-- Lista curta de mudanças concretas. Foco no "o que" e "por quê", não no diff. -->

-

## Como testar

<!-- Passos manuais reproduzíveis (URLs, comandos, fluxo na UI). -->

1.

## Checklist de qualidade

> A checklist completa (smoke tests, acessibilidade, publicação) está em
> [`docs/operacional/release-checklist.md`](../docs/operacional/release-checklist.md). Os itens abaixo
> são o mínimo para revisar um PR.

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run format:check`
- [ ] Fluxo principal validado em `index.html` (Configuração → Participação → Pódio → Classificação)
- [ ] UX/acessibilidade revisadas (foco visível, feedback de erro, navegação por teclado, sem `alert/confirm`)
- [ ] Importação/exportação JSON (evento e projeto) preserva os dados (round-trip)
- [ ] Sem regressão de performance (ver `docs/operacional/performance-budget.md`)
- [ ] `CHANGELOG.md` atualizado se a mudança é visível ao usuário
- [ ] `AGENTS.md` atualizado se a mudança altera invariante/contrato

## Riscos e rollback

- Risco principal:
- Como reverter:

## Capturas (opcional)

<!-- Antes/depois para mudanças visuais. -->
