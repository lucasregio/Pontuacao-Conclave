const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadMetrics() {
  const code = fs.readFileSync(path.join(__dirname, "..", "web", "escrita-metrics.js"), "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.window.ConclaveEscritaMetrics;
}

const M = loadMetrics();

const sampleList = [
  { id: "p1", nome: "Maria", igrejaId: "alianca", acertos: 18 },
  { id: "p2", nome: "Ana", igrejaId: "ibes", acertos: 18 },
  { id: "p3", nome: "Bia", igrejaId: "alianca", acertos: 12 },
  { id: "p4", nome: "Carla", igrejaId: "gloria", acertos: 20 },
];

test("rankParticipantes ordena por acertos desc e nome em empate", () => {
  const ranked = M.rankParticipantes(sampleList);
  assert.equal(ranked[0].nome, "Carla");
  assert.equal(ranked[1].nome, "Ana");
  assert.equal(ranked[2].nome, "Maria");
  assert.equal(ranked[3].nome, "Bia");
});

test("topParticipantes limita quantidade", () => {
  const top = M.topParticipantes(sampleList, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].nome, "Carla");
});

test("mediaPorIgreja calcula médias corretamente", () => {
  const nomes = { alianca: "Aliança", ibes: "Ibes", gloria: "Glória" };
  const medias = M.mediaPorIgreja(sampleList, nomes);
  assert.equal(medias.length, 3);
  const alianca = medias.find(function (m) {
    return m.igrejaId === "alianca";
  });
  assert.ok(alianca);
  assert.equal(alianca.count, 2);
  assert.equal(alianca.media, 15);
});

test("histogramaFaixas agrupa acertos em faixas", () => {
  const bins = M.histogramaFaixas(sampleList, 20, 5);
  assert.ok(bins.length >= 4);
  const totalCount = bins.reduce(function (s, b) {
    return s + b.count;
  }, 0);
  assert.equal(totalCount, sampleList.length);
});

test("validarEntrada rejeita acertos negativos e campos vazios", () => {
  assert.ok(M.validarEntrada({ nome: "", igrejaId: "x", acertos: 5 }).length > 0);
  assert.ok(M.validarEntrada({ nome: "A", igrejaId: "", acertos: 5 }).length > 0);
  assert.ok(M.validarEntrada({ nome: "A", igrejaId: "x", acertos: -1 }).length > 0);
  assert.equal(M.validarEntrada({ nome: "A", igrejaId: "x", acertos: 10 }).length, 0);
});

test("normalizeAcertos trata valores inválidos", () => {
  assert.equal(M.normalizeAcertos(-3), 0);
  assert.equal(M.normalizeAcertos("14.7"), 15);
});

test("minimoAcertosEscrita é 60% arredondado para cima", () => {
  assert.equal(M.minimoAcertosEscrita(20), 12);
  assert.equal(M.minimoAcertosEscrita(10), 6);
});

test("avisosPodiumEscritaMinimo alerta nota abaixo de 60% e medalha sem nota", () => {
  const evento = {
    provas: [
      {
        id: "escrita-evang-jun",
        titulo: "Prova escrita — Evangelhos — Junior",
        tipo: "escrita",
        escritaTotalQuestoes: 20,
      },
    ],
  };
  const dados = {
    podium: {
      "escrita-evang-jun": {
        ou: { igrejaId: "alianca", competidor: "Ana" },
        pt: { igrejaId: "gloria", competidor: "" },
        br: { igrejaId: null, competidor: "" },
      },
    },
    metricasEscrita: {
      "escrita-evang-jun": [
        { nome: "Ana", igrejaId: "alianca", acertos: 8 },
        { nome: "Bia", igrejaId: "gloria", acertos: 18 },
      ],
    },
  };
  const avisos = M.avisosPodiumEscritaMinimo(evento, dados);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Ana/);
  assert.match(avisos[0], /8\/20/);

  dados.podium["escrita-evang-jun"].pt.igrejaId = "ibes";
  const avisos2 = M.avisosPodiumEscritaMinimo(evento, dados);
  assert.ok(
    avisos2.some(function (a) {
      return /sem nota/.test(a);
    })
  );
});

test("avisosPodiumEscritaMinimo ignora montagem (sem total de questões)", () => {
  const evento = {
    provas: [{ id: "montagem-jun", titulo: "Montagem bíblica — Junior", tipo: "escrita" }],
  };
  const dados = {
    podium: {
      "montagem-jun": { ou: { igrejaId: "alianca", competidor: "Ana" }, pt: {}, br: {} },
    },
    metricasEscrita: {},
  };
  assert.equal(M.usaMinimoAcertosEscrita(evento.provas[0]), false);
  assert.equal(M.avisosPodiumEscritaMinimo(evento, dados).length, 0);
});

test("resumoProva calcula estatísticas", () => {
  const r = M.resumoProva(sampleList);
  assert.equal(r.count, 4);
  assert.equal(r.max, 20);
  assert.equal(r.min, 12);
});

test("sample projeto contém metricasEscrita válido", () => {
  const projeto = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "eventos", "conclave-2026-1.projeto.exemplo.json"),
      "utf8"
    )
  );
  assert.ok(projeto.dados.metricasEscrita);
  assert.ok(Array.isArray(projeto.dados.metricasEscrita["escrita-jun"]));
  assert.equal(projeto.dados.metricasEscrita["escrita-jun"].length, 3);
});
