/**
 * Pontuação Conclave — perfis e helpers do relatório oficial (sem DOM).
 */
(function () {
  var BLOCOS_RESUMO = ["capa", "sumario", "podio", "encerramento", "rodape"];

  var BLOCOS_COMPLETO = [
    "capa",
    "sumario",
    "classificacao",
    "medalhas",
    "podio",
    "participacao",
    "avisos",
    "criterios",
    "encerramento",
    "rodape",
  ];

  function normalizePerfil(perfil) {
    return perfil === "completo" ? "completo" : "resumo";
  }

  function getRelatorioBlocos(perfil) {
    return normalizePerfil(perfil) === "completo" ? BLOCOS_COMPLETO.slice() : BLOCOS_RESUMO.slice();
  }

  function relatorioPerfilLabel(perfil) {
    return normalizePerfil(perfil) === "completo" ? "Oficial completo" : "Resumo";
  }

  function buildRelatorioCapaTitulo(perfil) {
    return normalizePerfil(perfil) === "completo"
      ? "Relatório oficial — Completo"
      : "Relatório — Resumo";
  }

  function buildRelatorioDocumentTitle(slug, perfil) {
    var base = String(slug || "").trim() || "conclave";
    return base + "-relatorio-" + normalizePerfil(perfil);
  }

  /**
   * Linhas da meta da capa. Resumo omite slug/schema na capa (ficam no rodapé).
   */
  function buildCapaMetaRows(meta, perfil, agoraTxt, opts) {
    meta = meta || {};
    opts = opts || {};
    var isCompleto = normalizePerfil(perfil) === "completo";
    var horarioInicio = meta.horarioInicio || "";
    var horarioFim = meta.horarioEncerramento || "";
    var horarioTxt;
    if (horarioInicio && horarioFim) horarioTxt = horarioInicio + " — " + horarioFim;
    else if (horarioInicio) horarioTxt = horarioInicio;
    else if (horarioFim) horarioTxt = horarioFim;
    else horarioTxt = "—";

    var rows = [
      { dt: "Data", dd: meta.data || "" },
      { dt: "Local", dd: meta.local || "" },
      { dt: "Horário", dd: horarioTxt },
      { dt: "Tema", dd: opts.temaTexto || "—" },
    ];
    if (isCompleto) {
      rows.push({ dt: "Slug", dd: meta.slug || "" });
      var schemaVersion = meta.schemaVersion != null ? meta.schemaVersion : opts.schemaVersion;
      rows.push({
        dt: "Schema",
        dd: schemaVersion != null ? "v" + schemaVersion : "—",
      });
    }
    rows.push({ dt: "Gerado em", dd: agoraTxt || "—" });
    return rows;
  }

  function buildRodapeTexto(meta, agoraTxt, perfil, schemaVersion) {
    meta = meta || {};
    var slug = meta.slug || "—";
    var sv = schemaVersion != null ? schemaVersion : meta.schemaVersion;
    var base = "Gerado em " + (agoraTxt || "—") + " · slug: " + slug;
    if (normalizePerfil(perfil) === "completo" && sv != null) {
      base += " · schema: v" + sv;
    }
    return base;
  }

  var TEXTO_ATA =
    "Certificamos que a apuração registrada neste documento foi elaborada com base " +
    "nos dados lançados no Pontuação Conclave, conforme o regulamento vigente do evento " +
    "e os critérios de pontuação configurados para esta edição.";

  window.ConclaveRelatorio = {
    BLOCOS_RESUMO: BLOCOS_RESUMO,
    BLOCOS_COMPLETO: BLOCOS_COMPLETO,
    getRelatorioBlocos: getRelatorioBlocos,
    normalizePerfil: normalizePerfil,
    relatorioPerfilLabel: relatorioPerfilLabel,
    buildRelatorioCapaTitulo: buildRelatorioCapaTitulo,
    buildRelatorioDocumentTitle: buildRelatorioDocumentTitle,
    buildCapaMetaRows: buildCapaMetaRows,
    buildRodapeTexto: buildRodapeTexto,
    TEXTO_ATA: TEXTO_ATA,
  };
})();
