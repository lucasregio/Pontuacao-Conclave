"""
Motor de pontuação Conclave MR — funções puras (config + dados → totais e detalhes).
Manter em sincronia com web/engine.js
"""

from __future__ import annotations

import unicodedata
from collections import defaultdict
from typing import Any

MedalKey = str  # "ou" | "pt" | "br"


def truthy(v: Any) -> bool:
    if v is None or v is False:
        return False
    s = str(v).strip().lower()
    return s in ("x", "1", "sim", "s", "true", "verdadeiro", "ok", "✓")


def num(v: Any, default: float = 0.0) -> float:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def pontos_participacao(row: dict[str, Any], pesos: dict[str, float]) -> float:
    b = num(row.get("inscricao"), 0)
    if isinstance(row.get("inscricao"), bool):
        b = 1.0 if row.get("inscricao") else 0.0
    c = num(row.get("pontualidade"), 0)
    if isinstance(row.get("pontualidade"), bool):
        c = 1.0 if row.get("pontualidade") else 0.0
    d = int(num(row.get("mr_total"), 0))
    e = int(num(row.get("mr_camisa"), 0))
    f = int(num(row.get("mr_biblia"), 0))
    g = int(num(row.get("visitantes"), 0))
    anim = truthy(row.get("animacao"))

    if (b + d) <= 0:
        return 0.0

    total = b * pesos["inscricao"] + c * pesos["pontualidade"]
    if d > 0 and e == d:
        total += pesos["uniforme"]
    if d > 0 and f == d:
        total += pesos["biblia"]
    total += g * pesos["visitante"]
    if anim:
        total += pesos["animacao"]
    return total


def pontos_punicoes(row: dict[str, Any], pesos: dict[str, float]) -> float:
    p = 0.0
    if truthy(row.get("mau_comportamento")):
        p += pesos["mau_comportamento"]
    return p


def normalize_match_title(s: Any) -> str:
    """Título em minúsculas sem acentos, para reconhecer provas de desempate."""
    t = unicodedata.normalize("NFD", str(s or "").strip().lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def tiebreak_prova_bucket(titulo: str) -> str | None:
    """
    Agrupa provas pelos critérios de desempate.
    «Organização» antes de «Bíblia» — ambas começam por «Conhecimentos gerais».
    """
    t = normalize_match_title(titulo)
    if "conhecimentos gerais" in t and "organiz" in t:
        return "cg_org"
    if "conhecimentos gerais" in t and "bibl" in t:
        return "cg_bib"
    if "debate" in t and "versicul" in t:
        return "debate"
    return None


def gincana_pts_on_prova(
    places: dict[str, Any] | None,
    medalhas: dict[str, float],
    igreja_id: str,
) -> float:
    if not isinstance(places, dict):
        return 0.0
    pts = 0.0
    for key in ("ou", "pt", "br"):
        entry = places.get(key) or {}
        if not isinstance(entry, dict):
            continue
        if entry.get("igrejaId") == igreja_id and key in medalhas:
            pts += float(medalhas[key])
    return pts


def build_tiebreak_by_igreja(evento: dict[str, Any], dados: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Desempate: contagem ou/pt e pontos de gincana em provas-chave (por título)."""
    igrejas = evento.get("igrejas") or []
    medalhas = evento.get("medalhas") or {"ou": 0, "pt": 0, "br": 0}
    podium = dados.get("podium") or {}
    igreja_ids = {g["id"] for g in igrejas}
    medal_counts = contar_medalhas_por_igreja(podium, igreja_ids)
    out: dict[str, dict[str, float]] = {}
    for g in igrejas:
        gid = g["id"]
        m = medal_counts.get(gid) or {"ou": 0, "pt": 0, "br": 0}
        cg_bib = debate = cg_org = 0.0
        for p in evento.get("provas") or []:
            bucket = tiebreak_prova_bucket(str(p.get("titulo") or ""))
            if not bucket:
                continue
            pl = podium.get(p["id"])
            pts = gincana_pts_on_prova(pl, medalhas, gid)
            if bucket == "cg_bib":
                cg_bib += pts
            elif bucket == "debate":
                debate += pts
            elif bucket == "cg_org":
                cg_org += pts
        out[gid] = {
            "ou": float(m.get("ou") or 0),
            "pt": float(m.get("pt") or 0),
            "cgBiblia": cg_bib,
            "debate": debate,
            "cgOrg": cg_org,
        }
    return out


def gincana_por_igreja(
    podium: dict[str, dict[str, Any]],
    medalhas: dict[str, float],
    igreja_ids: set[str],
) -> dict[str, float]:
    """Soma pontos de gincana por igreja a partir do pódio (cada prova → ou/pt/br)."""
    tot: dict[str, float] = defaultdict(float)
    for _prova_id, places in podium.items():
        if not isinstance(places, dict):
            continue
        for key in ("ou", "pt", "br"):
            entry = places.get(key) or {}
            if not isinstance(entry, dict):
                continue
            iid = entry.get("igrejaId")
            if iid and iid in igreja_ids and key in medalhas:
                tot[str(iid)] += float(medalhas[key])
    return dict(tot)


def pontuacao_extra(row: dict[str, Any]) -> float:
    v = row.get("pontuacao_extra")
    if v is None:
        v = row.get("embaixadas")
    return num(v, 0.0)


def compute_totals(evento: dict[str, Any], dados: dict[str, Any]) -> dict[str, Any]:
    """
    evento: meta, pesos, medalhas, igrejas[], provas[]
    dados: participacao{ igrejaId: row }, podium{ provaId: { ou/pt/br: { igrejaId, competidor } } }
    """
    pesos = evento["pesos"]
    medalhas = evento["medalhas"]
    igrejas = evento["igrejas"]
    igreja_ids = {g["id"] for g in igrejas}
    participacao = dados.get("participacao") or {}
    podium = dados.get("podium") or {}

    ginc_totals = gincana_por_igreja(podium, medalhas, igreja_ids)

    detalhes = []
    for g in igrejas:
        gid = g["id"]
        row = participacao.get(gid) or {}
        p_part = pontos_participacao(row, pesos)
        p_puni = pontos_punicoes(row, pesos)
        p_ginc = float(ginc_totals.get(gid, 0.0))
        p_ext = pontuacao_extra(row)
        total = p_part + p_puni + p_ginc + p_ext
        detalhes.append(
            {
                "igrejaId": gid,
                "igreja": g["nome"],
                "participacao": p_part,
                "punicoes": p_puni,
                "gincana": p_ginc,
                "pontuacao_extra": p_ext,
                "total": total,
            }
        )

    totais = [d["total"] for d in detalhes]
    ranks = rank_list(totais)

    medalhas_por_igreja = contar_medalhas_por_igreja(podium, igreja_ids)
    tiebreak_by_igreja = build_tiebreak_by_igreja(evento, dados)

    return {
        "detalhes": detalhes,
        "totais": totais,
        "ranks": ranks,
        "medalhasPorIgreja": medalhas_por_igreja,
        "gincanaPorIgreja": ginc_totals,
        "tiebreakByIgreja": tiebreak_by_igreja,
    }


def rank_list(totais: list[float]) -> list[int]:
    n = len(totais)
    out = [0] * n
    order = sorted(range(n), key=lambda i: totais[i], reverse=True)
    for j, i in enumerate(order):
        if j == 0:
            out[i] = 1
        else:
            prev = order[j - 1]
            out[i] = out[prev] if totais[i] == totais[prev] else j + 1
    return out


def contar_medalhas_por_igreja(
    podium: dict[str, dict[str, Any]],
    igreja_ids: set[str],
) -> dict[str, dict[str, int]]:
    """Conta ou/pt/br conquistados por igreja (para relatório)."""
    out: dict[str, dict[str, int]] = {iid: {"ou": 0, "pt": 0, "br": 0} for iid in igreja_ids}
    for places in podium.values():
        if not isinstance(places, dict):
            continue
        for key in ("ou", "pt", "br"):
            entry = places.get(key) or {}
            if not isinstance(entry, dict):
                continue
            iid = entry.get("igrejaId")
            if iid and iid in out and key in out[iid]:
                out[iid][key] += 1
    return out


def classificacao_ordenada(
    detalhes: list[dict[str, Any]],
    ranks: list[int],
    tiebreak_by_igreja: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Ordena por total desc.; empates: ouro → prata → pts gincana em Conhecimentos Gerais da Bíblia
    → Debate de Versículos → Conhecimentos Gerais da Organização → nome.
    """
    tb = tiebreak_by_igreja or {}

    def sort_key(i: int) -> tuple:
        d = detalhes[i]
        gid = d["igrejaId"]
        t = tb.get(gid) or {}
        ou = float(t.get("ou") or 0)
        pt = float(t.get("pt") or 0)
        cg_bib = float(t.get("cgBiblia") or 0)
        deb = float(t.get("debate") or 0)
        cg_org = float(t.get("cgOrg") or 0)
        nome = str(d.get("igreja") or "")
        return (-d["total"], -ou, -pt, -cg_bib, -deb, -cg_org, nome)

    indexed = sorted(range(len(detalhes)), key=sort_key)
    return [{**detalhes[i], "posicao": ranks[i]} for i in indexed]


def validate_evento_minimal(evento: dict[str, Any]) -> list[str]:
    """Retorna lista de erros (vazia = OK)."""
    errs: list[str] = []
    for k in ("meta", "pesos", "medalhas", "igrejas", "provas"):
        if k not in evento:
            errs.append(f"Falta chave: {k}")
    if errs:
        return errs
    ids = [g["id"] for g in evento["igrejas"]]
    if len(ids) != len(set(ids)):
        errs.append("IDs de igrejas duplicados")
    pids = [p["id"] for p in evento["provas"]]
    if len(pids) != len(set(pids)):
        errs.append("IDs de provas duplicados")
    return errs


def empty_dados_template(igreja_ids: list[str], prova_ids: list[str]) -> dict[str, Any]:
    part = {
        gid: {
            "inscricao": True,
            "pontualidade": True,
            "mr_total": 0,
            "mr_camisa": 0,
            "mr_biblia": 0,
            "visitantes": 0,
            "animacao": False,
            "mau_comportamento": False,
            "pontuacao_extra": 0,
        }
        for gid in igreja_ids
    }
    pod = {
        pid: {"ou": {"igrejaId": None, "competidor": ""}, "pt": {"igrejaId": None, "competidor": ""}, "br": {"igrejaId": None, "competidor": ""}}
        for pid in prova_ids
    }
    return {"participacao": part, "podium": pod}
