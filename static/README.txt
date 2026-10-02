Pasta static/ — assets servidos pelo Pontuação Conclave
======================================================

Arquivos opcionais referenciados por eventos legados ou pelo deploy (GitHub Pages):

  - regulamento-er-2026-2.pdf — Regulamento do Conclave ER 2026/2 (botão Regulamento)
  - regulamento-2026.pdf  — PDF do regulamento do evento MR de exemplo

No app, o organizador pode carregar o regulamento diretamente do computador
(Configuração → Geral → «Carregar arquivo»). O PDF fica embutido no projeto
(localStorage e exportação JSON).

A pasta static/ continua útil para o evento de exemplo e para quem publica o
app com um PDF pré-incluído no repositório. PDFs grandes podem ficar fora do
Git (adicione ao .gitignore local) se não quiser versioná-los.
