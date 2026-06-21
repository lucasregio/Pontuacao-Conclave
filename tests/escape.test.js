const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Extrai a função `escapeHtml` de `web/app.js` sem precisar carregar o IIFE
// inteiro (que depende de DOM). Mantemos zero dependências, conforme AGENTS.md.
function loadEscapeHtml() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const match = source.match(/function escapeHtml\(s\) \{[\s\S]*?\n {2}\}/);
  if (!match) throw new Error("escapeHtml não encontrada em web/app.js");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(match[0] + "\nthis.escapeHtml = escapeHtml;", ctx);
  return ctx.escapeHtml;
}

const escapeHtml = loadEscapeHtml();

test("escapeHtml escapa caracteres básicos para uso em texto", () => {
  assert.equal(escapeHtml("<b>hi</b>"), "&lt;b&gt;hi&lt;/b&gt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
});

test("escapeHtml escapa aspas duplas para uso em atributos com aspas duplas", () => {
  // <input value="<valor escapado>" />
  assert.equal(escapeHtml('Igreja "Maranata"'), "Igreja &quot;Maranata&quot;");
});

test("escapeHtml escapa aspas simples (defesa contra atributos com aspas simples)", () => {
  // Antes da correção, payloads como `' onerror='alert(1)` passavam intactos.
  assert.equal(escapeHtml("a'b"), "a&#39;b");
  assert.ok(!escapeHtml("' onerror='x").includes("'"));
});

test("escapeHtml escapa crase (defesa contra template literals em onclick)", () => {
  assert.equal(escapeHtml("a`b"), "a&#96;b");
});

test("escapeHtml escapa = (defesa contra atributos sem aspas)", () => {
  // <div data-x=valor> — sem aspas no atributo, `=` permite injeção.
  assert.ok(!escapeHtml("a=b").includes("="));
});

test("escapeHtml neutraliza payload XSS clássico em nome de igreja", () => {
  const payload = '<img src=x onerror="alert(1)">';
  const safe = escapeHtml(payload);
  assert.ok(!safe.includes("<"));
  assert.ok(!safe.includes(">"));
  assert.ok(!safe.includes('"'));
  assert.equal(safe, "&lt;img src&#61;x onerror&#61;&quot;alert(1)&quot;&gt;");
});

test("escapeHtml neutraliza payload com aspas simples e atributo sem aspas", () => {
  const payload = "x' onmouseover=alert(1) y";
  const safe = escapeHtml(payload);
  assert.ok(!safe.includes("'"));
  assert.ok(!safe.includes("="));
});

test("escapeHtml é idempotente sobre números e strings vazias", () => {
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(null), "null");
});
