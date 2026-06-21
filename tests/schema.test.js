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
