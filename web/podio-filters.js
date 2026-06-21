/**
 * Filtros da aba Pódio por prova — funções puras testáveis (sem DOM).
 */
(function (global) {
  function normalizeSearchText(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function defaultPodioFilters() {
    return {
      status: "all",
      categoriaId: "",
      q: "",
      comAvisos: false,
      igrejaId: "",
      semCompetidor: false,
      desempate: false,
    };
  }

  function normalizePodioFilters(raw) {
    var d = defaultPodioFilters();
    if (!raw || typeof raw !== "object") return d;
    if (raw.status === "pending" || raw.status === "partial" || raw.status === "complete") {
      d.status = raw.status;
    }
    if (raw.categoriaId != null) d.categoriaId = String(raw.categoriaId);
    if (raw.q != null) d.q = String(raw.q).trim();
    d.comAvisos = !!raw.comAvisos;
    if (raw.igrejaId != null) d.igrejaId = String(raw.igrejaId);
    d.semCompetidor = !!raw.semCompetidor;
    d.desempate = !!raw.desempate;
    return d;
  }

  function hasMedalFilled(ent) {
    if (!ent || typeof ent !== "object") return false;
    if (ent.igrejaId) return true;
    return !!(ent.nomeLivre && String(ent.nomeLivre).trim());
  }

  function isPodiumComplete(pl) {
    if (!pl || typeof pl !== "object") return false;
    return ["ou", "pt", "br"].every(function (k) {
      var e = pl[k] || {};
      return !!e.igrejaId;
    });
  }

  /** @returns {'pending'|'partial'|'complete'} */
  function provaPodiumStatus(provaId, podium) {
    var pl = (podium && podium[provaId]) || {};
    var any = ["ou", "pt", "br"].some(function (k) {
      return hasMedalFilled(pl[k]);
    });
    if (!any) return "pending";
    if (isPodiumComplete(pl)) return "complete";
    return "partial";
  }

  function provaHasDuplicado(provaId, podium) {
    var places = podium && podium[provaId];
    if (!places || typeof places !== "object") return false;
    var seen = new Set();
    var keys = ["ou", "pt", "br"];
    for (var i = 0; i < keys.length; i++) {
      var iid = places[keys[i]] && places[keys[i]].igrejaId;
      if (!iid) continue;
      if (seen.has(iid)) return true;
      seen.add(iid);
    }
    return false;
  }

  function provaSemCompetidor(provaId, podium) {
    var pl = podium && podium[provaId];
    if (!pl) return false;
    return ["ou", "pt", "br"].some(function (k) {
      var ent = pl[k] || {};
      if (!hasMedalFilled(ent)) return false;
      return !ent.competidor || !String(ent.competidor).trim();
    });
  }

  function provaHasIgreja(provaId, igrejaId, podium) {
    if (!igrejaId) return true;
    var pl = podium && podium[provaId];
    if (!pl) return false;
    return ["ou", "pt", "br"].some(function (k) {
      var ent = pl[k] || {};
      return ent.igrejaId === igrejaId;
    });
  }

  function provaSearchHaystack(p, ctx) {
    var parts = [];
    if (p.titulo) parts.push(String(p.titulo));
    if (ctx.categoriaLabel) parts.push(ctx.categoriaLabel(p));
    var pl = ctx.podium && ctx.podium[p.id];
    if (pl) {
      ["ou", "pt", "br"].forEach(function (k) {
        var ent = pl[k] || {};
        if (ent.competidor) parts.push(String(ent.competidor));
        if (ent.igrejaId && ctx.igrejaNome) {
          var n = ctx.igrejaNome(ent.igrejaId);
          if (n) parts.push(n);
        }
        if (ent.nomeLivre) parts.push(String(ent.nomeLivre));
      });
    }
    return normalizeSearchText(parts.join(" "));
  }

  function isActivePodioFilters(filters) {
    var d = defaultPodioFilters();
    filters = normalizePodioFilters(filters);
    return (
      filters.status !== d.status ||
      !!filters.categoriaId ||
      !!filters.q ||
      filters.comAvisos !== d.comAvisos ||
      !!filters.igrejaId ||
      filters.semCompetidor !== d.semCompetidor ||
      filters.desempate !== d.desempate
    );
  }

  function provaMatchesPodioFilters(p, filters, ctx) {
    filters = normalizePodioFilters(filters);
    ctx = ctx || {};

    if (filters.status !== "all") {
      var st = provaPodiumStatus(p.id, ctx.podium);
      if (st !== filters.status) return false;
    }

    if (filters.categoriaId) {
      var catKey = ctx.categoriaKey ? ctx.categoriaKey(p) : p.categoriaId || p.categoria || "";
      if (catKey !== filters.categoriaId) return false;
    }

    if (filters.q) {
      var q = normalizeSearchText(filters.q);
      if (q && provaSearchHaystack(p, ctx).indexOf(q) === -1) return false;
    }

    if (filters.comAvisos && !provaHasDuplicado(p.id, ctx.podium)) return false;

    if (filters.igrejaId && !provaHasIgreja(p.id, filters.igrejaId, ctx.podium)) return false;

    if (filters.semCompetidor && !provaSemCompetidor(p.id, ctx.podium)) return false;

    if (filters.desempate) {
      var bucket = ctx.tiebreakProvaBucket ? ctx.tiebreakProvaBucket(p.titulo) : null;
      if (!bucket) return false;
    }

    return true;
  }

  function filterProvas(provas, filters, ctx) {
    return (provas || []).filter(function (p) {
      return provaMatchesPodioFilters(p, filters, ctx);
    });
  }

  global.ConclavePodioFilters = {
    defaultPodioFilters: defaultPodioFilters,
    normalizePodioFilters: normalizePodioFilters,
    normalizeSearchText: normalizeSearchText,
    provaPodiumStatus: provaPodiumStatus,
    provaHasDuplicado: provaHasDuplicado,
    provaSemCompetidor: provaSemCompetidor,
    provaHasIgreja: provaHasIgreja,
    isActivePodioFilters: isActivePodioFilters,
    provaMatchesPodioFilters: provaMatchesPodioFilters,
    filterProvas: filterProvas,
  };
})(typeof window !== "undefined" ? window : globalThis);
