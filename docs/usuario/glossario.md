# Glossário

Termos do Conclave que aparecem na interface, no JSON e nos relatórios. Use este
documento como apoio rápido durante o evento.

## Sumário

- [MR](#mr)
- [ER](#er)
- [Embaixadas](#embaixadas)
- [MR-camisa e MR-biblia](#mr-camisa-e-mr-biblia)
- [Gincana e podio](#gincana-e-podio)
- [Pontuacao extra](#pontuacao-extra)
- [Mau comportamento](#mau-comportamento)
- [Desempate](#desempate)
- [Schema](#schema)
- [Projeto vs evento](#projeto-vs-evento)

### MR

Mensageiras do Rei. Programa de educação cristã para meninas e adolescentes em
igrejas batistas. Quando o sistema fala em "MR" se refere às pessoas (ou unidades de
contagem) participantes pela igreja: `mr_total`, `mr_camisa`, `mr_biblia`.

### ER

Embaixadores do Rei. Programa equivalente para outra faixa etária. O Pontuação Conclave
prevê um **tema ER** com paleta azul/amarelo/branco e valores típicos diferentes
(medalhas 500/300/150 e bônus de participação +100). O tema é só visual — os pesos
e medalhas finais sempre vêm do JSON do evento.

### Embaixadas

Termo legado do regulamento antigo, hoje rebatizado como **Pontuação extra**. No JSON,
o campo `embaixadas` em `dados.participacao[*]` ainda é aceito como **fallback**
quando `pontuacao_extra` está ausente. Novos eventos devem usar apenas
`pontuacao_extra`.

### MR-camisa e MR-biblia

Indicadores binários de uniforme e Bíblia, contados por número de MR:

- **MR-camisa**: número de MR presentes vestindo a camisa oficial. Para a igreja
  ganhar o ponto de uniforme, **todos** os MR têm que estar de camisa
  (`mr_camisa === mr_total` e `mr_total > 0`). Faltou um, perde inteiro.
- **MR-bíblia**: análogo, mas para quem está com a Bíblia em mãos
  (`mr_biblia === mr_total` e `mr_total > 0`).

### Gincana e podio

A "gincana" é o conjunto das provas (Esgrima, Debate de Versículos, Conhecimentos
Gerais, Prova Escrita etc.). Cada prova tem um **tipo** — **oral** ou **escrita** —
e aparece agrupada no pódio e nos relatórios dentro dessa modalidade. Cada prova tem
um pódio com três posições: ouro
(`ou`), prata (`pt`) e bronze (`br`). A pontuação somada à classificação geral por
medalha é definida em `evento.medalhas[ou|pt|br]`.

### Pontuacao extra

Pontos avulsos somados ao total da igreja, fora dos critérios padronizados. Aceita
positivo ou negativo. No JSON: `dados.participacao[igrejaId].pontuacao_extra`. Use
para registrar bonificações específicas decididas pela comissão organizadora.

### Mau comportamento

Sinalizador booleano em `dados.participacao[igrejaId].mau_comportamento`. Quando
verdadeiro, soma `pesos.mau_comportamento` ao total da igreja. No JSON canônico, esse
peso já é registrado como número **negativo** (ex.: `-150`), então o efeito é
subtrair.

### Desempate

Critérios em cascata aplicados quando duas ou mais igrejas terminam com a mesma
pontuação total. Ordem completa:

1. Medalhas de ouro (decrescente).
2. Medalhas de prata (decrescente).
3. Pontos em **Conhecimentos Gerais da Bíblia** (decrescente).
4. Pontos em **Debate de Versículos** (decrescente).
5. Pontos em **Conhecimentos Gerais da Organização** (decrescente).
6. Nome da igreja, com ordenação pt-BR insensível a acentos/caixa
   (`localeCompare("pt", { sensitivity: "base", numeric: true })`).

A identificação de prova de desempate é feita pelo **título normalizado** (sem
acentos, em minúsculas), não pelo `id`. Veja
[`regulamento-mapeado.md`](regulamento-mapeado.md) para os critérios de
correspondência.

### Schema

Versão da estrutura de dados. O campo opcional `evento.meta.schemaVersion` indica em
qual versão um evento foi salvo. Eventos sem o campo são tratados como **versão 1**
e migrados em memória ao serem carregados; a versão atual é **2**. A migração é
não-destrutiva: o arquivo original em disco não é alterado até você exportar de
novo.

### Projeto vs evento

Dois objetos com papéis distintos:

- **Evento** (`.evento.json`): apenas a configuração. Contém `meta`, `pesos`,
  `medalhas`, `igrejas`, `categorias` e `provas`. Não contém pontuação.
- **Projeto** (`.projeto.json`): configuração + dados preenchidos. É o objeto
  `{ evento, dados }`, em que `dados` traz `participacao` (por igreja) e `podium`
  (por prova). É o backup canônico para round-trip.
