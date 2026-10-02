const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const schemaDir = path.join(__dirname, "..", "schema");
const eventosDir = path.join(__dirname, "..", "eventos");

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function checkRequired(obj, required, prefix) {
  const errors = [];
  for (const key of required || []) {
    if (!(key in obj)) errors.push(`${prefix} falta «${key}»`);
  }
  return errors;
}

test("schemas parseiam e projeto referencia evento", () => {
  const eventoSchema = loadJson(path.join(schemaDir, "evento.schema.json"));
  const projetoSchema = loadJson(path.join(schemaDir, "projeto.schema.json"));
  assert.equal(eventoSchema.type, "object");
  assert.equal(projetoSchema.properties.evento.$ref, "evento.schema.json");
});

test("amostras evento e projeto satisfazem required do schema", () => {
  const eventoSchema = loadJson(path.join(schemaDir, "evento.schema.json"));
  const projetoSchema = loadJson(path.join(schemaDir, "projeto.schema.json"));
  const evento = loadJson(path.join(eventosDir, "conclave-2026-1.evento.json"));
  const projeto = loadJson(path.join(eventosDir, "conclave-2026-1.projeto.exemplo.json"));

  const evErrs = checkRequired(evento, eventoSchema.required, "evento");
  assert.equal(evErrs.length, 0, evErrs.join("; "));

  const projErrs = checkRequired(projeto, projetoSchema.required, "projeto");
  assert.equal(projErrs.length, 0, projErrs.join("; "));

  const nestedErrs = checkRequired(projeto.evento, eventoSchema.required, "projeto.evento");
  assert.equal(nestedErrs.length, 0, nestedErrs.join("; "));
});

test("schema de projeto descreve sorteioEsgrima opcional", () => {
  const projetoSchema = loadJson(path.join(schemaDir, "projeto.schema.json"));
  assert.ok(projetoSchema.properties.dados.properties.sorteioEsgrima);
  assert.ok(projetoSchema.$defs.sorteioEsgrimaSessao);
});

test("amostra ER define tempo de 30 s no sorteio da Esgrima", () => {
  const er = loadJson(path.join(eventosDir, "conclave-er-2026-2.evento.json"));
  assert.equal(er.sorteioEsgrima.tempoSegundos, 30);
  assert.equal(er.sorteioEsgrima.corpus, "biblia");
});

test("amostra MR 2026/2 segue o regulamento", () => {
  const eventoSchema = loadJson(path.join(schemaDir, "evento.schema.json"));
  const mr = loadJson(path.join(eventosDir, "conclave-mr-2026-2.evento.json"));
  const errs = checkRequired(mr, eventoSchema.required, "evento");
  errs.push(...checkRequired(mr.pesos, eventoSchema.properties.pesos.required, "pesos"));
  assert.equal(errs.length, 0, errs.join("; "));

  assert.equal(mr.meta.slug, "conclave-mr-2026-2");
  assert.equal(mr.pesos.conservacao_templo, -100);
  assert.equal(mr.sorteioEsgrima.tempoSegundos, 30);
  assert.deepEqual(
    mr.categorias.map((c) => c.idade),
    ["9–11", "12–14", "15–18"]
  );
  assert.equal(mr.provas.length, 15);
  const escritas = mr.provas.filter((p) => p.tipo === "escrita");
  assert.equal(escritas.length, 6);
  escritas.forEach((p) => assert.equal(p.escritaTotalQuestoes, 20));
  const pids = mr.provas.map((p) => p.id);
  assert.equal(new Set(pids).size, pids.length);
});

test("medalhas e pesos das amostras são numéricos", () => {
  const evento = loadJson(path.join(eventosDir, "conclave-2026-1.evento.json"));
  for (const k of ["ou", "pt", "br"]) {
    assert.ok(Number.isFinite(evento.medalhas[k]), `medalhas.${k}`);
  }
  for (const k of [
    "inscricao",
    "pontualidade",
    "uniforme",
    "biblia",
    "visitante",
    "animacao",
    "mau_comportamento",
  ]) {
    assert.ok(Number.isFinite(evento.pesos[k]), `pesos.${k}`);
  }
});
