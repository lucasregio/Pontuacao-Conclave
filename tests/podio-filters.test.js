const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPodioFilters() {
  const code = fs.readFileSync(path.join(__dirname, "..", "web", "podio-filters.js"), "utf8");
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.ConclavePodioFilters;
}

function loadEngine() {
  const code = fs.readFileSync(path.join(__dirname, "..", "web", "engine.js"), "utf8");
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.ConclaveEngine;
}

const PF = loadPodioFilters();
const E = loadEngine();

const provas = [
  { id: "p1", titulo: "Esgrima bíblica — Junior", categoriaId: "junior", tipo: "oral" },
  { id: "p2", titulo: "Debate de versículos — Adolescente", categoriaId: "adl", tipo: "oral" },
  {
    id: "p3",
    titulo: "Conhecimentos Gerais da Bíblia — Juvenil",
    categoriaId: "juv",
    tipo: "escrita",
  },
];

const podium = {
  p1: {
    ou: { igrejaId: "a", competidor: "João" },
    pt: { igrejaId: "b", competidor: "" },
    br: { igrejaId: "c", competidor: "Maria" },
  },
  p2: {
    ou: { igrejaId: "a", competidor: "Ana" },
    pt: { igrejaId: "a", competidor: "Pedro" },
    br: { igrejaId: "b", competidor: "Luiz" },
  },
  p3: {
    ou: { nomeLivre: "Igreja visitante", competidor: "" },
    pt: {},
    br: {},
  },
};

const ctx = {
  podium: podium,
  categoriaKey: function (p) {
    return p.categoriaId;
  },
  categoriaLabel: function (p) {
    return p.categoriaId === "junior" ? "Junior" : p.categoriaId;
  },
  igrejaNome: function (id) {
    return id === "a" ? "Igreja Alpha" : id === "b" ? "Igreja Beta" : "";
  },
  tiebreakProvaBucket: E.tiebreakProvaBucket,
};

test("provaPodiumStatus distingue pendente, parcial e completo", () => {
  assert.equal(PF.provaPodiumStatus("p1", podium), "complete");
  assert.equal(PF.provaPodiumStatus("p2", podium), "complete");
  assert.equal(PF.provaPodiumStatus("p3", podium), "partial");
  assert.equal(PF.provaPodiumStatus("missing", podium), "pending");
});

test("provaHasDuplicado detecta igreja repetida na mesma prova", () => {
  assert.equal(PF.provaHasDuplicado("p2", podium), true);
  assert.equal(PF.provaHasDuplicado("p1", podium), false);
});

test("provaSemCompetidor detecta medalha sem nome do competidor", () => {
  assert.equal(PF.provaSemCompetidor("p1", podium), true);
  assert.equal(PF.provaSemCompetidor("p2", podium), false);
});

test("filtro por status", () => {
  var out = PF.filterProvas(provas, { status: "complete" }, ctx);
  assert.deepEqual(
    out.map(function (p) {
      return p.id;
    }),
    ["p1", "p2"]
  );
  out = PF.filterProvas(provas, { status: "partial" }, ctx);
  assert.deepEqual(
    out.map(function (p) {
      return p.id;
    }),
    ["p3"]
  );
});

test("filtro por categoria e busca combinam", () => {
  var out = PF.filterProvas(
    provas,
    { categoriaId: "junior", q: "esgrima" },
    ctx
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "p1");
});

test("filtro por igreja e avisos", () => {
  var out = PF.filterProvas(provas, { igrejaId: "a" }, ctx);
  assert.deepEqual(
    out.map(function (p) {
      return p.id;
    }),
    ["p1", "p2"]
  );
  out = PF.filterProvas(provas, { comAvisos: true }, ctx);
  assert.deepEqual(
    out.map(function (p) {
      return p.id;
    }),
    ["p2"]
  );
});

test("filtro desempate usa tiebreakProvaBucket do engine", () => {
  var out = PF.filterProvas(provas, { desempate: true }, ctx);
  assert.deepEqual(
    out.map(function (p) {
      return p.id;
    }),
    ["p2", "p3"]
  );
});

test("isActivePodioFilters detecta filtros não padrão", () => {
  assert.equal(PF.isActivePodioFilters(PF.defaultPodioFilters()), false);
  assert.equal(PF.isActivePodioFilters({ status: "pending" }), true);
  assert.equal(PF.isActivePodioFilters({ q: "debate" }), true);
});

test("normalizePodioFilters saneia valores inválidos", () => {
  var f = PF.normalizePodioFilters({ status: "invalid", q: "  teste  ", comAvisos: 1 });
  assert.equal(f.status, "all");
  assert.equal(f.q, "teste");
  assert.equal(f.comAvisos, true);
});

test("engine exporta tiebreakProvaBucket", () => {
  assert.equal(E.tiebreakProvaBucket("Conhecimentos Gerais da Bíblia"), "cgBib");
  assert.equal(E.tiebreakProvaBucket("Debate de Versículos"), "debate");
  assert.equal(E.tiebreakProvaBucket("Esgrima bíblica"), null);
});
