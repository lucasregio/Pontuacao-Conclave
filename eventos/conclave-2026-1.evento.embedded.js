/**
 * Gerado automaticamente por scripts/build-embedded.mjs.
 * NÃO EDITE À MÃO. Reedite eventos/conclave-2026-1.evento.json e
 * rode `npm run build:embedded` (ou `node scripts/build-embedded.mjs`).
 *
 * Este arquivo expõe o evento de exemplo como `window.ConclaveDefaultEvento`
 * para que o app funcione sem `fetch()` (cenário típico de uso via
 * `file://`, por exemplo a partir de um pen-drive).
 */
window.ConclaveDefaultEvento = {
  "meta": {
    "schemaVersion": 2,
    "nome": "Conclave MR 2026/1",
    "slug": "conclave-2026-1",
    "data": "2026-04-11",
    "local": "Vitória — ES",
    "regulamentoUrl": "regulamento-2026.pdf"
  },
  "pesos": {
    "inscricao": 100,
    "pontualidade": 200,
    "uniforme": 50,
    "biblia": 50,
    "visitante": 10,
    "animacao": 150,
    "mau_comportamento": -150
  },
  "medalhas": {
    "ou": 300,
    "pt": 200,
    "br": 100
  },
  "igrejas": [
    {
      "id": "alianca",
      "nome": "Primeira Igreja Batista Aliança"
    },
    {
      "id": "ibes",
      "nome": "Igreja Batista do Ibes"
    },
    {
      "id": "gloria",
      "nome": "Igreja Batista da Glória"
    },
    {
      "id": "orla",
      "nome": "Igreja da Orla"
    },
    {
      "id": "vila-batista",
      "nome": "Vila Batista"
    },
    {
      "id": "aribiri",
      "nome": "PIB Aribiri"
    },
    {
      "id": "vila-garrido",
      "nome": "Primeira Igreja Batista em Vila Garrido"
    },
    {
      "id": "novo-mexico",
      "nome": "Novo México"
    },
    {
      "id": "santa-rita",
      "nome": "Igreja Batista de Santa Rita"
    },
    {
      "id": "23-maio",
      "nome": "Primeira igreja Batista 23 de maio"
    },
    {
      "id": "guarapari",
      "nome": "batista Guaranhuns"
    },
    {
      "id": "pibjg",
      "nome": "Primeira Igreja Batista em João Goulart (PIBJG)"
    },
    {
      "id": "brunellas",
      "nome": "Primeira Igreja Batista em Brunellas"
    },
    {
      "id": "cobilandia",
      "nome": "Pib Cobilandia"
    },
    {
      "id": "alvorada",
      "nome": "Primeira igreja Batista em Alvorada"
    },
    {
      "id": "cocal",
      "nome": "Pib Cocal"
    },
    {
      "id": "santa-monica",
      "nome": "Igreja batista de Santa Mônica"
    }
  ],
  "categorias": [
    {
      "id": "junior",
      "nome": "Junior",
      "ordem": 0,
      "idade": "10–13"
    },
    {
      "id": "adolescente",
      "nome": "Adolescente",
      "ordem": 1,
      "idade": "14–17"
    },
    {
      "id": "juvenil",
      "nome": "Juvenil",
      "ordem": 2,
      "idade": "18–25"
    }
  ],
  "provas": [
    {
      "id": "esgrima-jun",
      "titulo": "Esgrima bíblica — Junior",
      "tipo": "oral",
      "categoriaId": "junior",
      "categoria": "Junior",
      "ordem": 1
    },
    {
      "id": "esgrima-adl",
      "titulo": "Esgrima bíblica — Adolescente",
      "tipo": "oral",
      "categoriaId": "adolescente",
      "categoria": "Adolescente",
      "ordem": 2
    },
    {
      "id": "esgrima-juv",
      "titulo": "Esgrima bíblica — Juvenil",
      "tipo": "oral",
      "categoriaId": "juvenil",
      "categoria": "Juvenil",
      "ordem": 3
    },
    {
      "id": "debate-jun",
      "titulo": "Debate de versículos — Junior",
      "tipo": "oral",
      "categoriaId": "junior",
      "categoria": "Junior",
      "ordem": 4
    },
    {
      "id": "debate-adl",
      "titulo": "Debate de versículos — Adolescente",
      "tipo": "oral",
      "categoriaId": "adolescente",
      "categoria": "Adolescente",
      "ordem": 5
    },
    {
      "id": "debate-juv",
      "titulo": "Debate de versículos — Juvenil",
      "tipo": "oral",
      "categoriaId": "juvenil",
      "categoria": "Juvenil",
      "ordem": 6
    },
    {
      "id": "esgrima-av-jun",
      "titulo": "Esgrima avançada — Junior",
      "tipo": "oral",
      "categoriaId": "junior",
      "categoria": "Junior",
      "ordem": 7
    },
    {
      "id": "esgrima-av-adl",
      "titulo": "Esgrima avançada — Adolescente",
      "tipo": "oral",
      "categoriaId": "adolescente",
      "categoria": "Adolescente",
      "ordem": 8
    },
    {
      "id": "esgrima-av-juv",
      "titulo": "Esgrima avançada — Juvenil",
      "tipo": "oral",
      "categoriaId": "juvenil",
      "categoria": "Juvenil",
      "ordem": 9
    },
    {
      "id": "escrita-jun",
      "titulo": "Prova escrita — Junior",
      "tipo": "escrita",
      "categoriaId": "junior",
      "categoria": "Junior",
      "ordem": 10
    },
    {
      "id": "escrita-adl",
      "titulo": "Prova escrita — Adolescente",
      "tipo": "escrita",
      "categoriaId": "adolescente",
      "categoria": "Adolescente",
      "ordem": 11
    },
    {
      "id": "escrita-juv",
      "titulo": "Prova escrita — Juvenil",
      "tipo": "escrita",
      "categoriaId": "juvenil",
      "categoria": "Juvenil",
      "ordem": 12
    }
  ]
};
