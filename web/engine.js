/**
 * Motor de pontuação Pontuação Conclave (uso web).
 */
(function (global) {
  function truthy(v) {
    if (v === null || v === false) return false;
    const s = String(v).trim().toLowerCase();
    return ["x", "1", "sim", "s", "true", "verdadeiro", "ok", "✓"].includes(s);
  }

  function num(v, def) {
    if (def === undefined) def = 0;
    if (v === null || v === undefined || v === "") return def;
    // Aceita vírgula decimal (entrada de planilha em pt-BR) sem quebrar JSON.
    if (typeof v === "string") {
      const s = v.trim();
      if (s === "") return def;
      const n = Number(s.indexOf(",") !== -1 ? s.replace(/\./g, "").replace(",", ".") : s);
      return Number.isFinite(n) ? n : def;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  /** Lê peso garantindo número finito (default 0) — evita NaN silencioso quando
   *  o evento foi importado com `pesos` parciais. */
  function peso(pesos, key) {
    if (!pesos) return 0;
    const v = pesos[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }

  function pontosParticipacao(row, pesos) {
    let b = num(row.inscricao, 0);
    if (typeof row.inscricao === "boolean") b = row.inscricao ? 1 : 0;
    let c = num(row.pontualidade, 0);
    if (typeof row.pontualidade === "boolean") c = row.pontualidade ? 1 : 0;
    const d = Math.trunc(num(row.mr_total, 0));
    const e = Math.trunc(num(row.mr_camisa, 0));
    const f = Math.trunc(num(row.mr_biblia, 0));
    const g = Math.trunc(num(row.visitantes, 0));
    const anim = truthy(row.animacao);
    if (b + d <= 0) return 0;
    let total = b * peso(pesos, "inscricao") + c * peso(pesos, "pontualidade");
    if (d > 0 && e === d) total += peso(pesos, "uniforme");
    if (d > 0 && f === d) total += peso(pesos, "biblia");
    total += g * peso(pesos, "visitante");
    if (anim) total += peso(pesos, "animacao");
    return total;
  }

  function pontosPunicoes(row, pesos) {
    let p = 0;
    if (truthy(row.mau_comportamento)) p += peso(pesos, "mau_comportamento");
    return p;
  }

  function gincanaPorIgreja(podium, medalhas, igrejaIds) {
    const tot = {};
    igrejaIds.forEach(function (iid) {
      tot[iid] = 0;
    });
    Object.values(podium).forEach(function (places) {
      if (!places || typeof places !== "object") return;
      ["ou", "pt", "br"].forEach(function (key) {
        const entry = places[key];
        if (!entry || typeof entry !== "object") return;
        const iid = entry.igrejaId;
        if (iid && igrejaIds.has(iid) && medalhas[key] != null) {
          tot[iid] = (tot[iid] || 0) + Number(medalhas[key]);
        }
      });
    });
    return tot;
  }

  function pontuacaoExtra(row) {
    const v = row.pontuacao_extra != null ? row.pontuacao_extra : row.embaixadas;
    return num(v, 0);
  }

  /** Título normalizado para reconhecer provas de desempate (acentos ignorados). */
  function normalizeMatchTitle(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  /**
   * Agrupa provas pelos critérios de desempate (título).
   * Ordem de teste: Organização antes de Bíblia (ambas «Conhecimentos gerais…»).
   */
  function tiebreakProvaBucket(titulo) {
    const t = normalizeMatchTitle(titulo);
    if (t.indexOf("conhecimentos gerais") !== -1 && t.indexOf("organiz") !== -1) return "cgOrg";
    if (t.indexOf("conhecimentos gerais") !== -1 && t.indexOf("bibl") !== -1) return "cgBib";
    if (t.indexOf("debate") !== -1 && t.indexOf("versicul") !== -1) return "debate";
    return null;
  }

  function gincanaPtsOnProva(places, medalhas, igrejaId) {
    if (!places || typeof places !== "object") return 0;
    let pts = 0;
    ["ou", "pt", "br"].forEach(function (key) {
      const entry = places[key];
      if (!entry || typeof entry !== "object") return;
      if (entry.igrejaId === igrejaId && medalhas[key] != null) {
        pts += Number(medalhas[key]);
      }
    });
    return pts;
  }

  function buildTiebreakByIgreja(evento, dados) {
    const igrejas = Array.isArray(evento && evento.igrejas) ? evento.igrejas : [];
    const medalhas = (evento && evento.medalhas) || { ou: 0, pt: 0, br: 0 };
    const podium = (dados && dados.podium) || {};
    const igrejaIds = new Set(
      igrejas.map(function (g) {
        return g && g.id;
      })
    );
    const medalCounts = contarMedalhasPorIgreja(podium, igrejaIds);
    const out = {};
    igrejas.forEach(function (g) {
      const gid = g.id;
      const m = medalCounts[gid] || { ou: 0, pt: 0, br: 0 };
      let cgBib = 0;
      let debate = 0;
      let cgOrg = 0;
      (evento.provas || []).forEach(function (p) {
        const bucket = tiebreakProvaBucket(p.titulo);
        if (!bucket) return;
        const pl = podium[p.id];
        const pts = gincanaPtsOnProva(pl, medalhas, gid);
        if (bucket === "cgBib") cgBib += pts;
        else if (bucket === "debate") debate += pts;
        else if (bucket === "cgOrg") cgOrg += pts;
      });
      out[gid] = {
        ou: m.ou || 0,
        pt: m.pt || 0,
        cgBiblia: cgBib,
        debate: debate,
        cgOrg: cgOrg,
      };
    });
    return out;
  }

  function computeTotals(evento, dados) {
    const pesos = (evento && evento.pesos) || {};
    const medalhas = (evento && evento.medalhas) || { ou: 0, pt: 0, br: 0 };
    const igrejas = Array.isArray(evento && evento.igrejas) ? evento.igrejas : [];
    const igrejaIds = new Set(
      igrejas.map(function (g) {
        return g && g.id;
      })
    );
    const participacao = (dados && dados.participacao) || {};
    const podium = (dados && dados.podium) || {};
    const gincTotals = gincanaPorIgreja(podium, medalhas, igrejaIds);
    const detalhes = [];
    for (let gi = 0; gi < igrejas.length; gi++) {
      const g = igrejas[gi];
      const gid = g.id;
      const row = participacao[gid] || {};
      const pPart = pontosParticipacao(row, pesos);
      const pPuni = pontosPunicoes(row, pesos);
      const pGinc = Number(gincTotals[gid] || 0);
      const pExt = pontuacaoExtra(row);
      const total = pPart + pPuni + pGinc + pExt;
      detalhes.push({
        igrejaId: gid,
        igreja: g.nome,
        participacao: pPart,
        punicoes: pPuni,
        gincana: pGinc,
        pontuacao_extra: pExt,
        total: total,
      });
    }
    const totais = detalhes.map(function (d) {
      return d.total;
    });
    const ranks = rankList(totais);
    const medalhasPorIgreja = contarMedalhasPorIgreja(podium, igrejaIds);
    const tiebreakByIgreja = buildTiebreakByIgreja(evento, dados);
    return {
      detalhes: detalhes,
      totais: totais,
      ranks: ranks,
      medalhasPorIgreja: medalhasPorIgreja,
      gincanaPorIgreja: gincTotals,
      tiebreakByIgreja: tiebreakByIgreja,
    };
  }

  function rankList(totais) {
    const n = totais.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = 0;
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) {
      return totais[b] - totais[a];
    });
    for (let j = 0; j < n; j++) {
      const i = order[j];
      if (j === 0) out[i] = 1;
      else {
        const prev = order[j - 1];
        out[i] = totais[i] === totais[prev] ? out[prev] : j + 1;
      }
    }
    return out;
  }

  function contarMedalhasPorIgreja(podium, igrejaIds) {
    const out = {};
    igrejaIds.forEach(function (iid) {
      out[iid] = { ou: 0, pt: 0, br: 0 };
    });
    Object.values(podium).forEach(function (places) {
      if (!places || typeof places !== "object") return;
      ["ou", "pt", "br"].forEach(function (key) {
        const entry = places[key];
        if (!entry || typeof entry !== "object") return;
        const iid = entry.igrejaId;
        if (iid && out[iid] && out[iid][key] != null) out[iid][key] += 1;
      });
    });
    return out;
  }

  function classificacaoOrdenada(detalhes, ranks, tiebreakByIgreja) {
    const tb = tiebreakByIgreja || {};
    const emptyTb = { ou: 0, pt: 0, cgBiblia: 0, debate: 0, cgOrg: 0 };
    const indexed = [];
    for (let i = 0; i < detalhes.length; i++) indexed.push(i);
    indexed.sort(function (a, b) {
      const da = detalhes[a];
      const db = detalhes[b];
      let diff = db.total - da.total;
      if (diff !== 0) return diff;
      const ida = da.igrejaId;
      const idb = db.igrejaId;
      const xa = tb[ida] || emptyTb;
      const xb = tb[idb] || emptyTb;
      diff = xb.ou - xa.ou;
      if (diff !== 0) return diff;
      diff = xb.pt - xa.pt;
      if (diff !== 0) return diff;
      diff = xb.cgBiblia - xa.cgBiblia;
      if (diff !== 0) return diff;
      diff = xb.debate - xa.debate;
      if (diff !== 0) return diff;
      diff = xb.cgOrg - xa.cgOrg;
      if (diff !== 0) return diff;
      return String(da.igreja || "").localeCompare(String(db.igreja || ""), "pt", {
        sensitivity: "base",
        numeric: true,
      });
    });
    return indexed.map(function (i) {
      const row = Object.assign({}, detalhes[i]);
      row.posicao = ranks[i];
      return row;
    });
  }

  function validateEventoMinimal(evento) {
    const errs = [];
    if (!evento || typeof evento !== "object") return ["Evento deve ser um objeto."];
    ["meta", "pesos", "medalhas", "igrejas", "provas"].forEach(function (k) {
      if (evento[k] == null) errs.push("Falta chave: " + k);
    });
    if (!Array.isArray(evento.igrejas)) errs.push("igrejas deve ser uma lista.");
    if (!Array.isArray(evento.provas)) errs.push("provas deve ser uma lista.");
    if (errs.length) return errs;
    const ids = evento.igrejas.map(function (g) {
      return g && g.id;
    });
    if (new Set(ids).size !== ids.length) errs.push("IDs de igrejas duplicados");
    const pids = evento.provas.map(function (p) {
      return p && p.id;
    });
    if (new Set(pids).size !== pids.length) errs.push("IDs de provas duplicados");
    return errs;
  }

  function emptyDadosTemplate(igrejaIds, provaIds) {
    const part = {};
    igrejaIds.forEach(function (gid) {
      part[gid] = {
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
    });
    const pod = {};
    provaIds.forEach(function (pid) {
      pod[pid] = {
        ou: { igrejaId: null, competidor: "" },
        pt: { igrejaId: null, competidor: "" },
        br: { igrejaId: null, competidor: "" },
      };
    });
    return { participacao: part, podium: pod };
  }

  function avisosPodiumDuplicado(podium) {
    const avisos = [];
    Object.keys(podium).forEach(function (provaId) {
      const places = podium[provaId];
      if (!places || typeof places !== "object") return;
      const seen = new Set();
      ["ou", "pt", "br"].forEach(function (key) {
        const iid = places[key] && places[key].igrejaId;
        if (!iid) return;
        if (seen.has(iid))
          avisos.push("Prova «" + provaId + "»: igreja repetida em mais de um lugar.");
        seen.add(iid);
      });
    });
    return avisos;
  }

  global.ConclaveEngine = {
    computeTotals: computeTotals,
    rankList: rankList,
    classificacaoOrdenada: classificacaoOrdenada,
    validateEventoMinimal: validateEventoMinimal,
    emptyDadosTemplate: emptyDadosTemplate,
    avisosPodiumDuplicado: avisosPodiumDuplicado,
    contarMedalhasPorIgreja: contarMedalhasPorIgreja,
    // Helpers expostos para reuso por integrações externas, evitando
    // reimplementação divergente das regras de pontuação/punição.
    pontosParticipacao: pontosParticipacao,
    pontosPunicoes: pontosPunicoes,
    pontuacaoExtra: pontuacaoExtra,
    truthy: truthy,
    num: num,
  };
})(typeof window !== "undefined" ? window : globalThis);
