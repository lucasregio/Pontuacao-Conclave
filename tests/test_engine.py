import json
from pathlib import Path

import pytest

from engine import (
    classificacao_ordenada,
    compute_totals,
    empty_dados_template,
    gincana_por_igreja,
    pontos_participacao,
    rank_list,
    validate_evento_minimal,
)

BASE = Path(__file__).resolve().parent.parent


@pytest.fixture
def evento_exemplo() -> dict:
    p = BASE / "eventos" / "conclave-2026-1.evento.json"
    return json.loads(p.read_text(encoding="utf-8"))


def test_validate_evento(evento_exemplo):
    assert validate_evento_minimal(evento_exemplo) == []


def test_participacao_basica(evento_exemplo):
    pesos = evento_exemplo["pesos"]
    row = {
        "inscricao": True,
        "pontualidade": True,
        "mr_total": 4,
        "mr_camisa": 4,
        "mr_biblia": 4,
        "visitantes": 0,
        "animacao": True,
    }
    # 100+200+50+50+150 = 550
    assert pontos_participacao(row, pesos) == 550.0


def test_gincana_podium(evento_exemplo):
    medalhas = evento_exemplo["medalhas"]
    ids = {g["id"] for g in evento_exemplo["igrejas"]}
    podium = {
        "p1": {
            "ou": {"igrejaId": "ibes", "competidor": "A"},
            "pt": {"igrejaId": "gloria", "competidor": "B"},
            "br": {"igrejaId": "orla", "competidor": ""},
        }
    }
    g = gincana_por_igreja(podium, medalhas, ids)
    assert g["ibes"] == 300
    assert g["gloria"] == 200
    assert g["orla"] == 100


def test_compute_totals(evento_exemplo):
    dados = empty_dados_template(
        [g["id"] for g in evento_exemplo["igrejas"]],
        [p["id"] for p in evento_exemplo["provas"]],
    )
    dados["participacao"]["ibes"]["mr_total"] = 1
    dados["participacao"]["ibes"]["mr_camisa"] = 1
    dados["participacao"]["ibes"]["mr_biblia"] = 1
    dados["podium"]["esgrima-jun"]["ou"]["igrejaId"] = "ibes"
    dados["podium"]["esgrima-jun"]["ou"]["competidor"] = "Maria"

    out = compute_totals(evento_exemplo, dados)
    ibes = next(d for d in out["detalhes"] if d["igrejaId"] == "ibes")
    assert ibes["gincana"] == 300.0
    assert ibes["total"] == pytest.approx(ibes["participacao"] + ibes["punicoes"] + 300 + ibes["pontuacao_extra"])


def test_rank_empate():
    assert rank_list([100.0, 100.0, 50.0]) == [1, 1, 3]


def test_desempate_mais_medalhas_ouro():
    detalhes = [
        {"igrejaId": "b", "igreja": "Bravo", "total": 1000.0},
        {"igrejaId": "a", "igreja": "Alfa", "total": 1000.0},
    ]
    ranks = [1, 1]
    tb = {
        "a": {"ou": 3, "pt": 0, "cgBiblia": 0, "debate": 0, "cgOrg": 0},
        "b": {"ou": 1, "pt": 0, "cgBiblia": 0, "debate": 0, "cgOrg": 0},
    }
    ordem = classificacao_ordenada(detalhes, ranks, tb)
    assert [r["igrejaId"] for r in ordem] == ["a", "b"]


def test_desempate_cg_biblia_depois_ouro_prata():
    detalhes = [
        {"igrejaId": "b", "igreja": "B", "total": 100.0},
        {"igrejaId": "a", "igreja": "A", "total": 100.0},
    ]
    ranks = [1, 1]
    tb = {
        "a": {"ou": 1, "pt": 1, "cgBiblia": 300, "debate": 0, "cgOrg": 0},
        "b": {"ou": 1, "pt": 1, "cgBiblia": 100, "debate": 0, "cgOrg": 0},
    }
    ordem = classificacao_ordenada(detalhes, ranks, tb)
    assert ordem[0]["igrejaId"] == "a"


def test_legacy_rows_to_dados(evento_exemplo):
    from calcular_conclave import legacy_rows_to_dados

    rows = [
        {
            "igreja": "Igreja Batista do Ibes",
            "inscricao": 1,
            "pontualidade": 1,
            "mr_total": 4,
            "mr_camisa": 4,
            "mr_biblia": 4,
            "visitantes": 0,
            "animacao": "",
            "mau_comportamento": "",
            "gincana": ["ou"] + [""] * 11,
            "embaixadas": 0,
        }
    ]
    dados, warns = legacy_rows_to_dados(rows, evento_exemplo)
    assert not warns
    pid = "esgrima-jun"
    assert dados["podium"][pid]["ou"]["igrejaId"] == "ibes"
    out = compute_totals(evento_exemplo, dados)
    ibes = next(d for d in out["detalhes"] if d["igrejaId"] == "ibes")
    assert ibes["gincana"] == 300.0
