const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadEngine() {
  const code = fs.readFileSync(path.join(__dirname, "..", "web", "engine.js"), "utf8");
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.ConclaveEngine;
}

const E = loadEngine();

function buildEventoBase() {
  return {
    meta: { nome: "Evento Teste", slug: "evento-teste" },
    pesos: {
      inscricao: 100,
      pontualidade: 50,
      uniforme: 25,
      biblia: 25,
      visitante: 10,
      animacao: 20,
      mau_comportamento: -15,
    },
    medalhas: { ou: 300, pt: 200, br: 100 },
    igrejas: [
      { id: "a", nome: "Igreja A" },
      { id: "b", nome: "Igreja B" },
      { id: "c", nome: "Igreja C" },
    ],
    provas: [
      { id: "cg-bib", titulo: "Conhecimentos Gerais da Bíblia", ordem: 1 },
      { id: "debate", titulo: "Debate de Versículos", ordem: 2 },
      { id: "cg-org", titulo: "Conhecimentos Gerais da Organização", ordem: 3 },
    ],
  };
}

test("emptyDadosTemplate cria participacao e podium para todos os ids", () => {
  const dados = E.emptyDadosTemplate(["a", "b"], ["p1"]);
  assert.deepEqual(Object.keys(dados.participacao), ["a", "b"]);
  assert.deepEqual(Object.keys(dados.podium), ["p1"]);
  assert.equal(dados.participacao.a.inscricao, true);
});

test("computeTotals soma participacao, punicao, gincana e extra", () => {
  const evento = buildEventoBase();
  const dados = E.emptyDadosTemplate(
    evento.igrejas.map((x) => x.id),
    evento.provas.map((x) => x.id)
  );

  dados.participacao.a = {
    inscricao: true,
    pontualidade: true,
    mr_total: 10,
    mr_camisa: 10,
    mr_biblia: 10,
    visitantes: 2,
    animacao: true,
    mau_comportamento: false,
    pontuacao_extra: 5,
  };
  dados.podium["cg-bib"].ou.igrejaId = "a";

  const out = E.computeTotals(evento, dados);
  const rowA = out.detalhes.find((d) => d.igrejaId === "a");

  assert.equal(rowA.participacao, 240);
  assert.equal(rowA.punicoes, 0);
  assert.equal(rowA.gincana, 300);
  assert.equal(rowA.pontuacao_extra, 5);
  assert.equal(rowA.total, 545);
});

test("rankList empata com mesma posicao", () => {
  const ranks = E.rankList([100, 200, 200, 50]);
  assert.deepEqual(Array.from(ranks), [3, 1, 1, 4]);
});

test("classificacaoOrdenada usa desempate por ouro, prata e provas-chave", () => {
  const evento = buildEventoBase();
  const dados = E.emptyDadosTemplate(
    evento.igrejas.map((x) => x.id),
    evento.provas.map((x) => x.id)
  );

  // Totais iguais entre A e B via podio.
  dados.podium["cg-bib"].ou.igrejaId = "a";
  dados.podium["debate"].ou.igrejaId = "b";

  const out = E.computeTotals(evento, dados);
  const ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);

  // A vence por ter ouro em Conhecimentos Gerais da Biblia.
  assert.equal(ord[0].igrejaId, "a");
  assert.equal(ord[1].igrejaId, "b");
});

test("validateEventoMinimal detecta chaves e ids duplicados", () => {
  const invalido = {
    meta: {},
    pesos: {},
    medalhas: {},
    igrejas: [{ id: "x" }, { id: "x" }],
    provas: [],
  };
  const errs = E.validateEventoMinimal(invalido);
  assert.ok(errs.some((e) => e.includes("IDs de igrejas duplicados")));
});

test("avisosPodiumDuplicado alerta igrejas repetidas na mesma prova", () => {
  const warnings = E.avisosPodiumDuplicado({
    p1: {
      ou: { igrejaId: "a" },
      pt: { igrejaId: "a" },
      br: { igrejaId: "b" },
    },
  });
  assert.equal(warnings.length, 1);
});

test("pontosParticipacao retorna 0 quando inscricao + mr_total <= 0", () => {
  const evento = buildEventoBase();
  const dados = E.emptyDadosTemplate(
    evento.igrejas.map((x) => x.id),
    evento.provas.map((x) => x.id)
  );
  // Igreja não inscrita e sem MR: tudo zero, mesmo com pontualidade/animação ligadas.
  dados.participacao.a = {
    inscricao: false,
    pontualidade: true,
    mr_total: 0,
    mr_camisa: 5,
    mr_biblia: 5,
    visitantes: 99,
    animacao: true,
    mau_comportamento: false,
    pontuacao_extra: 0,
  };
  const out = E.computeTotals(evento, dados);
  const rowA = out.detalhes.find((d) => d.igrejaId === "a");
  assert.equal(rowA.participacao, 0);
});

test("computeTotals respeita gincana parcial (igreja sem medalha)", () => {
  const evento = buildEventoBase();
  const dados = E.emptyDadosTemplate(
    evento.igrejas.map((x) => x.id),
    evento.provas.map((x) => x.id)
  );
  // Só A pega ouro em uma prova; B e C ficam sem medalha.
  dados.podium["debate"].ou.igrejaId = "a";
  const out = E.computeTotals(evento, dados);
  assert.equal(out.gincanaPorIgreja.a, 300);
  assert.equal(out.gincanaPorIgreja.b, 0);
  assert.equal(out.gincanaPorIgreja.c, 0);
});

test("pontuacao_extra aceita string (planilha) e fallback embaixadas legado", () => {
  const evento = buildEventoBase();
  const dados = E.emptyDadosTemplate(
    evento.igrejas.map((x) => x.id),
    evento.provas.map((x) => x.id)
  );
  dados.participacao.a = {
    inscricao: true,
    pontualidade: true,
    mr_total: 1,
    pontuacao_extra: "12,5",
  };
  dados.participacao.b = {
    inscricao: true,
    pontualidade: true,
    mr_total: 1,
    embaixadas: "7",
  };
  const out = E.computeTotals(evento, dados);
  assert.equal(out.detalhes.find((d) => d.igrejaId === "a").pontuacao_extra, 12.5);
  assert.equal(out.detalhes.find((d) => d.igrejaId === "b").pontuacao_extra, 7);
});

test("classificacaoOrdenada cai no nome quando não há provas-chave de desempate", () => {
  const evento = {
    meta: { nome: "Sem provas-chave", slug: "sem-pk" },
    pesos: {
      inscricao: 100,
      pontualidade: 50,
      uniforme: 25,
      biblia: 25,
      visitante: 10,
      animacao: 20,
      mau_comportamento: -15,
    },
    medalhas: { ou: 300, pt: 200, br: 100 },
    igrejas: [
      { id: "z", nome: "Zeta" },
      { id: "a", nome: "Álpha" },
    ],
    provas: [{ id: "p1", titulo: "Prova qualquer", ordem: 1 }],
  };
  const dados = E.emptyDadosTemplate(["z", "a"], ["p1"]);
  const out = E.computeTotals(evento, dados);
  const ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
  // "Álpha" vem antes de "Zeta" com sensitivity=base.
  assert.equal(ord[0].igrejaId, "a");
  assert.equal(ord[1].igrejaId, "z");
});

test("validateEventoMinimal sinaliza cada chave de topo faltante", () => {
  for (const k of ["meta", "pesos", "medalhas", "igrejas", "provas"]) {
    const ev = {
      meta: {},
      pesos: {},
      medalhas: {},
      igrejas: [{ id: "x" }],
      provas: [{ id: "p" }],
    };
    delete ev[k];
    const errs = E.validateEventoMinimal(ev);
    assert.ok(
      errs.some((e) => e.indexOf(k) !== -1),
      `Esperado erro citando «${k}»; recebido: ${JSON.stringify(errs)}`
    );
  }
});

test("validateEventoMinimal não crasha quando igrejas/provas não são listas", () => {
  const errs = E.validateEventoMinimal({
    meta: {},
    pesos: {},
    medalhas: {},
    igrejas: {},
    provas: "oops",
  });
  assert.ok(errs.some((e) => /igrejas/.test(e)));
  assert.ok(errs.some((e) => /provas/.test(e)));
});

test("computeTotals não quebra com pesos.uniforme/biblia ausentes", () => {
  const evento = buildEventoBase();
  delete evento.pesos.uniforme;
  delete evento.pesos.biblia;
  const dados = E.emptyDadosTemplate(
    evento.igrejas.map((x) => x.id),
    evento.provas.map((x) => x.id)
  );
  dados.participacao.a = {
    inscricao: true,
    pontualidade: true,
    mr_total: 5,
    mr_camisa: 5,
    mr_biblia: 5,
    visitantes: 0,
    animacao: false,
    mau_comportamento: false,
  };
  const out = E.computeTotals(evento, dados);
  const rowA = out.detalhes.find((d) => d.igrejaId === "a");
  // 100 (inscricao) + 50 (pontualidade) + 0 + 0.
  assert.equal(rowA.participacao, 150);
  assert.ok(Number.isFinite(rowA.total));
});

test("num aceita vírgula decimal pt-BR sem perder precisão", () => {
  assert.equal(E.num("12,5"), 12.5);
  assert.equal(E.num("1.234,56"), 1234.56);
  assert.equal(E.num("invalid", -1), -1);
  assert.equal(E.num(null, 0), 0);
});

test("contarMedalhasPorIgreja agrega ou/pt/br e ignora igreja desconhecida", () => {
  const podium = {
    p1: { ou: { igrejaId: "a" }, pt: { igrejaId: "b" }, br: { igrejaId: "a" } },
    p2: { ou: { igrejaId: "a" }, pt: { igrejaId: "c" }, br: { igrejaId: "x" } },
  };
  const counts = E.contarMedalhasPorIgreja(podium, ["a", "b", "c"]);
  assert.deepEqual(counts.a, { ou: 2, pt: 0, br: 1 });
  assert.deepEqual(counts.b, { ou: 0, pt: 1, br: 0 });
  assert.deepEqual(counts.c, { ou: 0, pt: 1, br: 0 });
});

test("pontosPunicoes aplica peso negativo quando mau_comportamento truthy", () => {
  const evento = buildEventoBase();
  assert.equal(E.pontosPunicoes({ mau_comportamento: true }, evento.pesos), -15);
  assert.equal(E.pontosPunicoes({ mau_comportamento: false }, evento.pesos), 0);
});

test("desempate por contagem de prata quando ouro empata", () => {
  const evento = {
    ...buildEventoBase(),
    igrejas: [
      { id: "a", nome: "A" },
      { id: "b", nome: "B" },
    ],
    provas: [
      { id: "p1", titulo: "P1", ordem: 1 },
      { id: "p2", titulo: "P2", ordem: 2 },
      { id: "p3", titulo: "P3", ordem: 3 },
    ],
  };
  const dados = E.emptyDadosTemplate(["a", "b"], ["p1", "p2", "p3"]);
  dados.podium.p1 = { ou: { igrejaId: "a" }, pt: { igrejaId: "b" }, br: {} };
  dados.podium.p2 = { ou: { igrejaId: "b" }, pt: { igrejaId: "a" }, br: {} };
  dados.podium.p3 = { ou: {}, pt: { igrejaId: "a" }, br: {} };
  dados.participacao.b.pontuacao_extra = 200;
  const out = E.computeTotals(evento, dados);
  const a = out.detalhes.find((d) => d.igrejaId === "a");
  const b = out.detalhes.find((d) => d.igrejaId === "b");
  assert.equal(a.total, b.total);
  const ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
  assert.equal(ord[0].igrejaId, "a");
});

test("desempate por pontos de debate quando ouro e prata empatam", () => {
  const evento = buildEventoBase();
  evento.provas = [
    { id: "debate", titulo: "Debate de Versículos", ordem: 1 },
    { id: "p2", titulo: "Outra", ordem: 2 },
  ];
  const dados = E.emptyDadosTemplate(
    evento.igrejas.map((x) => x.id),
    evento.provas.map((x) => x.id)
  );
  dados.podium.debate.ou.igrejaId = "b";
  dados.podium.p2.ou.igrejaId = "a";
  const out = E.computeTotals(evento, dados);
  const a = out.detalhes.find((d) => d.igrejaId === "a");
  const b = out.detalhes.find((d) => d.igrejaId === "b");
  assert.equal(a.total, b.total);
  assert.equal(a.gincana, b.gincana);
  const ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
  assert.equal(ord[0].igrejaId, "b");
});

test("bronze nao entra no desempate por ouro/prata", () => {
  const evento = buildEventoBase();
  evento.provas = [{ id: "p1", titulo: "Prova", ordem: 1 }];
  const dados = E.emptyDadosTemplate(["a", "b"], ["p1"]);
  dados.podium.p1 = {
    ou: { igrejaId: "a" },
    pt: { igrejaId: "b" },
    br: { igrejaId: "b" },
  };
  const out = E.computeTotals(evento, dados);
  assert.equal(out.detalhes.find((d) => d.igrejaId === "a").total, 300);
  assert.equal(out.detalhes.find((d) => d.igrejaId === "b").total, 300);
  const ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
  assert.equal(ord[0].igrejaId, "a");
});

test("validateEventoMinimal rejeita null e ids de prova duplicados", () => {
  assert.ok(E.validateEventoMinimal(null).length > 0);
  const ev = buildEventoBase();
  ev.provas = [
    { id: "dup", titulo: "A", ordem: 1 },
    { id: "dup", titulo: "B", ordem: 2 },
  ];
  const errs = E.validateEventoMinimal(ev);
  assert.ok(errs.some((e) => e.includes("IDs de provas duplicados")));
});

test("rankList com array vazio e elemento unico", () => {
  assert.deepEqual(Array.from(E.rankList([])), []);
  assert.deepEqual(Array.from(E.rankList([42])), [1]);
});

test("avisosPodiumDuplicado sem aviso quando igrejas distintas", () => {
  const warnings = E.avisosPodiumDuplicado({
    p1: {
      ou: { igrejaId: "a" },
      pt: { igrejaId: "b" },
      br: { igrejaId: "c" },
    },
  });
  assert.equal(warnings.length, 0);
});
