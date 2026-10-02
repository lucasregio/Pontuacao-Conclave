const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCeremonyHelpers() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const fnNames = [
    "getCeremonyRevealSequence",
    "isPositionRevealed",
    "advanceCeremonyState",
    "revealAllCeremonyState",
  ];
  const chunks = fnNames.map(function (name) {
    const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n {2}\\}");
    const match = source.match(re);
    if (!match) throw new Error(name + " não encontrada em web/app.js");
    return match[0];
  });
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    chunks.join("\n\n") +
      "\nthis.helpers = { getCeremonyRevealSequence, isPositionRevealed, advanceCeremonyState, revealAllCeremonyState };",
    ctx
  );
  return ctx.helpers;
}

const H = loadCeremonyHelpers();

test("getCeremonyRevealSequence: 8 igrejas revela 5→1", () => {
  assert.deepEqual([].slice.call(H.getCeremonyRevealSequence(8)), [5, 4, 3, 2, 1]);
});

test("getCeremonyRevealSequence: 3 igrejas revela 3→1", () => {
  assert.deepEqual([].slice.call(H.getCeremonyRevealSequence(3)), [3, 2, 1]);
});

test("advanceCeremonyState percorre 5→1 com 8 igrejas", () => {
  var snapshot = [];
  for (var i = 1; i <= 8; i++) snapshot.push({ posicao: i });
  var ceremony = { phase: "intro", revealedUpTo: null, snapshot: snapshot };
  ceremony = H.advanceCeremonyState(ceremony, 8);
  assert.equal(ceremony.phase, "reveal");
  assert.equal(ceremony.revealedUpTo, 5);

  ceremony = H.advanceCeremonyState(ceremony, 8);
  assert.equal(ceremony.revealedUpTo, 4);

  ceremony = H.advanceCeremonyState(ceremony, 8);
  assert.equal(ceremony.revealedUpTo, 3);

  ceremony = H.advanceCeremonyState(ceremony, 8);
  assert.equal(ceremony.revealedUpTo, 2);

  ceremony = H.advanceCeremonyState(ceremony, 8);
  assert.equal(ceremony.phase, "complete");
  assert.equal(ceremony.revealedUpTo, 1);
});

test("advanceCeremonyState com 3 igrejas percorre 3→1", () => {
  var ceremony = { phase: "intro", revealedUpTo: null, snapshot: [] };
  ceremony = H.advanceCeremonyState(ceremony, 3);
  assert.equal(ceremony.revealedUpTo, 3);
  ceremony = H.advanceCeremonyState(ceremony, 3);
  assert.equal(ceremony.revealedUpTo, 2);
  ceremony = H.advanceCeremonyState(ceremony, 3);
  assert.equal(ceremony.phase, "complete");
  assert.equal(ceremony.revealedUpTo, 1);
});

test("isPositionRevealed respeita fases intro e complete", () => {
  var intro = { phase: "intro", revealedUpTo: null, snapshot: [] };
  assert.equal(H.isPositionRevealed(intro, 5), false);

  var mid = { phase: "reveal", revealedUpTo: 4, snapshot: [] };
  assert.equal(H.isPositionRevealed(mid, 5), true);
  assert.equal(H.isPositionRevealed(mid, 4), true);
  assert.equal(H.isPositionRevealed(mid, 3), false);

  var done = { phase: "complete", revealedUpTo: 1, snapshot: [] };
  assert.equal(H.isPositionRevealed(done, 8), true);
});

test("getCeremonyRevealSequence ignora posição 5 inexistente (empate no 4º)", () => {
  var ord = [
    { posicao: 1 },
    { posicao: 2 },
    { posicao: 3 },
    { posicao: 4 },
    { posicao: 4 },
    { posicao: 4 },
  ];
  assert.deepEqual([].slice.call(H.getCeremonyRevealSequence(6, ord)), [4, 3, 2, 1]);
});

test("revealAllCeremonyState pula para complete", () => {
  var ceremony = { phase: "intro", revealedUpTo: null, snapshot: [{ posicao: 1 }] };
  var all = H.revealAllCeremonyState(ceremony);
  assert.equal(all.phase, "complete");
  assert.equal(all.revealedUpTo, 1);
  assert.equal(all.snapshot, ceremony.snapshot);
});
