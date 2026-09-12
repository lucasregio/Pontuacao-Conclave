const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

const DOC_PAGES = [
  "docs/usuario/manual-uso.html",
  "docs/usuario/faq.html",
  "docs/usuario/glossario.html",
  "docs/usuario/troubleshooting.html",
  "docs/usuario/atalhos-teclado.html",
  "docs/usuario/regulamento-mapeado.html",
  "docs/usuario/guia-visual.html",
  "docs/changelog.html",
  "docs/sobre.html",
];

test("páginas HTML da documentação existem e não linkam .md", () => {
  DOC_PAGES.forEach(function (rel) {
    const file = path.join(repoRoot, rel);
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /^<!doctype html>/i, rel + " deve ser HTML completo");
    assert.match(html, /class="docs-page"/, rel + " deve usar .docs-page");
    assert.doesNotMatch(html, /href="[^"]*\.md"/, rel + " não deve linkar .md");
  });

  const indexHtml = fs.readFileSync(path.join(repoRoot, "docs/index.html"), "utf8");
  assert.doesNotMatch(indexHtml, /href="[^"]*\.md"/, "docs/index.html não deve linkar .md");
  assert.match(indexHtml, /usuario\/guia-visual\.html/, "índice deve apontar o guia visual");
});

const GUIA_SHOTS = [
  "01-inicio.png",
  "02-menu-mais.png",
  "03-eventos-salvos.png",
  "04-config-geral.png",
  "05-config-igrejas.png",
  "06-config-pesos.png",
  "07-config-categorias.png",
  "08-config-provas.png",
  "09-participacao.png",
  "10-podio.png",
  "11-prova-escrita.png",
  "12-classificacao.png",
  "13-relatorios.png",
  "14-apresentacao.png",
  "15-mobile.png",
];

test("guia visual tem capturas PNG e as referencia no HTML", () => {
  const html = fs.readFileSync(path.join(repoRoot, "docs/usuario/guia-visual.html"), "utf8");
  GUIA_SHOTS.forEach(function (file) {
    const png = path.join(repoRoot, "docs/usuario/guia-visual", file);
    assert.ok(fs.existsSync(png), "falta captura " + file);
    assert.ok(fs.statSync(png).size > 1000, file + " parece vazio");
    assert.match(html, new RegExp("guia-visual/" + file.replace(".", "\\.")), file);
  });
});
