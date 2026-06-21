/**
 * Service Worker leve para Pontuação Conclave.
 *
 * Estratégia:
 * - App shell (HTML/CSS/JS/manifest/ícones): cache-first com fallback à rede.
 * - Demais recursos GET (eventos JSON, imagens): network-first com fallback
 *   ao cache (atualiza em segundo plano) — permite carregar a app offline
 *   após uma primeira visita online, sem servir versão velha quando a rede
 *   está disponível.
 *
 * Bumpe `CACHE_VERSION` ao publicar uma versão nova; o `activate` limpa
 * caches antigos automaticamente.
 */

const CACHE_VERSION = "pontuacao-conclave-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./docs/index.html",
  "./docs/changelog.html",
  "./docs/sobre.html",
  "./docs/usuario/manual-uso.html",
  "./docs/usuario/faq.html",
  "./docs/usuario/glossario.html",
  "./docs/usuario/troubleshooting.html",
  "./docs/usuario/atalhos-teclado.html",
  "./docs/usuario/regulamento-mapeado.html",
  "./web/styles.css",
  "./web/engine.js",
  "./web/relatorio.js",
  "./web/app.js",
  "./eventos/conclave-2026-1.evento.embedded.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isAppShell(url) {
  // Considera app-shell qualquer caminho que termine com um dos arquivos
  // pré-cacheados, independente do prefixo do escopo.
  return APP_SHELL.some((p) => {
    const trimmed = p.replace(/^\.\//, "");
    if (!trimmed) return url.pathname.endsWith("/");
    return url.pathname.endsWith("/" + trimmed) || url.pathname === "/" + trimmed;
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Só GETs (POST/PUT/DELETE não fazem sentido para um app estático).
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Ignora outras origens (CDNs externas, etc.) — deixa o navegador decidir.
  if (url.origin !== self.location.origin) return;

  if (isAppShell(url)) {
    // cache-first
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Demais (eventos JSON, imagens dentro do escopo): network-first.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
