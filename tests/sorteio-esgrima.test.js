const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadSorteio() {
  const root = path.join(__dirname, "..", "web");
  const context = { window: {}, crypto: globalThis.crypto };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "biblia-estrutura.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "sorteio-esgrima.js"), "utf8"), context);
  return {
    BE: context.window.ConclaveBibliaEstrutura,
    SE: context.window.ConclaveSorteioEsgrima,
  };
}

const { BE, SE } = loadSorteio();

const mini = {
  livros: [
    { id: "ob", nome: "Obadias", abrev: "Ob", testamento: "at", versiculos: [3] },
    { id: "fm", nome: "Filemom", abrev: "Fm", testamento: "nt", versiculos: [2] },
    {
      id: "mt",
      nome: "Mateus",
      abrev: "Mt",
      testamento: "nt",
      evangelho: true,
      versiculos: [2, 1],
    },
  ],
  livroPorId: function (id) {
    return this.livros.find(function (l) {
      return l.id === id;
    });
  },
};

function rngSeq(values) {
  var i = 0;
  return function () {
    var v = values[i % values.length];
    i += 1;
    return v;
  };
}

test("catálogo tem 66 livros e 1189 capítulos", () => {
  assert.equal(BE.livros.length, 66);
  const caps = BE.livros.reduce(function (s, lv) {
    return s + lv.versiculos.length;
  }, 0);
  assert.equal(caps, 1189);
});

test("isProvaEsgrima reconhece Debate Bíblico e ignora avançada", () => {
  assert.equal(SE.isProvaEsgrima("Esgrima bíblica — Junior"), true);
  assert.equal(SE.isProvaEsgrima("Esgrima Bíblico (Debate Bíblico)"), true);
  assert.equal(SE.isProvaEsgrima("Esgrima avançada — Juvenil"), false);
  assert.equal(SE.isProvaEsgrima("Debate de versículos — Junior"), false);
});

test("formatarReferencia omite capítulo em livros de um só capítulo", () => {
  assert.equal(SE.formatarReferencia("ob-1-12", BE), "Obadias 12");
  assert.equal(SE.formatarReferencia("fm-1-3", BE), "Filemom 3");
  assert.equal(SE.formatarReferencia("jo-3-16", BE), "João 3:16");
});

test("montarPool respeita o corpus", () => {
  assert.equal(SE.tamanhoPool(mini, "biblia"), 8);
  assert.equal(SE.tamanhoPool(mini, "at"), 3);
  assert.equal(SE.tamanhoPool(mini, "nt"), 5);
  assert.equal(SE.tamanhoPool(mini, "evangelhos"), 3);
});

test("proximo não repete e esgota o pool", () => {
  var sessao = SE.sessaoVazia({ corpus: "biblia", tempoSegundos: 20 });
  var seen = {};
  var rng = rngSeq([0.1, 0.8, 0.3, 0.9, 0.05, 0.6, 0.4, 0.2, 0.7]);
  for (var i = 0; i < 8; i++) {
    var out = SE.proximo(sessao, mini, rng);
    assert.equal(out.esgotado, false);
    assert.ok(out.item);
    var chave = SE.chaveRef(out.item);
    assert.equal(seen[chave], undefined, "repetiu " + chave);
    seen[chave] = true;
    sessao = out.sessao;
  }
  var fim = SE.proximo(sessao, mini, rng);
  assert.equal(fim.esgotado, true);
  assert.equal(fim.item, null);
  assert.equal(Object.keys(seen).length, 8);
});

test("anularAtual não devolve a passagem ao pool", () => {
  var sessao = SE.sessaoVazia({ corpus: "at", tempoSegundos: 20 });
  var primeira = SE.proximo(sessao, mini, rngSeq([0]));
  sessao = primeira.sessao;
  var chave1 = sessao.atual;
  var segunda = SE.anularAtual(sessao, mini, rngSeq([0]));
  sessao = segunda.sessao;
  assert.notEqual(sessao.atual, chave1);
  assert.ok(sessao.usados.indexOf(chave1) >= 0);
  var terceira = SE.proximo(sessao, mini, rngSeq([0]));
  sessao = terceira.sessao;
  var esgotado = SE.proximo(sessao, mini, rngSeq([0]));
  assert.equal(esgotado.esgotado, true);
});

test("normalizeSessao aceita JSON parcial e round-trip", () => {
  var raw = {
    corpus: "evangelhos",
    tempoSegundos: 30,
    usados: ["mt-1-1"],
    atual: "mt-1-1",
    historico: ["mt-1-1"],
  };
  var n = SE.normalizeSessao(raw);
  assert.equal(n.corpus, "evangelhos");
  assert.equal(n.tempoSegundos, 30);
  const again = SE.normalizeSessao(JSON.parse(JSON.stringify(n)));
  assert.deepEqual(again, n);
});

test("sorteio no catálogo completo não altera totais do motor", () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, "..", "web", "engine.js"), "utf8");
  const ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(engineSrc, ctx);
  const E = ctx.ConclaveEngine;
  const projeto = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "eventos", "conclave-2026-1.projeto.exemplo.json"),
      "utf8"
    )
  );
  const before = E.computeTotals(projeto.evento, projeto.dados);
  projeto.dados.sorteioEsgrima = {
    "esgrima-jun": SE.sessaoVazia({ corpus: "biblia", tempoSegundos: 20 }),
  };
  const drawn = SE.proximo(projeto.dados.sorteioEsgrima["esgrima-jun"], BE, rngSeq([0.42]));
  projeto.dados.sorteioEsgrima["esgrima-jun"] = drawn.sessao;
  const after = E.computeTotals(projeto.evento, projeto.dados);
  assert.equal(JSON.stringify(Array.from(before.totais)), JSON.stringify(Array.from(after.totais)));
});
