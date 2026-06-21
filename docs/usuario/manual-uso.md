# Manual de uso

Guia passo a passo para o organizador/juiz usar o **Pontuação Conclave** no dia do
evento. Tudo acontece no navegador, sem servidor, sem cadastro e sem login.

## Sumário

- [Interface: Início e navegação](#interface-início-e-navegação)
- [Primeiro evento em 5 minutos](#primeiro-evento-em-5-minutos)
- [Carregar um evento ou projeto existente](#carregar-um-evento-ou-projeto-existente)
- [Editar configuracao](#editar-configuracao)
- [Participacao](#participacao)
- [Podio](#podio)
- [Classificacao e desempate](#classificacao-e-desempate)
- [Gerar relatorio oficial](#gerar-relatorio-oficial)
- [Backup e portabilidade](#backup-e-portabilidade)
- [Modo apresentacao e impressao em PDF](#modo-apresentacao-e-impressao-em-pdf)

## Interface: Início e navegação

### Aba Início (Dashboard)

Sem evento carregado, a tela de boas-vindas oferece atalhos para **Novo evento**,
**Carregar projeto**, **Carregar exemplo** e a lista de **Eventos salvos** no
navegador. Com evento aberto, mostra resumo (nome, data, local), KPIs (igrejas,
provas, % pódios preenchidos, líder atual) e atalhos para Participação, Pódio,
Classificação e geração do relatório oficial.

### Sidebar e barra inferior

Em telas largas (≥ 1024px), a **sidebar** à esquerda lista as seis abas com ícones,
o seletor de tema **MR / ER** e o link para esta documentação. Em celular e tablet,
a **barra inferior** repete as mesmas abas com rótulos curtos.

### Topbar e menu «Mais»

A barra superior exibe o nome do evento, o botão **Regulamento** (PDF configurado em
Configuração → Geral), o indicador **Salvo localmente** e o menu **Mais**, que
concentra:

- Carregar evento / Carregar projeto
- **Exportar evento** (só configuração) e **Exportar projeto** (completo)
- Novo evento, Eventos salvos, Modo apresentação
- Limpar dados do evento

Use as **setas** (← →) para mover entre abas quando o foco estiver na lista de
navegação (padrão ARIA tablist).

## Primeiro evento em 5 minutos

1. Abra `index.html` no navegador. Para que o app funcione offline depois (PWA), prefira
   servir via `http://` ou `https://` em vez de abrir direto como `file://`.
2. Na aba **Início**, clique em **Novo evento** ou use o menu **Mais** → **Novo evento**.
   A aba **Configuração** é aberta em seguida.
3. Em **Configuração**, ajuste:
   - **Geral**: nome, data, **local**, horários e **regulamento** (botão «Carregar arquivo» para escolher um PDF do computador, ou URL externa opcional).
   - **Igrejas**: adicione cada igreja participante. O `id` é gerado automaticamente a
     partir do nome e precisa ser único.
   - **Categorias**: por exemplo Junior, Adolescente, Juvenil. Define a ordem das colunas
     no pódio.
   - **Provas**: cada prova pertence a uma categoria e a um **tipo** (oral ou escrita).
     Reordene como quiser; a ordem vira a ordem de exibição dentro de cada tipo.
   - **Pesos**: as 7 chaves obrigatórias são `inscricao`, `pontualidade`, `uniforme`,
     `biblia`, `visitante`, `animacao`, `mau_comportamento` (este último é negativo).
   - **Medalhas**: as 3 chaves obrigatórias são `ou` (ouro), `pt` (prata) e `br`
     (bronze). São os pontos somados quando uma igreja vence em uma prova.
4. Vá para **Participação** e preencha cada linha (uma por igreja). Os totais de cada
   igreja aparecem ao vivo na coluna da direita.
5. Vá para **Pódio**, marque ouro/prata/bronze por prova selecionando a igreja vencedora
   e (opcional) o nome do competidor.
6. Vá para **Classificação** para ver o ranking ordenado com desempate aplicado.
7. Salve com **Exportar projeto** (menu Mais) ou **Exportar evento** se quiser só a
   configuração. **Exportar CSV** fica na aba Classificação.

Os dados também ficam guardados automaticamente no `localStorage` deste navegador, mas
só o `.projeto.json` é portátil entre máquinas.

## Carregar um evento ou projeto existente

A topbar e o menu **Mais** concentram as ações de arquivo:

- **Carregar evento (.evento.json)**: traz só a configuração (igrejas, categorias,
  provas, pesos, medalhas, meta). Os campos de Participação e Pódio começam zerados.
  Útil para reaproveitar uma estrutura já desenhada e começar a pontuar do zero.
- **Carregar projeto (.json)**: traz configuração **e** dados preenchidos
  (Participação + Pódio). Útil para retomar um trabalho em andamento ou abrir o
  arquivo enviado por outro juiz.

Para experimentar sem digitar nada, use a amostra incluída no repositório:
`eventos/conclave-2026-1.evento.json` (só configuração) ou
`eventos/conclave-2026-1.projeto.exemplo.json` (com dados).

Ao carregar um JSON, mensagens de validação aparecem nos banners `#errors` (em
vermelho, bloqueia carga) e `#warnings` (em amarelo, apenas alerta). Se um banner
vermelho aparecer, leia a mensagem e corrija o JSON antes de tentar de novo.

## Editar configuracao

Tudo é feito na aba **Configuração**. Os campos editam o objeto `evento` em memória; as
mudanças refletem imediatamente nas outras abas.

- **Adicionar igreja**: botão **Adicionar igreja** ou pressione Enter no último campo.
  O `id` aceita apenas `a-z`, `0-9`, `-` e `_` (gerado a partir do nome).
- **Remover igreja**: botão de remoção na linha. Se houver dados de Participação ou
  pódio para essa igreja, um modal-confirm acessível pede confirmação.
- **Adicionar/remover prova**: igual às igrejas; cada prova precisa de `id`, `titulo`,
  `categoriaId` e `ordem`.
- **Pesos** (todas as 7 chaves precisam estar presentes):
  - `inscricao`: pontos por igreja inscrita.
  - `pontualidade`: pontos por chegar no horário.
  - `uniforme`: pontos quando todos os MR usam camisa (ver Participação).
  - `biblia`: pontos quando todos os MR estão com a Bíblia.
  - `visitante`: pontos por visitante (multiplicado pela quantidade).
  - `animacao`: pontos quando a torcida/animação está marcada.
  - `mau_comportamento`: já lançado como número negativo (ex.: `-150`).
- **Medalhas** (chaves `ou`, `pt`, `br`): pontos somados ao total da igreja por
  cada medalha de ouro, prata ou bronze conquistada nas provas.

Pequena armadilha: a UI fala "ouro/prata/bronze" porque é o vocabulário do regulamento,
mas no JSON os campos têm os nomes curtos `ou`, `pt`, `br`. Se editar o JSON na mão,
não use `ouro`, `prata`, `bronze` — o motor não os reconhece.

## Participacao

Uma linha por igreja, com os campos abaixo. A coluna **Total** é recalculada a cada
edição (cache via `computeTotals`, atualização coalescida com `requestAnimationFrame`).

- `inscricao` (boolean ou número): true conta como 1 e multiplica por
  `pesos.inscricao`. Para a igreja pontuar em participação, é preciso que
  `inscricao + mr_total` seja maior que zero — caso contrário a linha vale 0.
- `pontualidade` (boolean ou número): igual a `inscricao`, multiplica por
  `pesos.pontualidade`.
- `mr_total`: número de MR (Mensageiras do Rei) presentes da igreja.
- `mr_camisa`: número de MR de camisa. **Pontua só se `mr_camisa === mr_total`** (e
  `mr_total > 0`). Se faltar um MR sem camisa, perde inteiro o ponto de uniforme.
- `mr_biblia`: número de MR com Bíblia. Mesma regra: **só pontua se
  `mr_biblia === mr_total`** (e `mr_total > 0`).
- `visitantes`: número inteiro multiplicado por `pesos.visitante`.
- `animacao` (boolean): se marcado, soma `pesos.animacao` uma vez.
- `mau_comportamento` (boolean): se marcado, soma `pesos.mau_comportamento` (que
  costuma ser negativo).
- `pontuacao_extra`: pontos avulsos somados ao total. Aceita qualquer número
  (positivo ou negativo). Substitui o antigo `embaixadas`.
- `embaixadas` (legado): só é lido se `pontuacao_extra` estiver ausente; novos
  eventos devem usar `pontuacao_extra`.

Erros comuns:

- Marcar `mr_camisa = 5` quando `mr_total = 6` zera o ponto de uniforme da igreja.
- Esquecer de marcar `inscricao` ou colocar `mr_total = 0`: a linha inteira de
  participação fica zerada (mas medalhas de pódio e `pontuacao_extra` continuam
  contando).

## Podio

Uma seção por prova. Para cada prova, marque ouro (`ou`), prata (`pt`) e bronze
(`br`) escolhendo a igreja vencedora num dropdown. Campos opcionais:

- `competidor`: nome do MR vencedor (não pontua, apenas referência).
- `nomeLivre`: texto livre para identificar o ganhador quando a igreja **não está**
  cadastrada em `evento.igrejas[]`. Útil para registros visuais e relatórios; é
  ignorado pelo motor de pontuação (não soma medalhas).

Se a mesma igreja for selecionada em dois lugares da mesma prova (ex.: ouro e prata
para a mesma igreja), aparece um aviso em `#warnings`. O cálculo continua, mas vale
revisar.

## Classificacao e desempate

A aba **Classificação** mostra o ranking final ordenado por critérios em cascata:

1. **Pontos totais** (decrescente).
2. **Medalhas de ouro** (decrescente).
3. **Medalhas de prata** (decrescente).
4. **Pontos em Conhecimentos Gerais da Bíblia** (decrescente).
5. **Pontos em Debate de Versículos** (decrescente).
6. **Pontos em Conhecimentos Gerais da Organização** (decrescente).
7. **Nome da igreja** (`localeCompare("pt", { sensitivity: "base", numeric: true })`).

Os três critérios de prova (CG Bíblia, Debate, CG Organização) são identificados pelo
**título da prova normalizado** (sem acentos, em minúsculas). Por isso, ao renomear
provas, mantenha as palavras-chave: "conhecimentos gerais" + "biblia",
"debate" + "versiculos" e "conhecimentos gerais" + "organiza". Sem essas palavras,
a prova vira inerte para fins de desempate (mas continua valendo medalhas normalmente).

## Gerar relatorio oficial

Quando a apuração estiver concluída, gere um **relatório oficial** em PDF para
arquivar e divulgar. Este é o **único** caminho de impressão/PDF do app — não há
mais botão genérico no menu «Mais».

1. Vá na aba **Relatórios**.
2. Há **dois documentos** independentes, cada um com **Gerar** e **Imprimir / Salvar PDF**:
   - **Resumo (divulgação)** — enxuto para compartilhar.
   - **Oficial completo (auditoria)** — com classificação integral, participação, avisos e critérios.
3. Gere o modelo desejado (ou os dois) e confira a prévia na tela.
4. Clique em **Imprimir / Salvar PDF** na linha correspondente e escolha **Salvar como PDF** no
   diálogo nativo do navegador.

**Resumo** inclui: capa, sumário executivo (Top 3), pódio por prova, encerramento com
assinaturas e rodapé.

**Oficial completo** inclui tudo do resumo mais: classificação geral, medalhas por igreja,
detalhe de participação, avisos e apêndice de critérios.

Você pode gerar e imprimir **os dois** no mesmo evento — cada um mantém sua própria prévia
(com botão **Pré-visualização** para expandir ou recolher) e botão de PDF.

Dicas:

- Preencha **Local** em Configuração → Geral para aparecer na capa.
- Se as faixas coloridas das medalhas não aparecerem no PDF, marque
  **Imprimir gráficos de fundo** (ou similar) no diálogo do navegador.
- O relatório se mantém visível enquanto você navega entre as abas dentro da
  sessão; um F5 ou troca de evento exige gerá-lo novamente — comportamento
  proposital para garantir que o relatório sempre reflita o estado atual.

### Consulta rápida e outros atalhos

Abaixo do relatório oficial ficam as seções **Consulta rápida** (medalhas por
igreja e pódio colapsável) — úteis na tela, mas **não** entram no PDF.

Na mesma área você encontra dois atalhos extras:

- **Exportar CSV (pódio)**: baixa um `.csv` com uma linha por (prova,
  posição), incluindo categoria, igreja e nome do(a) competidor(a). Abre
  direto no Excel/Sheets em pt-BR (separador `;`, UTF-8 com BOM) e serve
  para alimentar planilhas históricas ou cruzamentos posteriores.
- **Copiar resumo**: copia para a área de transferência um resumo curto em
  **Markdown** com o Top 3 da classificação e as vencedoras de cada prova
  agrupadas por categoria. Cole direto no WhatsApp, Telegram ou e-mail —
  formatação leve (negrito, listas) é interpretada pela maioria dos apps;
  caso contrário, o texto puro continua legível.

Os dois atalhos respeitam o estado atual da apuração: se você ainda não
preencheu pódios, eles avisam («Não há provas para exportar») em vez de
gerar um arquivo vazio.

## Backup e portabilidade

O Pontuação Conclave oferece dois mecanismos complementares de proteção contra perda de
dados:

- **Exportar projeto** (toolbar): gera um `.projeto.json` com **tudo** (configuração +
  Participação + Pódio + meta). É o backup canônico — guarde em pendrive, e-mail,
  nuvem ou compartilhe com outro juiz. Round-trip seguro: importar de volta com
  **Carregar projeto** restaura o estado bit-a-bit equivalente.
- **Eventos salvos** (toolbar): abre um modal listando todos os projetos guardados no
  `localStorage` deste navegador. Permite **carregar**, **exportar** e **remover**
  cada projeto individualmente (com modal-confirm acessível). Útil para alternar entre
  vários conclaves sem precisar abrir cada arquivo manualmente.

Use os dois juntos: o `localStorage` te salva da queda do navegador e o
`.projeto.json` te salva da troca de máquina ou da limpeza de cache.

## Modo apresentacao

- **Modo apresentação** (menu Mais): esconde menus e amplia tabelas para
  exibir o ranking num projetor ou telão. Sair: clique em **Sair da apresentação**
  ou pressione `Escape` (em algumas versões de iOS Safari, `Escape` pode não ser
  capturado; nesse caso, use o botão).
