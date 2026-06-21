# Troubleshooting

Sintomas e soluções rápidas para problemas comuns no dia do evento. O formato é
sempre **sintoma → causa provável → o que fazer**.

## Sumário

- [Importei um JSON e nada aconteceu](#importei-um-json-e-nada-aconteceu)
- [Vejo dados antigos no celular apos atualizacao](#vejo-dados-antigos-no-celular-apos-atualizacao)
- [O navegador diz que o localStorage esta cheio](#o-navegador-diz-que-o-localstorage-esta-cheio)
- [Imprimi e saiu cortado](#imprimi-e-saiu-cortado)
- [Atalho Escape nao sai do modo apresentacao](#atalho-escape-nao-sai-do-modo-apresentacao)
- [PWA nao instala](#pwa-nao-instala)

## Importei um JSON e nada aconteceu

**Sintoma**: clicou em **Carregar evento** ou **Carregar projeto**, escolheu o
arquivo, e a interface não mudou — ou apareceu um banner vermelho em `#errors`.

**Causa provável**: o JSON é inválido (sintaxe quebrada) ou está faltando alguma
chave obrigatória do schema. O motor recusa a carga em vez de aceitar dados
parciais.

**O que fazer**:

1. Leia a mensagem em `#errors` (vermelho) ou `#warnings` (amarelo) no topo do
   conteúdo principal — ela indica o motivo da recusa (ex.: "Falta chave: pesos",
   "IDs de igrejas duplicados").
2. Abra o arquivo num editor de texto e valide-o contra o schema:
   - `schema/evento.schema.json` para `.evento.json`.
   - `schema/projeto.schema.json` para `.projeto.json`.
3. Verifique especialmente:
   - JSON válido (sem vírgula sobrando, aspas duplas em todas as strings).
   - As 7 chaves de `pesos` (`inscricao`, `pontualidade`, `uniforme`, `biblia`,
     `visitante`, `animacao`, `mau_comportamento`).
   - As 3 chaves de `medalhas` (`ou`, `pt`, `br` — não `ouro`/`prata`/`bronze`).
   - IDs em `igrejas[]` e `provas[]` únicos e no formato `^[a-z0-9_-]+$`.
4. Corrija o arquivo e tente carregar de novo.

## Vejo dados antigos no celular apos atualizacao

**Sintoma**: você atualizou o app (novo deploy ou nova versão do `.projeto.json`),
mas o celular continua mostrando o estado anterior.

**Causa provável**: o service worker (`sw.js`) está servindo a versão em cache. É
o comportamento esperado do PWA para funcionar offline, mas atrapalha quando você
quer forçar o refresh.

**O que fazer** (Chrome/Edge no Android, Safari no iOS é semelhante):

1. Abra DevTools (no desktop) → aba **Application** → **Service Workers**.
2. Marque **Update on reload** e recarregue a página.
3. Se persistir, clique em **Unregister** e recarregue.
4. No celular, alternativa rápida: desinstale o atalho do PWA e reinstale a partir
   da página atualizada. O cache antigo é descartado.
5. Em último caso, limpe o site nos ajustes do navegador (cuidado: também apaga o
   `localStorage` — exporte um `.projeto.json` antes).

## O navegador diz que o localStorage esta cheio

**Sintoma**: aparece um banner vermelho avisando que não foi possível salvar
localmente. A mensagem em `#errors` cita falha de `localStorage`.

**Causa provável**: o navegador limita o `localStorage` a 5–10 MB por origem, e
você acumulou muitos eventos salvos (cada projeto pode ter centenas de KB com todas
as provas e igrejas).

**O que fazer**:

1. Abra **Eventos salvos** na toolbar.
2. Para cada evento que você não usa mais:
   - Clique em **Exportar** primeiro (gera um `.projeto.json` para arquivo) — assim
     você não perde o histórico, só tira do navegador.
   - Em seguida, clique em **Remover** (modal-confirm acessível).
3. Repita até o banner vermelho desaparecer e o salvamento automático voltar.

Se mesmo após limpar a lista o aviso continuar, pode ser que outro site na mesma
origem esteja consumindo a cota. Em PWA isolada, isso é raro.

## Imprimi o relatorio oficial e saiu cortado

**Sintoma**: ao gerar o PDF do **relatório oficial** (aba Relatórios → Gerar →
Imprimir / Salvar PDF), colunas ficaram cortadas ou alguma seção saiu parcial.

**Causa provável**: o navegador ajustou a escala automaticamente e a tabela ficou
mais larga do que cabe na orientação retrato — comum no perfil **Completo**.

**O que fazer**: no diálogo de impressão do navegador:

1. Mude **Orientação** para **Paisagem** se o perfil Completo tiver tabelas largas.
2. Em **Mais configurações** → **Escala**, escolha **Padrão** ou **Ajustar à
   página** (em vez de **100%**).
3. Confira **Margens**: padrão funciona para a maioria dos casos; em tabelas muito
   largas, escolha **Mínimas**.
4. Habilite **Gráficos de fundo** se quiser preservar fundos coloridos.

O `@media print` do relatório oficial esconde a interface e formata o documento
em A4; a paginação física é responsabilidade do navegador.

## Atalho Escape nao sai do modo apresentacao

**Sintoma**: você entrou em **Modo apresentação** e `Escape` não devolve a UI
normal.

**Causa provável**: o foco do teclado pode ter saído da página (clicou fora, ou um
overlay capturou a tecla). Em algumas versões do **iOS Safari**, `Escape` em
teclados externos não chega ao JavaScript.

**O que fazer**:

1. Clique no botão grande **Sair da apresentação** (canto da tela). Ele sempre
   funciona, mesmo sem foco no teclado.
2. Em seguida, clique novamente em qualquer parte da página para devolver o foco.
3. Se quiser deixar `Escape` funcional para a próxima vez, clique no fundo da
   apresentação primeiro (para garantir foco) antes de pressionar a tecla.

## PWA nao instala

**Sintoma**: nenhum ícone de instalação aparece no navegador, ou o botão "Adicionar
à tela inicial" não cria atalho funcional.

**Causa provável**: a PWA exige uma origem segura. O navegador só oferece a
instalação quando a página é servida via `https://` (qualquer host) ou `http://` em
**localhost**. Abrir como `file://` ou via IP em rede local sem HTTPS bloqueia a
instalação.

**O que fazer**:

1. Confirme que a URL da barra começa com `https://` (ou `http://localhost:...`).
2. Em DevTools → **Application** → **Manifest**, confira:
   - O `manifest.webmanifest` foi carregado sem erro.
   - O service worker está registrado e ativo (aba **Service Workers**).
   - Os ícones em `icons/` estão acessíveis.
3. Se estiver rodando localmente, sirva com qualquer servidor HTTP simples (ex.:
   extensão "Live Server", `python3 -m http.server`, ou similar) e acesse via
   `localhost`.
4. Force um refresh duro (`Ctrl+Shift+R` / `Cmd+Shift+R`) para o navegador
   reavaliar o manifesto.
