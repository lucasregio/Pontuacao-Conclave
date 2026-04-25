/**
 * Conclave MR — UI (carrega evento.json, edita dados, persiste localmente).
 */
(function () {
  var E = window.ConclaveEngine;
  var state = {
    evento: null,
    dados: null,
    tab: "participacao",
    saveTimer: null,
    errors: [],
    lastSaved: null,
    autoLoadFailed: false,
    derivedRefreshTimer: null,
    /** { [provaId]: true } — true = seção colapsada */
    podiumCollapsed: {},
    /** { geral | categorias | provas: true } — true = colapsada */
    configSectionCollapsed: {},
    /** Relatórios: igreja | prova — true = seção colapsada */
    relatorioSectionCollapsed: {},
    /** Relatório «Por prova»: colapso por prova (igual ideia ao pódio) */
    relatorioPodiumCollapsed: {},
  };

  function $(sel) {
    return document.querySelector(sel);
  }

  function storageKey(slug) {
    return "conclave-projeto-" + slug;
  }

  function applyTema(evento) {
    var root = document.documentElement;
    var tema = (evento.meta && evento.meta.tema) || {};
    /* Paleta MR/ER vem de data-ui-theme no <html>; imagem de fundo opcional (caminho em static/ ou URL) */
    var img = tema.backgroundImage;
    var trimmed = img && String(img).trim();
    if (trimmed) {
      document.body.classList.add("has-bg");
      var url = resolveAssetUrl(trimmed);
      var safe = url.replace(/'/g, "%27");
      root.style.setProperty("--bg-url", "url('" + safe + "')");
    } else {
      document.body.classList.remove("has-bg");
      root.style.removeProperty("--bg-url");
    }
  }

  function setHeader() {
    var ev = state.evento;
    var h = $(".app-header h1");
    var sub = $(".app-header p.sub");
    if (!ev) {
      h.textContent = "Conclave MR — Pontuação";
      sub.textContent = "Carregue um arquivo «.evento.json» (Configuração do evento) ou um projeto completo.";
      updateRegulamentoButton();
      return;
    }
    h.textContent = ev.meta.nome || "Conclave MR";
    var parts = [];
    if (ev.meta.data) parts.push(ev.meta.data);
    if (ev.meta.horarioInicio || ev.meta.horarioEncerramento) {
      var h = [];
      if (ev.meta.horarioInicio) h.push(ev.meta.horarioInicio);
      if (ev.meta.horarioEncerramento) h.push(ev.meta.horarioEncerramento);
      parts.push(h.join(" — "));
    }
    sub.textContent = parts.join(" · ");
    updateRegulamentoButton();
  }

  function scheduleSave() {
    if (!state.evento || !state.dados) return;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      try {
        var key = storageKey(state.evento.meta.slug);
        var projeto = { evento: state.evento, dados: state.dados };
        localStorage.setItem(key, JSON.stringify(projeto));
        state.lastSaved = new Date();
        var pill = $("#status-pill");
        if (pill) pill.textContent = "Salvo localmente";
      } catch (err) {
        console.warn(err);
      }
    }, 450);
  }

  function loadFromStorage(slug) {
    try {
      var raw = localStorage.getItem(storageKey(slug));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
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
    return E.computeTotals(state.evento, state.dados);
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
      return String(x.nome || "").trim().toLowerCase() === lower;
    });
    return g ? g.id : null;
  }

  function sortedProvas() {
    return (state.evento.provas || [])
      .slice()
      .sort(function (a, b) {
        return (a.ordem || 0) - (b.ordem || 0);
      });
  }

  function sortedCategorias() {
    return (state.evento.categorias || [])
      .slice()
      .sort(function (a, b) {
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
    if (state.evento && state.evento.categorias && state.evento.categorias.length && p.categoriaId) {
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

  function syncCategoriaNomes(ev) {
    var map = {};
    (ev.categorias || []).forEach(function (c) {
      map[c.id] = c.nome;
    });
    (ev.provas || []).forEach(function (p) {
      if (p.categoriaId && map[p.categoriaId]) p.categoria = map[p.categoriaId];
    });
  }

  function normalizeEvento(ev) {
    if (!ev.meta) ev.meta = {};
    if (!ev.meta.slug || String(ev.meta.slug).trim() === "") {
      ev.meta.slug = slugify(ev.meta.nome || "evento");
    }
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
          while (list.some(function (x) { return x.id === id; })) {
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
    while (ev.igrejas.some(function (g) {
      return g.id === cand;
    })) {
      n += 1;
      cand = id + "-" + n;
    }
    return cand;
  }

  function ensureUniqueProvaId(ev, baseId) {
    var id = baseId || "prova";
    var n = 0;
    var cand = id;
    while (ev.provas.some(function (p) {
      return p.id === cand;
    })) {
      n += 1;
      cand = id + "-" + n;
    }
    return cand;
  }

  function resolveAssetUrl(path) {
    var p = String(path || "").trim();
    if (!p) return "";
    if (p.indexOf("http://") === 0 || p.indexOf("https://") === 0 || p.indexOf("//") === 0) return p;
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

  function openRegulamentoPdf() {
    if (!state.evento || !state.evento.meta) return;
    var raw = state.evento.meta.regulamentoUrl;
    if (!raw || !String(raw).trim()) return;
    var url = resolveAssetUrl(String(raw).trim());
    window.open(url, "_blank", "noopener,noreferrer");
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
    btn.title = ok ? "Abrir regulamento (PDF) numa nova aba" : "Configure o link ou caminho do PDF em Configuração → Geral";
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

  function groupProvasByCategoria() {
    var order = orderedCategoryKeys();
    var groups = {};
    order.forEach(function (k) {
      groups[k] = [];
    });
    sortedProvas().forEach(function (p) {
      var k = categoriaKey(p);
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(p);
    });
    return { order: order, groups: groups };
  }

  function renderBootHint() {
    var el = $("#boot-hint");
    if (!el) return;
    if (state.evento || !state.autoLoadFailed) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.style.display = "block";
    el.textContent =
      "O evento não foi carregado automaticamente (isso acontece ao abrir o arquivo pelo Finder como file://). Clique em «Carregar evento» e escolha eventos/conclave-2026-1.evento.json, ou use um servidor: python3 -m http.server 8765 e abra http://localhost:8765/";
  }

  var TAB_ORDER = ["config", "participacao", "podio", "classificacao", "relatorios"];

  function syncTabPanels() {
    TAB_ORDER.forEach(function (id) {
      var p = $("#panel-" + id);
      if (!p) return;
      var on = state.tab === id;
      p.classList.toggle("active", on);
      p.hidden = !on;
    });
    TAB_ORDER.forEach(function (id) {
      var b = $("#tab-" + id);
      if (!b) return;
      var on = state.tab === id;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.classList.toggle("active", on);
      b.tabIndex = on ? 0 : -1;
    });
  }

  function reactivatePanel() {
    syncTabPanels();
  }

  function focusActiveTabButton() {
    var b = $("#tab-" + state.tab);
    if (b) b.focus();
  }

  function ensureTabListKeyboard() {
    var tablist = $("#tabs");
    if (!tablist || tablist.dataset.kbWired === "1") return;
    tablist.dataset.kbWired = "1";
    tablist.addEventListener("keydown", function (e) {
      var key = e.key;
      if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End" && key !== "ArrowDown" && key !== "ArrowUp") {
        return;
      }
      var i = TAB_ORDER.indexOf(state.tab);
      if (i < 0) return;
      var next = i;
      if (key === "ArrowRight" || key === "ArrowDown") next = (i + 1) % TAB_ORDER.length;
      else if (key === "ArrowLeft" || key === "ArrowUp") next = (i - 1 + TAB_ORDER.length) % TAB_ORDER.length;
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
    state.derivedRefreshTimer = setTimeout(function () {
      refreshDerivedPanels();
    }, delayMs != null ? delayMs : 0);
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

  function renderTabs() {
    var tabs = $("#tabs");
    if (!tabs) return;
    tabs.setAttribute("role", "tablist");
    tabs.innerHTML = "";
    var names = [
      { id: "config", label: "Configuração" },
      { id: "participacao", label: "Participação" },
      { id: "podio", label: "Pódio por prova" },
      { id: "classificacao", label: "Classificação" },
      { id: "relatorios", label: "Relatórios" },
    ];
    names.forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button";
      b.id = "tab-" + n.id;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "panel-" + n.id);
      b.textContent = n.label;
      b.className = state.tab === n.id ? "active" : "";
      b.dataset.tab = n.id;
      b.setAttribute("aria-selected", state.tab === n.id ? "true" : "false");
      b.tabIndex = state.tab === n.id ? 0 : -1;
      b.addEventListener("click", function () {
        state.tab = n.id;
        render();
      });
      tabs.appendChild(b);
    });
    ensureTabListKeyboard();
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

  function renderConfig() {
    var host = $("#panel-config");
    if (!host) return;
    host.innerHTML = "";
    if (!state.evento) {
      host.textContent = "Carregue um evento para editar a configuração.";
      return;
    }
    var ev = state.evento;
    var meta = ev.meta || {};
    var wrap = document.createElement("div");
    wrap.className = "config-wrap";

    var gridGeral = document.createElement("div");
    gridGeral.className = "config-grid";
    gridGeral.innerHTML =
      "<label class=\"config-field\"><span>Nome do evento</span>" +
      "<input type=\"text\" data-cfg=\"meta.nome\" value=\"" +
      escapeHtml(meta.nome || "") +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Data</span>" +
      "<input type=\"text\" data-cfg=\"meta.data\" value=\"" +
      escapeHtml(meta.data || "") +
      "\" placeholder=\"AAAA-MM-DD ou texto\" /></label>" +
      "<div class=\"config-horarios-row\">" +
      "<label class=\"config-field\"><span>Horário de início</span>" +
      "<input type=\"time\" data-cfg=\"meta.horarioInicio\" value=\"" +
      escapeHtml(meta.horarioInicio || "") +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Horário de encerramento</span>" +
      "<input type=\"time\" data-cfg=\"meta.horarioEncerramento\" value=\"" +
      escapeHtml(meta.horarioEncerramento || "") +
      "\" /></label>" +
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
      "<label class=\"config-field config-field--full\"><span>Imagem de fundo</span>" +
        "<input type=\"text\" data-cfg=\"meta.tema.backgroundImage\" value=\"" +
        escapeHtml((meta.tema && meta.tema.backgroundImage) || "") +
        "\" placeholder=\"ex.: static/fundo.jpg\" spellcheck=\"false\" /></label>" +
        "<p class=\"config-hint config-field--full\" style=\"margin-top: -0.25rem\">" +
        "Regulamento: coloque o PDF em <code>static/</code> e escreva só o nome do ficheiro (ou cole uma URL completa). " +
        "O botão «Regulamento» abre o documento; a imagem de fundo usa o caminho indicado abaixo.</p>"
    );
    appendConfigCollapsible(wrap, "geral", "Geral", [gridGeral]);

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
      emptyIg.textContent = "Nenhuma igreja ainda. Use «Adicionar igreja» ou a lista em lote abaixo.";
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

    appendConfigCollapsible(wrap, "igrejas", "Igrejas", [igHint, tigWrap, addRow, bulkLab, btnBulk, btnRemAllIg]);

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
    var lblUni = isErUiTheme()
      ? "Uniforme (camisa = total emb.)"
      : "Uniforme (camisa = MR tot.)";
    var lblBib = isErUiTheme()
      ? "Bíblia (emb. com bíblia = total emb.)"
      : "Bíblia (MR bíblia = MR tot.)";
    pesGrid.innerHTML =
      "<label class=\"config-field\"><span>" +
      escapeHtml(lblInscr) +
      "</span><input type=\"number\" step=\"1\" data-cfg=\"pesos.inscricao\" value=\"" +
      escapeHtml(String(pev.inscricao != null ? pev.inscricao : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Pontualidade (pts se marcado)</span><input type=\"number\" step=\"1\" data-cfg=\"pesos.pontualidade\" value=\"" +
      escapeHtml(String(pev.pontualidade != null ? pev.pontualidade : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>" +
      escapeHtml(lblUni) +
      "</span><input type=\"number\" step=\"1\" data-cfg=\"pesos.uniforme\" value=\"" +
      escapeHtml(String(pev.uniforme != null ? pev.uniforme : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>" +
      escapeHtml(lblBib) +
      "</span><input type=\"number\" step=\"1\" data-cfg=\"pesos.biblia\" value=\"" +
      escapeHtml(String(pev.biblia != null ? pev.biblia : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Por visitante</span><input type=\"number\" step=\"1\" data-cfg=\"pesos.visitante\" value=\"" +
      escapeHtml(String(pev.visitante != null ? pev.visitante : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Animação (pts se marcado)</span><input type=\"number\" step=\"1\" data-cfg=\"pesos.animacao\" value=\"" +
      escapeHtml(String(pev.animacao != null ? pev.animacao : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Mau comportamento (geralmente negativo)</span><input type=\"number\" step=\"1\" data-cfg=\"pesos.mau_comportamento\" value=\"" +
      escapeHtml(String(pev.mau_comportamento != null ? pev.mau_comportamento : 0)) +
      "\" /></label>";
    appendConfigCollapsible(wrap, "pesosParticipacao", "Pesos da participação", [pesHint, pesGrid]);

    var p2 = document.createElement("p");
    p2.className = "config-hint";
    p2.textContent =
      "Arraste as linhas pela coluna à esquerda para definir a ordem das colunas no pódio. Cada prova deve usar uma categoria.";
    var tbc = document.createElement("div");
    tbc.className = "table-wrap";
    var tcat = document.createElement("table");
    tcat.className = "data config-table config-table--sortable";
    tcat.innerHTML =
      "<thead><tr><th class=\"config-col-drag\" aria-hidden=\"true\">&nbsp;</th><th>Nome</th><th>Idade</th><th></th></tr></thead>";
    var bcat = document.createElement("tbody");
    bcat.id = "config-cat-tbody";
    sortedCategorias().forEach(function (c) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-cat-id", c.id);
      tr.innerHTML =
        "<td class=\"config-drag-cell\" title=\"Arrastar para ordenar\"><span class=\"config-drag-grip\" aria-hidden=\"true\">⠿</span></td>" +
        "<td><input type=\"text\" class=\"cfg-cat-nome\" data-cat-id=\"" +
        escapeHtml(c.id) +
        "\" value=\"" +
        escapeHtml(c.nome || "") +
        "\" /></td>" +
        "<td><input type=\"text\" class=\"cfg-cat-idade\" data-cat-id=\"" +
        escapeHtml(c.id) +
        "\" value=\"" +
        escapeHtml(c.idade != null ? String(c.idade) : "") +
        "\" placeholder=\"ex.: 10–12 anos\" /></td>" +
        "<td><button type=\"button\" class=\"config-danger-btn\" data-config-del-cat=\"" +
        escapeHtml(c.id) +
        "\">Remover</button></td>";
      bcat.appendChild(tr);
    });
    tcat.appendChild(bcat);
    tbc.appendChild(tcat);
    var addCat = document.createElement("button");
    addCat.type = "button";
    addCat.className = "config-add-btn";
    addCat.setAttribute("data-config-add-cat", "1");
    addCat.textContent = "Adicionar categoria";
    appendConfigCollapsible(wrap, "categorias", "Categorias", [p2, tbc, addCat]);

    var h3m = document.createElement("h3");
    h3m.className = "config-subtitle";
    h3m.textContent = isErUiTheme()
      ? "Medalhas no pódio (embaixadores — 1.º / 2.º / 3.º)"
      : "Pontuação das medalhas (gincana)";
    var med = ev.medalhas || { ou: 0, pt: 0, br: 0 };
    var medDiv = document.createElement("div");
    medDiv.className = "config-grid config-grid--medalhas";
    medDiv.innerHTML =
      "<label class=\"config-field\"><span>Ouro</span><input type=\"number\" step=\"1\" data-cfg=\"medalhas.ou\" value=\"" +
      escapeHtml(String(med.ou != null ? med.ou : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Prata</span><input type=\"number\" step=\"1\" data-cfg=\"medalhas.pt\" value=\"" +
      escapeHtml(String(med.pt != null ? med.pt : 0)) +
      "\" /></label>" +
      "<label class=\"config-field\"><span>Bronze</span><input type=\"number\" step=\"1\" data-cfg=\"medalhas.br\" value=\"" +
      escapeHtml(String(med.br != null ? med.br : 0)) +
      "\" /></label>";

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
      "<thead><tr><th class=\"config-col-drag\" aria-hidden=\"true\">&nbsp;</th><th>Título</th><th>Categoria</th><th></th></tr></thead>";
    var bprov = document.createElement("tbody");
    bprov.id = "config-prova-tbody";
    sortedProvas().forEach(function (p) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-prova-id", p.id);
      var tdG = document.createElement("td");
      tdG.className = "config-drag-cell";
      tdG.title = "Arrastar para ordenar";
      tdG.innerHTML = "<span class=\"config-drag-grip\" aria-hidden=\"true\">⠿</span>";
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

    appendConfigCollapsible(wrap, "provas", "Provas bíblicas", [h3m, medDiv, h3p, p3, tbp, addPv, provaBulkWrap]);

    host.appendChild(wrap);
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

    host.querySelectorAll(".config-section-head[data-config-section-toggle]").forEach(function (btn) {
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
      applyTema(state.evento);
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
        if (path.indexOf("meta.") === 0) applyTema(state.evento);
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
        var ext =
          v.length > 0 &&
          (/^https?:\/\//i.test(v) || v.indexOf("//") === 0);
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
        if (!confirm("Remover esta igreja? A participação e referências no pódio serão atualizadas.")) return;
        state.evento.igrejas = state.evento.igrejas.filter(function (g) {
          return g.id !== gid;
        });
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    });

    var btnAddIg = host.querySelector("[data-config-add-igreja-single]");
    if (btnAddIg) {
      btnAddIg.addEventListener("click", function () {
        var el = $("#config-igreja-nova-nome");
        var nome = el && el.value ? el.value.trim() : "";
        if (!nome) {
          alert("Indique o nome da igreja.");
          return;
        }
        var lower = nome.toLowerCase();
        var dup = state.evento.igrejas.some(function (g) {
          return (g.nome || "").trim().toLowerCase() === lower;
        });
        if (dup) {
          alert("Já existe uma igreja com este nome.");
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
          alert("Nenhuma igreja nova a adicionar (linhas vazias ou nomes já existentes).");
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
          alert("Não há igrejas para remover.");
          return;
        }
        if (
          !confirm(
            "Remover todas as igrejas? A participação e as referências no pódio serão limpas. Esta ação não pode ser desfeita."
          )
        ) {
          return;
        }
        state.evento.igrejas = [];
        afterConfigChange();
        renderConfig();
        wireConfig();
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
          alert("Não é possível remover: existem provas nesta categoria. Reatribua as provas antes.");
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
          categoriaId: defCat,
          categoria: defCat ? (cats.find(function (c) { return c.id === defCat; }) || {}).nome : "",
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
        var defNome = defCat ? (cats.find(function (c) { return c.id === defCat; }) || {}).nome : "";
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
            categoriaId: defCat,
            categoria: defNome || "",
          });
          added += 1;
        });
        if (added === 0) {
          alert("Nenhuma prova nova a adicionar (linhas vazias ou títulos já existentes).");
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
          alert("Não há provas para remover.");
          return;
        }
        if (
          !confirm(
            "Remover todas as provas e apagar todo o pódio associado? Esta ação não pode ser desfeita."
          )
        ) {
          return;
        }
        state.evento.provas.forEach(function (p) {
          delete state.podiumCollapsed[p.id];
        });
        state.evento.provas = [];
        afterConfigChange();
        renderConfig();
        wireConfig();
      });
    }

    host.querySelectorAll("[data-config-del-prova]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pid = btn.getAttribute("data-config-del-prova");
        if (!confirm("Remover esta prova? Os dados do pódio desta prova serão apagados.")) return;
        state.evento.provas = state.evento.provas.filter(function (p) {
          return p.id !== pid;
        });
        delete state.podiumCollapsed[pid];
        afterConfigChange();
        renderConfig();
        wireConfig();
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
        grip.addEventListener("dragstart", function (e) {
          dragged = row;
          row.setAttribute("data-dragging", "1");
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", "");
          } catch (err) {}
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
      "<td><input type=\"number\" step=\"1\" data-gid=\"" +
      escapeHtml(gid) +
      "\" data-f=\"" +
      escapeHtml(field) +
      "\" value=\"" +
      escapeHtml(String(n)) +
      "\" /></td>"
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildProvaCardPodio(p) {
    var places = state.dados.podium[p.id] || {};
    var completo = provaPodiumCompleto(p.id);
    var collapsed = isProvaCollapsed(p.id);

    var card = document.createElement("div");
    card.className = "prova-card prova-card--compact";
    if (completo) card.classList.add("podium-complete");
    if (collapsed) card.classList.add("is-collapsed");

    var head = document.createElement("button");
    head.type = "button";
    head.className = "prova-card-head";
    head.setAttribute("data-prova-toggle", p.id);
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    head.setAttribute(
      "aria-label",
      (collapsed ? "Expandir " : "Recolher ") + nomeProvaExibicao(p) + (completo ? " — pódio completo" : "")
    );

    var titleWrap = document.createElement("span");
    titleWrap.className = "prova-card-title-wrap";
    var h = document.createElement("span");
    h.className = "prova-card-title";
    h.textContent = nomeProvaExibicao(p);
    titleWrap.appendChild(h);

    var statusBadge = document.createElement("span");
    statusBadge.className = "prova-status-badge" + (completo ? " complete" : " pending");
    statusBadge.textContent = completo ? "✓ Ok" : "○";
    statusBadge.setAttribute("title", completo ? "Ouro, prata e bronze com igreja" : "Falta definir alguma medalha");

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
      var lbl = mk === "ou" ? "Ouro" : mk === "pt" ? "Prata" : "Bronze";
      var ent = places[mk] || { igrejaId: null, competidor: "" };
      var displayNome = "";
      if (ent.igrejaId) displayNome = igrejaNome(ent.igrejaId) || "";
      else if (ent.nomeLivre != null && String(ent.nomeLivre).trim() !== "") displayNome = String(ent.nomeLivre);
      var row = document.createElement("div");
      row.className = "medal-row " + mk;
      var label = document.createElement("label");
      label.className = "medal";
      label.textContent = lbl;
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
      body.appendChild(row);
    });

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  /** Pódio em leitura para a aba Relatórios (mesmo layout que «Pódio por prova») */
  function buildProvaCardPodioReport(p) {
    var places = state.dados.podium[p.id] || {};
    var completo = provaPodiumCompleto(p.id);
    var collapsed = isRelatorioProvaCollapsed(p.id);

    var card = document.createElement("div");
    card.className = "prova-card prova-card--compact";
    if (completo) card.classList.add("podium-complete");
    if (collapsed) card.classList.add("is-collapsed");

    var head = document.createElement("button");
    head.type = "button";
    head.className = "prova-card-head";
    head.setAttribute("data-relatorio-prova-toggle", p.id);
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    head.setAttribute(
      "aria-label",
      (collapsed ? "Expandir " : "Recolher ") + nomeProvaExibicao(p) + (completo ? " — pódio completo" : "")
    );

    var titleWrap = document.createElement("span");
    titleWrap.className = "prova-card-title-wrap";
    var h = document.createElement("span");
    h.className = "prova-card-title";
    h.textContent = nomeProvaExibicao(p);
    titleWrap.appendChild(h);

    var statusBadge = document.createElement("span");
    statusBadge.className = "prova-status-badge" + (completo ? " complete" : " pending");
    statusBadge.textContent = completo ? "✓ Ok" : "○";
    statusBadge.setAttribute("title", completo ? "Ouro, prata e bronze com igreja" : "Falta definir alguma medalha");

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
      var lbl = mk === "ou" ? "Ouro" : mk === "pt" ? "Prata" : "Bronze";
      var ent = places[mk] || { igrejaId: null, competidor: "" };
      var row = document.createElement("div");
      row.className = "medal-row " + mk;
      var label = document.createElement("label");
      label.className = "medal";
      label.textContent = lbl;
      var cellI = document.createElement("div");
      cellI.className = "relatorio-read";
      cellI.textContent = ent.igrejaId ? igrejaNome(ent.igrejaId) : "—";
      var cellC = document.createElement("div");
      cellC.className = "relatorio-read";
      cellC.textContent = ent.competidor ? ent.competidor : "—";
      row.appendChild(label);
      row.appendChild(cellI);
      row.appendChild(cellC);
      body.appendChild(row);
    });

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  function createRelatorioPodioWrap() {
    var grouped = groupProvasByCategoria();
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

      var colTitle = document.createElement("h2");
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
      btnCollapseAll.setAttribute("data-relatorio-cat-action", "collapse");
      btnCollapseAll.setAttribute("data-prova-ids", idsAttr);
      btnCollapseAll.textContent = "Recolher todas";
      var btnExpandAll = document.createElement("button");
      btnExpandAll.type = "button";
      btnExpandAll.className = "podium-col-btn";
      btnExpandAll.setAttribute("data-relatorio-cat-action", "expand");
      btnExpandAll.setAttribute("data-prova-ids", idsAttr);
      btnExpandAll.textContent = "Expandir todas";
      colTools.appendChild(btnCollapseAll);
      colTools.appendChild(btnExpandAll);
      col.appendChild(colTools);

      var stack = document.createElement("div");
      stack.className = "podium-col-stack";
      list.forEach(function (p) {
        stack.appendChild(buildProvaCardPodioReport(p));
      });
      col.appendChild(stack);
      wrap.appendChild(col);
    });
    return wrap;
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

    var grouped = groupProvasByCategoria();
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

      var colTitle = document.createElement("h2");
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
      btnCollapseAll.setAttribute("data-cat-action", "collapse");
      btnCollapseAll.setAttribute("data-prova-ids", idsAttr);
      btnCollapseAll.textContent = "Recolher todas";
      var btnExpandAll = document.createElement("button");
      btnExpandAll.type = "button";
      btnExpandAll.className = "podium-col-btn";
      btnExpandAll.setAttribute("data-cat-action", "expand");
      btnExpandAll.setAttribute("data-prova-ids", idsAttr);
      btnExpandAll.textContent = "Expandir todas";
      colTools.appendChild(btnCollapseAll);
      colTools.appendChild(btnExpandAll);
      col.appendChild(colTools);

      var stack = document.createElement("div");
      stack.className = "podium-col-stack";

      list.forEach(function (p) {
        stack.appendChild(buildProvaCardPodio(p));
      });
      col.appendChild(stack);
      wrap.appendChild(col);
    });

    host.appendChild(wrap);
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
    var wrap = document.createElement("div");
    wrap.className = "table-wrap";
    var table = document.createElement("table");
    table.className = "data rank-table";
    var thead = document.createElement("thead");
    thead.innerHTML =
      "<tr><th class=\"pos\">#</th><th>Igreja</th><th>Partic.</th><th>Punições</th><th>Gincana</th><th>Extra</th><th class=\"tot\">Total</th></tr>";
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

    var wrap1 = document.createElement("div");
    wrap1.className = "table-wrap";
    var t1 = document.createElement("table");
    t1.className = "data";
    t1.innerHTML =
      "<thead><tr><th>Igreja</th><th>Ouro</th><th>Prata</th><th>Bronze</th><th>Pts gincana</th></tr></thead>";
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

    host.querySelectorAll(".config-section-head[data-relatorio-section-toggle]").forEach(function (btn) {
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
    root.querySelectorAll("#panel-podio .prova-card-head[data-prova-toggle]").forEach(function (btn) {
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
    if (!state.dados.podium[pid][mk]) state.dados.podium[pid][mk] = { igrejaId: null, competidor: "" };
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
    validate();
    setHeader();
    renderBootHint();
    renderErrors();
    renderWarnings();
    renderTabs();
    renderPanels();
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

  function setEvento(ev, mergeDados) {
    var errs = E.validateEventoMinimal(ev);
    if (errs.length) {
      alert("Evento inválido: " + errs.join(", "));
      return;
    }
    state.evento = ev;
    normalizeEvento(state.evento);
    if (isErUiTheme()) applyErClassificationPreset(state.evento);
    state.autoLoadFailed = false;
    state.podiumCollapsed = {};
    state.configSectionCollapsed = {};
    state.relatorioSectionCollapsed = {};
    state.relatorioPodiumCollapsed = {};
    applyTema(state.evento);
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
  }

  function onFileEvento(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var ev = JSON.parse(r.result);
        var slug = ev.meta && ev.meta.slug;
        var saved = slug ? loadFromStorage(slug) : null;
        if (saved && saved.dados && confirm("Encontramos dados salvos para este evento no navegador. Restaurar?")) {
          setEvento(ev, saved.dados);
        } else {
          setEvento(ev, null);
        }
      } catch (e) {
        alert("JSON inválido: " + e);
      }
    };
    r.readAsText(file, "UTF-8");
  }

  function onFileProjeto(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var projeto = JSON.parse(r.result);
        if (!projeto.evento || !projeto.dados) throw new Error("Faltam evento ou dados");
        setEvento(projeto.evento, projeto.dados);
      } catch (e) {
        alert("Projeto inválido: " + e);
      }
    };
    r.readAsText(file, "UTF-8");
  }

  function exportProjeto() {
    if (!state.evento || !state.dados) return;
    var blob = new Blob([JSON.stringify({ evento: state.evento, dados: state.dados }, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.evento.meta.slug || "projeto") + ".projeto.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function novoProjetoDados() {
    if (!state.evento) return;
    if (!confirm("Limpar todos os dados preenchidos deste evento?")) return;
    var ids = state.evento.igrejas.map(function (g) {
      return g.id;
    });
    var pids = state.evento.provas.map(function (p) {
      return p.id;
    });
    state.dados = E.emptyDadosTemplate(ids, pids);
    state.podiumCollapsed = {};
    scheduleSave();
    render();
  }

  var UI_THEME_KEY = "conclave-ui-theme";

  function getStoredUiTheme() {
    try {
      var t = localStorage.getItem(UI_THEME_KEY);
      return t === "er" ? "er" : "mr";
    } catch (e) {
      return "mr";
    }
  }

  function applyUiTheme(theme) {
    var t = theme === "er" ? "er" : "mr";
    document.documentElement.setAttribute("data-ui-theme", t);
    try {
      localStorage.setItem(UI_THEME_KEY, t);
    } catch (e) {}
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
    $("#btn-export") && $("#btn-export").addEventListener("click", exportProjeto);
    $("#btn-novo-dados") && $("#btn-novo-dados").addEventListener("click", novoProjetoDados);
    $("#btn-print") &&
      $("#btn-print").addEventListener("click", function () {
        window.print();
      });
    $("#btn-regulamento") &&
      $("#btn-regulamento").addEventListener("click", function () {
        openRegulamentoPdf();
      });
    $("#btn-exit-presentation") &&
      $("#btn-exit-presentation").addEventListener("click", function () {
        document.body.classList.remove("presentation-mode");
      });
    $("#btn-pres") &&
      $("#btn-pres").addEventListener("click", function () {
        document.body.classList.toggle("presentation-mode");
      });
  }

  function tryFetchDefaultEvento() {
    fetch("eventos/conclave-2026-1.evento.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
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

  document.addEventListener("DOMContentLoaded", function () {
    applyUiTheme(getStoredUiTheme());
    initToolbar();
    initThemeToggle();
    tryFetchDefaultEvento();
    render();
  });
})();
