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

function loadProjetoSample() {
  const p = path.join(__dirname, "..", "eventos", "conclave-2026-1.projeto.exemplo.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const E = loadEngine();

test("sample do projeto passa em validateEventoMinimal sem erros", () => {
  const projeto = loadProjetoSample();
  const errs = E.validateEventoMinimal(projeto.evento);
  // engine roda em vm.createContext → arrays/objetos cross-realm: comparamos
  // por conteúdo via JSON.
  assert.equal(JSON.stringify(Array.from(errs)), "[]");
});

test("sample do projeto produz totais finitos e ranks consistentes", () => {
  const projeto = loadProjetoSample();
  const out = E.computeTotals(projeto.evento, projeto.dados);
  assert.equal(out.detalhes.length, projeto.evento.igrejas.length);
  for (const d of out.detalhes) {
    assert.ok(Number.isFinite(d.total), `total não-finito em ${d.igrejaId}`);
    assert.ok(Number.isFinite(d.participacao));
    assert.ok(Number.isFinite(d.gincana));
  }
  // Ranks devem ser inteiros >= 1 e <= n.
  const n = out.ranks.length;
  for (const r of out.ranks) {
    assert.ok(Number.isInteger(r) && r >= 1 && r <= n);
  }
});

test("classificacaoOrdenada do sample é estável (mesmo resultado em duas execuções)", () => {
  const projeto = loadProjetoSample();
  const a = E.computeTotals(projeto.evento, projeto.dados);
  const b = E.computeTotals(projeto.evento, projeto.dados);
  const ordA = E.classificacaoOrdenada(a.detalhes, a.ranks, a.tiebreakByIgreja);
  const ordB = E.classificacaoOrdenada(b.detalhes, b.ranks, b.tiebreakByIgreja);
  assert.deepEqual(
    Array.from(ordA).map((x) => x.igrejaId),
    Array.from(ordB).map((x) => x.igrejaId)
  );
});

test("round-trip JSON: serializar e reimportar mantém os mesmos totais", () => {
  const original = loadProjetoSample();
  const out1 = E.computeTotals(original.evento, original.dados);

  // Serializa e reparseia (simulando export → import).
  const reparsed = JSON.parse(JSON.stringify(original));
  const out2 = E.computeTotals(reparsed.evento, reparsed.dados);

  // Comparação por conteúdo serializado (cross-realm safe).
  assert.equal(JSON.stringify(Array.from(out1.totais)), JSON.stringify(Array.from(out2.totais)));
  assert.equal(JSON.stringify(Array.from(out1.ranks)), JSON.stringify(Array.from(out2.ranks)));
});

test("round-trip preserva contagem de medalhas por igreja", () => {
  const original = loadProjetoSample();
  const out1 = E.computeTotals(original.evento, original.dados);
  const reparsed = JSON.parse(JSON.stringify(original));
  const out2 = E.computeTotals(reparsed.evento, reparsed.dados);
  assert.equal(JSON.stringify(out1.medalhasPorIgreja), JSON.stringify(out2.medalhasPorIgreja));
});

test("emptyDadosTemplate é JSON-estável (round-trip de serialização)", () => {
  const ids = ["a", "b"];
  const pids = ["p1", "p2"];
  const dados = E.emptyDadosTemplate(ids, pids);
  const json1 = JSON.stringify(dados);
  const json2 = JSON.stringify(JSON.parse(json1));
  assert.equal(json1, json2);
});
