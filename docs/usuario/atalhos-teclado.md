# Atalhos de teclado e acessibilidade

Lista compacta dos atalhos disponíveis e dos recursos de acessibilidade já garantidos
na interface. Tudo é navegável **só com o teclado**, sem mouse.

## Sumário

- [Navegacao geral](#navegacao-geral)
- [Skip-link](#skip-link)
- [Abas e botoes](#abas-e-botoes)
- [Modo apresentacao](#modo-apresentacao)
- [Confirmacoes acessiveis](#confirmacoes-acessiveis)
- [Movimento reduzido](#movimento-reduzido)

## Navegacao geral

- `Tab`: avança o foco para o próximo controle interativo (link, botão, input,
  select, área editável).
- `Shift + Tab`: volta o foco para o controle anterior.
- O foco fica **visível** com um anel colorido (token `--focus-ring` do tema MR/ER).
  Se não enxergar o anel, é provável que o foco tenha ido para um elemento fora da
  viewport — role a página até alcançá-lo.
- Em campos de texto e numéricos, `←/→` navegam dentro do valor, `Backspace` apaga,
  `Delete` apaga para a frente. Tudo padrão do navegador.

## Skip-link

A primeira `Tab` em uma página recém-carregada revela o skip-link
**"Pular para o conteúdo"**, ancorado em `#conteudo-principal`. Pressione `Enter`
para pular o cabeçalho e a toolbar e mandar o foco direto para `<main>`.

Útil para leitores de tela e para quem não quer percorrer todos os botões da toolbar
a cada visita.

## Abas e botoes

- A **sidebar** (desktop) e a **barra inferior** (mobile) formam um tablist ARIA: use
  `←` / `→` / `↑` / `↓`, `Home` ou `End` para mover entre Início, Configuração,
  Participação, Pódio, Classificação e Relatórios.
- O menu **Mais** (topbar): `↑` / `↓` entre itens; `Esc` fecha; `Enter` ativa.
- Em **Configuração → Categorias / Provas**, o grip ⠿ de reordenar aceita
  **Alt+Seta para cima** / **Alt+Seta para baixo** além de arrastar com o mouse.
- Em botões comuns, `Enter` e `Espaço` ativam a ação. Botões com `aria-pressed`
  (ex.: o tema MR/ER) trocam o estado a cada acionamento.
- Em selects e dropdowns, use as setas `↑/↓` para escolher e `Enter` ou `Tab` para
  confirmar.

## Modo apresentacao

- Acionar: `Tab` até o botão **Modo apresentação** na toolbar e pressione `Enter`.
- Sair: `Escape` ou clique/`Enter` no botão **Sair da apresentação** (visível no
  canto da tela). O foco volta para o botão original que ativou o modo, evitando
  perder o "lugar" no teclado.
- Em algumas versões do iOS Safari, `Escape` em teclados externos não chega ao
  JavaScript. Nesses casos, use o botão de saída.

## Confirmacoes acessiveis

Nenhuma ação destrutiva usa diálogo nativo (`alert`/`confirm`/`prompt`). Todas
passam por um **modal-confirm acessível** com:

- `Tab`/`Shift+Tab` circula apenas dentro do modal (foco preso enquanto aberto).
- `Enter` confirma (ativa o botão padrão **Confirmar**).
- `Escape` cancela (equivalente ao botão **Cancelar**, devolve o foco ao elemento
  que abriu o modal).
- A mensagem é anunciada por leitor de tela (`role="dialog"` + `aria-modal="true"` +
  `aria-labelledby`).

Vale para: remover igreja, remover prova, remover evento salvo, **Limpar dados do
evento**, etc.

## Movimento reduzido

A folha de estilo respeita `prefers-reduced-motion: reduce` do sistema operacional.
Quando essa preferência está ativa, animações e transições são desativadas
automaticamente — abas trocam instantaneamente, banners aparecem sem fade, e o
modal de confirmação não tem efeito de entrada/saída. Isso ajuda usuários com
sensibilidade vestibular e em dispositivos com bateria fraca.

Para conferir o efeito no macOS: **Ajustes do Sistema → Acessibilidade → Tela →
Reduzir movimento**. No Windows: **Configurações → Acessibilidade → Efeitos
visuais → Efeitos de animação**.
