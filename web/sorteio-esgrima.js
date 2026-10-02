/**
 * Sorteio de referências para Esgrima Bíblico (Debate Bíblico).
 * Funções puras (sem DOM). Não altera a classificação geral.
 */
(function () {
  "use strict";

  var CORPUS_VALIDOS = { biblia: true, at: true, nt: true, evangelhos: true };
  var TEMPO_MIN = 5;
  var TEMPO_MAX = 120;
  var TEMPO_PADRAO = 20;

  var poolCache = {};

  function getCatalogo(catalogo) {
    if (catalogo && Array.isArray(catalogo.livros)) return catalogo;
    if (typeof window !== "undefined" && window.ConclaveBibliaEstrutura) {
      return window.ConclaveBibliaEstrutura;
    }
    return { livros: [] };
  }

  function normalizeMatchTitle(titulo) {
    return String(titulo || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  /** Esgrima (Debate Bíblico), excluindo Esgrima avançada. */
  function isProvaEsgrima(titulo) {
    var t = normalizeMatchTitle(titulo);
    return t.indexOf("esgrima") !== -1 && t.indexOf("avanc") === -1;
  }

  function normalizeCorpus(corpus) {
    var c = String(corpus || "biblia").toLowerCase();
    return CORPUS_VALIDOS[c] ? c : "biblia";
  }

  function normalizeTempo(v, fallback) {
    var n = Number(v);
    if (!Number.isFinite(n)) n = fallback != null ? Number(fallback) : TEMPO_PADRAO;
    n = Math.round(n);
    if (n < TEMPO_MIN) n = TEMPO_MIN;
    if (n > TEMPO_MAX) n = TEMPO_MAX;
    return n;
  }

  function livroNoCorpus(lv, corpus) {
    if (!lv) return false;
    var c = normalizeCorpus(corpus);
    if (c === "biblia") return true;
    if (c === "at") return lv.testamento === "at";
    if (c === "nt") return lv.testamento === "nt";
    if (c === "evangelhos") return !!lv.evangelho;
    return true;
  }

  function chaveRef(item) {
    if (!item) return "";
    return item.livroId + "-" + item.capitulo + "-" + item.versiculo;
  }

  function parseChave(chave) {
    var m = /^([a-z0-9]+)-(\d+)-(\d+)$/.exec(String(chave || ""));
    if (!m) return null;
    return {
      livroId: m[1],
      capitulo: Number(m[2]),
      versiculo: Number(m[3]),
    };
  }

  function itemFromChave(catalogo, chave) {
    var parsed = parseChave(chave);
    if (!parsed) return null;
    var cat = getCatalogo(catalogo);
    var lv = cat.livroPorId ? cat.livroPorId(parsed.livroId) : null;
    if (!lv && cat.livros) {
      lv =
        cat.livros.find(function (x) {
          return x.id === parsed.livroId;
        }) || null;
    }
    if (!lv) return null;
    return {
      livroId: parsed.livroId,
      capitulo: parsed.capitulo,
      versiculo: parsed.versiculo,
      livro: lv,
    };
  }

  function isLivroUmCapitulo(lv) {
    return !!(lv && Array.isArray(lv.versiculos) && lv.versiculos.length === 1);
  }

  function formatarReferencia(itemOuChave, catalogo) {
    var item =
      itemOuChave && typeof itemOuChave === "object" && itemOuChave.livroId
        ? itemOuChave
        : itemFromChave(catalogo, itemOuChave);
    if (!item) return "";
    var lv = item.livro;
    if (!lv) {
      var resolved = itemFromChave(catalogo, chaveRef(item));
      lv = resolved && resolved.livro;
    }
    if (!lv) return chaveRef(item);
    var nome = lv.nome || lv.abrev || item.livroId;
    if (isLivroUmCapitulo(lv)) return nome + " " + item.versiculo;
    return nome + " " + item.capitulo + ":" + item.versiculo;
  }

  function montarPool(catalogo, corpus) {
    var cat = getCatalogo(catalogo);
    var c = normalizeCorpus(corpus);
    if (poolCache[c] && poolCache[c].cat === cat) return poolCache[c].pool;
    var pool = [];
    (cat.livros || []).forEach(function (lv) {
      if (!livroNoCorpus(lv, c)) return;
      var caps = lv.versiculos || [];
      for (var i = 0; i < caps.length; i++) {
        var n = Number(caps[i]);
        if (!Number.isFinite(n) || n < 1) continue;
        var cap = i + 1;
        for (var v = 1; v <= n; v++) {
          pool.push({ livroId: lv.id, capitulo: cap, versiculo: v });
        }
      }
    });
    poolCache[c] = { cat: cat, pool: pool };
    return pool;
  }

  function tamanhoPool(catalogo, corpus) {
    return montarPool(catalogo, corpus).length;
  }

  function randomInt(max, rng) {
    if (max <= 1) return 0;
    if (typeof rng === "function") {
      var r = Number(rng());
      if (!Number.isFinite(r)) r = 0;
      if (r < 0) r = 0;
      if (r >= 1) r = 0.999999;
      return Math.floor(r * max);
    }
    var cryptoObj = typeof crypto !== "undefined" ? crypto : null;
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / max) * max;
      do {
        cryptoObj.getRandomValues(buf);
      } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function embaralhar(lista, rng) {
    var arr = Array.isArray(lista) ? lista.slice() : [];
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randomInt(i + 1, rng);
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function setUsados(sessao) {
    var used = {};
    (sessao.usados || []).forEach(function (k) {
      if (k) used[k] = true;
    });
    (sessao.historico || []).forEach(function (k) {
      if (k) used[k] = true;
    });
    if (sessao.atual) used[sessao.atual] = true;
    return used;
  }

  function montarFila(catalogo, sessao, rng) {
    var pool = montarPool(catalogo, sessao.corpus);
    var used = setUsados(sessao);
    var rest = [];
    for (var i = 0; i < pool.length; i++) {
      var ch = chaveRef(pool[i]);
      if (!used[ch]) rest.push(pool[i]);
    }
    return embaralhar(rest, rng);
  }

  function uniqueKeys(keys) {
    var seen = {};
    var out = [];
    (keys || []).forEach(function (k) {
      var s = String(k || "");
      if (!s || seen[s]) return;
      if (!parseChave(s)) return;
      seen[s] = true;
      out.push(s);
    });
    return out;
  }

  function sessaoVazia(opts) {
    opts = opts || {};
    return {
      corpus: normalizeCorpus(opts.corpus),
      tempoSegundos: normalizeTempo(opts.tempoSegundos, TEMPO_PADRAO),
      usados: [],
      atual: null,
      historico: [],
    };
  }

  function normalizeSessao(raw, defaults) {
    defaults = defaults || {};
    var base = sessaoVazia(defaults);
    if (!raw || typeof raw !== "object") return base;
    var hist = uniqueKeys(raw.historico);
    var usados = uniqueKeys(raw.usados);
    usados.forEach(function (k) {
      if (hist.indexOf(k) < 0) hist.push(k);
    });
    var atual = raw.atual ? String(raw.atual) : null;
    if (atual && !parseChave(atual)) atual = null;
    if (atual && hist.indexOf(atual) < 0) hist.push(atual);
    if (atual && usados.indexOf(atual) < 0) usados.push(atual);
    if (!atual && hist.length) atual = hist[hist.length - 1];
    return {
      corpus: normalizeCorpus(raw.corpus || defaults.corpus),
      tempoSegundos: normalizeTempo(raw.tempoSegundos, defaults.tempoSegundos || TEMPO_PADRAO),
      usados: usados,
      atual: atual,
      historico: hist,
    };
  }

  function proximo(sessao, catalogo, rng) {
    var s = normalizeSessao(sessao);
    var fila = montarFila(catalogo, s, rng);
    if (!fila.length) {
      s.atual = s.historico.length ? s.historico[s.historico.length - 1] : null;
      return { sessao: s, item: null, esgotado: true };
    }
    var item = fila[0];
    var chave = chaveRef(item);
    s.atual = chave;
    if (s.usados.indexOf(chave) < 0) s.usados.push(chave);
    s.historico.push(chave);
    var cat = getCatalogo(catalogo);
    var lv = cat.livroPorId ? cat.livroPorId(item.livroId) : null;
    item.livro = lv;
    return { sessao: s, item: item, esgotado: false };
  }

  /** Empate / passagem inválida: a atual permanece usada e sorteia outra. */
  function anularAtual(sessao, catalogo, rng) {
    return proximo(sessao, catalogo, rng);
  }

  function contagem(sessao, catalogo) {
    var s = normalizeSessao(sessao);
    var total = tamanhoPool(catalogo, s.corpus);
    var usados = s.usados.length;
    if (usados > total) usados = total;
    return {
      usados: usados,
      total: total,
      restantes: Math.max(0, total - usados),
    };
  }

  function labelsCorpus() {
    return [
      { id: "biblia", label: "Bíblia toda" },
      { id: "at", label: "Antigo Testamento" },
      { id: "nt", label: "Novo Testamento" },
      { id: "evangelhos", label: "Evangelhos" },
    ];
  }

  window.ConclaveSorteioEsgrima = {
    isProvaEsgrima: isProvaEsgrima,
    normalizeCorpus: normalizeCorpus,
    normalizeTempo: normalizeTempo,
    chaveRef: chaveRef,
    parseChave: parseChave,
    itemFromChave: itemFromChave,
    isLivroUmCapitulo: isLivroUmCapitulo,
    formatarReferencia: formatarReferencia,
    montarPool: montarPool,
    tamanhoPool: tamanhoPool,
    embaralhar: embaralhar,
    sessaoVazia: sessaoVazia,
    normalizeSessao: normalizeSessao,
    proximo: proximo,
    anularAtual: anularAtual,
    contagem: contagem,
    labelsCorpus: labelsCorpus,
    TEMPO_PADRAO: TEMPO_PADRAO,
    TEMPO_MIN: TEMPO_MIN,
    TEMPO_MAX: TEMPO_MAX,
  };
})();
