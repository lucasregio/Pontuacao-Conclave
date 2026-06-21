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

function loadProjetoSample() {
  const p = path.join(__dirname, "..", "eventos", "conclave-2026-1.projeto.exemplo.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Orçamento docs/operacional/performance-budget.md: 150ms × 1,2 tolerância em CI */
const BUDGET_MS = 180;

test(`computeTotals no sample de referência ≤ ${BUDGET_MS}ms (mediana de 5 runs)`, () => {
  const { evento, dados } = loadProjetoSample();
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now();
    E.computeTotals(evento, dados);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[2];
  assert.ok(
    median <= BUDGET_MS,
    `mediana ${median.toFixed(1)}ms excedeu ${BUDGET_MS}ms`
  );
});
