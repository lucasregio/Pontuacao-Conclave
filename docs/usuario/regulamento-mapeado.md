# Regulamento mapeado para o JSON

Para cada item de pontuação previsto no regulamento, este documento mostra **onde o
campo vive no JSON**, **onde o organizador edita na UI** e **qual a observação
relevante** (regras especiais, fallback, casos de borda). O motor de pontuação real
é `web/engine.js`.

## Sumário

- [Como ler este mapa](#como-ler-este-mapa)
- [Itens de participacao](#itens-de-participacao)
- [Punicoes](#punicoes)
- [Pontuacao extra](#pontuacao-extra)
- [Gincana](#gincana)
- [Desempate](#desempate)
- [Como conferir manualmente](#como-conferir-manualmente)

## Como ler este mapa

Cada item segue a estrutura:

- **Nome no regulamento** — como aparece para o juiz.
  - **Campo no JSON** — caminho completo a partir de `evento` ou `dados`.
  - **Onde aparece na UI** — aba ou seção em `index.html`.
  - **Observação** — regra especial, dependência ou armadilha comum.

Os caminhos JSON usam a notação `evento.pesos.X` ou `dados.participacao[igrejaId].X`.
A amostra real está em `eventos/conclave-2026-1.evento.json` (configuração) e
`eventos/conclave-2026-1.projeto.exemplo.json` (configuração + dados).

## Itens de participacao

- **Inscrição**
  - Campo (peso): `evento.pesos.inscricao`.
  - Campo (entrada): `dados.participacao[igrejaId].inscricao` (boolean ou número).
  - UI: aba **Participação** → coluna "Inscrição".
  - Observação: para a igreja pontuar **qualquer** item de participação, é preciso
    que `inscricao + mr_total` seja maior que zero. Se ambos forem 0, toda a linha
    de participação fica zerada.

- **Pontualidade**
  - Campo (peso): `evento.pesos.pontualidade`.
  - Campo (entrada): `dados.participacao[igrejaId].pontualidade` (boolean ou
    número).
  - UI: aba **Participação** → coluna "Pontualidade".
  - Observação: igual a `inscricao` — `true` conta como 1 e multiplica pelo peso.

- **Uniforme (todos de camisa)**
  - Campo (peso): `evento.pesos.uniforme`.
  - Campos (entrada): `dados.participacao[igrejaId].mr_total` e `mr_camisa`.
  - UI: aba **Participação** → colunas "MR total" e "MR camisa".
  - Observação: o ponto de uniforme **só é creditado se `mr_camisa === mr_total`** e
    `mr_total > 0`. Não há crédito parcial — basta um MR sem camisa para zerar o
    item.

- **Bíblia (todos com Bíblia)**
  - Campo (peso): `evento.pesos.biblia`.
  - Campos (entrada): `dados.participacao[igrejaId].mr_total` e `mr_biblia`.
  - UI: aba **Participação** → colunas "MR total" e "MR bíblia".
  - Observação: mesma regra do uniforme — exige `mr_biblia === mr_total` e
    `mr_total > 0`. Sem crédito parcial.

- **Visitantes**
  - Campo (peso): `evento.pesos.visitante`.
  - Campo (entrada): `dados.participacao[igrejaId].visitantes` (inteiro).
  - UI: aba **Participação** → coluna "Visitantes".
  - Observação: o motor aplica `Math.trunc` ao valor lido — frações são
    descartadas. Pontos = `visitantes × pesos.visitante`.

- **Animação (torcida)**
  - Campo (peso): `evento.pesos.animacao`.
  - Campo (entrada): `dados.participacao[igrejaId].animacao` (boolean).
  - UI: aba **Participação** → coluna "Animação".
  - Observação: soma o peso uma única vez quando o booleano é truthy. Strings
    como `"x"`, `"sim"`, `"s"`, `"1"`, `"true"`, `"verdadeiro"`, `"ok"`, `"✓"`
    também são aceitas como verdadeiras (compatibilidade com planilhas
    importadas).

## Punicoes

- **Mau comportamento**
  - Campo (peso): `evento.pesos.mau_comportamento`.
  - Campo (entrada): `dados.participacao[igrejaId].mau_comportamento` (boolean).
  - UI: aba **Participação** → coluna "Mau comportamento".
  - Observação: o peso já é registrado **negativo** no JSON canônico (ex.:
    `-150`). O motor soma esse valor; o efeito final é subtrair. Se o JSON tiver o
    peso positivo, o motor soma positivo (ou seja: o sinal negativo é
    responsabilidade de quem edita o JSON do evento).

## Pontuacao extra

- **Pontuação extra (antigas "embaixadas")**
  - Campo (entrada preferido): `dados.participacao[igrejaId].pontuacao_extra`
    (número).
  - Campo (legado/fallback): `dados.participacao[igrejaId].embaixadas` (número).
  - UI: aba **Participação** → coluna "Pontuação extra".
  - Observação: o motor lê `pontuacao_extra` primeiro; só cai em `embaixadas`
    quando `pontuacao_extra` está ausente. Isso garante round-trip com eventos
    antigos sem mudar o cálculo. Novos eventos devem usar exclusivamente
    `pontuacao_extra`.

## Gincana

A gincana é a soma de medalhas conquistadas pela igreja em cada prova. Cada medalha
soma o peso correspondente.

- **Medalhas e pesos**
  - Campos (peso): `evento.medalhas.ou`, `evento.medalhas.pt`, `evento.medalhas.br`.
  - Campos (entrada): `dados.podium[provaId].ou`, `.pt`, `.br`, cada um com
    `{ igrejaId, competidor?, nomeLivre? }`.
  - UI: aba **Pódio** → seção por prova.
  - Observação: as chaves no JSON são **`ou`, `pt`, `br`** (não `ouro`, `prata`,
    `bronze`). O campo `competidor` é texto livre com o nome do MR vencedor (não
    pontua, só referência). O campo `nomeLivre` é usado quando a igreja vencedora
    **não está cadastrada** em `evento.igrejas[]`: o pódio aparece nos relatórios,
    mas o motor **não** atribui pontos a uma igreja inexistente.

## Desempate

Quando duas ou mais igrejas terminam com o mesmo `total`, o motor aplica os critérios
abaixo em cascata (todos decrescentes, exceto o nome). Eis a ordem real de
`classificacaoOrdenada` em `web/engine.js`:

0. **Total** de pontos (já usado como ordenação primária).
1. **Contagem** de medalhas de **ouro** (quantas vezes a igreja ficou em 1.º lugar
   no pódio — **não** o valor numérico de `evento.medalhas.ou`).
2. **Contagem** de medalhas de **prata** (idem — **não** `evento.medalhas.pt`).
3. **Soma de pontos** em provas cujo título casa com **Conhecimentos Gerais da Bíblia**
   (usa os pesos `evento.medalhas.ou/pt/br` de cada prova vencida nesse bucket).
4. **Soma de pontos** em **Debate de Versículos**.
5. **Soma de pontos** em **Conhecimentos Gerais da Organização**.
6. Nome da igreja, ordenado com
   `localeCompare("pt", { sensitivity: "base", numeric: true })`.

Importante: a identificação das três provas de desempate é feita pelo **título
normalizado** (lowercase, sem acentos), **não pelo `id`**. Os critérios de
correspondência (em `tiebreakProvaBucket`) são:

- **CG Organização** (`cgOrg`): título contém **"conhecimentos gerais"** **e**
  **"organiz"**.
- **CG Bíblia** (`cgBib`): título contém **"conhecimentos gerais"** **e**
  **"bibl"**.
- **Debate de Versículos** (`debate`): título contém **"debate"** **e**
  **"versicul"**.

Por isso, ao renomear uma prova de desempate, mantenha as palavras-chave
correspondentes. Se nenhum bucket for casado, a prova ainda vale medalhas
normalmente, mas fica inerte para fins de desempate.

## Como conferir manualmente

Para validar o cálculo automático contra a planilha do regulamento:

1. Em **Classificação**, clique em **Exportar CSV**. O arquivo vem com pontos
   totais e medalhas por igreja.
2. Em paralelo, abra o `.projeto.json` (Exportar projeto) num editor de texto. Para
   cada igreja:
   - Some manualmente os itens de participação:
     - `inscricao × pesos.inscricao` (se `inscricao` for `true` ou `1`).
     - `pontualidade × pesos.pontualidade`.
     - `pesos.uniforme` se `mr_camisa === mr_total > 0`.
     - `pesos.biblia` se `mr_biblia === mr_total > 0`.
     - `visitantes × pesos.visitante`.
     - `pesos.animacao` se `animacao` for truthy.
   - Some/subtraia `pesos.mau_comportamento` se `mau_comportamento` for truthy.
   - Some `pontuacao_extra` (ou `embaixadas`, se aplicável).
   - Some, em `dados.podium`, cada vez que `igrejaId` da igreja aparece como `ou`,
     `pt` ou `br`, multiplicando pelo `evento.medalhas[ou|pt|br]` correspondente.
3. Compare a soma manual com o `total` no CSV exportado. Em caso de divergência,
   confirme primeiro se a igreja realmente passa no filtro `inscricao + mr_total > 0`
   (linha de participação inteira pode estar zerada por isso). Em seguida, confira
   se `mr_camisa === mr_total` exatamente (uma diferença de 1 zera o uniforme).
4. Para o desempate, use a ordem listada na seção anterior. Empates totais que não
   se resolvem nos critérios 1–5 caem para ordenação alfabética por nome (pt-BR,
   sem acento, numérico).
