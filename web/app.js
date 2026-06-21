/**
 * Pontuação Conclave — UI (carrega evento.json, edita dados, persiste localmente).
 */
(function () {
  var E = window.ConclaveEngine;
  var state = {
    evento: null,
    dados: null,
    tab: "dashboard",
    saveTimer: null,
    errors: [],
    lastSaved: null,
    /** true → uma falha de localStorage já foi sinalizada nesta sessão (evita
     *  repetir feedback a cada keystroke). */
    persistFailed: false,
    autoLoadFailed: false,
    derivedRefreshTimer: null,
    derivedRefreshRaf: null,
    computeDirty: true,
    cachedTotals: null,
    feedbackTimer: null,
    confirmOnAccept: null,
    confirmOnCancel: null,
    confirmLastFocus: null,
    eventosModalLastFocus: null,
    /** { [provaId]: true } — true = seção colapsada */
    podiumCollapsed: {},
    /** { geral | categorias | provas: true } — true = colapsada */
    configSectionCollapsed: {},
    /** Relatórios: igreja | prova — true = seção colapsada */
    relatorioSectionCollapsed: {},
    /** Relatório «Por prova»: colapso por prova (igual ideia ao pódio) */
    relatorioPodiumCollapsed: {},
    /** true → o "Relatório oficial" já foi gerado nesta sessão (mantém-se
     *  visível em re-renders de Relatórios; resetado ao trocar de evento ou
     *  limpar dados). */
    relatorioOficialGerado: false,
  };

  function $(sel) {
    return document.querySelector(sel);
  }

  function markComputeDirty() {
    state.computeDirty = true;
  }

  function storageKey(slug) {
    return "conclave-projeto-" + slug;
  }

  function setHeader() {
    var ev = state.evento;
    // Suporta o layout novo (#evento-title/#evento-sub) e o legado (.app-header h1).
    var h = $("#evento-title") || $(".app-header h1");
    var sub = $("#evento-sub") || $(".app-header p.sub");
    if (!ev) {
      if (h) h.textContent = "Pontuação Conclave";
      if (sub)
        sub.textContent =
          "Carregue um arquivo «.evento.json» (Configuração do evento) ou um projeto completo.";
      renderKpiStrip();
      updateRegulamentoButton();
      return;
    }
    if (h) h.textContent = ev.meta.nome || "Evento sem nome";
    var parts = [];
    if (ev.meta.data) parts.push(ev.meta.data);
    if (ev.meta.horarioInicio || ev.meta.horarioEncerramento) {
      var hs = [];
      if (ev.meta.horarioInicio) hs.push(ev.meta.horarioInicio);
      if (ev.meta.horarioEncerramento) hs.push(ev.meta.horarioEncerramento);
      parts.push(hs.join(" — "));
    }
    if (sub) sub.textContent = parts.join(" · ");
    renderKpiStrip();
    updateRegulamentoButton();
  }

  /** Popula `#kpi-strip` na topbar com chips compactos (igrejas, provas,
   *  % pódios e líder atual). Vazio quando não há evento — o CSS esconde
   *  o container automaticamente via `.kpi-strip:not(:empty)`. */
  function renderKpiStrip() {
    var strip = $("#kpi-strip");
    if (!strip) return;
    strip.innerHTML = "";
    if (!state.evento) return;
    var k = computeKpis();
    if (!k) return;

    function chip(label, value, tone) {
      var el = document.createElement("span");
      el.className = "kpi-chip";
      if (tone) el.setAttribute("data-tone", tone);
      el.innerHTML =
        '<span class="kpi-chip-label">' +
        escapeHtml(label) +
        "</span>" +
        '<span class="kpi-chip-value">' +
        value +
        "</span>";
      return el;
    }

    strip.appendChild(chip("Igrejas", k.igrejas));
    strip.appendChild(chip("Provas", k.provas));
    var tonePodio = k.podiosPct >= 100 ? "success" : k.podiosPct >= 50 ? "warn" : null;
    strip.appendChild(chip("Pódios", k.podiosPct + "%", tonePodio));
  }

  /**
   * Captura uma "etiqueta" do elemento focado e tenta restaurar o foco depois
   * que `fn` rodar. Útil para painéis que se redesenham via `innerHTML = ""`.
   * Procura, em ordem: `id`, `data-focus-id`, `data-cfg`, par
   * `data-row-id`+`data-field`, `name`. Mantém posição do cursor em inputs
   * de texto. Falha silenciosamente se o elemento sumiu de fato.
   */
  function withFocusPreserved(fn) {
    var active = typeof document !== "undefined" ? document.activeElement : null;
    var marker = null;
    if (active && active !== document.body && active.tagName !== "BODY") {
      var attr = function (name) {
        return active.getAttribute && active.getAttribute(name);
      };
      marker = {
        id: active.id || null,
        focusId: attr("data-focus-id"),
        cfg: attr("data-cfg"),
        rowId: attr("data-row-id"),
        field: attr("data-field"),
        name: attr("name"),
        selStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
        selEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
      };
    }
    try {
      fn();
    } finally {
      if (!marker) return;
      var quote = function (v) {
        return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"');
      };
      var target = null;
      if (marker.id) target = document.getElementById(marker.id);
      if (!target && marker.focusId)
        target = document.querySelector('[data-focus-id="' + quote(marker.focusId) + '"]');
      if (!target && marker.cfg)
        target = document.querySelector('[data-cfg="' + quote(marker.cfg) + '"]');
      if (!target && marker.rowId && marker.field)
        target = document.querySelector(
          '[data-row-id="' + quote(marker.rowId) + '"][data-field="' + quote(marker.field) + '"]'
        );
      if (!target && marker.name)
        target = document.querySelector('[name="' + quote(marker.name) + '"]');
      if (target && typeof target.focus === "function") {
        try {
          target.focus({ preventScroll: true });
          if (
            typeof target.setSelectionRange === "function" &&
            marker.selStart != null &&
            (target.type === "text" ||
              target.type === "search" ||
              target.type === "url" ||
              target.type === "tel" ||
              target.type === "password" ||
              target.tagName === "TEXTAREA")
          ) {
            target.setSelectionRange(
              marker.selStart,
              marker.selEnd != null ? marker.selEnd : marker.selStart
            );
          }
        } catch (_e) {
          // ignore — foco é "best effort"
        }
      }
    }
  }

  function persistProjeto() {
    if (!state.evento || !state.dados) return false;
    try {
      var key = storageKey(state.evento.meta.slug);
      var projeto = { evento: state.evento, dados: state.dados };
      localStorage.setItem(key, JSON.stringify(projeto));
      state.lastSaved = new Date();
      state.persistFailed = false;
      var pill = $("#status-pill");
      if (pill) pill.textContent = "Salvo localmente";
      return true;
    } catch (err) {
      console.warn(err);
      // Reportar uma vez por falha (modo privado, cota cheia, etc.) — sem
      // poluir o feedback a cada keystroke.
      if (!state.persistFailed) {
        state.persistFailed = true;
        showFeedback(
          "Não foi possível salvar localmente neste navegador. Use «Exportar projeto» para preservar os dados.",
          "warn"
        );
      }
      var pill = $("#status-pill");
      if (pill) pill.textContent = "Salvamento local indisponível";
      return false;
    }
  }

  function scheduleSave() {
    if (!state.evento || !state.dados) return;
    markComputeDirty();
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(persistProjeto, 450);
  }

  /** Garante que qualquer save pendente seja persistido AGORA — chamado antes
   *  de trocar evento, evitando que o debounce grave dados do evento antigo
   *  na chave do novo. */
  function flushScheduledSave() {
    if (state.saveTimer != null) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
      persistProjeto();
    }
  }

  function loadFromStorage(slug) {
    try {
      var raw = localStorage.getItem(storageKey(slug));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }

  /** Prefixo único do app no localStorage. Usado para enumerar projetos
   *  salvos sem confundir com outras chaves do mesmo origem. */
  var STORAGE_PREFIX = "conclave-projeto-";

  /**
   * Lista os projetos salvos no `localStorage`. Retorna sempre um array (mesmo
   * em modo privado / quota cheia). Cada item resume o projeto sem carregar
   * o `dados` inteiro repetidas vezes — usamos `meta.nome`/`meta.data` quando
   * disponíveis.
   */
  function listProjetosSalvos() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(STORAGE_PREFIX) !== 0) continue;
        var slug = k.slice(STORAGE_PREFIX.length);
        var raw = localStorage.getItem(k);
        if (!raw) continue;
        var parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (_e) {
          continue;
        }
        var meta = (parsed && parsed.evento && parsed.evento.meta) || {};
        out.push({
          slug: slug,
          nome: meta.nome || slug,
          data: meta.data || "",
          schemaVersion: meta.schemaVersion || 1,
          // Tamanho aproximado em bytes do JSON serializado — útil para o
          // usuário entender quanta cota está sendo usada.
          tamanhoBytes: raw.length,
        });
      }
    } catch (_e) {
      // ignore — localStorage pode estar indisponível
    }
    out.sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome), "pt", { sensitivity: "base" });
    });
    return out;
  }

  function removerProjetoSalvo(slug) {
    try {
      localStorage.removeItem(storageKey(slug));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function validate() {
    state.errors = [];
    if (!state.evento) return;
    var errs = E.validateEventoMinimal(state.evento);
    state.errors = errs.slice();
  }

  function compute() {
    if (!state.evento || !state.dados) return null;
    if (!state.computeDirty && state.cachedTotals) return state.cachedTotals;
    state.cachedTotals = E.computeTotals(state.evento, state.dados);
    state.computeDirty = false;
    return state.cachedTotals;
  }

  function igrejaNome(id) {
    var g = (state.evento.igrejas || []).find(function (x) {
      return x.id === id;
    });
    return g ? g.nome : id || "—";
  }

  /** Nome exato (após trim, sem diferenciar maiúsculas) → id; duplicados: primeira ocorrência */
  function resolveIgrejaIdFromNome(nome) {
    var t = (nome || "").trim();
    if (!t) return null;
    var lower = t.toLowerCase();
    var g = (state.evento.igrejas || []).find(function (x) {
      return (
        String(x.nome || "")
          .trim()
          .toLowerCase() === lower
      );
    });
    return g ? g.id : null;
  }

  function sortedProvas() {
    return (state.evento.provas || []).slice().sort(function (a, b) {
      return (a.ordem || 0) - (b.ordem || 0);
    });
  }

  /** Ordem e rótulos das provas por modalidade (oral vs escrita). */
  var PROVA_TIPO_ORDER = ["oral", "escrita"];
  var PROVA_TIPO_LABELS = { oral: "Prova oral", escrita: "Prova escrita" };

  function labelProvaTipo(tipo) {
    return PROVA_TIPO_LABELS[tipo] || PROVA_TIPO_LABELS.oral;
  }

  /** Infere modalidade a partir do título quando `tipo` está ausente (legado). */
  function inferProvaTipo(p) {
    var t = String((p && p.titulo) || "")
      .trim()
      .toLowerCase();
    if (/\bescrita\b/.test(t)) return "escrita";
    return "oral";
  }

  function normalizeProvaTipos(ev) {
    (ev.provas || []).forEach(function (p) {
      if (p.tipo !== "oral" && p.tipo !== "escrita") p.tipo = inferProvaTipo(p);
    });
  }

  function sortedCategorias() {
    return (state.evento.categorias || []).slice().sort(function (a, b) {
      return (a.ordem || 0) - (b.ordem || 0);
    });
  }

  function resequenceCategoriasOrdem(tbody) {
    tbody.querySelectorAll("tr[data-cat-id]").forEach(function (tr, idx) {
      var id = tr.getAttribute("data-cat-id");
      var c = state.evento.categorias.find(function (x) {
        return x.id === id;
      });
      if (c) c.ordem = idx;
    });
  }

  function resequenceProvasOrdem(tbody) {
    tbody.querySelectorAll("tr[data-prova-id]").forEach(function (tr, idx) {
      var id = tr.getAttribute("data-prova-id");
      var p = state.evento.provas.find(function (x) {
        return x.id === id;
      });
      if (p) p.ordem = idx;
    });
  }

  function getDragAfterElement(container, y, rowSelector) {
    var rows = [].slice.call(container.querySelectorAll(rowSelector + ":not([data-dragging])"));
    return rows.reduce(
      function (closest, child) {
        var box = child.getBoundingClientRect();
        var offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }

  function isProvaCollapsed(provaId) {
    return !!state.podiumCollapsed[provaId];
  }

  /** Ouro, prata e bronze com igreja escolhida */
  function provaPodiumCompleto(provaId) {
    var pl = (state.dados && state.dados.podium && state.dados.podium[provaId]) || {};
    return ["ou", "pt", "br"].every(function (k) {
      var e = pl[k] || {};
      return !!e.igrejaId;
    });
  }

  var CATEGORIA_OUTROS = "__outros__";

  function slugify(s) {
    var t = String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return t || "item";
  }

  function categoriaKeyLegacy(p) {
    var c = p.categoria != null ? String(p.categoria).trim() : "";
    return c ? c : CATEGORIA_OUTROS;
  }

  /** Chave de agrupamento: preferir categoriaId quando o evento tem categorias. */
  function categoriaKey(p) {
    if (
      state.evento &&
      state.evento.categorias &&
      state.evento.categorias.length &&
      p.categoriaId
    ) {
      return p.categoriaId;
    }
    return categoriaKeyLegacy(p);
  }

  function labelCategoria(key) {
    if (state.evento && state.evento.categorias) {
      var c = state.evento.categorias.find(function (x) {
        return x.id === key;
      });
      if (c) {
        var idade = c.idade != null && String(c.idade).trim() ? String(c.idade).trim() : "";
        return idade ? c.nome + " (" + idade + ")" : c.nome;
      }
    }
    return key === CATEGORIA_OUTROS ? "Sem categoria" : key;
  }

  /** Nome da prova na interface: «Título - Categoria» (ex.: Esgrima Bíblico - Junior). */
  function nomeProvaExibicao(p) {
    var t = (p.titulo != null ? String(p.titulo) : "").trim();
    var cat = labelCategoria(categoriaKey(p));
    if (!t) return cat;
    return t + " - " + cat;
  }

  /** Título do card de prova no pódio (coluna já exibe categoria e idade). */
  function tituloProvaCard(p) {
    var t = (p.titulo != null ? String(p.titulo) : "").trim();
    if (t) return t;
    if (state.evento && state.evento.categorias) {
      var c = state.evento.categorias.find(function (x) {
        return x.id === categoriaKey(p);
      });
      if (c) return c.nome;
    }
    return labelCategoria(categoriaKey(p));
  }

  function syncCategoriaNomes(ev) {
    var map = {};
    (ev.categorias || []).forEach(function (c) {
      map[c.id] = c.nome;
    });
    (ev.provas || []).forEach(function (p) {
      if (p.categoriaId && map[p.categoriaId]) p.categoria = map[p.categoriaId];
    });
  }

  /**
   * Versão atual da estrutura de evento. Bumpe junto com `migrateEvento` ao
   * mudar o shape de modo incompatível. Migrações são SEMPRE aditivas em
   * memória — nunca derrubamos um campo desconhecido (mantém compatibilidade
   * para frente quando um JSON gravado em versão futura é aberto aqui).
   */
  var CURRENT_SCHEMA_VERSION = 2;

  /**
   * Migra um `evento` em memória para a versão atual. Não dispara render
   * nem persistência — quem chama deve cuidar disso. As regras seguem o
   * princípio de só renomear/copiar; nada é apagado.
   *
   * v1 → v2 (jun/2026):
   *   - Garante `meta.schemaVersion`.
   *   - Garante `meta.tema` (objeto vazio se ausente) — campo legado opcional.
   *
   * Mantém `participacao[*].embaixadas` como fallback legado (já lido pelo
   * engine como `pontuacao_extra`); migrações futuras podem promover esse
   * campo.
   */
  function migrateEvento(ev) {
    if (!ev || typeof ev !== "object") return ev;
    if (!ev.meta || typeof ev.meta !== "object") ev.meta = {};
    var v = Number(ev.meta.schemaVersion);
    if (!Number.isFinite(v) || v < 1) v = 1;
    if (v < 2) {
      if (!ev.meta.tema || typeof ev.meta.tema !== "object") ev.meta.tema = {};
      v = 2;
    }
    ev.meta.schemaVersion = Math.max(v, CURRENT_SCHEMA_VERSION);
    return ev;
  }

  function normalizeEvento(ev) {
    if (!ev.meta) ev.meta = {};
    if (!ev.meta.slug || String(ev.meta.slug).trim() === "") {
      ev.meta.slug = slugify(ev.meta.nome || "evento");
    }
    migrateEvento(ev);
    if (!ev.igrejas) ev.igrejas = [];
    if (!ev.pesos) ev.pesos = {};
    var pe = ev.pesos;
    [
      ["inscricao", 100],
      ["pontualidade", 200],
      ["uniforme", 50],
      ["biblia", 50],
      ["visitante", 10],
      ["animacao", 150],
      ["mau_comportamento", -150],
    ].forEach(function (x) {
      if (pe[x[0]] == null || pe[x[0]] === "") pe[x[0]] = x[1];
    });
    if (ev.categorias && ev.categorias.length) {
      ev.categorias.forEach(function (c) {
        if (c.idade == null) c.idade = "";
      });
      (ev.provas || []).forEach(function (p) {
        if (!p.categoriaId && p.categoria) {
          var nome = String(p.categoria).trim();
          var m = ev.categorias.find(function (c) {
            return c.nome.trim() === nome;
          });
          if (m) p.categoriaId = m.id;
        }
      });
      (ev.provas || []).forEach(function (p) {
        if (!p.categoriaId) {
          var nome = (p.categoria && String(p.categoria).trim()) || "Sem categoria";
          var m = ev.categorias.find(function (c) {
            return c.nome.trim() === nome;
          });
          p.categoriaId = m ? m.id : ev.categorias[0].id;
        }
      });
      syncCategoriaNomes(ev);
      normalizeProvaTipos(ev);
      return;
    }
    var seen = {};
    var list = [];
    var ord = 0;
    (ev.provas || [])
      .slice()
      .sort(function (a, b) {
        return (a.ordem || 0) - (b.ordem || 0);
      })
      .forEach(function (p) {
        var nome = (p.categoria && String(p.categoria).trim()) || "Sem categoria";
        var id;
        if (!seen[nome]) {
          id = "cat-" + slugify(nome);
          var j = 0;
          while (
            list.some(function (x) {
              return x.id === id;
            })
          ) {
            j += 1;
            id = "cat-" + slugify(nome) + "-" + j;
          }
          seen[nome] = id;
          list.push({ id: id, nome: nome, ordem: ord++, idade: "" });
        }
        p.categoriaId = seen[nome];
      });
    ev.categorias = list;
    syncCategoriaNomes(ev);
    normalizeProvaTipos(ev);
  }

  function defaultParticipacaoIgreja() {
    return {
      inscricao: true,
      pontualidade: true,
      mr_total: 0,
      mr_camisa: 0,
      mr_biblia: 0,
      visitantes: 0,
      animacao: false,
      mau_comportamento: false,
      pontuacao_extra: 0,
    };
  }

  /** Mantém participação e referências no pódio alinhadas à lista de igrejas do evento */
  function syncIgrejasIntoDados() {
    if (!state.evento || !state.dados) return;
    var idSet = {};
    state.evento.igrejas.forEach(function (g) {
      idSet[g.id] = true;
    });
    Object.keys(state.dados.participacao).forEach(function (gid) {
      if (!idSet[gid]) delete state.dados.participacao[gid];
    });
    state.evento.igrejas.forEach(function (g) {
      if (!state.dados.participacao[g.id]) {
        state.dados.participacao[g.id] = defaultParticipacaoIgreja();
      }
    });
    Object.keys(state.dados.podium).forEach(function (pid) {
      var pl = state.dados.podium[pid];
      if (!pl) return;
      ["ou", "pt", "br"].forEach(function (k) {
        if (pl[k] && pl[k].igrejaId && !idSet[pl[k].igrejaId]) {
          pl[k].igrejaId = null;
          delete pl[k].nomeLivre;
        }
      });
    });
  }

  function syncDadosWithEvento() {
    if (!state.evento || !state.dados) return;
    var ids = state.evento.provas.map(function (p) {
      return p.id;
    });
    var set = {};
    ids.forEach(function (id) {
      set[id] = true;
    });
    Object.keys(state.dados.podium).forEach(function (pid) {
      if (!set[pid]) delete state.dados.podium[pid];
    });
    ids.forEach(function (pid) {
      if (!state.dados.podium[pid]) {
        state.dados.podium[pid] = {
          ou: { igrejaId: null, competidor: "" },
          pt: { igrejaId: null, competidor: "" },
          br: { igrejaId: null, competidor: "" },
        };
      }
    });
    syncIgrejasIntoDados();
  }

  function ensureUniqueIgrejaId(ev, baseId) {
    var id = baseId || "igreja";
    var n = 0;
    var cand = id;
    while (
      ev.igrejas.some(function (g) {
        return g.id === cand;
      })
    ) {
      n += 1;
      cand = id + "-" + n;
    }
    return cand;
  }

  function ensureUniqueProvaId(ev, baseId) {
    var id = baseId || "prova";
    var n = 0;
    var cand = id;
    while (
      ev.provas.some(function (p) {
        return p.id === cand;
      })
    ) {
      n += 1;
      cand = id + "-" + n;
    }
    return cand;
  }

  function resolveAssetUrl(path) {
    var p = String(path || "").trim();
    if (!p) return "";
    if (p.indexOf("http://") === 0 || p.indexOf("https://") === 0 || p.indexOf("//") === 0)
      return p;
    return encodeURI(p);
  }

  /** Valor mostrado no campo (sem o prefixo static/ quando for ficheiro local) */
  function regulamentoDisplayFromStored(stored) {
    var s = String(stored || "").trim();
    if (!s) return "";
    if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0 || s.indexOf("//") === 0) {
      return s;
    }
    if (s.indexOf("static/") === 0) {
      return s.slice(7);
    }
    return s;
  }

  /** Monta meta.regulamentoUrl a partir do texto do utilizador */
  function regulamentoUrlFromInput(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0 || s.indexOf("//") === 0) {
      return s;
    }
    var path = s.replace(/^\/+/g, "").replace(/\\/g, "/");
    if (path.indexOf("static/") === 0) {
      return path;
    }
    return "static/" + path;
  }

  function updateRegulamentoButton() {
    var btn = $("#btn-regulamento");
    if (!btn) return;
    if (!state.evento || !state.evento.meta) {
      btn.disabled = true;
      btn.title = "Carregue um evento";
      return;
    }
    var u = state.evento.meta.regulamentoUrl;
    var ok = !!(u && String(u).trim());
    btn.disabled = !ok;
    btn.title = ok
      ? "Abrir regulamento (PDF) numa nova aba"
      : "Configure o link ou caminho do PDF em Configuração → Geral";
  }

  /** Ordem das colunas: ordem em categorias[]; provas sem lista caem no fim (legado). */
  function orderedCategoryKeys() {
    var ev = state.evento;
    if (!ev) return [];
    var inUse = {};
    sortedProvas().forEach(function (p) {
      inUse[categoriaKey(p)] = true;
    });
    if (ev.categorias && ev.categorias.length) {
      var keys = [];
      ev.categorias
        .slice()
        .sort(function (a, b) {
          return (a.ordem || 0) - (b.ordem || 0);
        })
        .forEach(function (c) {
          if (inUse[c.id]) keys.push(c.id);
        });
      sortedProvas().forEach(function (p) {
        var k = categoriaKey(p);
        if (inUse[k] && keys.indexOf(k) === -1) keys.push(k);
      });
      return keys;
    }
    var seen = {};
    var order = [];
    sortedProvas().forEach(function (p) {
      var k = categoriaKeyLegacy(p);
      if (!seen[k]) {
        seen[k] = true;
        order.push(k);
      }
    });
    return order;
  }

  function groupProvasByCategoria(filterTipo) {
    var order = orderedCategoryKeys();
    var groups = {};
    order.forEach(function (k) {
      groups[k] = [];
    });
    sortedProvas().forEach(function (p) {
      if (filterTipo && p.tipo !== filterTipo) return;
      var k = categoriaKey(p);
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(p);
    });
    return { order: order, groups: groups };
  }

  /** Grid de colunas por categoria (Junior, Adolescente, …) dentro de uma modalidade. */
  function buildPodiumCategoriaGrid(grouped, opts) {
    opts = opts || {};
    var buildCard = opts.buildCard || buildProvaCardPodio;
    var catActionAttr = opts.catActionAttr || "data-cat-action";

    var hasAny = grouped.order.some(function (k) {
      return (grouped.groups[k] || []).length;
    });
    if (!hasAny) return null;

    var nCols = grouped.order.length;
    var wrap = document.createElement("div");
    wrap.className = "podium-by-categoria";
    wrap.style.setProperty("--podium-cols", String(Math.max(1, nCols)));

    grouped.order.forEach(function (catKey) {
      var list = grouped.groups[catKey] || [];
      if (!list.length) return;

      var col = document.createElement("section");
      col.className = "podium-col";
      col.setAttribute("aria-label", labelCategoria(catKey));

      var colTitle = document.createElement("h3");
      colTitle.className = "podium-col-title";
      colTitle.textContent = labelCategoria(catKey);
      col.appendChild(colTitle);

      var provaIdsInCol = list.map(function (p) {
        return p.id;
      });
      var idsAttr = provaIdsInCol.join(",");

      var colTools = document.createElement("div");
      colTools.className = "podium-col-tools";
      var btnCollapseAll = document.createElement("button");
      btnCollapseAll.type = "button";
      btnCollapseAll.className = "podium-col-btn";
      btnCollapseAll.setAttribute(catActionAttr, "collapse");
      btnCollapseAll.setAttribute("data-prova-ids", idsAttr);
      btnCollapseAll.textContent = "Recolher todas";
      var btnExpandAll = document.createElement("button");
      btnExpandAll.type = "button";
      btnExpandAll.className = "podium-col-btn";
      btnExpandAll.setAttribute(catActionAttr, "expand");
      btnExpandAll.setAttribute("data-prova-ids", idsAttr);
      btnExpandAll.textContent = "Expandir todas";
      colTools.appendChild(btnCollapseAll);
      colTools.appendChild(btnExpandAll);
      col.appendChild(colTools);

      var stack = document.createElement("div");
      stack.className = "podium-col-stack";
      list.forEach(function (p) {
        stack.appendChild(buildCard(p));
      });
      col.appendChild(stack);
      wrap.appendChild(col);
    });
    return wrap;
  }

  /** Pódio e relatórios: seções «Prova oral» e «Prova escrita», cada uma com colunas por categoria. */
  function buildPodiumWithTipoSections(opts) {
    var container = document.createElement("div");
    container.className = "podium-by-tipo";
    PROVA_TIPO_ORDER.forEach(function (tipo) {
      var grouped = groupProvasByCategoria(tipo);
      var grid = buildPodiumCategoriaGrid(grouped, opts);
      if (!grid) return;

      var section = document.createElement("section");
      section.className = "podium-tipo-section";
      section.setAttribute("data-prova-tipo", tipo);
      section.setAttribute("aria-label", labelProvaTipo(tipo));

      var title = document.createElement("h2");
      title.className = "podium-tipo-title";
      title.textContent = labelProvaTipo(tipo);
      section.appendChild(title);
      section.appendChild(grid);
      container.appendChild(section);
    });
    return container;
  }

  function renderBootHint() {
    var el = $("#boot-hint");
    if (!el) return;
    if (state.evento || !state.autoLoadFailed) {
      // `hidden` property é equivalente a display:none mas sem usar style.X
      // (mais amigável para CSP estritas e mantém semântica de boolean attr).
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent =
      "O evento de exemplo não foi carregado automaticamente (isso acontece ao abrir como file://). Clique em «Novo evento» para começar do zero, ou em «Carregar evento» para escolher um arquivo .evento.json.";
  }

  var TAB_ORDER = ["dashboard", "config", "participacao", "podio", "classificacao", "relatorios"];

  /** Definição de cada aba: label visível, label curto (mobile) e ícone SVG.
   *  Ícones em outline (24x24) — usam `currentColor` para herdar a tinta da
   *  sidebar (branco) ou da bottom-nav (var(--on-surface-muted)). */
  var TAB_DEFS = {
    dashboard: {
      label: "Início",
      short: "Início",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h5v-6h4v6h5v-9.5"/></svg>',
    },
    config: {
      label: "Configuração",
      short: "Config",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    },
    participacao: {
      label: "Participação",
      short: "Partic.",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    },
    podio: {
      label: "Pódio por prova",
      short: "Pódio",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5"/></svg>',
    },
    classificacao: {
      label: "Classificação",
      short: "Class.",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="9" width="4" height="12" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/></svg>',
    },
    relatorios: {
      label: "Relatórios",
      short: "Relat.",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
    },
  };

  function syncTabPanels() {
    TAB_ORDER.forEach(function (id) {
      var p = $("#panel-" + id);
      if (!p) return;
      var on = state.tab === id;
      p.classList.toggle("active", on);
      p.hidden = !on;
    });
    // Atualiza estado visual em ambos containers (sidebar desktop + bottom-nav mobile).
    // O id "tab-<id>" fica na cópia da sidebar; a bottom-nav usa "tab-bn-<id>".
    TAB_ORDER.forEach(function (id) {
      var on = state.tab === id;
      ["#tab-" + id, "#tab-bn-" + id].forEach(function (sel) {
        var b = document.querySelector(sel);
        if (!b) return;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.classList.toggle("active", on);
        b.tabIndex = on ? 0 : -1;
      });
    });
  }

  function reactivatePanel() {
    syncTabPanels();
  }

  function focusActiveTabButton() {
    // Foca no botão da sidebar (visível em desktop) ou da bottom-nav (mobile),
    // o que estiver presente no DOM e visível.
    var b = $("#tab-" + state.tab) || $("#tab-bn-" + state.tab);
    if (b) {
      try {
        b.focus();
      } catch (_e) {
        /* foco best-effort */
      }
    }
  }

  function ensureTabListKeyboard(tablist) {
    if (!tablist || tablist.dataset.kbWired === "1") return;
    tablist.dataset.kbWired = "1";
    tablist.addEventListener("keydown", function (e) {
      var key = e.key;
      if (
        key !== "ArrowRight" &&
        key !== "ArrowLeft" &&
        key !== "Home" &&
        key !== "End" &&
        key !== "ArrowDown" &&
        key !== "ArrowUp"
      ) {
        return;
      }
      var i = TAB_ORDER.indexOf(state.tab);
      if (i < 0) return;
      var next = i;
      // ArrowDown/Up navega vertical na sidebar; ArrowRight/Left na bottom-nav.
      // Aceitamos ambos em qualquer container para simplificar.
      if (key === "ArrowRight" || key === "ArrowDown") next = (i + 1) % TAB_ORDER.length;
      else if (key === "ArrowLeft" || key === "ArrowUp")
        next = (i - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      else if (key === "Home") next = 0;
      else if (key === "End") next = TAB_ORDER.length - 1;
      if (next === i) return;
      e.preventDefault();
      state.tab = TAB_ORDER[next];
      render();
      focusActiveTabButton();
    });
  }

  /** Atualiza Classificação e Relatórios sem redesenhar a aba em edição (evita parecer que «nada mudou»). */
  function refreshDerivedPanels() {
    if (!state.evento || !state.dados) return;
    renderClassificacao();
    renderRelatorios();
    wireRelatorios();
    renderWarnings();
    reactivatePanel();
  }

  function scheduleDerivedRefresh(delayMs) {
    clearTimeout(state.derivedRefreshTimer);
    state.derivedRefreshTimer = setTimeout(
      function () {
        if (state.derivedRefreshRaf) cancelAnimationFrame(state.derivedRefreshRaf);
        state.derivedRefreshRaf = requestAnimationFrame(function () {
          state.derivedRefreshRaf = null;
          refreshDerivedPanels();
        });
      },
      delayMs != null ? delayMs : 0
    );
  }

  function renderErrors() {
    var el = $("#errors");
    if (!el) return;
    el.innerHTML = "";
    if (!state.errors.length) return;
    var div = document.createElement("div");
    div.className = "banner-error";
    div.textContent = state.errors.join(" · ");
    el.appendChild(div);
  }

  function renderWarnings() {
    var el = $("#warnings");
    if (!el) return;
    el.innerHTML = "";
    if (!state.evento || !state.dados) return;
    var av = E.avisosPodiumDuplicado(state.dados.podium || {});
    if (!av.length) return;
    var div = document.createElement("div");
    div.className = "banner-warn";
    div.textContent = av.join(" ");
    el.appendChild(div);
  }

  function showFeedback(message, type) {
    var host = $("#feedback");
    if (!host) return;
    clearTimeout(state.feedbackTimer);
    host.innerHTML = "";
    var div = document.createElement("div");
    div.className =
      type === "error" ? "banner-error" : type === "warn" ? "banner-warn" : "banner-info";
    div.setAttribute("role", type === "error" ? "alert" : "status");
    div.textContent = message;
    host.appendChild(div);
    state.feedbackTimer = setTimeout(function () {
      if (host.contains(div)) host.removeChild(div);
    }, 5200);
  }

  // Os seletores fora do modal recebem `inert` enquanto o diálogo está aberto.
  // Isso evita foco "vazando" para a página atrás e respeita screen readers.
  // Inclui tanto o layout novo (.app-grid + .presentation-host) quanto seletores
  // legados (header.app-header, main.shell, footer.app-footer) para máxima
  // compatibilidade entre revisões.
  var CONFIRM_INERT_SELECTORS = [
    ".app-grid",
    ".presentation-host",
    "header.app-header",
    "main.shell",
    "footer.app-footer",
  ];

  function setBackgroundInert(on) {
    CONFIRM_INERT_SELECTORS.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (on) {
        el.setAttribute("inert", "");
        el.setAttribute("aria-hidden", "true");
      } else {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      }
    });
  }

  function onConfirmKeydown(ev) {
    var root = $("#confirm-overlay");
    if (!root || !root.classList.contains("open")) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeConfirmModal(false);
      return;
    }
    if (ev.key === "Tab") {
      // Focus-trap: só Cancelar e Confirmar são focáveis dentro do modal.
      var ok = $("#confirm-ok");
      var cancel = $("#confirm-cancel");
      if (!ok || !cancel) return;
      var active = document.activeElement;
      if (ev.shiftKey) {
        if (active === cancel || !root.contains(active)) {
          ev.preventDefault();
          ok.focus();
        }
      } else {
        if (active === ok || !root.contains(active)) {
          ev.preventDefault();
          cancel.focus();
        }
      }
    }
  }

  function ensureConfirmModal() {
    var root = $("#confirm-overlay");
    if (root) return root;
    root = document.createElement("div");
    root.id = "confirm-overlay";
    root.className = "confirm-overlay";
    root.setAttribute("role", "presentation");
    root.innerHTML =
      '<div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
      '<h2 id="confirm-title">Confirmar ação</h2>' +
      '<p id="confirm-message"></p>' +
      '<div class="confirm-actions">' +
      '<button type="button" class="confirm-btn" id="confirm-cancel">Cancelar</button>' +
      '<button type="button" class="confirm-btn confirm-btn--danger" id="confirm-ok">Confirmar</button>' +
      "</div></div>";
    document.body.appendChild(root);
    root.addEventListener("click", function (ev) {
      if (ev.target === root) closeConfirmModal(false);
    });
    $("#confirm-cancel").addEventListener("click", function () {
      closeConfirmModal(false);
    });
    $("#confirm-ok").addEventListener("click", function () {
      closeConfirmModal(true);
    });
    document.addEventListener("keydown", onConfirmKeydown, true);
    return root;
  }

  function closeConfirmModal(accepted) {
    var root = $("#confirm-overlay");
    if (!root || !root.classList.contains("open")) return;
    root.classList.remove("open");
    setBackgroundInert(false);
    var fn = state.confirmOnAccept;
    var onCancel = state.confirmOnCancel;
    state.confirmOnAccept = null;
    state.confirmOnCancel = null;
    var lastFocus = state.confirmLastFocus;
    state.confirmLastFocus = null;
    if (lastFocus && typeof lastFocus.focus === "function" && document.contains(lastFocus)) {
      try {
        lastFocus.focus();
      } catch (_e) {
        /* foco anterior pode estar destacado do DOM; ignorar */
      }
    }
    if (accepted && typeof fn === "function") fn();
    if (!accepted && typeof onCancel === "function") onCancel();
  }

  /**
   * Abre o modal de confirmação acessível.
   * options.destructive=true → foca inicialmente em "Cancelar" e usa rótulo de
   * confirmação adequado (evita aceitar destruição com Enter por reflexo).
   */
  function requestConfirmation(message, onAccept, onCancel, options) {
    var opts = options || {};
    var root = ensureConfirmModal();
    state.confirmOnAccept = onAccept;
    state.confirmOnCancel = onCancel || null;
    state.confirmLastFocus = document.activeElement;
    var ok = $("#confirm-ok");
    var cancel = $("#confirm-cancel");
    if (ok) ok.textContent = opts.confirmLabel || (opts.destructive ? "Remover" : "Confirmar");
    if (cancel) cancel.textContent = opts.cancelLabel || "Cancelar";
    $("#confirm-message").textContent = message;
    root.classList.add("open");
    setBackgroundInert(true);
    if (opts.destructive && cancel) cancel.focus();
    else if (ok) ok.focus();
  }

  /**
   * Modal de gerenciamento de eventos salvos no `localStorage`. Lista
   * resumida com ações (carregar, exportar, remover). Segue o mesmo padrão
   * de acessibilidade do `confirm-modal` (Esc, focus-trap leve, inert).
   */
  function ensureEventosModal() {
    var root = document.getElementById("eventos-modal-overlay");
    if (root) return root;
    root = document.createElement("div");
    root.id = "eventos-modal-overlay";
    root.className = "confirm-overlay eventos-modal-overlay";
    root.setAttribute("role", "presentation");
    root.innerHTML =
      '<div class="confirm-modal eventos-modal" role="dialog" aria-modal="true" aria-labelledby="eventos-modal-title">' +
      '<h2 id="eventos-modal-title">Eventos salvos no navegador</h2>' +
      '<p id="eventos-modal-hint" class="eventos-modal-hint">' +
      "Estes projetos estão guardados localmente neste navegador. " +
      "Use «Carregar» para abrir, «Exportar» para baixar o JSON ou «Remover» para apagar." +
      "</p>" +
      '<div id="eventos-modal-list" class="eventos-modal-list" role="list"></div>' +
      '<div class="confirm-actions">' +
      '<button type="button" class="confirm-btn" id="eventos-modal-close">Fechar</button>' +
      "</div></div>";
    document.body.appendChild(root);
    root.addEventListener("click", function (ev) {
      if (ev.target === root) closeEventosModal();
    });
    document.getElementById("eventos-modal-close").addEventListener("click", closeEventosModal);
    document.addEventListener(
      "keydown",
      function (ev) {
        if (ev.key === "Escape" && root.classList.contains("open")) {
          ev.stopPropagation();
          closeEventosModal();
        }
      },
      true
    );
    return root;
  }

  function closeEventosModal() {
    var root = document.getElementById("eventos-modal-overlay");
    if (!root || !root.classList.contains("open")) return;
    root.classList.remove("open");
    setBackgroundInert(false);
    var lastFocus = state.eventosModalLastFocus;
    state.eventosModalLastFocus = null;
    if (lastFocus && typeof lastFocus.focus === "function" && document.contains(lastFocus)) {
      try {
        lastFocus.focus();
      } catch (_e) {
        /* ignore */
      }
    }
  }

  function renderEventosModalList() {
    var listEl = document.getElementById("eventos-modal-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    var eventos = listProjetosSalvos();
    if (!eventos.length) {
      var empty = document.createElement("p");
      empty.className = "eventos-modal-empty";
      empty.textContent = "Nenhum evento salvo neste navegador.";
      listEl.appendChild(empty);
      return;
    }
    eventos.forEach(function (info) {
      var item = document.createElement("div");
      item.className = "eventos-modal-item";
      item.setAttribute("role", "listitem");

      var meta = document.createElement("div");
      meta.className = "eventos-modal-meta";
      var nome = document.createElement("strong");
      nome.textContent = info.nome;
      var sub = document.createElement("span");
      sub.className = "eventos-modal-sub";
      var parts = [];
      if (info.data) parts.push(info.data);
      parts.push("slug: " + info.slug);
      parts.push((info.tamanhoBytes / 1024).toFixed(1) + " KB");
      sub.textContent = parts.join(" · ");
      meta.appendChild(nome);
      meta.appendChild(sub);
      item.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "eventos-modal-actions";

      var btnLoad = document.createElement("button");
      btnLoad.type = "button";
      btnLoad.className = "pill-btn pill-btn--primary";
      btnLoad.textContent = "Carregar";
      btnLoad.addEventListener("click", function () {
        var saved = loadFromStorage(info.slug);
        if (!saved || !saved.evento) {
          showFeedback("Falha ao carregar «" + info.nome + "».", "error");
          return;
        }
        if (setEvento(saved.evento, saved.dados || null)) {
          closeEventosModal();
          showFeedback("Evento «" + info.nome + "» carregado.", "info");
        }
      });
      actions.appendChild(btnLoad);

      var btnExport = document.createElement("button");
      btnExport.type = "button";
      btnExport.className = "pill-btn";
      btnExport.textContent = "Exportar";
      btnExport.addEventListener("click", function () {
        var saved = loadFromStorage(info.slug);
        if (!saved) {
          showFeedback("Não foi possível ler «" + info.nome + "».", "error");
          return;
        }
        var blob = new Blob([JSON.stringify(saved, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = info.slug + ".projeto.json";
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 0);
      });
      actions.appendChild(btnExport);

      var btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "pill-btn pill-btn--danger";
      btnRemove.textContent = "Remover";
      btnRemove.addEventListener("click", function () {
        // Fecha o modal de listagem para o confirm-modal poder gerenciar foco.
        closeEventosModal();
        requestConfirmation(
          "Remover o evento salvo «" + info.nome + "»? Esta ação não pode ser desfeita.",
          function () {
            if (removerProjetoSalvo(info.slug)) {
              showFeedback("Evento «" + info.nome + "» removido.", "info");
              // Reabre a listagem (já sem o item removido) para fluxo contínuo.
              openEventosSalvosModal();
            } else {
              showFeedback("Não foi possível remover «" + info.nome + "».", "error");
            }
          },
          function () {
            // Em caso de cancelamento, reabre a listagem para o usuário não
            // perder o contexto.
            openEventosSalvosModal();
          },
          { destructive: true, confirmLabel: "Remover" }
        );
      });
      actions.appendChild(btnRemove);

      item.appendChild(actions);
      listEl.appendChild(item);
    });
  }

  function openEventosSalvosModal() {
    var root = ensureEventosModal();
    state.eventosModalLastFocus = document.activeElement;
    renderEventosModalList();
    root.classList.add("open");
    setBackgroundInert(true);
    var closeBtn = document.getElementById("eventos-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  /** Renderiza a navegação principal em DOIS containers em paralelo:
   *  - `#sidebar-nav` (desktop ≥1024px): item completo com ícone + label;
   *  - `#bottom-nav` (mobile ≤768px): ícone empilhado sobre label curto.
   *  Ambos compartilham TAB_ORDER e a mesma semântica ARIA (role="tab",
   *  aria-controls="panel-<id>"). O container legado `#tabs` segue oculto
   *  como hook para `renderTabs()` antiga e ainda recebe os botões para
   *  preservar buscas via `$("#tab-<id>")` — mesmo que invisíveis.
   */
  function renderTabs() {
    var sidebar = $("#sidebar-nav");
    var bottom = $("#bottom-nav");
    var legacy = $("#tabs");

    if (sidebar) {
      sidebar.setAttribute("role", "tablist");
      sidebar.setAttribute("aria-orientation", "vertical");
      sidebar.innerHTML = "";
    }
    if (bottom) {
      bottom.setAttribute("role", "tablist");
      bottom.setAttribute("aria-orientation", "horizontal");
      bottom.innerHTML = "";
    }
    if (legacy) {
      legacy.setAttribute("role", "tablist");
      legacy.innerHTML = "";
    }

    TAB_ORDER.forEach(function (id) {
      var def = TAB_DEFS[id] || { label: id, short: id, icon: "" };
      var on = state.tab === id;

      // Sidebar (desktop): ícone + label completo
      if (sidebar) {
        var bs = document.createElement("button");
        bs.type = "button";
        bs.id = "tab-" + id;
        bs.setAttribute("role", "tab");
        bs.setAttribute("aria-controls", "panel-" + id);
        bs.setAttribute("aria-selected", on ? "true" : "false");
        bs.className = on ? "active" : "";
        bs.tabIndex = on ? 0 : -1;
        bs.dataset.tab = id;
        bs.innerHTML = def.icon + "<span>" + def.label + "</span>";
        bs.addEventListener("click", function () {
          state.tab = id;
          render();
        });
        sidebar.appendChild(bs);
      }

      // Bottom-nav (mobile): ícone empilhado + label curto
      if (bottom) {
        var bb = document.createElement("button");
        bb.type = "button";
        bb.id = "tab-bn-" + id;
        bb.setAttribute("role", "tab");
        bb.setAttribute("aria-controls", "panel-" + id);
        bb.setAttribute("aria-selected", on ? "true" : "false");
        bb.setAttribute("aria-label", def.label);
        bb.className = on ? "active" : "";
        bb.tabIndex = on ? 0 : -1;
        bb.dataset.tab = id;
        bb.innerHTML = def.icon + "<span>" + def.short + "</span>";
        bb.addEventListener("click", function () {
          state.tab = id;
          render();
        });
        bottom.appendChild(bb);
      }

      // Legacy (#tabs oculto): garante que `#tab-<id>` exista mesmo quando a
      // sidebar não está no DOM (ambientes de teste antigos).
      if (legacy && !sidebar) {
        var bl = document.createElement("button");
        bl.type = "button";
        bl.id = "tab-" + id;
        bl.setAttribute("role", "tab");
        bl.setAttribute("aria-controls", "panel-" + id);
        bl.setAttribute("aria-selected", on ? "true" : "false");
        bl.className = on ? "active" : "";
        bl.tabIndex = on ? 0 : -1;
        bl.dataset.tab = id;
        bl.textContent = def.label;
        bl.addEventListener("click", function () {
          state.tab = id;
          render();
        });
        legacy.appendChild(bl);
      }
    });

    if (sidebar) ensureTabListKeyboard(sidebar);
    if (bottom) ensureTabListKeyboard(bottom);
    if (legacy) ensureTabListKeyboard(legacy);
  }

  function isConfigSectionCollapsed(key) {
    return !!state.configSectionCollapsed[key];
  }

  function appendConfigCollapsible(wrap, key, title, childNodes) {
    var section = document.createElement("section");
    section.className = "config-section config-section--collapsible";
    if (isConfigSectionCollapsed(key)) section.classList.add("is-collapsed");

    var head = document.createElement("button");
    head.type = "button";
    head.className = "config-section-head";
    head.setAttribute("data-config-section-toggle", key);
    head.setAttribute("aria-expanded", isConfigSectionCollapsed(key) ? "false" : "true");
    head.setAttribute("aria-controls", "config-section-body-" + key);
    var titleEl = document.createElement("span");
    titleEl.className = "config-section-head-title";
    titleEl.textContent = title;
    var chev = document.createElement("span");
    chev.className = "config-section-chevron";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▼";
    head.appendChild(titleEl);
    head.appendChild(chev);

    var body = document.createElement("div");
    body.className = "config-section-body";
    body.id = "config-section-body-" + key;
    childNodes.forEach(function (n) {
      body.appendChild(n);
    });
    section.appendChild(head);
    section.appendChild(body);
    wrap.appendChild(section);
  }

  function isRelatorioSectionCollapsed(key) {
    return !!state.relatorioSectionCollapsed[key];
  }

  function appendRelatorioCollapsible(wrap, key, title, childNodes) {
    var section = document.createElement("section");
    section.className = "config-section config-section--collapsible";
    if (isRelatorioSectionCollapsed(key)) section.classList.add("is-collapsed");

    var head = document.createElement("button");
    head.type = "button";
    head.className = "config-section-head";
    head.setAttribute("data-relatorio-section-toggle", key);
    head.setAttribute("aria-expanded", isRelatorioSectionCollapsed(key) ? "false" : "true");
    head.setAttribute("aria-controls", "relatorio-section-body-" + key);
    var titleEl = document.createElement("span");
    titleEl.className = "config-section-head-title";
    titleEl.textContent = title;
    var chev = document.createElement("span");
    chev.className = "config-section-chevron";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▼";
    head.appendChild(titleEl);
    head.appendChild(chev);

    var body = document.createElement("div");
    body.className = "config-section-body";
    body.id = "relatorio-section-body-" + key;
    childNodes.forEach(function (n) {
      body.appendChild(n);
    });
    section.appendChild(head);
    section.appendChild(body);
    wrap.appendChild(section);
  }

  function isRelatorioProvaCollapsed(provaId) {
    return !!state.relatorioPodiumCollapsed[provaId];
  }

  /** Calcula KPIs derivados do estado atual para o Dashboard e topbar:
   *  - igrejas: total cadastrado;
   *  - provas: total cadastrado;
   *  - podiosPct: % de provas com ao menos 1 medalha atribuída;
   *  - top1: { igreja, total } ou null se não computável. */
  function computeKpis() {
    var ev = state.evento;
    var dados = state.dados || {};
    if (!ev) return null;
    var igrejas = (ev.igrejas || []).length;
    var provas = (ev.provas || []).length;
    var podium = dados.podium || {};
    var preenchidas = 0;
    (ev.provas || []).forEach(function (p) {
      var slot = podium[p.id];
      if (!slot) return;
      var algum = ["ou", "pt", "br"].some(function (mk) {
        var ent = slot[mk];
        if (!ent) return false;
        return !!(ent.igrejaId || (ent.nomeLivre && String(ent.nomeLivre).trim()));
      });
      if (algum) preenchidas++;
    });
    var podiosPct = provas ? Math.round((preenchidas / provas) * 100) : 0;
    var top1 = null;
    var out = compute();
    if (out) {
      var ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
      if (ord && ord.length) top1 = { igreja: ord[0].igreja, total: ord[0].total };
    }
    return {
      igrejas: igrejas,
      provas: provas,
      podiosPreenchidos: preenchidas,
      podiosPct: podiosPct,
      top1: top1,
    };
  }

  /** Renderiza a aba inicial (Dashboard). Quando sem evento mostra onboarding
   *  com 3 CTAs (Novo evento, Carregar projeto, Carregar exemplo) e a lista
   *  de eventos salvos no localStorage. Quando com evento mostra um resumo
   *  (cards KPI + top 3 atual + atalhos para outras abas). */
  function renderDashboard() {
    var host = $("#panel-dashboard");
    if (!host) return;
    host.innerHTML = "";
    host.classList.add("dashboard-panel");

    var ev = state.evento;
    var salvos = listProjetosSalvos();

    var wrap = document.createElement("div");
    wrap.className = "dashboard-wrap";

    if (!ev) {
      // -------------- Onboarding (sem evento) --------------
      var hero = document.createElement("section");
      hero.className = "dashboard-hero";
      hero.innerHTML =
        '<h2 class="dashboard-hero-title">Bem-vindo à Pontuação Conclave</h2>' +
        '<p class="dashboard-hero-sub">Aplicação 100% local para registrar participação, ' +
        "pódios e classificação do Conclave. Comece criando um evento novo, carregando um " +
        "projeto salvo ou abrindo o exemplo oficial.</p>";
      wrap.appendChild(hero);

      var ctaGrid = document.createElement("div");
      ctaGrid.className = "dashboard-cta-grid";

      ctaGrid.appendChild(
        buildDashboardCta({
          id: "btn-dash-novo-evento",
          variant: "primary",
          title: "Novo evento",
          desc: "Começa do zero com a configuração padrão MR e nenhum dado.",
        })
      );
      ctaGrid.appendChild(
        buildDashboardCta({
          id: "btn-dash-carregar-projeto",
          variant: "default",
          title: "Carregar projeto",
          desc: "Abrir um arquivo .json exportado anteriormente.",
        })
      );
      ctaGrid.appendChild(
        buildDashboardCta({
          id: "btn-dash-carregar-exemplo",
          variant: "default",
          title: "Carregar exemplo",
          desc: "Conclave MR 2026/1 — útil para conhecer a ferramenta.",
        })
      );
      wrap.appendChild(ctaGrid);

      if (salvos.length) {
        wrap.appendChild(buildDashboardSavedSection(salvos));
      }

      var docs = document.createElement("section");
      docs.className = "dashboard-card";
      docs.innerHTML =
        '<h3 class="dashboard-card-title">Comece pela documentação</h3>' +
        '<p class="dashboard-card-text">Manual de uso, FAQ, glossário, atalhos de teclado e ' +
        "como o regulamento mapeia para os campos do JSON.</p>" +
        '<a class="pill-btn pill-btn--primary" href="docs/index.html">Abrir documentação</a>';
      wrap.appendChild(docs);
    } else {
      // -------------- Resumo (com evento) --------------
      var kpis = computeKpis() || { igrejas: 0, provas: 0, podiosPct: 0, top1: null };
      var meta = ev.meta || {};

      var summary = document.createElement("section");
      summary.className = "dashboard-summary";
      summary.innerHTML =
        '<p class="dashboard-summary-eyebrow">Evento ativo</p>' +
        '<h2 class="dashboard-summary-title">' +
        escapeHtml(meta.nome || "Evento sem nome") +
        "</h2>" +
        (meta.data || meta.local
          ? '<p class="dashboard-summary-sub">' +
            [meta.data, meta.local].filter(Boolean).map(escapeHtml).join(" · ") +
            "</p>"
          : "");
      wrap.appendChild(summary);

      var kpiGrid = document.createElement("div");
      kpiGrid.className = "dashboard-kpi-grid";
      kpiGrid.appendChild(buildKpiCard("Igrejas", kpis.igrejas, "Cadastradas no evento"));
      kpiGrid.appendChild(buildKpiCard("Provas", kpis.provas, "Total no regulamento"));
      kpiGrid.appendChild(
        buildKpiCard(
          "Pódios",
          kpis.podiosPct + "%",
          kpis.podiosPreenchidos + " de " + kpis.provas + " preenchidos"
        )
      );
      if (kpis.top1) {
        kpiGrid.appendChild(
          buildKpiCard("Líder atual", escapeHtml(kpis.top1.igreja), fmt(kpis.top1.total) + " pts")
        );
      }
      wrap.appendChild(kpiGrid);

      var actions = document.createElement("section");
      actions.className = "dashboard-actions";
      actions.innerHTML =
        '<h3 class="dashboard-card-title">Continuar trabalhando</h3>' +
        '<div class="dashboard-actions-row">' +
        '<button type="button" class="pill-btn pill-btn--primary" id="btn-dash-ir-participacao">Registrar participação</button>' +
        '<button type="button" class="pill-btn" id="btn-dash-ir-podio">Pódio por prova</button>' +
        '<button type="button" class="pill-btn" id="btn-dash-ir-classificacao">Ver classificação</button>' +
        '<button type="button" class="pill-btn" id="btn-dash-ir-relatorios">Gerar relatório oficial</button>' +
        "</div>";
      wrap.appendChild(actions);

      if (salvos.length > 1) {
        wrap.appendChild(buildDashboardSavedSection(salvos, ev.meta && ev.meta.slug));
      }
    }

    host.appendChild(wrap);
  }

  function buildDashboardCta(opts) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = opts.id;
    btn.className = "dashboard-cta" + (opts.variant === "primary" ? " dashboard-cta--primary" : "");
    btn.innerHTML =
      '<span class="dashboard-cta-title">' +
      escapeHtml(opts.title) +
      "</span>" +
      '<span class="dashboard-cta-desc">' +
      escapeHtml(opts.desc) +
      "</span>";
    return btn;
  }

  function buildKpiCard(label, value, sub) {
    var card = document.createElement("div");
    card.className = "dashboard-kpi-card";
    card.innerHTML =
      '<span class="dashboard-kpi-label">' +
      escapeHtml(label) +
      "</span>" +
      '<span class="dashboard-kpi-value">' +
      value +
      "</span>" +
      (sub ? '<span class="dashboard-kpi-sub">' + sub + "</span>" : "");
    return card;
  }

  function buildDashboardSavedSection(salvos, currentSlug) {
    var section = document.createElement("section");
    section.className = "dashboard-card";
    var title = document.createElement("h3");
    title.className = "dashboard-card-title";
    title.textContent = "Eventos salvos neste navegador";
    section.appendChild(title);

    var list = document.createElement("ul");
    list.className = "dashboard-saved-list";
    salvos.slice(0, 6).forEach(function (info) {
      var li = document.createElement("li");
      li.className = "dashboard-saved-item";
      if (currentSlug && info.slug === currentSlug) li.classList.add("is-current");
      var meta = document.createElement("div");
      meta.className = "dashboard-saved-meta";
      meta.innerHTML =
        "<strong>" +
        escapeHtml(info.nome) +
        "</strong>" +
        '<span class="dashboard-saved-sub">' +
        escapeHtml([info.data, "slug: " + info.slug].filter(Boolean).join(" · ")) +
        "</span>";
      li.appendChild(meta);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill-btn";
      btn.textContent = currentSlug && info.slug === currentSlug ? "Evento ativo" : "Carregar";
      btn.disabled = !!(currentSlug && info.slug === currentSlug);
      btn.addEventListener("click", function () {
        var saved = loadFromStorage(info.slug);
        if (!saved || !saved.evento) {
          showFeedback("Falha ao carregar «" + info.nome + "».", "error");
          return;
        }
        if (setEvento(saved.evento, saved.dados || null)) {
          showFeedback("Evento «" + info.nome + "» carregado.", "info");
        }
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    section.appendChild(list);

    var more = document.createElement("button");
    more.type = "button";
    more.className = "dashboard-saved-all";
    more.id = "btn-dash-eventos-salvos";
    more.textContent =
      salvos.length > 6 ? "Ver todos (" + salvos.length + ")" : "Gerenciar (exportar, remover)";
    section.appendChild(more);
    return section;
  }

  function goToTab(id) {
    if (TAB_ORDER.indexOf(id) < 0) return;
    state.tab = id;
    render();
    focusActiveTabButton();
  }

  function wireDashboard() {
    var host = $("#panel-dashboard");
    if (!host) return;

    var btnNovo = host.querySelector("#btn-dash-novo-evento");
    if (btnNovo) btnNovo.addEventListener("click", criarNovoEvento);

    var btnProj = host.querySelector("#btn-dash-carregar-projeto");
    if (btnProj)
      btnProj.addEventListener("click", function () {
        var f = $("#file-projeto");
        if (f) f.click();
      });

    var btnExemplo = host.querySelector("#btn-dash-carregar-exemplo");
    if (btnExemplo)
      btnExemplo.addEventListener("click", function () {
        tryLoadDefaultEventoWeb().then(
          function (ev) {
            if (setEvento(ev, null)) {
              showFeedback("Exemplo Conclave 2026/1 carregado.", "info");
            }
          },
          function () {
            showFeedback(
              "Não foi possível carregar o exemplo (verifique se está servindo via http(s)).",
              "warn"
            );
          }
        );
      });

    var btnSalvos = host.querySelector("#btn-dash-eventos-salvos");
    if (btnSalvos) btnSalvos.addEventListener("click", openEventosSalvosModal);

    [
      ["#btn-dash-ir-participacao", "participacao"],
      ["#btn-dash-ir-podio", "podio"],
      ["#btn-dash-ir-classificacao", "classificacao"],
    ].forEach(function (pair) {
      var b = host.querySelector(pair[0]);
      if (b) {
        b.addEventListener("click", function () {
          goToTab(pair[1]);
        });
      }
    });

    var btnRel = host.querySelector("#btn-dash-ir-relatorios");
    if (btnRel) {
      btnRel.addEventListener("click", function () {
        goToTab("relatorios");
        // Após render(), dispara o "Gerar relatório oficial" se existir.
        setTimeout(function () {
          var bg = document.getElementById("btn-relatorio-oficial-gerar");
          if (bg) bg.click();
        }, 0);
      });
    }
  }

  function renderConfig() {
    return withFocusPreserved(function () {
      renderConfigBody();
    });
  }

  function renderConfigBody() {
    var host = $("#panel-config");
    if (!host) return;
    host.innerHTML = "";
    if (!state.evento) {
      host.textContent = "Carregue um evento para editar a configuração.";
      return;
    }
    var ev = state.evento;
    var wrap = document.createElement("div");
    wrap.className = "config-wrap";

    appendConfigCollapsible(wrap, "geral", "Geral", buildConfigGeralSection(ev));
    appendConfigCollapsible(wrap, "igrejas", "Igrejas", buildConfigIgrejasSection(ev));
    appendConfigCollapsible(
      wrap,
      "pesosParticipacao",
      "Pesos da participação",
      buildConfigPesosSection(ev)
    );
    appendConfigCollapsible(wrap, "categorias", "Categorias", buildConfigCategoriasSection(ev));
    appendConfigCollapsible(wrap, "provas", "Provas bíblicas", buildConfigProvasSection(ev));

    host.appendChild(wrap);
  }

  /** Seção "Geral": nome, data, horários e regulamento. */
  function buildConfigGeralSection(ev) {
    var meta = ev.meta || {};
    var gridGeral = document.createElement("div");
    gridGeral.className = "config-grid";
    gridGeral.innerHTML =
      '<label class="config-field"><span>Nome do evento</span>' +
      '<input type="text" data-cfg="meta.nome" value="' +
      escapeHtml(meta.nome || "") +
      '" /></label>' +
      '<label class="config-field"><span>Data</span>' +
      '<input type="text" data-cfg="meta.data" value="' +
      escapeHtml(meta.data || "") +
      '" placeholder="AAAA-MM-DD ou texto" /></label>' +
      '<label class="config-field config-field--full"><span>Local</span>' +
      '<input type="text" data-cfg="meta.local" value="' +
      escapeHtml(meta.local || "") +
      '" placeholder="ex.: Templo Central — São Paulo" /></label>' +
      '<div class="config-horarios-row">' +
      '<label class="config-field"><span>Horário de início</span>' +
      '<input type="time" data-cfg="meta.horarioInicio" value="' +
      escapeHtml(meta.horarioInicio || "") +
      '" /></label>' +
      '<label class="config-field"><span>Horário de encerramento</span>' +
      '<input type="time" data-cfg="meta.horarioEncerramento" value="' +
      escapeHtml(meta.horarioEncerramento || "") +
      '" /></label>' +
      "</div>";

    var storedReg = meta.regulamentoUrl || "";
    var regTrim = String(storedReg).trim();
    var isExternal =
      regTrim.indexOf("http://") === 0 ||
      regTrim.indexOf("https://") === 0 ||
      regTrim.indexOf("//") === 0;
    var regLab = document.createElement("label");
    regLab.className = "config-field config-field--full";
    var spReg = document.createElement("span");
    spReg.textContent = "Regulamento (PDF)";
    regLab.appendChild(spReg);
    var regRow = document.createElement("div");
    regRow.className =
      "config-regulamento-row" + (isExternal ? " config-regulamento-row--external" : "");
    if (!isExternal) {
      var pref = document.createElement("span");
      pref.className = "config-regulamento-prefix";
      pref.textContent = "static/";
      pref.setAttribute("title", "Ficheiros na pasta static/ na raiz do projeto");
      regRow.appendChild(pref);
    }
    var regInp = document.createElement("input");
    regInp.type = "text";
    regInp.id = "cfg-regulamento-input";
    regInp.setAttribute("spellcheck", "false");
    regInp.placeholder = isExternal ? "https://…" : "ex.: regulamento.pdf";
    regInp.value = isExternal ? regTrim : regulamentoDisplayFromStored(storedReg);
    regRow.appendChild(regInp);
    regLab.appendChild(regRow);
    gridGeral.appendChild(regLab);

    gridGeral.insertAdjacentHTML(
      "beforeend",
      '<p class="config-hint config-field--full" style="margin-top: -0.25rem">' +
        "Regulamento: coloque o PDF em <code>static/</code> e escreva só o nome do ficheiro (ou cole uma URL completa). " +
        "O botão «Regulamento» abre o documento.</p>"
    );

    return [gridGeral];
  }

  /** Seção "Igrejas": lista editável + adição inline + adição em lote + remover todas. */
  function buildConfigIgrejasSection(ev) {
    var igHint = document.createElement("p");
    igHint.className = "config-hint";
    igHint.textContent =
      "Adicione ou edite igrejas. Remover uma igreja apaga a linha na participação e limpa referências no pódio. Em lote: um nome por linha. «Remover todas as igrejas» limpa a lista inteira.";

    var tigWrap = document.createElement("div");
    tigWrap.className = "table-wrap config-igrejas-wrap";
    var igHead = document.createElement("div");
    igHead.className = "config-igrejas-list-head";
    igHead.textContent = "Nome";
    var tigList = document.createElement("div");
    tigList.className = "config-igrejas-list";
    tigList.setAttribute("role", "group");
    tigList.setAttribute("aria-label", "Lista de igrejas");
    (ev.igrejas || []).forEach(function (g) {
      var row = document.createElement("div");
      row.className = "config-igreja-row";
      var inp = document.createElement("input");
      inp.type = "text";
      inp.className = "cfg-igreja-nome";
      inp.setAttribute("data-igreja-id", g.id);
      inp.value = g.nome || "";
      inp.setAttribute("autocomplete", "organization");
      var bdel = document.createElement("button");
      bdel.type = "button";
      bdel.className = "config-danger-btn";
      bdel.setAttribute("data-config-del-igreja", g.id);
      bdel.textContent = "Remover";
      row.appendChild(inp);
      row.appendChild(bdel);
      tigList.appendChild(row);
    });
    if (!(ev.igrejas || []).length) {
      var emptyIg = document.createElement("p");
      emptyIg.className = "config-hint config-igrejas-empty";
      emptyIg.textContent =
        "Nenhuma igreja ainda. Use «Adicionar igreja» ou a lista em lote abaixo.";
      tigList.appendChild(emptyIg);
    }
    tigWrap.appendChild(igHead);
    tigWrap.appendChild(tigList);

    var addRow = document.createElement("div");
    addRow.className = "config-inline-add";
    var inpNova = document.createElement("input");
    inpNova.type = "text";
    inpNova.id = "config-igreja-nova-nome";
    inpNova.placeholder = "Nome da igreja a adicionar";
    inpNova.setAttribute("aria-label", "Nome da nova igreja");
    var btnAdd1 = document.createElement("button");
    btnAdd1.type = "button";
    btnAdd1.className = "config-add-btn";
    btnAdd1.setAttribute("data-config-add-igreja-single", "1");
    btnAdd1.textContent = "Adicionar igreja";
    addRow.appendChild(inpNova);
    addRow.appendChild(btnAdd1);

    var bulkLab = document.createElement("label");
    bulkLab.className = "config-field";
    bulkLab.style.marginTop = "0.75rem";
    var sp = document.createElement("span");
    sp.textContent = "Adicionar em lote (um nome por linha)";
    var bulkTa = document.createElement("textarea");
    bulkTa.className = "config-bulk-textarea";
    bulkTa.id = "config-igrejas-bulk";
    bulkTa.setAttribute("aria-label", "Nomes de igrejas, uma por linha");
    bulkTa.placeholder = "Primeira Igreja Batista …\nOutra igreja …";
    bulkLab.appendChild(sp);
    bulkLab.appendChild(bulkTa);
    var btnBulk = document.createElement("button");
    btnBulk.type = "button";
    btnBulk.className = "config-add-btn";
    btnBulk.setAttribute("data-config-add-igreja-bulk", "1");
    btnBulk.textContent = "Adicionar todas da lista";
    btnBulk.style.marginTop = "0.35rem";

    var btnRemAllIg = document.createElement("button");
    btnRemAllIg.type = "button";
    btnRemAllIg.className = "config-danger-btn";
    btnRemAllIg.setAttribute("data-config-rem-all-igrejas", "1");
    btnRemAllIg.textContent = "Remover todas as igrejas";
    btnRemAllIg.style.marginTop = "0.35rem";

    return [igHint, tigWrap, addRow, bulkLab, btnBulk, btnRemAllIg];
  }

  /** Seção "Pesos da participação": grid de campos numéricos. */
  function buildConfigPesosSection(ev) {
    var pesHint = document.createElement("p");
    pesHint.className = "config-hint";
    pesHint.textContent = isErUiTheme()
      ? "Modelo ER: presença do pastor, pontualidade, uniforme e bíblia (+100 pts cada quando aplicável; uniforme/bíblia exigem totais iguais na tabela de participação). Os valores aparecem no cabeçalho da aba Participação."
      : "Usados no cálculo da participação; os valores aparecem no cabeçalho da aba Participação.";
    var pev = ev.pesos || {};
    var pesGrid = document.createElement("div");
    pesGrid.className = "config-grid config-grid--pesos";
    var lblInscr = isErUiTheme()
      ? "Presença do pastor (pts se marcado)"
      : "Inscrição (pts se marcado)";
    var lblUni = isErUiTheme() ? "Uniforme (camisa = total emb.)" : "Uniforme (camisa = MR tot.)";
    var lblBib = isErUiTheme()
      ? "Bíblia (emb. com bíblia = total emb.)"
      : "Bíblia (MR bíblia = MR tot.)";
    pesGrid.innerHTML =
      '<label class="config-field"><span>' +
      escapeHtml(lblInscr) +
      '</span><input type="number" step="1" data-cfg="pesos.inscricao" value="' +
      escapeHtml(String(pev.inscricao != null ? pev.inscricao : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>Pontualidade (pts se marcado)</span><input type="number" step="1" data-cfg="pesos.pontualidade" value="' +
      escapeHtml(String(pev.pontualidade != null ? pev.pontualidade : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>' +
      escapeHtml(lblUni) +
      '</span><input type="number" step="1" data-cfg="pesos.uniforme" value="' +
      escapeHtml(String(pev.uniforme != null ? pev.uniforme : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>' +
      escapeHtml(lblBib) +
      '</span><input type="number" step="1" data-cfg="pesos.biblia" value="' +
      escapeHtml(String(pev.biblia != null ? pev.biblia : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>Por visitante</span><input type="number" step="1" data-cfg="pesos.visitante" value="' +
      escapeHtml(String(pev.visitante != null ? pev.visitante : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>Animação (pts se marcado)</span><input type="number" step="1" data-cfg="pesos.animacao" value="' +
      escapeHtml(String(pev.animacao != null ? pev.animacao : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>Mau comportamento (geralmente negativo)</span><input type="number" step="1" data-cfg="pesos.mau_comportamento" value="' +
      escapeHtml(String(pev.mau_comportamento != null ? pev.mau_comportamento : 0)) +
      '" /></label>';
    return [pesHint, pesGrid];
  }

  /** Seção "Categorias": tabela arrastável + botão de adicionar. */
  function buildConfigCategoriasSection(_ev) {
    var p2 = document.createElement("p");
    p2.className = "config-hint";
    p2.textContent =
      "Arraste as linhas pela coluna à esquerda para definir a ordem das colunas no pódio. Cada prova deve usar uma categoria.";
    var tbc = document.createElement("div");
    tbc.className = "table-wrap";
    var tcat = document.createElement("table");
    tcat.className = "data config-table config-table--sortable";
    tcat.innerHTML =
      '<thead><tr><th class="config-col-drag" scope="col" aria-hidden="true">&nbsp;</th><th scope="col">Nome</th><th scope="col">Idade</th><th scope="col"><span class="visually-hidden">Ações</span></th></tr></thead>';
    var bcat = document.createElement("tbody");
    bcat.id = "config-cat-tbody";
    sortedCategorias().forEach(function (c) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-cat-id", c.id);
      tr.innerHTML =
        '<td class="config-drag-cell" title="Arrastar para ordenar"><span class="config-drag-grip" aria-hidden="true">⠿</span></td>' +
        '<td><input type="text" class="cfg-cat-nome" data-cat-id="' +
        escapeHtml(c.id) +
        '" value="' +
        escapeHtml(c.nome || "") +
        '" /></td>' +
        '<td><input type="text" class="cfg-cat-idade" data-cat-id="' +
        escapeHtml(c.id) +
        '" value="' +
        escapeHtml(c.idade != null ? String(c.idade) : "") +
        '" placeholder="ex.: 10–12 anos" /></td>' +
        '<td><button type="button" class="config-danger-btn" data-config-del-cat="' +
        escapeHtml(c.id) +
        '">Remover</button></td>';
      bcat.appendChild(tr);
    });
    tcat.appendChild(bcat);
    tbc.appendChild(tcat);
    var addCat = document.createElement("button");
    addCat.type = "button";
    addCat.className = "config-add-btn";
    addCat.setAttribute("data-config-add-cat", "1");
    addCat.textContent = "Adicionar categoria";
    return [p2, tbc, addCat];
  }

  /** Seção "Provas bíblicas": medalhas + lista de provas + adição em lote. */
  function buildConfigProvasSection(ev) {
    var h3m = document.createElement("h3");
    h3m.className = "config-subtitle";
    h3m.textContent = isErUiTheme()
      ? "Medalhas no pódio (embaixadores — 1.º / 2.º / 3.º)"
      : "Pontuação das medalhas (gincana)";
    var med = ev.medalhas || { ou: 0, pt: 0, br: 0 };
    var medDiv = document.createElement("div");
    medDiv.className = "config-grid config-grid--medalhas";
    medDiv.innerHTML =
      '<label class="config-field"><span>Ouro</span><input type="number" step="1" data-cfg="medalhas.ou" value="' +
      escapeHtml(String(med.ou != null ? med.ou : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>Prata</span><input type="number" step="1" data-cfg="medalhas.pt" value="' +
      escapeHtml(String(med.pt != null ? med.pt : 0)) +
      '" /></label>' +
      '<label class="config-field"><span>Bronze</span><input type="number" step="1" data-cfg="medalhas.br" value="' +
      escapeHtml(String(med.br != null ? med.br : 0)) +
      '" /></label>';

    var h3p = document.createElement("h3");
    h3p.className = "config-subtitle";
    h3p.textContent = "Lista de provas";
    var p3 = document.createElement("p");
    p3.className = "config-hint";
    p3.textContent =
      "Arraste as linhas para alterar a ordem de exibição no pódio e nos relatórios. Em lote: um título por linha para adicionar. «Remover todas as provas» apaga a lista e o pódio.";

    var catOpts = '<option value="">—</option>';
    (ev.categorias || []).forEach(function (c) {
      catOpts += '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.nome) + "</option>";
    });

    var tbp = document.createElement("div");
    tbp.className = "table-wrap";
    var tprov = document.createElement("table");
    tprov.className = "data config-table config-table--sortable";
    tprov.innerHTML =
      '<thead><tr><th class="config-col-drag" scope="col" aria-hidden="true">&nbsp;</th><th scope="col">Título</th><th scope="col">Tipo</th><th scope="col">Categoria</th><th scope="col"><span class="visually-hidden">Ações</span></th></tr></thead>';
    var bprov = document.createElement("tbody");
    bprov.id = "config-prova-tbody";
    sortedProvas().forEach(function (p) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-prova-id", p.id);
      var tdG = document.createElement("td");
      tdG.className = "config-drag-cell";
      tdG.title = "Arrastar para ordenar";
      tdG.innerHTML = '<span class="config-drag-grip" aria-hidden="true">⠿</span>';
      var sel = document.createElement("select");
      sel.className = "cfg-prova-cat";
      sel.setAttribute("data-prova-id", p.id);
      sel.innerHTML = catOpts;
      if (p.categoriaId) sel.value = p.categoriaId;
      var td1 = document.createElement("td");
      var inpT = document.createElement("input");
      inpT.type = "text";
      inpT.className = "cfg-prova-titulo";
      inpT.setAttribute("data-prova-id", p.id);
      inpT.value = p.titulo || "";
      td1.appendChild(inpT);
      var tdTipo = document.createElement("td");
      var selTipo = document.createElement("select");
      selTipo.className = "cfg-prova-tipo";
      selTipo.setAttribute("data-prova-id", p.id);
      selTipo.innerHTML =
        '<option value="oral">Oral</option><option value="escrita">Escrita</option>';
      selTipo.value = p.tipo === "escrita" ? "escrita" : "oral";
      tdTipo.appendChild(selTipo);
      var td2 = document.createElement("td");
      td2.appendChild(sel);
      var tdRem = document.createElement("td");
      var bdel = document.createElement("button");
      bdel.type = "button";
      bdel.className = "config-danger-btn";
      bdel.setAttribute("data-config-del-prova", p.id);
      bdel.textContent = "Remover";
      tdRem.appendChild(bdel);
      tr.appendChild(tdG);
      tr.appendChild(td1);
      tr.appendChild(tdTipo);
      tr.appendChild(td2);
      tr.appendChild(tdRem);
      bprov.appendChild(tr);
    });
    tprov.appendChild(bprov);
    tbp.appendChild(tprov);
    var addPv = document.createElement("button");
    addPv.type = "button";
    addPv.className = "config-add-btn";
    addPv.setAttribute("data-config-add-prova", "1");
    addPv.textContent = "Adicionar prova";

    var provaBulkWrap = document.createElement("div");
    provaBulkWrap.className = "config-provas-bulk-wrap";

    var bulkAddLab = document.createElement("label");
    bulkAddLab.className = "config-field";
    bulkAddLab.style.marginTop = "0.75rem";
    var bulkAddSpan = document.createElement("span");
    bulkAddSpan.textContent = "Adicionar em lote (um título por linha)";
    var bulkAddTa = document.createElement("textarea");
    bulkAddTa.className = "config-bulk-textarea";
    bulkAddTa.id = "config-provas-bulk-add";
    bulkAddTa.setAttribute("aria-label", "Títulos de provas, uma por linha");
    bulkAddTa.placeholder = "Esgrima bíblica — Junior\nDebate de versículos — Adolescente …";
    bulkAddLab.appendChild(bulkAddSpan);
    bulkAddLab.appendChild(bulkAddTa);
    var btnBulkAddPv = document.createElement("button");
    btnBulkAddPv.type = "button";
    btnBulkAddPv.className = "config-add-btn";
    btnBulkAddPv.setAttribute("data-config-add-prova-bulk", "1");
    btnBulkAddPv.textContent = "Adicionar todas da lista";
    btnBulkAddPv.style.marginTop = "0.35rem";

    var btnRemAllPv = document.createElement("button");
    btnRemAllPv.type = "button";
    btnRemAllPv.className = "config-danger-btn";
    btnRemAllPv.setAttribute("data-config-rem-all-provas", "1");
    btnRemAllPv.textContent = "Remover todas as provas";
    btnRemAllPv.style.marginTop = "0.5rem";

    provaBulkWrap.appendChild(bulkAddLab);
    provaBulkWrap.appendChild(btnBulkAddPv);
    provaBulkWrap.appendChild(btnRemAllPv);

    return [h3m, medDiv, h3p, p3, tbp, addPv, provaBulkWrap];
  }

  function setCfgPath(obj, path, value) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (!o[k] || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = value;
  }

  function wireConfig() {
    var host = $("#panel-config");
    if (!host) return;

    host
      .querySelectorAll(".config-section-head[data-config-section-toggle]")
      .forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          var key = btn.getAttribute("data-config-section-toggle");
          if (!key) return;
          state.configSectionCollapsed[key] = !state.configSectionCollapsed[key];
          renderConfig();
          wireConfig();
        });
      });

    function afterConfigChange() {
      normalizeEvento(state.evento);
      syncCategoriaNomes(state.evento);
      syncDadosWithEvento();
      scheduleSave();
      validate();
      refreshDerivedPanels();
      renderPodio();
      wirePodio();
      setHeader();
      reactivatePanel();
    }

    host.querySelectorAll("input[data-cfg]").forEach(function (inp) {
      function apply() {
        var path = inp.getAttribute("data-cfg");
        if (!path) return;
        var v = inp.value;
        if (path.indexOf("medalhas.") === 0 || path.indexOf("pesos.") === 0) {
          setCfgPath(state.evento, path, Number(v));
        } else {
          setCfgPath(state.evento, path, v);
        }
        scheduleSave();
        validate();
        refreshDerivedPanels();
        setHeader();
        if (path.indexOf("pesos.") === 0) {
          renderParticipacao();
          wireParticipacao();
          reactivatePanel();
        }
      }
      inp.addEventListener("change", apply);
      inp.addEventListener("input", function () {
        var pth = inp.getAttribute("data-cfg");
        if (!pth || (pth.indexOf("medalhas.") !== 0 && pth.indexOf("pesos.") !== 0)) return;
        apply();
      });
    });

    var cfgRegInp = $("#cfg-regulamento-input");
    if (cfgRegInp) {
      function syncRegulamento() {
        if (!state.evento.meta) state.evento.meta = {};
        var v = cfgRegInp.value.trim();
        state.evento.meta.regulamentoUrl = regulamentoUrlFromInput(v);
        var row = cfgRegInp.closest(".config-regulamento-row");
        var pref = row && row.querySelector(".config-regulamento-prefix");
        var ext = v.length > 0 && (/^https?:\/\//i.test(v) || v.indexOf("//") === 0);
        if (row) row.classList.toggle("config-regulamento-row--external", ext);
        if (pref) pref.style.display = ext ? "none" : "";
        scheduleSave();
        validate();
        refreshDerivedPanels();
        setHeader();
      }
      cfgRegInp.addEventListener("change", syncRegulamento);
      cfgRegInp.addEventListener("input", syncRegulamento);
    }

    host.querySelectorAll(".cfg-cat-nome").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-cat-id");
        var c = state.evento.categorias.find(function (x) {
          return x.id === id;
        });
        if (c) c.nome = inp.value;
        syncCategoriaNomes(state.evento);
        scheduleSave();
        renderConfig();
        wireConfig();
      });
    });
    host.querySelectorAll(".cfg-cat-idade").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-cat-id");
        var c = state.evento.categorias.find(function (x) {
          return x.id === id;
        });
        if (c) c.idade = inp.value;
        scheduleSave();
      });
    });

    host.querySelectorAll(".cfg-igreja-nome").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-igreja-id");
        var g = state.evento.igrejas.find(function (x) {
          return x.id === id;
        });
        if (g) g.nome = inp.value;
        scheduleSave();
        validate();
        refreshDerivedPanels();
        setHeader();
      });
    });

    host.querySelectorAll("[data-config-del-igreja]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var gid = btn.getAttribute("data-config-del-igreja");
        if (!gid) return;
        requestConfirmation(
          "Remover esta igreja? A participação e referências no pódio serão atualizadas.",
          function () {
            state.evento.igrejas = state.evento.igrejas.filter(function (g) {
              return g.id !== gid;
            });
            afterConfigChange();
            renderConfig();
            wireConfig();
          },
          null,
          { destructive: true }
        );
      });
    });

    var btnAddIg = host.querySelector("[data-config-add-igreja-single]");
    if (btnAddIg) {
      btnAddIg.addEventListener("click", function () {
        var el = $("#config-igreja-nova-nome");
        var nome = el && el.value ? el.value.trim() : "";
        if (!nome) {
          showFeedback("Indique o nome da igreja.", "warn");
          return;
        }
        var lower = nome.toLowerCase();
        var dup = state.evento.igrejas.some(function (g) {
          return (g.nome || "").trim().toLowerCase() === lower;
        });
        if (dup) {
          showFeedback("Já existe uma igreja com este nome.", "warn");
          return;
        }
        var base = slugify(nome);
        var id = ensureUniqueIgrejaId(state.evento, base);
        state.evento.igrejas.push({ id: id, nome: nome });
        if (el) el.value = "";
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    }

    var btnBulkIg = host.querySelector("[data-config-add-igreja-bulk]");
    if (btnBulkIg) {
      btnBulkIg.addEventListener("click", function () {
        var ta = $("#config-igrejas-bulk");
        var raw = ta && ta.value ? ta.value : "";
        var lines = raw.split(/\r?\n/);
        var added = 0;
        var existingLower = {};
        state.evento.igrejas.forEach(function (g) {
          existingLower[(g.nome || "").trim().toLowerCase()] = true;
        });
        lines.forEach(function (line) {
          var nome = String(line || "").trim();
          if (!nome) return;
          var low = nome.toLowerCase();
          if (existingLower[low]) return;
          existingLower[low] = true;
          var base = slugify(nome);
          var id = ensureUniqueIgrejaId(state.evento, base);
          state.evento.igrejas.push({ id: id, nome: nome });
          added += 1;
        });
        if (added === 0) {
          showFeedback(
            "Nenhuma igreja nova a adicionar (linhas vazias ou nomes já existentes).",
            "warn"
          );
          return;
        }
        if (ta) ta.value = "";
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    }

    var btnRemAllIg = host.querySelector("[data-config-rem-all-igrejas]");
    if (btnRemAllIg) {
      btnRemAllIg.addEventListener("click", function () {
        if (!state.evento.igrejas.length) {
          showFeedback("Não há igrejas para remover.", "warn");
          return;
        }
        requestConfirmation(
          "Remover todas as igrejas? A participação e as referências no pódio serão limpas. Esta ação não pode ser desfeita.",
          function () {
            state.evento.igrejas = [];
            afterConfigChange();
            renderConfig();
            wireConfig();
          },
          null,
          { destructive: true, confirmLabel: "Remover todas" }
        );
      });
    }

    host.querySelectorAll(".cfg-prova-titulo").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-prova-id");
        var p = state.evento.provas.find(function (x) {
          return x.id === id;
        });
        if (p) p.titulo = inp.value;
        scheduleSave();
      });
    });
    host.querySelectorAll(".cfg-prova-cat").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.getAttribute("data-prova-id");
        var p = state.evento.provas.find(function (x) {
          return x.id === id;
        });
        if (p) {
          p.categoriaId = sel.value || null;
          syncCategoriaNomes(state.evento);
        }
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    });
    host.querySelectorAll(".cfg-prova-tipo").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.getAttribute("data-prova-id");
        var p = state.evento.provas.find(function (x) {
          return x.id === id;
        });
        if (p) {
          p.tipo = sel.value === "escrita" ? "escrita" : "oral";
        }
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    });

    var addCat = host.querySelector("[data-config-add-cat]");
    if (addCat) {
      addCat.addEventListener("click", function () {
        var n = (state.evento.categorias || []).length;
        var cid = "cat-" + Date.now();
        state.evento.categorias = state.evento.categorias || [];
        state.evento.categorias.push({ id: cid, nome: "Nova categoria", ordem: n, idade: "" });
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    }
    host.querySelectorAll("[data-config-del-cat]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cid = btn.getAttribute("data-config-del-cat");
        var emUso = state.evento.provas.some(function (p) {
          return p.categoriaId === cid;
        });
        if (emUso) {
          showFeedback(
            "Não é possível remover: existem provas nesta categoria. Reatribua as provas antes.",
            "warn"
          );
          return;
        }
        state.evento.categorias = (state.evento.categorias || []).filter(function (c) {
          return c.id !== cid;
        });
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    });

    var addPv = host.querySelector("[data-config-add-prova]");
    if (addPv) {
      addPv.addEventListener("click", function () {
        var pid = ensureUniqueProvaId(state.evento, "prova-" + Date.now());
        var cats = state.evento.categorias || [];
        var defCat = cats.length ? cats[0].id : null;
        var maxOrd = 0;
        state.evento.provas.forEach(function (p) {
          if ((p.ordem || 0) > maxOrd) maxOrd = p.ordem;
        });
        state.evento.provas.push({
          id: pid,
          titulo: "Nova prova",
          ordem: maxOrd + 1,
          tipo: "oral",
          categoriaId: defCat,
          categoria: defCat
            ? (
                cats.find(function (c) {
                  return c.id === defCat;
                }) || {}
              ).nome
            : "",
        });
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    }

    var btnBulkAddPv = host.querySelector("[data-config-add-prova-bulk]");
    if (btnBulkAddPv) {
      btnBulkAddPv.addEventListener("click", function () {
        var ta = $("#config-provas-bulk-add");
        var raw = ta && ta.value ? ta.value : "";
        var lines = raw.split(/\r?\n/);
        var cats = state.evento.categorias || [];
        var defCat = cats.length ? cats[0].id : null;
        var defNome = defCat
          ? (
              cats.find(function (c) {
                return c.id === defCat;
              }) || {}
            ).nome
          : "";
        var maxOrd = 0;
        state.evento.provas.forEach(function (p) {
          if ((p.ordem || 0) > maxOrd) maxOrd = p.ordem;
        });
        var existingLower = {};
        state.evento.provas.forEach(function (p) {
          existingLower[(p.titulo || "").trim().toLowerCase()] = true;
        });
        var added = 0;
        lines.forEach(function (line) {
          var titulo = String(line || "").trim();
          if (!titulo) return;
          var low = titulo.toLowerCase();
          if (existingLower[low]) return;
          existingLower[low] = true;
          maxOrd += 1;
          var base = slugify(titulo);
          var pid = ensureUniqueProvaId(state.evento, "prova-" + (base || "item"));
          state.evento.provas.push({
            id: pid,
            titulo: titulo,
            ordem: maxOrd,
            tipo: inferProvaTipo({ titulo: titulo }),
            categoriaId: defCat,
            categoria: defNome || "",
          });
          added += 1;
        });
        if (added === 0) {
          showFeedback(
            "Nenhuma prova nova a adicionar (linhas vazias ou títulos já existentes).",
            "warn"
          );
          return;
        }
        if (ta) ta.value = "";
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    }

    var btnRemAllPv = host.querySelector("[data-config-rem-all-provas]");
    if (btnRemAllPv) {
      btnRemAllPv.addEventListener("click", function () {
        if (!state.evento.provas.length) {
          showFeedback("Não há provas para remover.", "warn");
          return;
        }
        requestConfirmation(
          "Remover todas as provas e apagar todo o pódio associado? Esta ação não pode ser desfeita.",
          function () {
            state.evento.provas.forEach(function (p) {
              delete state.podiumCollapsed[p.id];
            });
            state.evento.provas = [];
            afterConfigChange();
            renderConfig();
            wireConfig();
          },
          null,
          { destructive: true, confirmLabel: "Remover todas" }
        );
      });
    }

    host.querySelectorAll("[data-config-del-prova]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pid = btn.getAttribute("data-config-del-prova");
        requestConfirmation(
          "Remover esta prova? Os dados do pódio desta prova serão apagados.",
          function () {
            state.evento.provas = state.evento.provas.filter(function (p) {
              return p.id !== pid;
            });
            delete state.podiumCollapsed[pid];
            afterConfigChange();
            renderConfig();
            wireConfig();
          },
          null,
          { destructive: true }
        );
      });
    });

    function wireConfigTableDnD(tbodySelector, mode) {
      var tbody = host.querySelector(tbodySelector);
      if (!tbody) return;
      var rowSel = mode === "cat" ? "tr[data-cat-id]" : "tr[data-prova-id]";
      var dragged = null;

      tbody.querySelectorAll(rowSel).forEach(function (row) {
        row.setAttribute("draggable", "false");
        var grip = row.querySelector(".config-drag-grip");
        if (!grip) return;
        grip.setAttribute("draggable", "true");
        grip.setAttribute("tabindex", "0");
        grip.setAttribute("role", "button");
        grip.setAttribute(
          "aria-label",
          "Reordenar. Arraste ou use Alt+Seta para cima ou para baixo."
        );
        grip.addEventListener("dragstart", function (e) {
          dragged = row;
          row.setAttribute("data-dragging", "1");
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", "");
          } catch (_err) {
            /* alguns navegadores rejeitam setData; ignorar */
          }
        });
        grip.addEventListener("dragend", function () {
          row.removeAttribute("data-dragging");
          if (mode === "cat") resequenceCategoriasOrdem(tbody);
          else resequenceProvasOrdem(tbody);
          dragged = null;
          afterConfigChange();
          renderConfig();
          wireConfig();
        });
        grip.addEventListener("keydown", function (e) {
          if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
          e.preventDefault();
          var rows = [].slice.call(tbody.querySelectorAll(rowSel));
          var idx = rows.indexOf(row);
          if (idx < 0) return;
          if (e.key === "ArrowUp" && idx > 0) {
            tbody.insertBefore(row, rows[idx - 1]);
          } else if (e.key === "ArrowDown" && idx < rows.length - 1) {
            tbody.insertBefore(row, rows[idx + 1].nextSibling);
          } else {
            return;
          }
          if (mode === "cat") resequenceCategoriasOrdem(tbody);
          else resequenceProvasOrdem(tbody);
          afterConfigChange();
          renderConfig();
          wireConfig();
        });
      });

      tbody.addEventListener("dragover", function (e) {
        e.preventDefault();
        if (!dragged) return;
        e.dataTransfer.dropEffect = "move";
        var after = getDragAfterElement(tbody, e.clientY, rowSel);
        if (after == null) tbody.appendChild(dragged);
        else tbody.insertBefore(dragged, after);
      });

      tbody.addEventListener("drop", function (e) {
        e.preventDefault();
      });
    }

    wireConfigTableDnD("#config-cat-tbody", "cat");
    wireConfigTableDnD("#config-prova-tbody", "prova");
  }

  function participacaoPesoTxt(pz, key) {
    var v = pz && pz[key];
    if (v == null || v === "") return "—";
    var n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return String(n) + " pts";
  }

  function thParticipacaoBool(shortTitle, field, pz) {
    var th = document.createElement("th");
    th.scope = "col";
    th.className = "part-th part-th--bool";
    var l1 = document.createElement("div");
    l1.className = "part-th-line";
    l1.textContent = shortTitle;
    var l2 = document.createElement("div");
    l2.className = "part-th-peso";
    l2.textContent = participacaoPesoTxt(pz, field);
    var tools = document.createElement("div");
    tools.className = "part-th-bool-tools";
    var bTodos = document.createElement("button");
    bTodos.type = "button";
    bTodos.className = "part-bool-all";
    bTodos.setAttribute("data-part-bool-field", field);
    bTodos.setAttribute("data-part-bool-val", "1");
    bTodos.textContent = "Todos";
    var bNenhum = document.createElement("button");
    bNenhum.type = "button";
    bNenhum.className = "part-bool-all";
    bNenhum.setAttribute("data-part-bool-field", field);
    bNenhum.setAttribute("data-part-bool-val", "0");
    bNenhum.textContent = "Nenhum";
    tools.appendChild(bTodos);
    tools.appendChild(bNenhum);
    th.appendChild(l1);
    th.appendChild(l2);
    th.appendChild(tools);
    return th;
  }

  function thParticipacaoNum(title, pesoLine) {
    var th = document.createElement("th");
    th.scope = "col";
    th.className = "part-th";
    var l1 = document.createElement("div");
    l1.className = "part-th-line";
    l1.textContent = title;
    var l2 = document.createElement("div");
    l2.className = "part-th-peso";
    l2.textContent = pesoLine;
    th.appendChild(l1);
    th.appendChild(l2);
    return th;
  }

  function renderParticipacao() {
    var host = $("#panel-participacao");
    if (!host) return;
    host.innerHTML = "";
    if (!state.evento || !state.dados) {
      host.textContent = "Carregue um evento para editar a participação.";
      return;
    }
    var pz = state.evento.pesos || {};
    var wrap = document.createElement("div");
    wrap.className = "table-wrap";
    var table = document.createElement("table");
    table.className = "data participacao-table";
    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    var thIgreja = document.createElement("th");
    thIgreja.scope = "col";
    thIgreja.className = "part-th part-th--igreja";
    thIgreja.textContent = "Igreja";
    trh.appendChild(thIgreja);
    trh.appendChild(thParticipacaoBool(isErUiTheme() ? "Pastor" : "Inscr.", "inscricao", pz));
    trh.appendChild(thParticipacaoBool("Pont.", "pontualidade", pz));
    trh.appendChild(
      thParticipacaoNum(
        isErUiTheme() ? "Emb. tot." : "MR tot.",
        isErUiTheme() ? "contagem emb. (sem peso fixo)" : "contagem MR (sem peso fixo)"
      )
    );
    trh.appendChild(
      thParticipacaoNum(
        isErUiTheme() ? "Emb. camisa" : "MR camisa",
        participacaoPesoTxt(pz, "uniforme") +
          (isErUiTheme() ? " se emb. camisa = emb. tot." : " se MR camisa = MR tot.")
      )
    );
    trh.appendChild(
      thParticipacaoNum(
        isErUiTheme() ? "Emb. bíblia" : "MR bíblia",
        participacaoPesoTxt(pz, "biblia") +
          (isErUiTheme() ? " se emb. bíblia = emb. tot." : " se MR bíblia = MR tot.")
      )
    );
    trh.appendChild(
      thParticipacaoNum("Visit.", participacaoPesoTxt(pz, "visitante") + " / visitante")
    );
    trh.appendChild(thParticipacaoBool("Animação", "animacao", pz));
    trh.appendChild(thParticipacaoBool("Mau comp.", "mau_comportamento", pz));
    trh.appendChild(thParticipacaoNum("Extra", "livre (sem peso)"));
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    state.evento.igrejas.forEach(function (g) {
      var row = state.dados.participacao[g.id] || {};
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(g.nome) +
        "</td>" +
        tdBool(g.id, "inscricao", row.inscricao) +
        tdBool(g.id, "pontualidade", row.pontualidade) +
        tdNum(g.id, "mr_total", row.mr_total) +
        tdNum(g.id, "mr_camisa", row.mr_camisa) +
        tdNum(g.id, "mr_biblia", row.mr_biblia) +
        tdNum(g.id, "visitantes", row.visitantes) +
        tdBool(g.id, "animacao", row.animacao) +
        tdBool(g.id, "mau_comportamento", row.mau_comportamento) +
        tdNum(g.id, "pontuacao_extra", row.pontuacao_extra);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
  }

  function tdBool(gid, field, val) {
    var c = typeof val === "boolean" ? val : !!val;
    return (
      '<td><input type="checkbox" data-gid="' +
      escapeHtml(gid) +
      '" data-f="' +
      escapeHtml(field) +
      '" ' +
      (c ? "checked" : "") +
      " /></td>"
    );
  }

  function tdNum(gid, field, val) {
    var n = val != null ? val : 0;
    return (
      '<td><input type="number" step="1" data-gid="' +
      escapeHtml(gid) +
      '" data-f="' +
      escapeHtml(field) +
      '" value="' +
      escapeHtml(String(n)) +
      '" /></td>'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/`/g, "&#96;")
      .replace(/=/g, "&#61;");
  }

  /**
   * Constrói o esqueleto comum (head colapsável + body com 3 linhas de
   * medalha) de um card de prova no pódio. As variantes editor/relatório
   * passam diferentes geradores de linha via `opts.renderMedalRow`.
   *
   * opts:
   *   - toggleAttr: nome do atributo `data-...` no botão de cabeçalho usado
   *     pelo wireup para identificar o que toggles (editor vs relatório).
   *   - collapsed: boolean — se a prova está recolhida.
   *   - renderMedalRow(p, mk, ent): retorna o `HTMLDivElement` da linha da
   *     medalha (ouro/prata/bronze).
   */
  function buildProvaCardBase(p, opts) {
    var places = state.dados.podium[p.id] || {};
    var completo = provaPodiumCompleto(p.id);
    var collapsed = !!opts.collapsed;

    var card = document.createElement("div");
    card.className = "prova-card prova-card--compact";
    if (completo) card.classList.add("podium-complete");
    if (collapsed) card.classList.add("is-collapsed");

    var head = document.createElement("button");
    head.type = "button";
    head.className = "prova-card-head";
    head.setAttribute(opts.toggleAttr, p.id);
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    head.setAttribute(
      "aria-label",
      (collapsed ? "Expandir " : "Recolher ") +
        tituloProvaCard(p) +
        (completo ? " — pódio completo" : "")
    );

    var titleWrap = document.createElement("span");
    titleWrap.className = "prova-card-title-wrap";
    var h = document.createElement("span");
    h.className = "prova-card-title";
    h.textContent = tituloProvaCard(p);
    titleWrap.appendChild(h);

    var statusBadge = document.createElement("span");
    statusBadge.className = "prova-status-badge" + (completo ? " complete" : " pending");
    statusBadge.textContent = completo ? "✓ Ok" : "○";
    statusBadge.setAttribute(
      "title",
      completo ? "Ouro, prata e bronze com igreja" : "Falta definir alguma medalha"
    );

    var chev = document.createElement("span");
    chev.className = "prova-card-chevron";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▼";

    head.appendChild(titleWrap);
    head.appendChild(statusBadge);
    head.appendChild(chev);

    var body = document.createElement("div");
    body.className = "prova-card-body";

    ["ou", "pt", "br"].forEach(function (mk) {
      var ent = places[mk] || { igrejaId: null, competidor: "" };
      body.appendChild(opts.renderMedalRow(p, mk, ent));
    });

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  function medalLabel(mk) {
    return mk === "ou" ? "Ouro" : mk === "pt" ? "Prata" : "Bronze";
  }

  /** Linha de medalha editável (aba "Pódio por prova"). */
  function buildMedalRowEditor(p, mk, ent) {
    var displayNome = "";
    if (ent.igrejaId) displayNome = igrejaNome(ent.igrejaId) || "";
    else if (ent.nomeLivre != null && String(ent.nomeLivre).trim() !== "")
      displayNome = String(ent.nomeLivre);
    var row = document.createElement("div");
    row.className = "medal-row " + mk;
    var label = document.createElement("label");
    label.className = "medal";
    label.textContent = medalLabel(mk);
    var inpIg = document.createElement("input");
    inpIg.type = "text";
    inpIg.className = "sel-igreja";
    inpIg.setAttribute("list", "podio-igreja-list");
    inpIg.setAttribute("autocomplete", "off");
    inpIg.setAttribute("data-prova", p.id);
    inpIg.setAttribute("data-medal", mk);
    inpIg.placeholder = "Igreja…";
    inpIg.value = displayNome;
    var hint = document.createElement("span");
    hint.className = "sel-igreja-hint";
    if (displayNome.trim() && !ent.igrejaId) {
      hint.textContent = "Nenhuma igreja da lista corresponde a este texto.";
    }
    var cellIg = document.createElement("div");
    cellIg.className = "podium-igreja-cell";
    cellIg.appendChild(inpIg);
    cellIg.appendChild(hint);
    var inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = "Competidor";
    inp.className = "inp-comp";
    inp.setAttribute("data-prova", p.id);
    inp.setAttribute("data-medal", mk);
    inp.value = ent.competidor || "";
    row.appendChild(label);
    row.appendChild(cellIg);
    row.appendChild(inp);
    return row;
  }

  /** Linha de medalha em modo leitura (aba "Relatórios"). */
  function buildMedalRowReport(_p, mk, ent) {
    var row = document.createElement("div");
    row.className = "medal-row " + mk;
    var label = document.createElement("label");
    label.className = "medal";
    label.textContent = medalLabel(mk);
    var cellI = document.createElement("div");
    cellI.className = "relatorio-read";
    cellI.textContent = ent.igrejaId
      ? igrejaNome(ent.igrejaId) || "—"
      : ent.nomeLivre && String(ent.nomeLivre).trim()
        ? String(ent.nomeLivre)
        : "—";
    var cellC = document.createElement("div");
    cellC.className = "relatorio-read";
    cellC.textContent = ent.competidor ? ent.competidor : "—";
    row.appendChild(label);
    row.appendChild(cellI);
    row.appendChild(cellC);
    return row;
  }

  function buildProvaCardPodio(p) {
    return buildProvaCardBase(p, {
      toggleAttr: "data-prova-toggle",
      collapsed: isProvaCollapsed(p.id),
      renderMedalRow: buildMedalRowEditor,
    });
  }

  /** Pódio em leitura para a aba Relatórios (mesmo layout que «Pódio por prova») */
  function buildProvaCardPodioReport(p) {
    return buildProvaCardBase(p, {
      toggleAttr: "data-relatorio-prova-toggle",
      collapsed: isRelatorioProvaCollapsed(p.id),
      renderMedalRow: buildMedalRowReport,
    });
  }

  function createRelatorioPodioWrap() {
    return buildPodiumWithTipoSections({
      buildCard: buildProvaCardPodioReport,
      catActionAttr: "data-relatorio-cat-action",
    });
  }

  function renderPodio() {
    var host = $("#panel-podio");
    if (!host) return;
    host.innerHTML = "";
    if (!state.evento || !state.dados) {
      host.textContent = "Carregue um evento para registrar o pódio.";
      return;
    }
    var datalist = document.createElement("datalist");
    datalist.id = "podio-igreja-list";
    (state.evento.igrejas || []).forEach(function (g) {
      var opt = document.createElement("option");
      opt.value = g.nome || "";
      datalist.appendChild(opt);
    });
    host.appendChild(datalist);

    host.appendChild(
      buildPodiumWithTipoSections({
        buildCard: buildProvaCardPodio,
        catActionAttr: "data-cat-action",
      })
    );
  }

  function renderClassificacao() {
    var host = $("#panel-classificacao");
    if (!host) return;
    host.innerHTML = "";
    var out = compute();
    if (!out) {
      host.textContent = "Sem dados.";
      return;
    }
    if (isErUiTheme()) {
      var info = document.createElement("aside");
      info.className = "classificacao-er-premiacao";
      info.setAttribute("aria-label", "Pontuação e premiação ER");
      var t = document.createElement("h2");
      t.className = "classificacao-er-title";
      t.textContent = "Pontuação e premiação";
      info.appendChild(t);
      var p1 = document.createElement("p");
      p1.className = "classificacao-er-block";
      p1.innerHTML =
        "<strong>Medalhas.</strong> Embaixadores que conquistarem o primeiro lugar receberão a medalha de ouro <strong>(500 pontos)</strong>; o segundo, a medalha de prata <strong>(300 pontos)</strong> e o terceiro, a medalha de bronze <strong>(150 pontos)</strong>.";
      info.appendChild(p1);
      var p2 = document.createElement("p");
      p2.className = "classificacao-er-block";
      p2.innerHTML =
        "<strong>Troféus.</strong> Serão entregues troféus aos 1.º, 2.º e 3.º colocados na classificação geral.";
      info.appendChild(p2);
      var p3 = document.createElement("p");
      p3.className = "classificacao-er-block";
      p3.innerHTML =
        "<strong>Extra (participação).</strong> Presença do pastor (+100 pts), pontualidade (+100 pts), uniforme (+100 pts), bíblia (+100 pts).";
      info.appendChild(p3);
      host.appendChild(info);
    }
    var ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);

    // Toolbar local da aba: exportar a classificação como CSV.
    var toolbar = document.createElement("div");
    toolbar.className = "classificacao-toolbar";
    var btnCsv = document.createElement("button");
    btnCsv.type = "button";
    btnCsv.className = "pill-btn";
    btnCsv.id = "btn-export-classificacao";
    btnCsv.textContent = "Exportar CSV";
    btnCsv.title =
      "Salva a classificação atual como arquivo .csv (delimitado por ponto-e-vírgula).";
    btnCsv.addEventListener("click", function () {
      exportClassificacaoCsv(ord);
    });
    toolbar.appendChild(btnCsv);
    host.appendChild(toolbar);

    var wrap = document.createElement("div");
    wrap.className = "table-wrap";
    var table = document.createElement("table");
    table.className = "data rank-table";
    var thead = document.createElement("thead");
    thead.innerHTML =
      '<tr><th class="pos" scope="col">#</th><th scope="col">Igreja</th><th scope="col">Partic.</th><th scope="col">Punições</th><th scope="col">Gincana</th><th scope="col">Extra</th><th class="tot" scope="col">Total</th></tr>';
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    ord.forEach(function (r) {
      var tr = document.createElement("tr");
      var pos = Number(r.posicao);
      tr.classList.add("rank-row");
      if (pos === 1) tr.classList.add("rank-pos--1");
      else if (pos === 2) tr.classList.add("rank-pos--2");
      else if (pos === 3) tr.classList.add("rank-pos--3");
      tr.innerHTML =
        '<td class="pos">' +
        r.posicao +
        "</td><td>" +
        escapeHtml(r.igreja) +
        "</td><td>" +
        fmt(r.participacao) +
        "</td><td>" +
        fmt(r.punicoes) +
        "</td><td>" +
        fmt(r.gincana) +
        "</td><td>" +
        fmt(r.pontuacao_extra) +
        '</td><td class="tot">' +
        fmt(r.total) +
        "</td>";
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
    var foot = document.createElement("p");
    foot.className = "classificacao-desempate-hint";
    foot.innerHTML =
      "<strong>Desempate</strong> (mesmo total geral): 1.º mais medalhas de ouro no pódio; 2.º mais de prata; em seguida maior pontuação de gincana nas provas cujo título corresponde a <em>Conhecimentos Gerais da Bíblia</em>, depois <em>Debate de Versículos</em>, depois <em>Conhecimentos Gerais da Organização</em> (soma de todas as provas que coincidem com cada grupo).";
    host.appendChild(foot);
  }

  function fmt(x) {
    var n = Number(x);
    if (!Number.isFinite(n)) return "0";
    return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2);
  }

  /** Escapa um campo CSV (RFC 4180-ish): se contém ; , " ou quebra de linha,
   *  envolve em aspas duplas duplicando aspas internas. Mantemos `;` como
   *  separador (mais amigável para Excel pt-BR). */
  function csvField(v) {
    var s = v == null ? "" : String(v);
    if (/[;,"\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Exporta a classificação ordenada como CSV (UTF-8 com BOM para abrir
   *  corretamente no Excel pt-BR). */
  function exportClassificacaoCsv(ord) {
    if (!state.evento || !ord || !ord.length) {
      showFeedback("Não há classificação para exportar.", "warn");
      return;
    }
    var headers = ["Posição", "Igreja", "Participação", "Punições", "Gincana", "Extra", "Total"];
    var lines = [headers.map(csvField).join(";")];
    ord.forEach(function (r) {
      lines.push(
        [
          r.posicao,
          r.igreja,
          fmt(r.participacao),
          fmt(r.punicoes),
          fmt(r.gincana),
          fmt(r.pontuacao_extra),
          fmt(r.total),
        ]
          .map(csvField)
          .join(";")
      );
    });
    var content = "\ufeff" + lines.join("\r\n");
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var slug = (state.evento.meta && state.evento.meta.slug) || "evento";
    a.download = slug + "-classificacao.csv";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
    showFeedback("Classificação exportada como CSV.", "info");
  }

  /** Exporta o pódio (ouro/prata/bronze de cada prova) como CSV — uma linha
   *  por (prova, posição), formato pronto para importar em Excel/Sheets pt-BR. */
  function exportPodioCsv() {
    var out = compute();
    if (!state.evento || !out) {
      showFeedback("Não há dados para exportar.", "warn");
      return;
    }
    var dados = state.dados || {};
    var podium = dados.podium || {};
    var headers = ["Tipo", "Categoria", "Prova", "Posição", "Igreja", "Competidor"];
    var lines = [headers.map(csvField).join(";")];
    var algumaLinha = false;
    PROVA_TIPO_ORDER.forEach(function (tipo) {
      var grouped = groupProvasByCategoria(tipo);
      grouped.order.forEach(function (catKey) {
        var list = grouped.groups[catKey] || [];
        list.forEach(function (p) {
          var catLabel = labelCategoria(catKey);
          var provaTitulo = (p.titulo != null ? String(p.titulo) : "").trim() || catLabel;
          var places = podium[p.id] || {};
          ["ou", "pt", "br"].forEach(function (mk) {
            var ent = places[mk] || {};
            var nome;
            if (ent.igrejaId) nome = igrejaNome(ent.igrejaId) || "—";
            else if (ent.nomeLivre && String(ent.nomeLivre).trim())
              nome = String(ent.nomeLivre).trim();
            else nome = "—";
            var comp = ent.competidor ? String(ent.competidor).trim() : "";
            lines.push(
              [labelProvaTipo(tipo), catLabel, provaTitulo, medalLabel(mk), nome, comp]
                .map(csvField)
                .join(";")
            );
            algumaLinha = true;
          });
        });
      });
    });
    if (!algumaLinha) {
      showFeedback("Não há provas para exportar.", "warn");
      return;
    }
    var content = "\ufeff" + lines.join("\r\n");
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var slug = (state.evento.meta && state.evento.meta.slug) || "evento";
    a.download = slug + "-podio.csv";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
    showFeedback("Pódio exportado como CSV.", "info");
  }

  /** Copia texto para a área de transferência. Tenta a Clipboard API primeiro
   *  (assíncrona, padrão); cai para textarea+execCommand quando indisponível
   *  (ex.: contexto file:// em navegadores antigos). Retorna Promise. */
  function copyToClipboard(text) {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand && document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("execCommand copy retornou false"));
      } catch (e) {
        reject(e);
      }
    });
  }

  /** Monta um resumo Markdown compacto (Top 3 + vencedoras por prova) pronto
   *  para colar em WhatsApp/Telegram/email. Sem emojis para manter consistência
   *  com a UI; quem quiser pode adicionar manualmente após colar. */
  function buildResumoMarkdown() {
    if (!state.evento) return "";
    var ev = state.evento;
    var dados = state.dados || {};
    var meta = ev.meta || {};
    var out = compute();
    if (!out) return "";
    var ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
    var titulo = (meta.nome || "").trim() || "Evento sem nome";
    var data = (meta.data || "").trim();
    var local = (meta.local || "").trim();
    var lines = [];
    lines.push("# Pontuação Conclave — " + titulo);
    lines.push("");
    if (data || local) {
      var info = [];
      if (data) info.push("Data: " + data);
      if (local) info.push("Local: " + local);
      lines.push(info.join(" · "));
      lines.push("");
    }
    lines.push("## Classificação — Top 3");
    lines.push("");
    if (!ord.length) {
      lines.push("_Sem dados de classificação._");
    } else {
      ord.slice(0, 3).forEach(function (r, i) {
        lines.push(i + 1 + ". **" + r.igreja + "** — " + fmt(r.total) + " pts");
      });
    }
    lines.push("");
    lines.push("## Vencedoras por prova");
    lines.push("");
    var anyProva = false;
    PROVA_TIPO_ORDER.forEach(function (tipo) {
      var grouped = groupProvasByCategoria(tipo);
      var tipoLines = [];
      grouped.order.forEach(function (catKey) {
        var list = grouped.groups[catKey] || [];
        if (!list.length) return;
        tipoLines.push("**" + labelCategoria(catKey) + "**");
        list.forEach(function (p) {
          anyProva = true;
          var places = (dados.podium && dados.podium[p.id]) || {};
          var parts = ["ou", "pt", "br"]
            .map(function (mk) {
              var ent = places[mk] || {};
              var nome;
              if (ent.igrejaId) nome = igrejaNome(ent.igrejaId) || "—";
              else if (ent.nomeLivre && String(ent.nomeLivre).trim())
                nome = String(ent.nomeLivre).trim();
              else nome = "—";
              return medalLabel(mk) + " " + nome;
            })
            .join(" · ");
          var tituloProva = (p.titulo != null ? String(p.titulo) : "").trim() || "(sem título)";
          tipoLines.push("- " + tituloProva + ": " + parts);
        });
        tipoLines.push("");
      });
      if (tipoLines.length) {
        lines.push("### " + labelProvaTipo(tipo));
        lines.push("");
        lines.push.apply(lines, tipoLines);
      }
    });
    if (!anyProva) {
      lines.push("_Nenhuma prova cadastrada._");
      lines.push("");
    }
    lines.push("---");
    var stamp = new Date().toLocaleString("pt-BR");
    lines.push("_Resumo gerado em " + stamp + " · Pontuação Conclave_");
    return lines.join("\n");
  }

  function copyResumoMarkdown() {
    if (!state.evento) {
      showFeedback("Carregue um evento antes de copiar o resumo.", "warn");
      return;
    }
    var md = buildResumoMarkdown();
    if (!md) {
      showFeedback("Não há dados para resumir.", "warn");
      return;
    }
    copyToClipboard(md).then(
      function () {
        showFeedback("Resumo copiado para a área de transferência (Markdown).", "info");
      },
      function () {
        showFeedback(
          "Não foi possível copiar automaticamente. Tente novamente ou use «Gerar relatório oficial».",
          "warn"
        );
      }
    );
  }

  function renderRelatorios() {
    var host = $("#panel-relatorios");
    if (!host) return;
    host.innerHTML = "";
    var out = compute();
    if (!out) {
      host.textContent = "Sem dados.";
      return;
    }
    var outer = document.createElement("div");
    outer.className = "relatorio-wrap";

    // Ações do Relatório oficial — markup acordado com o web-design-specialist.
    var acoes = document.createElement("div");
    acoes.className = "relatorio-acoes";
    var btnGerar = document.createElement("button");
    btnGerar.type = "button";
    btnGerar.id = "btn-relatorio-oficial-gerar";
    btnGerar.className = "pill-btn pill-btn--primary";
    btnGerar.textContent = "Gerar relatório oficial";
    var btnPrint = document.createElement("button");
    btnPrint.type = "button";
    btnPrint.id = "btn-relatorio-oficial-print";
    btnPrint.className = "pill-btn";
    btnPrint.textContent = "Imprimir / Salvar PDF";
    btnPrint.hidden = true;
    var btnCsvPodio = document.createElement("button");
    btnCsvPodio.type = "button";
    btnCsvPodio.id = "btn-export-podio-csv";
    btnCsvPodio.className = "pill-btn";
    btnCsvPodio.textContent = "Exportar CSV (pódio)";
    btnCsvPodio.title = "Baixa o pódio de cada prova como .csv (Excel pt-BR pronto).";
    var btnCopyMd = document.createElement("button");
    btnCopyMd.type = "button";
    btnCopyMd.id = "btn-copy-resumo-md";
    btnCopyMd.className = "pill-btn";
    btnCopyMd.textContent = "Copiar resumo";
    btnCopyMd.title =
      "Copia um resumo em Markdown (top 3 + vencedoras por prova) para colar em mensagens.";
    acoes.appendChild(btnGerar);
    acoes.appendChild(btnPrint);
    acoes.appendChild(btnCsvPodio);
    acoes.appendChild(btnCopyMd);
    outer.appendChild(acoes);

    var oficialHost = document.createElement("div");
    oficialHost.id = "relatorio-oficial-host";
    outer.appendChild(oficialHost);

    // Se já foi gerado nesta sessão, re-render mantém visível e atualizado.
    if (state.relatorioOficialGerado) {
      renderRelatorioOficial(oficialHost);
      btnPrint.hidden = false;
    }

    var wrap1 = document.createElement("div");
    wrap1.className = "table-wrap";
    var t1 = document.createElement("table");
    t1.className = "data";
    t1.innerHTML =
      '<thead><tr><th scope="col">Igreja</th><th scope="col">Ouro</th><th scope="col">Prata</th><th scope="col">Bronze</th><th scope="col">Pts gincana</th></tr></thead>';
    var b1 = document.createElement("tbody");
    state.evento.igrejas.forEach(function (g) {
      var m = out.medalhasPorIgreja[g.id] || { ou: 0, pt: 0, br: 0 };
      var gg = out.gincanaPorIgreja[g.id] || 0;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(g.nome) +
        "</td><td>" +
        m.ou +
        "</td><td>" +
        m.pt +
        "</td><td>" +
        m.br +
        "</td><td>" +
        fmt(gg) +
        "</td>";
      b1.appendChild(tr);
    });
    t1.appendChild(b1);
    wrap1.appendChild(t1);

    appendRelatorioCollapsible(outer, "igreja", "Por igreja (medalhas)", [wrap1]);
    appendRelatorioCollapsible(outer, "prova", "Por prova (pódio)", [createRelatorioPodioWrap()]);
    host.appendChild(outer);
  }

  function wireRelatorios() {
    var host = $("#panel-relatorios");
    if (!host) return;

    host
      .querySelectorAll(".config-section-head[data-relatorio-section-toggle]")
      .forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          var key = btn.getAttribute("data-relatorio-section-toggle");
          if (!key) return;
          state.relatorioSectionCollapsed[key] = !state.relatorioSectionCollapsed[key];
          renderRelatorios();
          wireRelatorios();
          reactivatePanel();
        });
      });

    host.querySelectorAll("[data-relatorio-cat-action]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var action = btn.getAttribute("data-relatorio-cat-action");
        var raw = btn.getAttribute("data-prova-ids") || "";
        raw.split(",").forEach(function (id) {
          id = id.trim();
          if (!id) return;
          if (action === "collapse") state.relatorioPodiumCollapsed[id] = true;
          else delete state.relatorioPodiumCollapsed[id];
        });
        renderRelatorios();
        wireRelatorios();
        reactivatePanel();
      });
    });

    host.querySelectorAll(".prova-card-head[data-relatorio-prova-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var id = btn.getAttribute("data-relatorio-prova-toggle");
        if (!id) return;
        state.relatorioPodiumCollapsed[id] = !isRelatorioProvaCollapsed(id);
        renderRelatorios();
        wireRelatorios();
        reactivatePanel();
      });
    });

    // Relatório oficial: gerar (renderiza dentro do host) e imprimir/salvar PDF.
    var btnGerar = $("#btn-relatorio-oficial-gerar");
    var btnPrint = $("#btn-relatorio-oficial-print");
    var oficialHost = $("#relatorio-oficial-host");
    if (btnGerar && oficialHost) {
      btnGerar.addEventListener("click", function () {
        renderRelatorioOficial(oficialHost);
        state.relatorioOficialGerado = true;
        if (btnPrint) {
          btnPrint.hidden = false;
          try {
            btnPrint.focus();
          } catch (_e) {
            /* foco best-effort; alguns navegadores recusam focar botões recém-revelados */
          }
        }
        showFeedback(
          "Relatório oficial gerado. Use «Imprimir / Salvar PDF» para arquivar.",
          "info"
        );
      });
    }
    if (btnPrint) {
      btnPrint.addEventListener("click", function () {
        if (typeof window !== "undefined" && typeof window.print === "function") {
          window.print();
        }
      });
    }

    var btnCsvPodio = $("#btn-export-podio-csv");
    if (btnCsvPodio) {
      btnCsvPodio.addEventListener("click", function () {
        exportPodioCsv();
      });
    }
    var btnCopyMd = $("#btn-copy-resumo-md");
    if (btnCopyMd) {
      btnCopyMd.addEventListener("click", function () {
        copyResumoMarkdown();
      });
    }
  }

  /**
   * Monta o documento "Relatório oficial" dentro de `host`. Substitui o
   * conteúdo existente. Resiliente a evento/dados parciais — campos
   * ausentes viram «—» em vez de quebrar. Usa apenas DOM + textContent
   * (sem `innerHTML` com input do usuário) para evitar XSS via nomes de
   * igrejas/provas vindos de JSON importado.
   */
  function renderRelatorioOficial(host) {
    if (!host) return;
    host.innerHTML = "";
    var ev = state.evento;
    var dados = state.dados;
    if (!ev || !dados) {
      var emptyP = document.createElement("p");
      emptyP.className = "relatorio-oficial__empty";
      emptyP.textContent = "Carregue um evento para gerar o relatório oficial.";
      host.appendChild(emptyP);
      return;
    }
    var out = compute();
    if (!out) {
      var emptyP2 = document.createElement("p");
      emptyP2.className = "relatorio-oficial__empty";
      emptyP2.textContent = "Sem dados para gerar o relatório.";
      host.appendChild(emptyP2);
      return;
    }

    function el(tag, opts) {
      var node = document.createElement(tag);
      if (opts) {
        if (opts.className) node.className = opts.className;
        if (opts.text != null) node.textContent = String(opts.text);
        if (opts.attrs) {
          Object.keys(opts.attrs).forEach(function (k) {
            node.setAttribute(k, opts.attrs[k]);
          });
        }
      }
      return node;
    }
    function fmtDataHora(d) {
      try {
        return d.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch (_e) {
        return d.toISOString();
      }
    }
    function defRow(parent, dt, dd) {
      var div = document.createElement("div");
      var dtEl = document.createElement("dt");
      dtEl.textContent = dt;
      var ddEl = document.createElement("dd");
      ddEl.textContent = dd != null && dd !== "" ? String(dd) : "—";
      div.appendChild(dtEl);
      div.appendChild(ddEl);
      parent.appendChild(div);
    }
    function appendTabela(parent, headers, rows, top3Rows) {
      var tableWrap = el("div", { className: "table-wrap" });
      var table = el("table", { className: "data" });
      var thead = document.createElement("thead");
      var trH = document.createElement("tr");
      headers.forEach(function (h) {
        var th = document.createElement("th");
        th.scope = "col";
        th.textContent = h;
        trH.appendChild(th);
      });
      thead.appendChild(trH);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      rows.forEach(function (cells, idx) {
        var tr = document.createElement("tr");
        if (top3Rows) {
          var cls = top3Rows[idx];
          if (cls) tr.className = cls;
        }
        cells.forEach(function (val) {
          var td = document.createElement("td");
          td.textContent = val == null ? "—" : String(val);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      parent.appendChild(tableWrap);
    }

    var meta = ev.meta || {};
    var schemaVersion = meta.schemaVersion || CURRENT_SCHEMA_VERSION;
    var slug = meta.slug || "";
    var horarioInicio = meta.horarioInicio || "";
    var horarioFim = meta.horarioEncerramento || "";
    var horarioTxt;
    if (horarioInicio && horarioFim) horarioTxt = horarioInicio + " — " + horarioFim;
    else if (horarioInicio) horarioTxt = horarioInicio;
    else if (horarioFim) horarioTxt = horarioFim;
    else horarioTxt = "—";
    var temaTexto = isErUiTheme() ? "ER" : "MR";
    var agora = new Date();
    var agoraTxt = fmtDataHora(agora);

    var ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
    var top1 = ord[0] || null;
    var top2 = ord[1] || null;
    var top3 = ord[2] || null;

    var totalOu = 0;
    var totalPt = 0;
    var totalBr = 0;
    Object.keys(out.medalhasPorIgreja || {}).forEach(function (gid) {
      var m = out.medalhasPorIgreja[gid] || {};
      totalOu += Number(m.ou || 0);
      totalPt += Number(m.pt || 0);
      totalBr += Number(m.br || 0);
    });
    var avisosPodio = E.avisosPodiumDuplicado(dados.podium || {});
    var orphans = findProjetoOrphanRefs({ evento: ev, dados: dados });

    var doc = el("section", {
      className: "relatorio-oficial",
      attrs: { "aria-label": "Relatório oficial" },
    });

    // 1) Capa
    var blocoCapa = el("section", {
      className: "relatorio-oficial__bloco relatorio-oficial__capa",
      attrs: { "data-bloco": "capa" },
    });
    blocoCapa.appendChild(
      el("p", { className: "relatorio-oficial__eyebrow", text: "Pontuação Conclave" })
    );
    blocoCapa.appendChild(
      el("h2", { className: "relatorio-oficial__titulo", text: "Relatório oficial" })
    );
    blocoCapa.appendChild(
      el("p", { className: "relatorio-oficial__evento", text: meta.nome || "—" })
    );
    var dlMeta = el("dl", { className: "relatorio-oficial__meta" });
    defRow(dlMeta, "Slug", slug);
    defRow(dlMeta, "Data", meta.data || "");
    defRow(dlMeta, "Horário", horarioTxt);
    defRow(dlMeta, "Tema", temaTexto);
    defRow(dlMeta, "Schema", "v" + schemaVersion);
    defRow(dlMeta, "Gerado em", agoraTxt);
    blocoCapa.appendChild(dlMeta);
    doc.appendChild(blocoCapa);

    // 2) Sumário executivo
    var blocoSumario = el("section", {
      className: "relatorio-oficial__bloco",
      attrs: { "data-bloco": "sumario" },
    });
    blocoSumario.appendChild(el("h3", { text: "Sumário executivo" }));
    var sumarioUl = el("ul", { className: "relatorio-oficial__sumario" });
    function podiumLi(label, det) {
      var li = document.createElement("li");
      var strong = document.createElement("strong");
      strong.textContent = label + ":";
      li.appendChild(strong);
      if (det) {
        li.appendChild(document.createTextNode(" " + det.igreja + " (" + fmt(det.total) + " pts)"));
      } else {
        li.appendChild(document.createTextNode(" —"));
      }
      return li;
    }
    function infoLi(label, valor) {
      var li = document.createElement("li");
      var strong = document.createElement("strong");
      strong.textContent = label + ":";
      li.appendChild(strong);
      li.appendChild(document.createTextNode(" " + valor));
      return li;
    }
    sumarioUl.appendChild(podiumLi("Vencedora", top1));
    sumarioUl.appendChild(podiumLi("2º lugar", top2));
    sumarioUl.appendChild(podiumLi("3º lugar", top3));
    var nIgrejas = Array.isArray(ev.igrejas) ? ev.igrejas.length : 0;
    var nProvas = Array.isArray(ev.provas) ? ev.provas.length : 0;
    sumarioUl.appendChild(infoLi("Igrejas participantes", String(nIgrejas)));
    sumarioUl.appendChild(infoLi("Provas", String(nProvas)));
    sumarioUl.appendChild(
      infoLi(
        "Medalhas distribuídas",
        "ouro " + totalOu + " · prata " + totalPt + " · bronze " + totalBr
      )
    );
    blocoSumario.appendChild(sumarioUl);
    doc.appendChild(blocoSumario);

    // 3) Classificação geral
    var blocoClass = el("section", {
      className: "relatorio-oficial__bloco",
      attrs: { "data-bloco": "classificacao" },
    });
    blocoClass.appendChild(el("h3", { text: "Classificação geral" }));
    var classRows = ord.map(function (r) {
      return [
        String(r.posicao),
        r.igreja,
        fmt(r.participacao),
        fmt(r.punicoes),
        fmt(r.gincana),
        fmt(r.pontuacao_extra),
        fmt(r.total),
      ];
    });
    var top3Classes = ord.map(function (r) {
      var pos = Number(r.posicao);
      if (pos === 1) return "relatorio-oficial__top3 relatorio-oficial__top3--1";
      if (pos === 2) return "relatorio-oficial__top3 relatorio-oficial__top3--2";
      if (pos === 3) return "relatorio-oficial__top3 relatorio-oficial__top3--3";
      return "";
    });
    appendTabela(
      blocoClass,
      ["Posição", "Igreja", "Participação", "Punições", "Gincana", "Extra", "Total"],
      classRows,
      top3Classes
    );
    doc.appendChild(blocoClass);

    // 4) Medalhas por igreja
    var blocoMed = el("section", {
      className: "relatorio-oficial__bloco",
      attrs: { "data-bloco": "medalhas" },
    });
    blocoMed.appendChild(el("h3", { text: "Medalhas por igreja" }));
    var medRows = (ev.igrejas || []).map(function (g) {
      var m = out.medalhasPorIgreja[g.id] || { ou: 0, pt: 0, br: 0 };
      var gg = out.gincanaPorIgreja[g.id] || 0;
      return [g.nome || "—", String(m.ou), String(m.pt), String(m.br), fmt(gg)];
    });
    appendTabela(blocoMed, ["Igreja", "Ouro", "Prata", "Bronze", "Pts gincana"], medRows);
    doc.appendChild(blocoMed);

    // 5) Pódio por prova (agrupado por categoria — reaproveita groupProvasByCategoria)
    var blocoPodio = el("section", {
      className: "relatorio-oficial__bloco",
      attrs: { "data-bloco": "podio" },
    });
    blocoPodio.appendChild(el("h3", { text: "Pódio por prova" }));
    var algumaProva = false;
    PROVA_TIPO_ORDER.forEach(function (tipo) {
      var grouped = groupProvasByCategoria(tipo);
      var listTipo = [];
      grouped.order.forEach(function (catKey) {
        var list = grouped.groups[catKey] || [];
        list.forEach(function (p) {
          listTipo.push({ catKey: catKey, p: p });
        });
      });
      if (!listTipo.length) return;
      algumaProva = true;
      blocoPodio.appendChild(el("h4", { text: labelProvaTipo(tipo) }));
      listTipo.forEach(function (item) {
        var p = item.p;
        var card = el("div", {
          className: "relatorio-oficial__prova",
          attrs: { "data-prova": p.id },
        });
        card.appendChild(
          el("p", {
            className: "relatorio-oficial__prova-titulo",
            text:
              labelCategoria(item.catKey) +
              " — " +
              nomeProvaExibicao(p),
          })
        );
        var ol = el("ol", { className: "relatorio-oficial__podio" });
        var places = (dados.podium && dados.podium[p.id]) || {};
        ["ou", "pt", "br"].forEach(function (mk) {
          var ent = places[mk] || {};
          var li = document.createElement("li");
          li.setAttribute("data-medalha", mk);
          var nome;
          if (ent.igrejaId) nome = igrejaNome(ent.igrejaId) || "—";
          else if (ent.nomeLivre && String(ent.nomeLivre).trim())
            nome = String(ent.nomeLivre).trim();
          else nome = "—";
          var comp = ent.competidor ? String(ent.competidor).trim() : "";
          var txt = medalLabel(mk) + " — " + nome;
          if (comp) txt += " (" + comp + ")";
          li.textContent = txt;
          ol.appendChild(li);
        });
        card.appendChild(ol);
        blocoPodio.appendChild(card);
      });
    });
    if (!algumaProva) {
      blocoPodio.appendChild(el("p", { text: "Nenhuma prova cadastrada." }));
    }
    doc.appendChild(blocoPodio);

    // 6) Detalhe de participação por igreja
    var blocoPart = el("section", {
      className: "relatorio-oficial__bloco",
      attrs: { "data-bloco": "participacao" },
    });
    blocoPart.appendChild(el("h3", { text: "Detalhe de participação por igreja" }));
    var labelsPart = [
      "Igreja",
      isErUiTheme() ? "Pastor" : "Inscr.",
      "Pont.",
      isErUiTheme() ? "Emb. tot." : "MR total",
      isErUiTheme() ? "Emb. camisa" : "MR camisa",
      isErUiTheme() ? "Emb. bíblia" : "MR bíblia",
      "Visit.",
      "Anim.",
      "Mau comp.",
      "Extra",
    ];
    var partRows = (ev.igrejas || []).map(function (g) {
      var row = (dados.participacao && dados.participacao[g.id]) || {};
      var extra = row.pontuacao_extra != null ? row.pontuacao_extra : row.embaixadas;
      return [
        g.nome || "—",
        row.inscricao ? "Sim" : "Não",
        row.pontualidade ? "Sim" : "Não",
        fmt(row.mr_total || 0),
        fmt(row.mr_camisa || 0),
        fmt(row.mr_biblia || 0),
        fmt(row.visitantes || 0),
        row.animacao ? "Sim" : "Não",
        row.mau_comportamento ? "Sim" : "Não",
        fmt(extra || 0),
      ];
    });
    appendTabela(blocoPart, labelsPart, partRows);
    doc.appendChild(blocoPart);

    // 7) Avisos
    var blocoAvisos = el("section", {
      className: "relatorio-oficial__bloco",
      attrs: { "data-bloco": "avisos" },
    });
    blocoAvisos.appendChild(el("h3", { text: "Avisos e inconsistências" }));
    var todosAvisos = avisosPodio.concat(orphans);
    if (!todosAvisos.length) {
      blocoAvisos.appendChild(el("p", { text: "Nenhum aviso." }));
    } else {
      var ulAv = document.createElement("ul");
      todosAvisos.forEach(function (msg) {
        var li = document.createElement("li");
        li.textContent = msg;
        ulAv.appendChild(li);
      });
      blocoAvisos.appendChild(ulAv);
    }
    doc.appendChild(blocoAvisos);

    // 8) Apêndice — critérios
    var blocoCrit = el("section", {
      className: "relatorio-oficial__bloco",
      attrs: { "data-bloco": "criterios" },
    });
    blocoCrit.appendChild(el("h3", { text: "Critérios usados" }));
    blocoCrit.appendChild(el("h4", { text: "Pesos" }));
    var dlPesos = el("dl", { className: "relatorio-oficial__defs" });
    var pz = ev.pesos || {};
    defRow(
      dlPesos,
      isErUiTheme() ? "Pastor (pts se marcado)" : "Inscrição (pts se marcado)",
      fmt(pz.inscricao || 0)
    );
    defRow(dlPesos, "Pontualidade (pts se marcado)", fmt(pz.pontualidade || 0));
    defRow(
      dlPesos,
      isErUiTheme()
        ? "Uniforme (pts se emb. camisa = emb. tot.)"
        : "Uniforme (pts se MR camisa = MR tot.)",
      fmt(pz.uniforme || 0)
    );
    defRow(
      dlPesos,
      isErUiTheme()
        ? "Bíblia (pts se emb. bíblia = emb. tot.)"
        : "Bíblia (pts se MR bíblia = MR tot.)",
      fmt(pz.biblia || 0)
    );
    defRow(dlPesos, "Visitante (pts por visitante)", fmt(pz.visitante || 0));
    defRow(dlPesos, "Animação (pts se marcado)", fmt(pz.animacao || 0));
    defRow(dlPesos, "Mau comportamento (pts se marcado)", fmt(pz.mau_comportamento || 0));
    blocoCrit.appendChild(dlPesos);

    blocoCrit.appendChild(el("h4", { text: "Valores de medalha" }));
    var dlMed = el("dl", { className: "relatorio-oficial__defs" });
    var medConf = ev.medalhas || {};
    defRow(dlMed, "Ouro", fmt(medConf.ou || 0));
    defRow(dlMed, "Prata", fmt(medConf.pt || 0));
    defRow(dlMed, "Bronze", fmt(medConf.br || 0));
    blocoCrit.appendChild(dlMed);

    blocoCrit.appendChild(el("h4", { text: "Ordem de desempate" }));
    var olDes = document.createElement("ol");
    [
      "Medalhas de ouro (desc).",
      "Medalhas de prata (desc).",
      "Pontos em Conhecimentos Gerais da Bíblia.",
      "Pontos em Debate de Versículos.",
      "Pontos em Conhecimentos Gerais da Organização.",
      "Nome da igreja (ordenação pt-BR).",
    ].forEach(function (txt) {
      var li = document.createElement("li");
      li.textContent = txt;
      olDes.appendChild(li);
    });
    blocoCrit.appendChild(olDes);
    doc.appendChild(blocoCrit);

    // 9) Rodapé
    var rodape = el("footer", { className: "relatorio-oficial__rodape" });
    rodape.appendChild(
      el("p", {
        text:
          "Gerado em " + agoraTxt + " · slug: " + (slug || "—") + " · schema: v" + schemaVersion,
      })
    );
    doc.appendChild(rodape);

    host.appendChild(doc);
  }

  function wireParticipacao(root) {
    root = root || document;
    root.querySelectorAll("#panel-participacao input[data-gid]").forEach(function (inp) {
      function sync() {
        var gid = inp.getAttribute("data-gid");
        var f = inp.getAttribute("data-f");
        if (!state.dados.participacao[gid]) return;
        if (inp.type === "checkbox") state.dados.participacao[gid][f] = inp.checked;
        else state.dados.participacao[gid][f] = Number(inp.value);
        scheduleSave();
        if (inp.type === "number") scheduleDerivedRefresh(120);
        else refreshDerivedPanels();
      }
      inp.addEventListener("change", sync);
      if (inp.type === "number") inp.addEventListener("input", sync);
    });
    root.querySelectorAll("#panel-participacao button.part-bool-all").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var field = btn.getAttribute("data-part-bool-field");
        var val = btn.getAttribute("data-part-bool-val") === "1";
        if (!field || !state.dados || !state.dados.participacao || !state.evento.igrejas) return;
        state.evento.igrejas.forEach(function (g) {
          var row = state.dados.participacao[g.id];
          if (row) row[field] = val;
        });
        scheduleSave();
        refreshDerivedPanels();
        renderParticipacao();
        wireParticipacao();
        reactivatePanel();
      });
    });
  }

  function wirePodio(root) {
    root = root || document;
    root.querySelectorAll("#panel-podio .podium-col-btn[data-cat-action]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var action = btn.getAttribute("data-cat-action");
        var raw = btn.getAttribute("data-prova-ids") || "";
        raw.split(",").forEach(function (id) {
          id = id.trim();
          if (!id) return;
          if (action === "collapse") state.podiumCollapsed[id] = true;
          else delete state.podiumCollapsed[id];
        });
        renderPodio();
        wirePodio();
        reactivatePanel();
      });
    });
    root
      .querySelectorAll("#panel-podio .prova-card-head[data-prova-toggle]")
      .forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          var id = btn.getAttribute("data-prova-toggle");
          if (!id) return;
          state.podiumCollapsed[id] = !isProvaCollapsed(id);
          renderPodio();
          wirePodio();
          reactivatePanel();
        });
      });
    root.querySelectorAll("#panel-podio input.sel-igreja").forEach(function (el) {
      el.addEventListener("change", onPodioChange);
      el.addEventListener("blur", onPodioChange);
    });
    root.querySelectorAll("#panel-podio input.inp-comp").forEach(function (el) {
      el.addEventListener("change", onPodioChange);
      el.addEventListener("input", onPodioChange);
    });
  }

  function onPodioChange(ev) {
    var sel = ev.target;
    var pid = sel.getAttribute("data-prova");
    var mk = sel.getAttribute("data-medal");
    if (!state.dados.podium[pid]) state.dados.podium[pid] = { ou: {}, pt: {}, br: {} };
    if (!state.dados.podium[pid][mk])
      state.dados.podium[pid][mk] = { igrejaId: null, competidor: "" };
    if (sel.classList && sel.classList.contains("sel-igreja")) {
      var nome = sel.value.trim();
      var id = resolveIgrejaIdFromNome(nome);
      state.dados.podium[pid][mk].igrejaId = id;
      if (id) {
        delete state.dados.podium[pid][mk].nomeLivre;
        if (igrejaNome(id) !== sel.value) sel.value = igrejaNome(id);
      } else {
        if (nome) state.dados.podium[pid][mk].nomeLivre = nome;
        else delete state.dados.podium[pid][mk].nomeLivre;
      }
      scheduleSave();
      refreshDerivedPanels();
      renderPodio();
      wirePodio();
      reactivatePanel();
      return;
    }
    state.dados.podium[pid][mk].competidor = sel.value;
    scheduleSave();
    refreshDerivedPanels();
  }

  function renderPanels() {
    renderDashboard();
    wireDashboard();
    renderConfig();
    wireConfig();
    renderParticipacao();
    wireParticipacao();
    renderPodio();
    wirePodio();
    renderClassificacao();
    renderRelatorios();
    wireRelatorios();
    syncTabPanels();
  }

  function render() {
    withFocusPreserved(function () {
      validate();
      setHeader();
      renderBootHint();
      renderErrors();
      renderWarnings();
      renderTabs();
      renderPanels();
      if (document.body.classList.contains("presentation-mode")) {
        var presHost = document.getElementById("presentation-host");
        if (presHost && !presHost.hidden) renderScoreboard(presHost);
      }
    });
  }

  function isErUiTheme() {
    return document.documentElement.getAttribute("data-ui-theme") === "er";
  }

  /** Regulamento ER: medalhas no pódio 500 / 300 / 150; extras de participação +100 cada (pastor, pontualidade, uniforme, bíblia). */
  function applyErClassificationPreset(ev) {
    if (!ev) return;
    if (!ev.medalhas) ev.medalhas = {};
    ev.medalhas.ou = 500;
    ev.medalhas.pt = 300;
    ev.medalhas.br = 150;
    if (!ev.pesos) ev.pesos = {};
    ev.pesos.inscricao = 100;
    ev.pesos.pontualidade = 100;
    ev.pesos.uniforme = 100;
    ev.pesos.biblia = 100;
    ev.pesos.visitante = 0;
    ev.pesos.animacao = 0;
  }

  function isObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  function isNumberValue(v) {
    return typeof v === "number" && Number.isFinite(v);
  }

  function validateEventoSchemaLike(evento) {
    var errs = [];
    if (!isObject(evento)) return ["Raiz do evento deve ser um objeto JSON."];
    if (!isObject(evento.meta)) errs.push("meta deve ser objeto.");
    if (!isObject(evento.pesos)) errs.push("pesos deve ser objeto.");
    if (!isObject(evento.medalhas)) errs.push("medalhas deve ser objeto.");
    if (!Array.isArray(evento.igrejas) || !evento.igrejas.length)
      errs.push("igrejas deve ter ao menos um item.");
    if (!Array.isArray(evento.provas) || !evento.provas.length)
      errs.push("provas deve ter ao menos um item.");

    if (isObject(evento.meta)) {
      if (!isNonEmptyString(evento.meta.nome)) errs.push("meta.nome deve ser texto não vazio.");
      if (!/^[a-z0-9-]+$/.test(String(evento.meta.slug || ""))) {
        errs.push("meta.slug deve conter apenas letras minúsculas, números e hífen.");
      }
    }

    if (isObject(evento.pesos)) {
      [
        "inscricao",
        "pontualidade",
        "uniforme",
        "biblia",
        "visitante",
        "animacao",
        "mau_comportamento",
      ].forEach(function (k) {
        if (!isNumberValue(evento.pesos[k])) errs.push("pesos." + k + " deve ser número.");
      });
    }

    if (isObject(evento.medalhas)) {
      ["ou", "pt", "br"].forEach(function (k) {
        if (!isNumberValue(evento.medalhas[k])) errs.push("medalhas." + k + " deve ser número.");
      });
    }

    var igrejaIds = {};
    if (Array.isArray(evento.igrejas)) {
      evento.igrejas.forEach(function (g, idx) {
        if (!isObject(g)) {
          errs.push("igrejas[" + idx + "] deve ser objeto.");
          return;
        }
        var id = String(g.id || "");
        if (!/^[a-z0-9_-]+$/.test(id)) {
          errs.push("igrejas[" + idx + "].id inválido.");
        } else if (igrejaIds[id]) {
          errs.push("igrejas[" + idx + "].id duplicado: «" + id + "».");
        } else {
          igrejaIds[id] = true;
        }
        if (!isNonEmptyString(g.nome))
          errs.push("igrejas[" + idx + "].nome deve ser texto não vazio.");
      });
    }

    var categoriaIds = {};
    if (evento.categorias != null && !Array.isArray(evento.categorias)) {
      errs.push("categorias deve ser uma lista (ou ser omitido).");
    } else if (Array.isArray(evento.categorias)) {
      evento.categorias.forEach(function (c, idx) {
        if (!isObject(c)) {
          errs.push("categorias[" + idx + "] deve ser objeto.");
          return;
        }
        var id = String(c.id || "");
        if (!/^[a-z0-9_-]+$/.test(id)) {
          errs.push("categorias[" + idx + "].id inválido.");
        } else if (categoriaIds[id]) {
          errs.push("categorias[" + idx + "].id duplicado: «" + id + "».");
        } else {
          categoriaIds[id] = true;
        }
        if (!isNonEmptyString(c.nome))
          errs.push("categorias[" + idx + "].nome deve ser texto não vazio.");
        if (!Number.isInteger(c.ordem) || c.ordem < 0)
          errs.push("categorias[" + idx + "].ordem deve ser inteiro >= 0.");
      });
    }

    var provaIds = {};
    if (Array.isArray(evento.provas)) {
      evento.provas.forEach(function (p, idx) {
        if (!isObject(p)) {
          errs.push("provas[" + idx + "] deve ser objeto.");
          return;
        }
        var id = String(p.id || "");
        if (!/^[a-z0-9_-]+$/.test(id)) {
          errs.push("provas[" + idx + "].id inválido.");
        } else if (provaIds[id]) {
          errs.push("provas[" + idx + "].id duplicado: «" + id + "».");
        } else {
          provaIds[id] = true;
        }
        if (!isNonEmptyString(p.titulo))
          errs.push("provas[" + idx + "].titulo deve ser texto não vazio.");
        if (!Number.isInteger(p.ordem) || p.ordem < 0)
          errs.push("provas[" + idx + "].ordem deve ser inteiro >= 0.");
        // Quando o evento tem `categorias[]`, exigir que `categoriaId`
        // (se preenchido) referencie alguém da lista.
        if (
          p.categoriaId != null &&
          Array.isArray(evento.categorias) &&
          evento.categorias.length &&
          !categoriaIds[String(p.categoriaId)]
        ) {
          errs.push(
            "provas[" + idx + "].categoriaId «" + p.categoriaId + "» não existe em categorias."
          );
        }
      });
    }

    return errs;
  }

  function validateProjetoSchemaLike(projeto) {
    var errs = [];
    if (!isObject(projeto)) return ["Raiz do projeto deve ser um objeto JSON."];
    if (!isObject(projeto.evento)) errs.push("evento deve ser objeto.");
    if (!isObject(projeto.dados)) errs.push("dados deve ser objeto.");
    if (isObject(projeto.dados)) {
      if (!isObject(projeto.dados.participacao)) errs.push("dados.participacao deve ser objeto.");
      if (!isObject(projeto.dados.podium)) errs.push("dados.podium deve ser objeto.");
    }
    return errs.concat(isObject(projeto.evento) ? validateEventoSchemaLike(projeto.evento) : []);
  }

  /** Avisos não-fatais sobre referências de `dados` que não existem em
   *  `evento`. Projetos legados podem ter igrejas/provas removidas; ao
   *  importar, `syncDadosWithEvento` limpará esses órfãos — mas o usuário
   *  deve ser informado antes de a limpeza acontecer. */
  function findProjetoOrphanRefs(projeto) {
    var avisos = [];
    if (!isObject(projeto) || !isObject(projeto.evento) || !isObject(projeto.dados)) return avisos;
    if (!Array.isArray(projeto.evento.igrejas) || !Array.isArray(projeto.evento.provas))
      return avisos;
    var igrejaSet = {};
    projeto.evento.igrejas.forEach(function (g) {
      if (g && g.id) igrejaSet[g.id] = true;
    });
    var provaSet = {};
    projeto.evento.provas.forEach(function (p) {
      if (p && p.id) provaSet[p.id] = true;
    });
    if (isObject(projeto.dados.participacao)) {
      Object.keys(projeto.dados.participacao).forEach(function (gid) {
        if (!igrejaSet[gid]) avisos.push("Participação ignorada: igreja «" + gid + "» não existe.");
      });
    }
    if (isObject(projeto.dados.podium)) {
      Object.keys(projeto.dados.podium).forEach(function (pid) {
        if (!provaSet[pid]) {
          avisos.push("Pódio ignorado: prova «" + pid + "» não existe.");
          return;
        }
        var places = projeto.dados.podium[pid];
        if (!isObject(places)) return;
        ["ou", "pt", "br"].forEach(function (k) {
          var entry = places[k];
          if (entry && entry.igrejaId && !igrejaSet[entry.igrejaId]) {
            avisos.push(
              "Pódio «" + pid + "»: igreja «" + entry.igrejaId + "» será limpa (não existe)."
            );
          }
        });
      });
    }
    return avisos;
  }

  function setEvento(ev, mergeDados) {
    var errs = validateEventoSchemaLike(ev).concat(E.validateEventoMinimal(ev));
    if (errs.length) {
      showFeedback("Evento inválido: " + errs.slice(0, 3).join(" · "), "error");
      return false;
    }
    // Garante que qualquer save pendente do evento atual seja gravado antes
    // de trocar o slug — evita corrida com o debounce de scheduleSave.
    flushScheduledSave();
    state.persistFailed = false;
    state.evento = ev;
    normalizeEvento(state.evento);
    if (isErUiTheme()) applyErClassificationPreset(state.evento);
    state.autoLoadFailed = false;
    state.podiumCollapsed = {};
    state.configSectionCollapsed = {};
    state.relatorioSectionCollapsed = {};
    state.relatorioPodiumCollapsed = {};
    state.relatorioOficialGerado = false;
    var ids = state.evento.igrejas.map(function (g) {
      return g.id;
    });
    var pids = state.evento.provas.map(function (p) {
      return p.id;
    });
    if (mergeDados && mergeDados.participacao && mergeDados.podium) {
      state.dados = mergeDados;
      syncDadosWithEvento();
    } else {
      state.dados = E.emptyDadosTemplate(ids, pids);
    }
    validate();
    scheduleSave();
    render();
    return true;
  }

  function onFileEvento(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var ev = JSON.parse(r.result);
        var schemaErrs = validateEventoSchemaLike(ev);
        if (schemaErrs.length) {
          showFeedback("Evento inválido: " + schemaErrs.slice(0, 3).join(" · "), "error");
          return;
        }
        var slug = ev.meta && ev.meta.slug;
        var saved = slug ? loadFromStorage(slug) : null;
        if (saved && saved.dados) {
          requestConfirmation(
            "Encontramos dados salvos para este evento no navegador. Restaurar?",
            function () {
              if (setEvento(ev, saved.dados)) {
                showFeedback("Projeto restaurado com dados salvos localmente.", "info");
              }
            },
            function () {
              if (setEvento(ev, null))
                showFeedback("Evento carregado sem restauração de dados.", "info");
            }
          );
        } else {
          if (setEvento(ev, null)) showFeedback("Evento carregado com sucesso.", "info");
        }
      } catch (e) {
        showFeedback("JSON inválido no arquivo de evento: " + e, "error");
      }
    };
    r.onerror = function () {
      showFeedback("Falha ao ler o arquivo de evento. Tente novamente.", "error");
    };
    r.readAsText(file, "UTF-8");
  }

  function onFileProjeto(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var projeto = JSON.parse(r.result);
        var schemaErrs = validateProjetoSchemaLike(projeto);
        if (schemaErrs.length) {
          showFeedback("Projeto inválido: " + schemaErrs.slice(0, 3).join(" · "), "error");
          return;
        }
        var orphans = findProjetoOrphanRefs(projeto);
        if (setEvento(projeto.evento, projeto.dados)) {
          if (orphans.length) {
            showFeedback(
              "Projeto importado com avisos: " + orphans.slice(0, 3).join(" · "),
              "warn"
            );
          } else {
            showFeedback("Projeto importado com sucesso.", "info");
          }
        }
      } catch (e) {
        showFeedback("Projeto inválido: " + e, "error");
      }
    };
    r.onerror = function () {
      showFeedback("Falha ao ler o arquivo de projeto. Tente novamente.", "error");
    };
    r.readAsText(file, "UTF-8");
  }

  function exportEvento() {
    if (!state.evento) return;
    var blob = new Blob([JSON.stringify(state.evento, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = (state.evento.meta.slug || "evento") + ".evento.json";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
    showFeedback("Evento exportado (somente configuração).", "info");
  }

  function exportProjeto() {
    if (!state.evento || !state.dados) return;
    var blob = new Blob([JSON.stringify({ evento: state.evento, dados: state.dados }, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = (state.evento.meta.slug || "projeto") + ".projeto.json";
    a.click();
    // Revogar tarde: alguns navegadores (Safari) cancelam o download se a URL
    // for liberada de forma síncrona após `.click()`.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function buildNovoEventoSeed() {
    return {
      meta: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        nome: "Novo evento",
        slug: "novo-evento",
        data: "",
      },
      pesos: {
        inscricao: 100,
        pontualidade: 200,
        uniforme: 50,
        biblia: 50,
        visitante: 10,
        animacao: 150,
        mau_comportamento: -150,
      },
      medalhas: { ou: 300, pt: 200, br: 100 },
      igrejas: [{ id: "igreja-1", nome: "Igreja 1" }],
      provas: [{ id: "prova-1", titulo: "Prova 1", ordem: 1, tipo: "oral", categoria: "Geral" }],
    };
  }

  function criarNovoEvento() {
    function doCriar() {
      var ev = buildNovoEventoSeed();
      if (setEvento(ev, null)) {
        state.tab = "config";
        render();
        showFeedback(
          "Novo evento criado. Edite os campos na aba «Configuração» e adicione suas igrejas e provas.",
          "info"
        );
      }
    }
    if (state.evento) {
      requestConfirmation(
        "Criar um novo evento substituirá o evento atualmente aberto. Os dados não exportados serão perdidos. Continuar?",
        doCriar,
        null,
        { destructive: true, confirmLabel: "Substituir" }
      );
    } else {
      doCriar();
    }
  }

  function novoProjetoDados() {
    if (!state.evento) return;
    requestConfirmation(
      "Limpar todos os dados preenchidos deste evento?",
      function () {
        var ids = state.evento.igrejas.map(function (g) {
          return g.id;
        });
        var pids = state.evento.provas.map(function (p) {
          return p.id;
        });
        state.dados = E.emptyDadosTemplate(ids, pids);
        state.podiumCollapsed = {};
        state.relatorioOficialGerado = false;
        scheduleSave();
        render();
        showFeedback("Dados do evento foram limpos.", "info");
      },
      null,
      { destructive: true, confirmLabel: "Limpar" }
    );
  }

  var UI_THEME_KEY = "conclave-ui-theme";

  function getStoredUiTheme() {
    try {
      var t = localStorage.getItem(UI_THEME_KEY);
      return t === "er" ? "er" : "mr";
    } catch (_e) {
      return "mr";
    }
  }

  function applyUiTheme(theme, opts) {
    opts = opts || {};
    var t = theme === "er" ? "er" : "mr";
    var current = document.documentElement.getAttribute("data-ui-theme") || "mr";
    if (!opts.skipConfirm && state.evento && t !== current && t === "er") {
      requestConfirmation(
        "Ao mudar para o tema ER, os pesos de participação e os valores de medalhas serão substituídos pelo preset do Encontro Real. Deseja continuar?",
        function () {
          applyUiTheme(t, { skipConfirm: true });
        },
        null,
        { confirmLabel: "Aplicar preset ER" }
      );
      return;
    }
    document.documentElement.setAttribute("data-ui-theme", t);
    try {
      localStorage.setItem(UI_THEME_KEY, t);
    } catch (_e) {
      /* localStorage indisponível (modo privado/cota); seguir sem persistir tema */
    }
    var mr = $("#theme-mr");
    var er = $("#theme-er");
    if (mr) mr.classList.toggle("active", t === "mr");
    if (er) er.classList.toggle("active", t === "er");
    if (state.evento) {
      if (t === "er") applyErClassificationPreset(state.evento);
      scheduleSave();
      validate();
      render();
    }
  }

  function initThemeToggle() {
    var mr = $("#theme-mr");
    var er = $("#theme-er");
    if (mr) {
      mr.addEventListener("click", function () {
        applyUiTheme("mr");
      });
    }
    if (er) {
      er.addEventListener("click", function () {
        applyUiTheme("er");
      });
    }
  }

  function initToolbar() {
    $("#file-evento") &&
      $("#file-evento").addEventListener("change", function () {
        var f = $("#file-evento").files[0];
        if (f) onFileEvento(f);
        $("#file-evento").value = "";
      });
    $("#file-projeto") &&
      $("#file-projeto").addEventListener("change", function () {
        var f = $("#file-projeto").files[0];
        if (f) onFileProjeto(f);
        $("#file-projeto").value = "";
      });
    $("#btn-novo-evento") && $("#btn-novo-evento").addEventListener("click", criarNovoEvento);
    $("#btn-export-evento") && $("#btn-export-evento").addEventListener("click", exportEvento);
    $("#btn-export") && $("#btn-export").addEventListener("click", exportProjeto);
    $("#btn-regulamento") &&
      $("#btn-regulamento").addEventListener("click", function () {
        if (!state.evento || !state.evento.meta) return;
        var u = state.evento.meta.regulamentoUrl;
        if (!u || !String(u).trim()) return;
        window.open(resolveAssetUrl(String(u).trim()), "_blank", "noopener,noreferrer");
      });
    $("#btn-novo-dados") && $("#btn-novo-dados").addEventListener("click", novoProjetoDados);
    $("#btn-eventos-salvos") &&
      $("#btn-eventos-salvos").addEventListener("click", openEventosSalvosModal);
    $("#btn-print") &&
      $("#btn-print").addEventListener("click", function () {
        // Pequena dica antes de abrir o diálogo: usuários costumam não saber
        // que "Salvar como PDF" é um destino do diálogo nativo do navegador.
        showFeedback(
          "Abrindo a impressão. No diálogo, selecione «Salvar como PDF» se quiser gerar um arquivo.",
          "info"
        );
        // Aguarda o feedback aparecer antes de abrir o diálogo (que bloqueia
        // a thread em alguns navegadores).
        setTimeout(function () {
          window.print();
        }, 80);
      });
    $("#btn-exit-presentation") &&
      $("#btn-exit-presentation").addEventListener("click", function () {
        setPresentationMode(false);
      });
    $("#btn-pres") &&
      $("#btn-pres").addEventListener("click", function () {
        setPresentationMode(!document.body.classList.contains("presentation-mode"));
      });
    // Esc sai do modo apresentação (diretriz de UX para projetores: rota
    // rápida quando o controle remoto não está acessível).
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && document.body.classList.contains("presentation-mode")) {
        // Se o modal de confirmação estiver aberto, deixe-o tratar primeiro.
        var confirmEl = document.getElementById("modal-confirm");
        if (confirmEl && confirmEl.classList.contains("open")) return;
        setPresentationMode(false);
      }
    });
    initMoreMenu();
    initFileProtocolHint();
  }

  /**
   * Revela a dica sobre `file://` apenas quando a página foi aberta direto
   * do disco. O markup começa com `hidden`; aqui apenas hidratamos o caso
   * em que ela é útil. Restringe ao header para não afetar outras `.hint`
   * que existam em outras telas.
   */
  function initFileProtocolHint() {
    if (typeof window === "undefined" || !window.location) return;
    if (window.location.protocol !== "file:") return;
    // Layout novo: .topbar-hint; layout legado: .app-header .hint. Mostra ambas
    // (uma só existe em cada página).
    var hint =
      document.querySelector(".topbar-hint") || document.querySelector(".app-header .hint");
    if (hint) hint.hidden = false;
  }

  /**
   * Popover acessível ancorado a `#btn-mais` que agrupa ações secundárias
   * (importar evento, eventos salvos, apresentação, imprimir, novo
   * projeto). Implementa padrão WAI-ARIA de menu: setas circulam, Home/End
   * vão para extremos, Esc fecha devolvendo foco e Tab fecha sem prender.
   * Acionar um item fecha o menu sem restaurar foco — alguns itens abrem
   * file picker ou modal e cuidam do próprio foco.
   *
   * Resiliente: se o markup não existir (ex.: usuário num contexto sem
   * topbar/menu), retorna cedo sem registrar listeners.
   */
  function initMoreMenu() {
    var btn = document.getElementById("btn-mais");
    var menu = document.getElementById("more-menu");
    if (!btn || !menu) return;

    function getItems() {
      return Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]'));
    }

    function focusItemAt(idx) {
      var items = getItems();
      if (!items.length) return;
      var n = items.length;
      var i = ((idx % n) + n) % n;
      items.forEach(function (el, j) {
        el.tabIndex = j === i ? 0 : -1;
      });
      items[i].focus();
    }

    function onDocPointer(e) {
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      closeMenu({ restoreFocus: false });
    }

    function onDocKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      }
      if (e.key === "Tab") {
        // Tab/Shift+Tab fecham o menu sem prender o foco — deixa a
        // navegação seguir naturalmente para o próximo elemento da página.
        closeMenu({ restoreFocus: false });
        return;
      }
      if (!menu.contains(document.activeElement)) return;
      var items = getItems();
      if (!items.length) return;
      var current = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItemAt(current + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItemAt(current - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusItemAt(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusItemAt(items.length - 1);
      }
    }

    function onDocFocusIn(e) {
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      closeMenu({ restoreFocus: false });
    }

    function openMenu() {
      if (!menu.hidden) return;
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      focusItemAt(0);
      document.addEventListener("mousedown", onDocPointer);
      document.addEventListener("keydown", onDocKeydown);
      document.addEventListener("focusin", onDocFocusIn);
    }

    function closeMenu(opts) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      getItems().forEach(function (el) {
        el.tabIndex = -1;
      });
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onDocKeydown);
      document.removeEventListener("focusin", onDocFocusIn);
      if (opts && opts.restoreFocus) btn.focus();
    }

    btn.addEventListener("click", function () {
      if (menu.hidden) openMenu();
      else closeMenu({ restoreFocus: true });
    });

    // Delegação: ao acionar qualquer item (inclusive o <label> que envolve
    // o input file), fecha sem restaurar foco — o handler do item pode
    // assumir o foco (file picker, modal, etc.).
    menu.addEventListener("click", function (e) {
      var item = e.target && e.target.closest && e.target.closest('[role="menuitem"]');
      if (!item) return;
      closeMenu({ restoreFocus: false });
    });
  }

  /** Alterna o modo apresentação garantindo aria-pressed e foco coerentes.
   *  Quando ligado, popula `#presentation-host` com o scoreboard (top 3 em
   *  cards gigantes + lista compacta abaixo) e esconde toda a UI regular
   *  via `body.presentation-mode`. Quando desligado, restaura. */
  function setPresentationMode(on) {
    var was = document.body.classList.contains("presentation-mode");
    document.body.classList.toggle("presentation-mode", !!on);
    var pres = document.getElementById("btn-pres");
    if (pres) pres.setAttribute("aria-pressed", on ? "true" : "false");
    var exit = document.getElementById("btn-exit-presentation");
    var host = document.getElementById("presentation-host");

    if (on) {
      if (host) {
        renderScoreboard(host);
        host.hidden = false;
        host.setAttribute("aria-hidden", "false");
      }
      // Foco no botão de sair (alvo óbvio para teclado/projetor).
      if (exit) {
        try {
          exit.focus();
        } catch (_e) {
          /* best-effort */
        }
      }
    } else {
      if (host) {
        host.hidden = true;
        host.setAttribute("aria-hidden", "true");
        host.innerHTML = "";
      }
      if (was && pres) {
        // Devolve o foco ao botão que abriu, evitando "foco perdido no body".
        try {
          pres.focus();
        } catch (_e) {
          /* best-effort */
        }
      }
    }
  }

  /** Renderiza o scoreboard de apresentação em `host`. Layout:
   *  - cabeçalho com nome do evento + data;
   *  - top 3 em cards gigantes (ouro/prata/bronze, ouro um pouco elevado);
   *  - lista das demais classificadas em tabela compacta abaixo.
   *  Se não houver dados, exibe mensagem amigável. */
  function renderScoreboard(host) {
    host.innerHTML = "";
    var ev = state.evento;
    var meta = (ev && ev.meta) || {};
    var out = compute();

    var header = document.createElement("header");
    header.className = "scoreboard-header";
    var titulo = document.createElement("h1");
    titulo.className = "scoreboard-title";
    titulo.id = "presentation-title";
    titulo.textContent = (meta.nome || "Evento sem nome") + " — Classificação";
    var sub = document.createElement("p");
    sub.className = "scoreboard-sub";
    sub.textContent = [meta.data, meta.local].filter(Boolean).join(" · ");
    header.appendChild(titulo);
    if (sub.textContent) header.appendChild(sub);
    host.appendChild(header);

    if (!ev || !out) {
      var empty = document.createElement("p");
      empty.className = "scoreboard-empty";
      empty.textContent = "Carregue um evento para visualizar a classificação.";
      host.appendChild(empty);
      return;
    }

    var ord = E.classificacaoOrdenada(out.detalhes, out.ranks, out.tiebreakByIgreja);
    if (!ord || !ord.length) {
      var noData = document.createElement("p");
      noData.className = "scoreboard-empty";
      noData.textContent = "Sem dados para classificar ainda.";
      host.appendChild(noData);
      return;
    }

    // Top 3 em cards (ordem visual: prata, ouro, bronze para destacar o ouro no centro)
    var top3 = document.createElement("section");
    top3.className = "scoreboard-top3";
    top3.setAttribute("aria-label", "Top 3 do evento");
    var medals = ["pt", "ou", "br"];
    medals.forEach(function (mk) {
      var idx = mk === "ou" ? 0 : mk === "pt" ? 1 : 2;
      var r = ord[idx];
      if (!r) return;
      var card = document.createElement("article");
      card.className = "scoreboard-card";
      card.setAttribute("data-medal", mk);
      card.innerHTML =
        '<span class="scoreboard-pos">' +
        (idx + 1) +
        "º</span>" +
        '<span class="scoreboard-igreja">' +
        escapeHtml(r.igreja) +
        "</span>" +
        '<span class="scoreboard-pts">' +
        '<span class="scoreboard-pts-label">Total</span>' +
        fmt(r.total) +
        "</span>";
      top3.appendChild(card);
    });
    host.appendChild(top3);

    // Demais
    if (ord.length > 3) {
      var rest = document.createElement("section");
      rest.className = "scoreboard-rest";
      rest.setAttribute("aria-label", "Demais classificadas");
      var table = document.createElement("table");
      table.innerHTML =
        '<thead><tr><th scope="col">#</th><th scope="col">Igreja</th>' +
        '<th scope="col" style="text-align:right;">Total</th></tr></thead>';
      var tbody = document.createElement("tbody");
      ord.slice(3).forEach(function (r) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="pos">' +
          r.posicao +
          "º</td>" +
          "<td>" +
          escapeHtml(r.igreja) +
          "</td>" +
          '<td class="tot">' +
          fmt(r.total) +
          "</td>";
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      rest.appendChild(table);
      host.appendChild(rest);
    }
  }

  /** Tenta carregar o evento de exemplo. Prioriza `window.ConclaveDefaultEvento`
   *  (injetado por `eventos/conclave-2026-1.evento.embedded.js`), que funciona
   *  até em `file://` — cenário típico de pen-drive. Se não houver a constante,
   *  cai para `fetch()` do JSON, que só funciona via http(s). Resolve com uma
   *  cópia profunda (evita o usuário mutar o objeto global por engano). */
  function tryLoadDefaultEventoWeb() {
    if (typeof window !== "undefined" && window.ConclaveDefaultEvento) {
      try {
        return Promise.resolve(JSON.parse(JSON.stringify(window.ConclaveDefaultEvento)));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return fetch("eventos/conclave-2026-1.evento.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function tryFetchDefaultEvento() {
    tryLoadDefaultEventoWeb()
      .then(function (ev) {
        if (!state.evento) {
          var slug = ev.meta && ev.meta.slug;
          var saved = slug ? loadFromStorage(slug) : null;
          if (saved && saved.evento && saved.dados) {
            setEvento(saved.evento, saved.dados);
            return;
          } else {
            setEvento(ev, saved && saved.dados ? saved.dados : null);
            return;
          }
        }
      })
      .catch(function () {
        state.autoLoadFailed = true;
        render();
      });
  }

  /**
   * Registra o service worker quando estamos servidos via http(s). Pulamos
   * em `file://` (onde a Service Worker API simplesmente não funciona) e
   * em ambientes de teste sem `navigator.serviceWorker`.
   */
  function registerServiceWorker() {
    try {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
      var scheme = window.location && window.location.protocol;
      if (scheme !== "http:" && scheme !== "https:") return;
      // Carregamento opcional: erro de registro é apenas logado; o app deve
      // continuar funcionando sem o SW.
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function (err) {
          console.warn("Falha ao registrar service worker:", err);
        });
      });
    } catch (_e) {
      // best-effort
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyUiTheme(getStoredUiTheme());
    initToolbar();
    initThemeToggle();
    tryFetchDefaultEvento();
    render();
    registerServiceWorker();
  });
})();
