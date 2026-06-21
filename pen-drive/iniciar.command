#!/usr/bin/env bash
# ------------------------------------------------------------------
# Pontuação Conclave — iniciar servidor local (macOS / Linux)
#
# Sobe um servidor HTTP simples na porta 8765 (ou na próxima livre) e
# abre o navegador apontando para http://127.0.0.1:8765. Para parar,
# feche esta janela do Terminal ou pressione Ctrl+C.
#
# Pré-requisito: Python 3 instalado (vem por padrão no macOS).
# ------------------------------------------------------------------
set -euo pipefail

# Garante que o script roda a partir da raiz do projeto (uma pasta
# acima de pen-drive/), independente de onde for clicado.
cd "$(dirname "$0")/.."

PORT_PRIMARIA=8765

# Detecta um Python 3 disponível (python3, python ou py).
PY=""
for candidato in python3 python py; do
  if command -v "$candidato" >/dev/null 2>&1; then
    if "$candidato" -c "import sys; sys.exit(0 if sys.version_info.major>=3 else 1)" >/dev/null 2>&1; then
      PY="$candidato"
      break
    fi
  fi
done

if [ -z "$PY" ]; then
  cat <<EOF
ERRO: Python 3 não foi encontrado neste computador.

Opções rápidas:
  1) Instale Python 3 (https://www.python.org/downloads/) e tente de novo.
  2) Use o app via file:// (clique duas vezes em index.html). Tudo funciona,
     mas você precisará escolher manualmente o evento em "Mais > Carregar evento".

Pressione Enter para fechar.
EOF
  read -r _
  exit 1
fi

# Procura uma porta livre a partir da primária.
PORT="$PORT_PRIMARIA"
for tentativa in $(seq 0 19); do
  CANDIDATA=$((PORT_PRIMARIA + tentativa))
  if ! lsof -nP -iTCP:"$CANDIDATA" -sTCP:LISTEN >/dev/null 2>&1; then
    PORT="$CANDIDATA"
    break
  fi
done

URL="http://127.0.0.1:${PORT}/index.html"

cat <<EOF
============================================================
 Pontuação Conclave — servidor local
------------------------------------------------------------
 URL : ${URL}
 Pasta servida: $(pwd)
 Python      : $(${PY} --version 2>&1)
------------------------------------------------------------
 Para parar: feche esta janela ou pressione Ctrl+C.
============================================================
EOF

# Abre o navegador padrão (macOS usa "open"; Linux geralmente "xdg-open").
( sleep 1 && \
  ( command -v open >/dev/null 2>&1 && open "$URL" ) || \
  ( command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" ) || \
  echo "Abra manualmente: $URL"
) >/dev/null 2>&1 &

# Sobe o servidor em foreground (Ctrl+C derruba).
exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
