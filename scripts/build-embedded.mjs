#!/usr/bin/env node
/**
 * build-embedded.mjs
 *
 * Lê eventos/conclave-2026-1.evento.json e gera
 * eventos/conclave-2026-1.evento.embedded.js, expondo o conteúdo como
 * `window.ConclaveDefaultEvento`. Isso permite que `web/app.js` carregue o
 * evento de exemplo mesmo quando aberto via `file://` (cenário típico de
 * uso a partir de um pen-drive, onde `fetch()` é bloqueado pelo navegador).
 *
 * Re-execute este script sempre que o evento de exemplo for editado:
 *
 *   npm run build:embedded
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const SRC = resolve(repoRoot, "eventos/conclave-2026-1.evento.json");
const DEST = resolve(repoRoot, "eventos/conclave-2026-1.evento.embedded.js");

async function main() {
  const raw = await readFile(SRC, "utf8");
  // Re-stringifica para garantir formato canônico (sem BOM, sem trailing
  // newline excedente) e validar JSON antes de embarcar.
  const evento = JSON.parse(raw);
  const json = JSON.stringify(evento, null, 2);

  const banner =
    "/**\n" +
    " * Gerado automaticamente por scripts/build-embedded.mjs.\n" +
    " * NÃO EDITE À MÃO. Reedite eventos/conclave-2026-1.evento.json e\n" +
    " * rode `npm run build:embedded` (ou `node scripts/build-embedded.mjs`).\n" +
    " *\n" +
    " * Este arquivo expõe o evento de exemplo como `window.ConclaveDefaultEvento`\n" +
    " * para que o app funcione sem `fetch()` (cenário típico de uso via\n" +
    " * `file://`, por exemplo a partir de um pen-drive).\n" +
    " */\n";

  const body = "window.ConclaveDefaultEvento = " + json + ";\n";

  await writeFile(DEST, banner + body, "utf8");
  console.log("[build-embedded] gerado " + DEST + " (" + (banner.length + body.length) + " bytes)");
}

main().catch((err) => {
  console.error("[build-embedded] falhou:", err);
  process.exit(1);
});
