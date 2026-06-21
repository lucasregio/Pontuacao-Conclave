const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const src = path.join(repoRoot, "eventos", "conclave-2026-1.evento.json");
const embedded = path.join(repoRoot, "eventos", "conclave-2026-1.evento.embedded.js");
const buildScript = path.join(repoRoot, "scripts", "build-embedded.mjs");

function parseEmbeddedEvento(code) {
  const marker = "window.ConclaveDefaultEvento = ";
  const start = code.indexOf(marker);
  assert.ok(start >= 0, "marker ConclaveDefaultEvento ausente");
  const jsonStart = start + marker.length;
  const jsonEnd = code.lastIndexOf(";");
  assert.ok(jsonEnd > jsonStart, "terminador ; ausente");
  return JSON.parse(code.slice(jsonStart, jsonEnd));
}

test("embedded.js coincide com evento.json fonte", () => {
  const fromJson = JSON.parse(fs.readFileSync(src, "utf8"));
  const fromEmbedded = parseEmbeddedEvento(fs.readFileSync(embedded, "utf8"));
  assert.deepEqual(fromEmbedded, fromJson);
});

test("build:embedded regenera arquivo idêntico ao conteúdo canônico", () => {
  execFileSync(process.execPath, [buildScript], { cwd: repoRoot, stdio: "pipe" });
  const fromJson = JSON.parse(fs.readFileSync(src, "utf8"));
  const fromEmbedded = parseEmbeddedEvento(fs.readFileSync(embedded, "utf8"));
  assert.deepEqual(fromEmbedded, fromJson);
});
