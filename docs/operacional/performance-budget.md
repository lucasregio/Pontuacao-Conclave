# Orcamento de Performance (Frontend Estatico)

## Metas

- **Carregamento inicial (local):** interface interativa em ate 2.0s.
- **Atualizacao de paines derivados (classificacao + relatorios):** ate 150ms no evento de referencia.
- **Atualizacao de input numerico na participacao:** sem travamento perceptivel (meta de frame < 16ms em digitacao normal).

## Cenarios de medicao

1. Abrir `index.html` com evento de exemplo.
2. Alterar campos de participacao em sequencia por 15 segundos.
3. Atualizar podio em 10 provas.
4. Trocar abas rapidamente (participacao, podio, classificacao, relatorios).

## Politicas adotadas no codigo

- Cache de `computeTotals` para evitar recomputes redundantes.
- `requestAnimationFrame` em refresh derivado para coalescer atualizacoes.
- Scripts com `defer` para reduzir bloqueio de render.

## Criterio de regressao

Qualquer aumento superior a 20% nos tempos acima deve ser tratado antes do merge.
