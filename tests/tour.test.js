const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.join(__dirname, "..");

function loadTourSteps() {
  const source = fs.readFileSync(path.join(repoRoot, "web", "app.js"), "utf8");
  const start = source.indexOf("/* TOUR_STEPS_START */");
  const end = source.indexOf("/* TOUR_STEPS_END */");
  assert.ok(start >= 0 && end > start, "marcadores TOUR_STEPS_* ausentes em web/app.js");
  const block = source.slice(start, end);
  const match = block.match(/var TOUR_STEPS = (\[[\s\S]*\]);/);
  assert.ok(match, "TOUR_STEPS não encontrado entre os marcadores");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext("this.steps = " + match[1] + ";", ctx);
  return ctx.steps;
}

test("tutorial guiado tem passos com aba, alvo e texto", () => {
  const steps = loadTourSteps();
  assert.ok(steps.length >= 6, "tutorial precisa de pelo menos 6 passos");
  const ids = {};
  steps.forEach(function (step, i) {
    assert.ok(step.id, "passo " + i + " sem id");
    assert.ok(!ids[step.id], "id duplicado: " + step.id);
    ids[step.id] = true;
    assert.ok(step.tab, step.id + " sem tab");
    assert.ok(Array.isArray(step.targets) && step.targets.length, step.id + " sem targets");
    assert.ok(step.title && step.body, step.id + " sem título/texto");
  });
  ["inicio", "participacao", "podio", "classificacao"].forEach(function (id) {
    assert.ok(ids[id], "falta o passo " + id);
  });
});

test("index.html tem o palco do tutorial guiado", () => {
  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  ["tour-root", "tour-next", "tour-prev", "tour-skip", "tour-title", "btn-footer-tutorial"].forEach(
    function (id) {
      assert.match(html, new RegExp('id="' + id + '"'), "falta #" + id);
    }
  );
});
