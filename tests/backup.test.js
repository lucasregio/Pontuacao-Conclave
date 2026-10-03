const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackup(extra) {
  const code = fs.readFileSync(path.join(__dirname, "..", "web", "backup.js"), "utf8");
  const context = Object.assign({}, extra || {});
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.ConclaveBackup;
}

const BK = loadBackup();

test("hashTexto é determinístico e muda com o conteúdo", () => {
  assert.equal(BK.hashTexto("abc"), BK.hashTexto("abc"));
  assert.notEqual(BK.hashTexto("abc"), BK.hashTexto("abd"));
  assert.match(BK.hashTexto(""), /^[0-9a-f]{8}$/);
  assert.equal(BK.hashTexto(null), BK.hashTexto(""));
});

test("deveCriarSnapshotAutomatico respeita conteúdo e intervalo", () => {
  const agora = 10 * 60 * 1000;
  assert.equal(BK.deveCriarSnapshotAutomatico(null, agora, "h1"), true);
  const ultimo = { hash: "h1", criadoEmMs: agora - 60 * 1000 };
  assert.equal(BK.deveCriarSnapshotAutomatico(ultimo, agora, "h1"), false, "sem mudança");
  assert.equal(BK.deveCriarSnapshotAutomatico(ultimo, agora, "h2"), false, "antes do intervalo");
  const antigo = { hash: "h1", criadoEmMs: agora - BK.INTERVALO_SNAPSHOT_MS };
  assert.equal(BK.deveCriarSnapshotAutomatico(antigo, agora, "h2"), true);
  assert.equal(BK.deveCriarSnapshotAutomatico(antigo, agora, "h1"), false, "igual mesmo velho");
  assert.equal(BK.deveCriarSnapshotAutomatico(ultimo, agora, "h2", 1000), true);
});

test("idsParaPodar remove só os mais antigos acima do limite", () => {
  const podar = (...args) => Array.from(BK.idsParaPodar(...args));
  assert.deepEqual(podar([3, 1, 2], 5), []);
  assert.deepEqual(podar([5, 1, 4, 2, 3], 3), [1, 2]);
  assert.deepEqual(podar([{ id: 7 }, { id: 9 }, { id: 8 }], 1), [7, 8]);
  assert.deepEqual(podar(null, 3), []);
  const muitos = Array.from({ length: BK.MAX_SNAPSHOTS_POR_EVENTO + 2 }, (_, i) => i + 1);
  assert.deepEqual(podar(muitos), [1, 2]);
});

test("nomes de arquivo são seguros e importáveis como projeto", () => {
  assert.equal(
    BK.nomeArquivoBackup("conclave-mr-2026-2"),
    "conclave-mr-2026-2.backup.projeto.json"
  );
  assert.equal(BK.nomeArquivoBackup("Evento / Teste"), "evento-teste.backup.projeto.json");
  assert.equal(BK.nomeArquivoBackup(""), "projeto.backup.projeto.json");
  const d = new Date(2026, 9, 2, 9, 5);
  assert.equal(BK.nomeArquivoVersao("mr", d), "mr-20261002-0905.projeto.json");
});

test("parseProjetoTexto aceita só projetos com evento e dados", () => {
  const ok = BK.parseProjetoTexto(JSON.stringify({ evento: { meta: {} }, dados: {} }));
  assert.ok(ok && ok.evento && ok.dados);
  assert.equal(BK.parseProjetoTexto("{"), null);
  assert.equal(BK.parseProjetoTexto(JSON.stringify({ evento: {} })), null);
  assert.equal(BK.parseProjetoTexto("null"), null);
});

test("sem IndexedDB/File System Access o módulo degrada sem erro", async () => {
  assert.equal(BK.suportaHistorico(), false);
  assert.equal(BK.suportaArquivo(), false);
  assert.equal(await BK.obterArquivo("x"), null);
  await assert.rejects(BK.listarSnapshots("x"));
  assert.equal(await BK.armazenamentoPersistente(), null);
  assert.equal(await BK.pedirArmazenamentoPersistente(), null);
});

test("verificarPermissao só pede autorização quando solicitado", async () => {
  let pedidos = 0;
  const handle = {
    queryPermission: async () => "prompt",
    requestPermission: async () => {
      pedidos++;
      return "granted";
    },
  };
  assert.equal(await BK.verificarPermissao(handle, false), false);
  assert.equal(pedidos, 0);
  assert.equal(await BK.verificarPermissao(handle, true), true);
  assert.equal(pedidos, 1);
  assert.equal(await BK.verificarPermissao({ queryPermission: async () => "granted" }), true);
  assert.equal(await BK.verificarPermissao(null, true), false);
});

test("escreverArquivo grava e fecha; em falha aborta e propaga o erro", async () => {
  const log = [];
  const handleOk = {
    createWritable: async () => ({
      write: async (t) => log.push("write:" + t),
      close: async () => log.push("close"),
      abort: async () => log.push("abort"),
    }),
  };
  await BK.escreverArquivo(handleOk, "{}");
  assert.deepEqual(log, ["write:{}", "close"]);

  log.length = 0;
  const handleFalha = {
    createWritable: async () => ({
      write: async () => {
        throw new Error("disco cheio");
      },
      close: async () => log.push("close"),
      abort: async () => log.push("abort"),
    }),
  };
  await assert.rejects(BK.escreverArquivo(handleFalha, "{}"), /disco cheio/);
  assert.deepEqual(log, ["abort"]);
});

test("armazenamento persistente usa navigator.storage quando existe", async () => {
  const BK2 = loadBackup({
    navigator: { storage: { persisted: async () => false, persist: async () => true } },
  });
  assert.equal(await BK2.armazenamentoPersistente(), false);
  assert.equal(await BK2.pedirArmazenamentoPersistente(), true);
});
