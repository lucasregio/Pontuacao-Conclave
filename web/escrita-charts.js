/**
 * Gráficos SVG nativos para métricas da prova escrita (sem dependências externas).
 */
(function () {
  "use strict";

  var M = window.ConclaveEscritaMetrics;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncateLabel(s, max) {
    var t = String(s || "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + "…";
  }

  /** Barras horizontais — ranking individual. */
  function renderRankingSvg(items, maxVal, opts) {
    opts = opts || {};
    var barH = opts.barHeight || 22;
    var gap = opts.gap || 6;
    var padL = opts.padLeft || 120;
    var padR = opts.padRight || 48;
    var padT = opts.padTop || 8;
    var w = opts.width || 640;
    var n = items.length;
    if (!n) return { svg: "", height: 0, aria: "Sem participantes." };
    var chartW = w - padL - padR;
    var h = padT + n * (barH + gap) + 8;
    var max = maxVal > 0 ? maxVal : 1;
    var parts = [
      '<svg class="escrita-chart-svg escrita-chart-svg--rank" viewBox="0 0 ' +
        w +
        " " +
        h +
        '" width="100%" height="' +
        h +
        '" role="img" aria-label="' +
        esc(opts.ariaLabel || "Ranking de participantes") +
        '">',
    ];
    items.forEach(function (item, i) {
      var y = padT + i * (barH + gap);
      var val = M.normalizeAcertos(item.acertos);
      var bw = Math.max(2, (val / max) * chartW);
      var label = truncateLabel(item.label || item.nome, 16);
      parts.push(
        '<text class="escrita-chart-label" x="' +
          (padL - 8) +
          '" y="' +
          (y + barH * 0.72) +
          '" text-anchor="end">' +
          esc(label) +
          "</text>"
      );
      parts.push(
        '<rect class="escrita-chart-bar" x="' +
          padL +
          '" y="' +
          y +
          '" width="' +
          bw +
          '" height="' +
          barH +
          '" rx="3"/>'
      );
      parts.push(
        '<text class="escrita-chart-value" x="' +
          (padL + bw + 6) +
          '" y="' +
          (y + barH * 0.72) +
          '">' +
          esc(String(val)) +
          "</text>"
      );
    });
    parts.push("</svg>");
    return { svg: parts.join(""), height: h, aria: opts.ariaLabel || "" };
  }

  /** Barras verticais — média por igreja. */
  function renderMediaIgrejaSvg(items, maxVal, opts) {
    opts = opts || {};
    var padL = opts.padLeft || 40;
    var padR = opts.padRight || 16;
    var padB = opts.padBottom || 72;
    var padT = opts.padTop || 16;
    var w = opts.width || 640;
    var barW = opts.barWidth || 36;
    var gap = opts.gap || 12;
    var n = items.length;
    if (!n) return { svg: "", height: 0, aria: "Sem dados por igreja." };
    var chartH = opts.chartHeight || 180;
    var h = padT + chartH + padB;
    var totalW = padL + n * (barW + gap) + padR;
    var vw = Math.max(w, totalW);
    var max = maxVal > 0 ? maxVal : 1;
    var parts = [
      '<svg class="escrita-chart-svg escrita-chart-svg--igreja" viewBox="0 0 ' +
        vw +
        " " +
        h +
        '" width="100%" height="' +
        h +
        '" role="img" aria-label="' +
        esc(opts.ariaLabel || "Média por igreja") +
        '">',
    ];
    items.forEach(function (item, i) {
      var val = item.media || 0;
      var bh = Math.max(2, (val / max) * chartH);
      var x = padL + i * (barW + gap);
      var y = padT + chartH - bh;
      parts.push(
        '<rect class="escrita-chart-bar escrita-chart-bar--igreja" x="' +
          x +
          '" y="' +
          y +
          '" width="' +
          barW +
          '" height="' +
          bh +
          '" rx="3"/>'
      );
      parts.push(
        '<text class="escrita-chart-value escrita-chart-value--center" x="' +
          (x + barW / 2) +
          '" y="' +
          (y - 4) +
          '" text-anchor="middle">' +
          esc(val.toFixed(1)) +
          "</text>"
      );
      var lbl = truncateLabel(item.igrejaNome || item.igrejaId, 12);
      parts.push(
        '<text class="escrita-chart-label escrita-chart-label--rot" transform="rotate(-35 ' +
          (x + barW / 2) +
          " " +
          (padT + chartH + 14) +
          ')" x="' +
          (x + barW / 2) +
          '" y="' +
          (padT + chartH + 14) +
          '" text-anchor="end">' +
          esc(lbl) +
          "</text>"
      );
    });
    parts.push("</svg>");
    return { svg: parts.join(""), height: h, aria: opts.ariaLabel || "" };
  }

  /** Histograma — faixas de acertos. */
  function renderHistogramSvg(bins, opts) {
    opts = opts || {};
    var padL = opts.padLeft || 40;
    var padR = opts.padRight || 16;
    var padB = opts.padBottom || 48;
    var padT = opts.padTop || 16;
    var w = opts.width || 640;
    var barW = opts.barWidth || 48;
    var gap = opts.gap || 8;
    var n = bins.length;
    if (!n) return { svg: "", height: 0, aria: "Sem distribuição." };
    var chartH = opts.chartHeight || 160;
    var h = padT + chartH + padB;
    var maxCount = 0;
    bins.forEach(function (b) {
      if (b.count > maxCount) maxCount = b.count;
    });
    if (maxCount < 1) maxCount = 1;
    var totalW = padL + n * (barW + gap) + padR;
    var vw = Math.max(w, totalW);
    var parts = [
      '<svg class="escrita-chart-svg escrita-chart-svg--hist" viewBox="0 0 ' +
        vw +
        " " +
        h +
        '" width="100%" height="' +
        h +
        '" role="img" aria-label="' +
        esc(opts.ariaLabel || "Distribuição de acertos") +
        '">',
    ];
    bins.forEach(function (bin, i) {
      var bh = Math.max(2, (bin.count / maxCount) * chartH);
      var x = padL + i * (barW + gap);
      var y = padT + chartH - bh;
      parts.push(
        '<rect class="escrita-chart-bar escrita-chart-bar--hist" x="' +
          x +
          '" y="' +
          y +
          '" width="' +
          barW +
          '" height="' +
          bh +
          '" rx="3"/>'
      );
      parts.push(
        '<text class="escrita-chart-value escrita-chart-value--center" x="' +
          (x + barW / 2) +
          '" y="' +
          (y - 4) +
          '" text-anchor="middle">' +
          esc(String(bin.count)) +
          "</text>"
      );
      parts.push(
        '<text class="escrita-chart-label escrita-chart-label--center" x="' +
          (x + barW / 2) +
          '" y="' +
          (padT + chartH + 20) +
          '" text-anchor="middle">' +
          esc(bin.label) +
          "</text>"
      );
    });
    parts.push("</svg>");
    return { svg: parts.join(""), height: h, aria: opts.ariaLabel || "" };
  }

  function buildSrTable(caption, headers, rows) {
    var parts = ['<table class="visually-hidden"><caption>', esc(caption), "</caption><thead><tr>"];
    headers.forEach(function (h) {
      parts.push('<th scope="col">', esc(h), "</th>");
    });
    parts.push("</tr></thead><tbody>");
    rows.forEach(function (row) {
      parts.push("<tr>");
      row.forEach(function (cell) {
        parts.push("<td>", esc(cell), "</td>");
      });
      parts.push("</tr>");
    });
    parts.push("</tbody></table>");
    return parts.join("");
  }

  /**
   * Preenche um container com os três gráficos.
   * @param {HTMLElement} host
   * @param {{ list, igrejaNomeMap, totalQuestoes, provaTitulo }} data
   */
  function renderEscritaCharts(host, data) {
    if (!host || !M) return;
    var list = data.list || [];
    var igrejaNomeMap = data.igrejaNomeMap || {};
    var totalQuestoes = data.totalQuestoes;
    var ranked = M.topParticipantes(list, 15);
    var medias = M.mediaPorIgreja(list, igrejaNomeMap);
    var bins = totalQuestoes && totalQuestoes > 0 ? M.histogramaFaixas(list, totalQuestoes) : [];

    var maxRank = 0;
    ranked.forEach(function (p) {
      var a = M.normalizeAcertos(p.acertos);
      if (a > maxRank) maxRank = a;
    });
    if (totalQuestoes && totalQuestoes > maxRank) maxRank = totalQuestoes;

    var maxMedia = 0;
    medias.forEach(function (m) {
      if (m.media > maxMedia) maxMedia = m.media;
    });
    if (totalQuestoes && totalQuestoes > maxMedia) maxMedia = totalQuestoes;

    var rankItems = ranked.map(function (p) {
      return {
        nome: p.nome,
        label: p.nome,
        acertos: p.acertos,
      };
    });

    var rankChart = renderRankingSvg(rankItems, maxRank, {
      ariaLabel: "Ranking individual na prova " + (data.provaTitulo || ""),
    });
    var igrejaChart = renderMediaIgrejaSvg(medias, maxMedia, {
      ariaLabel: "Média de acertos por igreja",
    });
    var histChart =
      bins.length > 0
        ? renderHistogramSvg(bins, { ariaLabel: "Distribuição de acertos por faixa" })
        : null;

    var rankRows = ranked.map(function (p, i) {
      var pct =
        totalQuestoes && totalQuestoes > 0
          ? M.percentual(p.acertos, totalQuestoes).toFixed(1) + "%"
          : "—";
      return [
        String(i + 1),
        p.nome,
        igrejaNomeMap[p.igrejaId] || p.igrejaId,
        String(M.normalizeAcertos(p.acertos)),
        pct,
      ];
    });

    host.innerHTML =
      '<div class="escrita-charts-grid">' +
      '<section class="escrita-chart-card" aria-labelledby="escrita-chart-rank-title">' +
      '<h3 class="escrita-chart-title" id="escrita-chart-rank-title">Ranking individual</h3>' +
      rankChart.svg +
      buildSrTable("Ranking individual", ["Pos.", "Nome", "Igreja", "Acertos", "%"], rankRows) +
      "</section>" +
      '<section class="escrita-chart-card" aria-labelledby="escrita-chart-igreja-title">' +
      '<h3 class="escrita-chart-title" id="escrita-chart-igreja-title">Média por igreja</h3>' +
      igrejaChart.svg +
      "</section>" +
      (histChart
        ? '<section class="escrita-chart-card" aria-labelledby="escrita-chart-hist-title">' +
          '<h3 class="escrita-chart-title" id="escrita-chart-hist-title">Distribuição</h3>' +
          histChart.svg +
          "</section>"
        : "") +
      "</div>";
  }

  window.ConclaveEscritaCharts = {
    renderEscritaCharts: renderEscritaCharts,
    renderRankingSvg: renderRankingSvg,
    renderMediaIgrejaSvg: renderMediaIgrejaSvg,
    renderHistogramSvg: renderHistogramSvg,
  };
})();
