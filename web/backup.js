/**
 * Backup automático do projeto (`window.ConclaveBackup`) — complementa o
 * `localStorage` sem backend:
 * - histórico de versões em IndexedDB (pontos de restauração por evento);
 * - cópia contínua num arquivo `.json` escolhido pelo usuário (File System
 *   Access API — Chrome/Edge). Se o arquivo estiver numa pasta sincronizada
 *   (Google Drive, OneDrive, Dropbox), vira cópia na nuvem;
 * - pedido de armazenamento persistente (`navigator.storage.persist`).
 *
 * As funções puras ficam no topo e são testadas em `tests/backup.test.js`.
 * As APIs do navegador só são tocadas quando chamadas (o módulo carrega em
 * Node sem erros). Não altera totais nem o formato do projeto.
 */
(function (global) {
  var DB_NOME = "conclave-backup";
  var DB_VERSAO = 1;
  var STORE_SNAPSHOTS = "snapshots";
  var STORE_CONFIG = "config";
  var MAX_SNAPSHOTS_POR_EVENTO = 60;
  var INTERVALO_SNAPSHOT_MS = 3 * 60 * 1000;

  /** Hash FNV-1a 32 bits em hex — só para detectar mudança de conteúdo. */
  function hashTexto(texto) {
    var s = String(texto == null ? "" : texto);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  /**
   * Snapshot automático só quando o conteúdo mudou e já passou o intervalo
   * desde o último. Sem snapshot anterior, cria imediatamente.
   */
  function deveCriarSnapshotAutomatico(ultimo, agoraMs, hash, intervaloMs) {
    if (!ultimo) return true;
    if (ultimo.hash === hash) return false;
    var intervalo = typeof intervaloMs === "number" ? intervaloMs : INTERVALO_SNAPSHOT_MS;
    return agoraMs - (Number(ultimo.criadoEmMs) || 0) >= intervalo;
  }

  /** Ids dos registros mais antigos que excedem `max` (ordem por id crescente). */
  function idsParaPodar(registros, max) {
    var lim = typeof max === "number" ? max : MAX_SNAPSHOTS_POR_EVENTO;
    var ids = (registros || [])
      .map(function (r) {
        return r && typeof r === "object" ? r.id : r;
      })
      .filter(function (id) {
        return typeof id === "number";
      })
      .sort(function (a, b) {
        return a - b;
      });
    return ids.length > lim ? ids.slice(0, ids.length - lim) : [];
  }

  function slugSeguro(slug) {
    var s = String(slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || "projeto";
  }

  function nomeArquivoBackup(slug) {
    return slugSeguro(slug) + ".backup.projeto.json";
  }

  function doisDigitos(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /** `<slug>-AAAAMMDD-HHMM.projeto.json` para baixar uma versão do histórico. */
  function nomeArquivoVersao(slug, data) {
    var d = data instanceof Date ? data : new Date(data);
    if (isNaN(d.getTime())) d = new Date(0);
    return (
      slugSeguro(slug) +
      "-" +
      d.getFullYear() +
      doisDigitos(d.getMonth() + 1) +
      doisDigitos(d.getDate()) +
      "-" +
      doisDigitos(d.getHours()) +
      doisDigitos(d.getMinutes()) +
      ".projeto.json"
    );
  }

  /** Lê o texto de um snapshot/arquivo; devolve `{ evento, dados }` ou null. */
  function parseProjetoTexto(texto) {
    try {
      var p = JSON.parse(texto);
      if (!p || typeof p !== "object") return null;
      if (!p.evento || typeof p.evento !== "object") return null;
      if (!p.dados || typeof p.dados !== "object") return null;
      return p;
    } catch (_e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // IndexedDB
  // ---------------------------------------------------------------------

  var dbPromise = null;

  function suportaHistorico() {
    return typeof global.indexedDB !== "undefined" && global.indexedDB !== null;
  }

  function abrirDb() {
    if (!suportaHistorico()) return Promise.reject(new Error("IndexedDB indisponível"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NOME, DB_VERSAO);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          var st = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "id", autoIncrement: true });
          st.createIndex("slug", "slug", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_CONFIG)) {
          db.createObjectStore(STORE_CONFIG);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        dbPromise = null;
        reject(req.error || new Error("Falha ao abrir IndexedDB"));
      };
      req.onblocked = function () {
        dbPromise = null;
        reject(new Error("IndexedDB bloqueado por outra aba"));
      };
    });
    return dbPromise;
  }

  function promessaReq(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function promessaTx(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
      tx.onabort = function () {
        reject(tx.error || new Error("Transação abortada"));
      };
    });
  }

  function semTexto(r) {
    return {
      id: r.id,
      slug: r.slug,
      criadoEm: r.criadoEm,
      criadoEmMs: r.criadoEmMs,
      motivo: r.motivo,
      hash: r.hash,
      tamanho: r.tamanho,
    };
  }

  /** Metadados do snapshot mais recente do evento (ou null). */
  function ultimoSnapshot(slug) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_SNAPSHOTS, "readonly");
        var idx = tx.objectStore(STORE_SNAPSHOTS).index("slug");
        var req = idx.openCursor(IDBKeyRange.only(String(slug)), "prev");
        req.onsuccess = function () {
          var cur = req.result;
          resolve(cur ? semTexto(cur.value) : null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  /** Metadados (sem o conteúdo) do histórico do evento, mais recentes primeiro. */
  function listarSnapshots(slug) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = [];
        var tx = db.transaction(STORE_SNAPSHOTS, "readonly");
        var idx = tx.objectStore(STORE_SNAPSHOTS).index("slug");
        var req = idx.openCursor(IDBKeyRange.only(String(slug)), "prev");
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) {
            resolve(out);
            return;
          }
          out.push(semTexto(cur.value));
          cur.continue();
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function lerSnapshot(id) {
    return abrirDb().then(function (db) {
      var tx = db.transaction(STORE_SNAPSHOTS, "readonly");
      return promessaReq(tx.objectStore(STORE_SNAPSHOTS).get(id));
    });
  }

  function podar(db, slug, max) {
    var tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    var st = tx.objectStore(STORE_SNAPSHOTS);
    return promessaReq(st.index("slug").getAllKeys(IDBKeyRange.only(String(slug)))).then(
      function (ids) {
        idsParaPodar(ids, max).forEach(function (id) {
          st.delete(id);
        });
        return promessaTx(tx);
      }
    );
  }

  /**
   * Grava um ponto de restauração. Se o conteúdo for igual ao último snapshot
   * do evento, não duplica e resolve com o registro existente.
   * Resolve com os metadados `{ id, criadoEmMs, hash, ... , criado: bool }`.
   */
  function salvarSnapshot(slug, texto, motivo, opts) {
    var o = opts || {};
    var hash = hashTexto(texto);
    return ultimoSnapshot(slug).then(function (ultimo) {
      if (ultimo && ultimo.hash === hash) {
        ultimo.criado = false;
        return ultimo;
      }
      return abrirDb().then(function (db) {
        var agora = new Date();
        var reg = {
          slug: String(slug),
          criadoEm: agora.toISOString(),
          criadoEmMs: agora.getTime(),
          motivo: String(motivo || "Automático"),
          hash: hash,
          tamanho: String(texto).length,
          texto: String(texto),
        };
        var tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
        var reqAdd = tx.objectStore(STORE_SNAPSHOTS).add(reg);
        return promessaTx(tx)
          .then(function () {
            reg.id = reqAdd.result;
            return podar(db, slug, o.max);
          })
          .then(function () {
            var meta = semTexto(reg);
            meta.criado = true;
            return meta;
          });
      });
    });
  }

  function lerConfig(chave) {
    return abrirDb().then(function (db) {
      var tx = db.transaction(STORE_CONFIG, "readonly");
      return promessaReq(tx.objectStore(STORE_CONFIG).get(chave));
    });
  }

  function gravarConfig(chave, valor) {
    return abrirDb().then(function (db) {
      var tx = db.transaction(STORE_CONFIG, "readwrite");
      var st = tx.objectStore(STORE_CONFIG);
      if (valor === undefined) st.delete(chave);
      else st.put(valor, chave);
      return promessaTx(tx);
    });
  }

  // ---------------------------------------------------------------------
  // Arquivo de backup (File System Access API)
  // ---------------------------------------------------------------------

  function chaveArquivo(slug) {
    return "arquivo:" + String(slug);
  }

  function suportaArquivo() {
    return typeof global.showSaveFilePicker === "function" && suportaHistorico();
  }

  /** Abre o seletor "Salvar como" e memoriza o arquivo para o evento. */
  function escolherArquivo(slug) {
    if (!suportaArquivo()) return Promise.reject(new Error("Navegador sem suporte"));
    return global
      .showSaveFilePicker({
        suggestedName: nomeArquivoBackup(slug),
        types: [
          {
            description: "Projeto Conclave (JSON)",
            accept: { "application/json": [".json"] },
          },
        ],
      })
      .then(function (handle) {
        return gravarConfig(chaveArquivo(slug), handle).then(function () {
          return handle;
        });
      });
  }

  function obterArquivo(slug) {
    if (!suportaArquivo()) return Promise.resolve(null);
    return lerConfig(chaveArquivo(slug)).then(function (h) {
      return h || null;
    });
  }

  function esquecerArquivo(slug) {
    return gravarConfig(chaveArquivo(slug), undefined);
  }

  /**
   * `true` se há permissão de escrita. Com `pedir`, abre o prompt do
   * navegador (exige gesto do usuário, ex.: clique).
   */
  function verificarPermissao(handle, pedir) {
    if (!handle || typeof handle.queryPermission !== "function") return Promise.resolve(false);
    var modo = { mode: "readwrite" };
    return handle.queryPermission(modo).then(function (st) {
      if (st === "granted") return true;
      if (!pedir || typeof handle.requestPermission !== "function") return false;
      return handle.requestPermission(modo).then(function (st2) {
        return st2 === "granted";
      });
    });
  }

  /** Escrita atômica: o navegador só troca o arquivo no `close()`. */
  function escreverArquivo(handle, texto) {
    return handle.createWritable().then(function (w) {
      return w
        .write(texto)
        .then(function () {
          return w.close();
        })
        .catch(function (err) {
          if (typeof w.abort === "function") {
            return w.abort().then(
              function () {
                throw err;
              },
              function () {
                throw err;
              }
            );
          }
          throw err;
        });
    });
  }

  // ---------------------------------------------------------------------
  // Armazenamento persistente
  // ---------------------------------------------------------------------

  function storageApi() {
    var nav = global.navigator;
    return nav && nav.storage ? nav.storage : null;
  }

  /** Resolve `true`/`false`, ou `null` se o navegador não informa. */
  function armazenamentoPersistente() {
    var s = storageApi();
    if (!s || typeof s.persisted !== "function") return Promise.resolve(null);
    return s.persisted().catch(function () {
      return null;
    });
  }

  function pedirArmazenamentoPersistente() {
    var s = storageApi();
    if (!s || typeof s.persist !== "function") return Promise.resolve(null);
    return s.persist().catch(function () {
      return null;
    });
  }

  global.ConclaveBackup = {
    MAX_SNAPSHOTS_POR_EVENTO: MAX_SNAPSHOTS_POR_EVENTO,
    INTERVALO_SNAPSHOT_MS: INTERVALO_SNAPSHOT_MS,
    hashTexto: hashTexto,
    deveCriarSnapshotAutomatico: deveCriarSnapshotAutomatico,
    idsParaPodar: idsParaPodar,
    nomeArquivoBackup: nomeArquivoBackup,
    nomeArquivoVersao: nomeArquivoVersao,
    parseProjetoTexto: parseProjetoTexto,
    suportaHistorico: suportaHistorico,
    suportaArquivo: suportaArquivo,
    salvarSnapshot: salvarSnapshot,
    ultimoSnapshot: ultimoSnapshot,
    listarSnapshots: listarSnapshots,
    lerSnapshot: lerSnapshot,
    escolherArquivo: escolherArquivo,
    obterArquivo: obterArquivo,
    esquecerArquivo: esquecerArquivo,
    verificarPermissao: verificarPermissao,
    escreverArquivo: escreverArquivo,
    armazenamentoPersistente: armazenamentoPersistente,
    pedirArmazenamentoPersistente: pedirArmazenamentoPersistente,
  };
})(typeof window !== "undefined" ? window : globalThis);
