/**
 * Métricas analíticas da prova escrita — funções puras (sem DOM).
 * Não altera a classificação geral; usado pela aba Prova escrita e gráficos.
 */
(function () {
  "use strict";

  function normalizeAcertos(v) {
    var n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n);
  }

  function compareParticipantes(a, b) {
    var da = normalizeAcertos(a.acertos);
    var db = normalizeAcertos(b.acertos);
    if (db !== da) return db - da;
    var na = String(a.nome || "").trim();
    var nb = String(b.nome || "").trim();
    return na.localeCompare(nb, "pt-BR", { sensitivity: "base" });
  }

  /** Ordena participantes por acertos desc, depois nome. */
  function rankParticipantes(list) {
    if (!Array.isArray(list)) return [];
    return list.slice().sort(compareParticipantes);
  }

  /** Top N para gráfico de ranking (máx. 15). */
  function topParticipantes(list, limit) {
    var lim = limit == null ? 15 : Math.max(1, limit);
    return rankParticipantes(list).slice(0, lim);
  }

  /** Média de acertos por igrejaId. Retorna [{ igrejaId, media, count }]. */
  function mediaPorIgreja(list, igrejaNomeMap) {
    if (!Array.isArray(list) || !list.length) return [];
    var buckets = {};
    list.forEach(function (p) {
      if (!p || !p.igrejaId) return;
      var gid = p.igrejaId;
      if (!buckets[gid]) buckets[gid] = { sum: 0, count: 0 };
      buckets[gid].sum += normalizeAcertos(p.acertos);
      buckets[gid].count += 1;
    });
    var out = Object.keys(buckets).map(function (gid) {
      var b = buckets[gid];
      return {
        igrejaId: gid,
        igrejaNome: (igrejaNomeMap && igrejaNomeMap[gid]) || gid,
        media: b.count ? b.sum / b.count : 0,
        count: b.count,
      };
    });
    out.sort(function (a, b) {
      if (b.media !== a.media) return b.media - a.media;
      return String(a.igrejaNome).localeCompare(String(b.igrejaNome), "pt-BR", {
        sensitivity: "base",
      });
    });
    return out;
  }

  /**
   * Histograma em faixas de tamanho fixo.
   * @param {number} totalQuestoes — ex.: 20 → faixas 0-4, 5-9, …
   */
  function histogramaFaixas(list, totalQuestoes, binSize) {
    if (!Array.isArray(list) || !list.length) return [];
    var total = Number(totalQuestoes);
    if (!Number.isFinite(total) || total < 1) return [];
    var size = binSize == null ? Math.max(1, Math.ceil(total / 5)) : Math.max(1, binSize);
    var maxBin = Math.ceil(total / size) - 1;
    var bins = [];
    for (var i = 0; i <= maxBin; i++) {
      var lo = i * size;
      var hi = Math.min(total, lo + size - 1);
      bins.push({ label: lo + "–" + hi, lo: lo, hi: hi, count: 0 });
    }
    list.forEach(function (p) {
      var a = normalizeAcertos(p.acertos);
      var idx = Math.min(maxBin, Math.floor(a / size));
      if (idx < 0) idx = 0;
      bins[idx].count += 1;
    });
    return bins;
  }

  function resumoProva(list) {
    if (!Array.isArray(list) || !list.length) {
      return { count: 0, media: 0, max: 0, min: 0 };
    }
    var sum = 0;
    var max = 0;
    var min = Infinity;
    list.forEach(function (p) {
      var a = normalizeAcertos(p.acertos);
      sum += a;
      if (a > max) max = a;
      if (a < min) min = a;
    });
    return {
      count: list.length,
      media: sum / list.length,
      max: max,
      min: min === Infinity ? 0 : min,
    };
  }

  function validarEntrada(entry) {
    var errs = [];
    if (!entry || typeof entry !== "object") {
      errs.push("Entrada inválida.");
      return errs;
    }
    if (!String(entry.nome || "").trim()) errs.push("Nome é obrigatório.");
    if (!String(entry.igrejaId || "").trim()) errs.push("Igreja é obrigatória.");
    var a = Number(entry.acertos);
    if (!Number.isFinite(a) || a < 0) errs.push("Acertos deve ser número ≥ 0.");
    return errs;
  }

  function percentual(acertos, totalQuestoes) {
    var t = Number(totalQuestoes);
    if (!Number.isFinite(t) || t < 1) return null;
    return (normalizeAcertos(acertos) / t) * 100;
  }

  window.ConclaveEscritaMetrics = {
    normalizeAcertos: normalizeAcertos,
    rankParticipantes: rankParticipantes,
    topParticipantes: topParticipantes,
    mediaPorIgreja: mediaPorIgreja,
    histogramaFaixas: histogramaFaixas,
    resumoProva: resumoProva,
    validarEntrada: validarEntrada,
    percentual: percentual,
  };
})();
