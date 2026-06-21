# Perguntas frequentes (FAQ)

Respostas curtas para as dúvidas mais comuns de organizadores e juízes da **Pontuação Conclave**.
Para o passo a passo completo, veja [`manual-uso.md`](manual-uso.md).

## Sumário

- [Perdi meus dados ao trocar de navegador](#perdi-meus-dados-ao-trocar-de-navegador)
- [Posso usar offline](#posso-usar-offline)
- [Como compartilho o evento com outro juiz](#como-compartilho-o-evento-com-outro-juiz)
- [Funciona em celular](#funciona-em-celular)
- [Como apago um evento salvo localmente](#como-apago-um-evento-salvo-localmente)
- [Os dados saem da minha maquina](#os-dados-saem-da-minha-maquina)
- [Posso editar o JSON manualmente](#posso-editar-o-json-manualmente)
- [O que muda entre tema MR e ER](#o-que-muda-entre-tema-mr-e-er)
- [Como exporto para o Excel](#como-exporto-para-o-excel)

## Perdi meus dados ao trocar de navegador

O salvamento automático usa `localStorage`, que é por **navegador + origem**. Trocar
do Chrome para o Firefox, abrir em outro computador, usar uma janela anônima ou
limpar o cache descarta o que estava guardado nesse contexto.

O backup canônico, portátil entre máquinas, é o **Exportar projeto**. Ele gera um
arquivo `.projeto.json` com tudo (configuração + Participação + Pódio). Para retomar
em outro navegador, abra com **Carregar projeto**.

## Posso usar offline

Sim. O app é uma PWA com service worker (`sw.js`). Após a primeira visita online ele
funciona sem rede.

Restrição importante: o service worker **só registra quando a página é servida via
`http://` ou `https://`**. Abrir o `index.html` direto pelo Finder/Explorer (URL
começando com `file://`) faz o app rodar normalmente, mas sem cache de SW — ou seja,
se o arquivo desaparecer do disco, não há fallback.

## Como compartilho o evento com outro juiz

Use **Exportar projeto** na toolbar. O arquivo `.projeto.json` resultante contém
configuração + dados; envie por e-mail, WhatsApp, pendrive ou nuvem. Quem recebe abre
o `index.html` no próprio navegador e clica em **Carregar projeto (.json)** para
importar. Sem cadastro, sem servidor, sem login.

## Funciona em celular

Sim. O layout é mobile-first e os fluxos principais funcionam a partir de viewport
de **360px** de largura. Tabelas grandes (Participação, Pódio, Classificação) rolam
horizontalmente quando não cabem, sem cortar conteúdo. Para o dia do evento, leve um
backup `.projeto.json` no celular: dá para pontuar e exportar do telefone se a
máquina principal falhar.

## Como apago um evento salvo localmente

Na toolbar, clique em **Eventos salvos**. O modal lista todos os projetos guardados
neste navegador. Cada linha tem um botão de remoção; ele dispara um modal-confirm
acessível (Enter confirma, Escape cancela) — não há `confirm()` nativo. Antes de
remover, considere **Exportar** o projeto para preservar uma cópia em arquivo.

## Os dados saem da minha maquina

Não. A Pontuação Conclave é uma aplicação **100% estática**, sem backend, sem analytics e
sem chamadas de rede além das necessárias para o app shell. Tudo o que você digita
vive apenas no `localStorage` do seu navegador. Os dados só saem do dispositivo se
**você** exportar e enviar o `.projeto.json`.

## Posso editar o JSON manualmente

Pode. Os dois schemas canônicos vivem na raiz do repositório e descrevem todos os
campos:

- `schema/evento.schema.json` para a configuração (`evento`).
- `schema/projeto.schema.json` para a estrutura completa (`evento` + `dados`).

Validadores online aceitam JSON Schema 2020-12 e apontam erros linha a linha. Cuidados
frequentes:

- Medalhas usam as chaves curtas `ou`, `pt`, `br` (não `ouro`/`prata`/`bronze`).
- Pesos têm 7 chaves obrigatórias: `inscricao`, `pontualidade`, `uniforme`, `biblia`,
  `visitante`, `animacao`, `mau_comportamento`.
- IDs de igrejas e provas seguem `^[a-z0-9_-]+$` e devem ser únicos.
- Para a pontuação extra (antigo "embaixadas"), use `pontuacao_extra`.

## O que muda entre tema MR e ER

O botão **Tema** na toolbar troca entre dois conjuntos de cores e valores típicos:

- **MR**: paleta verde/amarelo/branco, com os pesos e medalhas tradicionais do
  Conclave das Mensageiras do Rei.
- **ER**: paleta azul/amarelo/branco, com medalhas tipicamente em 500/300/150 e
  bônus de participação +100 em pontualidade, uniforme, bíblia e pastor.

Importante: o tema **não sobrescreve** os valores do JSON do evento. Os pesos e
medalhas finais são sempre os que estão em `evento.pesos` e `evento.medalhas`. O tema
só ajusta a aparência (cores, foco, contraste).

## Como exporto para o Excel

Na aba **Classificação**, clique em **Exportar CSV**. O arquivo gerado é UTF-8 com
BOM e usa `;` como separador de colunas — formato pronto para o Excel pt-BR abrir
direto, sem assistente de importação. Vale também para LibreOffice Calc e Google
Sheets.
