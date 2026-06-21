const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadRelatorio() {
  const code = fs.readFileSync(path.join(__dirname, "..", "web", "relatorio.js"), "utf8");
  const context = {};
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.ConclaveRelatorio;
}

const R = loadRelatorio();

test("getRelatorioBlocos — resumo omite blocos de auditoria", () => {
  const blocos = R.getRelatorioBlocos("resumo");
  assert.deepEqual(blocos, R.BLOCOS_RESUMO);
  assert.ok(!blocos.includes("participacao"));
  assert.ok(!blocos.includes("criterios"));
  assert.ok(!blocos.includes("classificacao"));
  assert.ok(blocos.includes("encerramento"));
  assert.ok(blocos.includes("podio"));
});

test("getRelatorioBlocos — completo inclui auditoria", () => {
  const blocos = R.getRelatorioBlocos("completo");
  assert.deepEqual(blocos, R.BLOCOS_COMPLETO);
  assert.ok(blocos.includes("participacao"));
  assert.ok(blocos.includes("criterios"));
  assert.ok(blocos.includes("classificacao"));
});

test("normalizePerfil trata valores inválidos como resumo", () => {
  assert.equal(R.normalizePerfil("completo"), "completo");
  assert.equal(R.normalizePerfil("resumo"), "resumo");
  assert.equal(R.normalizePerfil(""), "resumo");
  assert.equal(R.normalizePerfil(null), "resumo");
});

test("buildRelatorioCapaTitulo inclui perfil", () => {
  assert.match(R.buildRelatorioCapaTitulo("resumo"), /Resumo/);
  assert.match(R.buildRelatorioCapaTitulo("completo"), /Completo/i);
});

test("buildRelatorioDocumentTitle usa slug e perfil", () => {
  assert.equal(
    R.buildRelatorioDocumentTitle("conclave-2026-1", "resumo"),
    "conclave-2026-1-relatorio-resumo"
  );
  assert.equal(R.buildRelatorioDocumentTitle("", "completo"), "conclave-relatorio-completo");
});

test("buildCapaMetaRows inclui local e omite slug no resumo", () => {
  const meta = {
    nome: "Teste",
    slug: "teste",
    data: "2026-01-01",
    local: "Sede Central",
    schemaVersion: 2,
  };
  const resumoRows = R.buildCapaMetaRows(meta, "resumo", "01/01/2026 10:00", { temaTexto: "MR" });
  const localRow = resumoRows.find(function (r) {
    return r.dt === "Local";
  });
  assert.ok(localRow);
  assert.equal(localRow.dd, "Sede Central");
  assert.ok(
    !resumoRows.some(function (r) {
      return r.dt === "Slug";
    })
  );

  const completoRows = R.buildCapaMetaRows(meta, "completo", "01/01/2026 10:00", {
    temaTexto: "MR",
    schemaVersion: 2,
  });
  assert.ok(
    completoRows.some(function (r) {
      return r.dt === "Slug" && r.dd === "teste";
    })
  );
});

test("buildRodapeTexto — schema só no completo", () => {
  const meta = { slug: "evt" };
  const resumo = R.buildRodapeTexto(meta, "hoje", "resumo", 2);
  assert.match(resumo, /slug: evt/);
  assert.ok(!resumo.includes("schema"));

  const completo = R.buildRodapeTexto(meta, "hoje", "completo", 2);
  assert.match(completo, /schema: v2/);
});
