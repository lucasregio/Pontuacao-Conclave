# Baseline de Metricas e Criterios de Sucesso

Este documento define os indicadores de acompanhamento para a evolucao da aplicacao em arquitetura estatica.

## Medicao inicial (2026-06-20)

Ambiente de referencia: Node 22, Windows 10 / notebook comum, evento
`eventos/conclave-2026-1.projeto.exemplo.json`.

| Metrica | Meta | Medido | Metodo |
| --- | --- | --- | --- |
| `computeTotals` (mediana 5 runs) | <= 150 ms | **< 5 ms** | `tests/perf.test.js` (gate 180 ms) |
| TTI local (abrir index + exemplo) | <= 2,0 s | ~0,8 s | Manual, `npm run serve`, DevTools |
| Classificacao apos editar participacao | <= 150 ms | imperceptivel | Manual, evento exemplo |
| Lint + test + format em CI | 100% PRs | sim | `.github/workflows/ci.yml` |

Repetir esta tabela a cada release significativa e registrar delta abaixo.

## 1) Front-End e UX

- **Tempo para primeira interacao (TTI local):** <= 2.0s em notebook comum.
- **Fluxos com feedback acessivel:** 100% das acoes destrutivas e erros de importacao sem `alert/confirm` nativo.
- **Cobertura de navegacao por teclado:** 100% dos controles principais (abas, botoes, acao de configuracao, exportacao/importacao).
- **Legibilidade mobile:** tabelas principais utilizaveis em viewport >= 360px sem perda de funcao.

## 2) Logica e Integridade de Dados

- **Taxa de importacoes invalidas com mensagem clara:** 100% dos JSON invalidos mostram causa e contexto.
- **Regressoes em regras de pontuacao:** 0 falhas em suite de testes do motor antes de merge.
- **Consistencia de dados apos edicao:** 0 erros de referencia quebrada (igreja/prova removida sem sincronizacao).
- **Schemas e embedded:** `tests/schema.test.js` e `tests/embedded.test.js` verdes no CI.

## 3) Performance e Otimizacao

- **Tempo de atualizacao de classificacao/relatorios:** <= 150ms para dataset de referencia (evento exemplo).
- **Recompute desnecessario:** reduzir recalculos duplicados em mudancas de formulario (meta: 1 compute por ciclo de atualizacao).
- **Peso de assets estaticos:** manter CSS + JS enxutos, com monitoramento em PR.

Ver tambem [`performance-budget.md`](performance-budget.md).

## 4) Processo e Manutencao

- **Qualidade automatizada em PR:** 100% dos PRs com `lint` e `test` aprovados no CI.
- **Padrao de contribuicao:** 100% dos PRs com checklist de UX/acessibilidade/dados/testes.
- **Documentacao operacional:** README e `docs/usuario/` atualizados com a UI vigente.

## Medicao inicial recomendada

1. Registrar baseline manual com o evento de exemplo em ambiente local.
2. Executar os mesmos cenarios a cada release.
3. Comparar delta por frente (UX, logica, performance e manutencao).
