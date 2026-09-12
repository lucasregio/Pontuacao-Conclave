#!/usr/bin/env node
/**
 * build-docs.mjs
 *
 * Converte a documentação em Markdown para páginas HTML estáticas servidas
 * pelo app (sem depender de renderizador de .md no navegador).
 *
 *   npm run build:docs
 *   node scripts/build-docs.mjs
 *
 * Fonte canônica: docs/usuario/*.md, CHANGELOG.md, README.md (→ docs/sobre.html).
 * Reexecute após editar qualquer .md listado abaixo.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

/** @type {{ src: string, dest: string, depth: number, navTitle?: string }[]} */
const PAGES = [
  { src: "docs/usuario/manual-uso.md", dest: "docs/usuario/manual-uso.html", depth: 2 },
  { src: "docs/usuario/faq.md", dest: "docs/usuario/faq.html", depth: 2 },
  { src: "docs/usuario/glossario.md", dest: "docs/usuario/glossario.html", depth: 2 },
  {
    src: "docs/usuario/troubleshooting.md",
    dest: "docs/usuario/troubleshooting.html",
    depth: 2,
  },
  {
    src: "docs/usuario/atalhos-teclado.md",
    dest: "docs/usuario/atalhos-teclado.html",
    depth: 2,
  },
  {
    src: "docs/usuario/regulamento-mapeado.md",
    dest: "docs/usuario/regulamento-mapeado.html",
    depth: 2,
  },
  {
    src: "docs/usuario/guia-visual.md",
    dest: "docs/usuario/guia-visual.html",
    depth: 2,
  },
  { src: "CHANGELOG.md", dest: "docs/changelog.html", depth: 1, navTitle: "Changelog" },
  { src: "README.md", dest: "docs/sobre.html", depth: 1, navTitle: "Sobre o projeto" },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugifyHeading(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function rewriteHref(href) {
  if (!href || href.startsWith("#") || href.startsWith("http")) return href;
  if (href.endsWith(".md")) {
    return href
      .replace(/(^|\/)README\.md$/i, "$1sobre.html")
      .replace(/(^|\/)CHANGELOG\.md$/i, "$1changelog.html")
      .replace(/\.md$/i, ".html");
  }
  return href;
}

function isDevOnlyHref(href) {
  return /(?:^|\/)docs\/operacional\/|CONTRIBUTING\.md|AGENTS\.md|pull_request_template/i.test(
    href
  );
}

function linkLabelHtml(label) {
  var labelHtml = String(label).replace(/^`([^`]+)`$/, "$1");
  labelHtml = labelHtml.replace(/\.md$/i, "");
  labelHtml = labelHtml.replace(/`([^`]+)`/g, "<code>$1</code>");
  labelHtml = labelHtml.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return labelHtml;
}

function inlineMarkdown(text) {
  var out = escapeHtml(text);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_m, alt, src) {
    return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="lazy" />';
  });
  out = out.replace(/\[(`[^`]+`|[^\]]+)\]\(([^)]+)\)/g, function (_m, label, href) {
    if (isDevOnlyHref(href)) {
      return "<code>" + escapeHtml(String(label).replace(/^`|`$/g, "")) + "</code>";
    }
    return '<a href="' + escapeHtml(rewriteHref(href)) + '">' + linkLabelHtml(label) + "</a>";
  });
  out = out.replace(/`([^`]+)`/g, function (_m, code) {
    return "<code>" + code + "</code>";
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

function listMarker(line) {
  var m = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (!m) return null;
  return { indent: m[1].length, ordered: /^\d/.test(m[2]), text: m[3] };
}

function parseListBlock(lines, startIndex, minIndent) {
  var first = listMarker(lines[startIndex]);
  if (!first || first.indent < minIndent) return null;
  var baseIndent = first.indent;
  var tag = first.ordered ? "ol" : "ul";
  var html = ["<" + tag + ">"];
  var i = startIndex;

  while (i < lines.length) {
    var mk = listMarker(lines[i]);
    if (!mk || mk.indent < baseIndent) break;
    if (mk.indent > baseIndent) {
      var nested = parseListBlock(lines, i, mk.indent);
      if (nested) {
        html[html.length - 1] =
          html[html.length - 1].replace(/<\/li>$/, "") + nested.html + "</li>";
        i = nested.nextIndex;
        continue;
      }
    }
    if (mk.indent !== baseIndent) break;

    var parts = [mk.text];
    i += 1;
    while (i < lines.length) {
      var peek = lines[i];
      if (!peek.trim()) break;
      var peekMk = listMarker(peek);
      if (peekMk && peekMk.indent <= baseIndent) break;
      if (peekMk && peekMk.indent > baseIndent) break;
      if (/^#{1,3} /.test(peek.trim())) break;
      if (/^```/.test(peek.trim())) break;
      parts.push(peek.trim());
      i += 1;
    }
    html.push("<li>" + inlineMarkdown(parts.join(" ")) + "</li>");
  }

  html.push("</" + tag + ">");
  return { html: html.join("\n"), nextIndex: i };
}

/**
 * Converte Markdown simples (headings, listas, parágrafos) em HTML.
 * @param {string} md
 * @param {{ skipTitle?: boolean }} opts
 */
function markdownToHtml(md, opts) {
  opts = opts || {};
  var lines = md.replace(/\r\n/g, "\n").split("\n");
  var html = [];
  var i = 0;
  var skippedTitle = !opts.skipTitle;

  while (i < lines.length) {
    var line = lines[i];
    var trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    var h1 = trimmed.match(/^# (.+)$/);
    if (h1) {
      if (!skippedTitle) {
        skippedTitle = true;
        i += 1;
        continue;
      }
      html.push('<h2 id="' + slugifyHeading(h1[1]) + '">' + inlineMarkdown(h1[1]) + "</h2>");
      i += 1;
      continue;
    }

    var h2 = trimmed.match(/^## (.+)$/);
    if (h2) {
      html.push('<h2 id="' + slugifyHeading(h2[1]) + '">' + inlineMarkdown(h2[1]) + "</h2>");
      i += 1;
      continue;
    }

    var h3 = trimmed.match(/^### (.+)$/);
    if (h3) {
      html.push('<h3 id="' + slugifyHeading(h3[1]) + '">' + inlineMarkdown(h3[1]) + "</h3>");
      i += 1;
      continue;
    }

    var listBlock = parseListBlock(lines, i, 0);
    if (listBlock) {
      html.push(listBlock.html);
      i = listBlock.nextIndex;
      continue;
    }

    var imgOnly = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgOnly) {
      html.push(
        '<figure class="docs-shot"><img src="' +
          escapeHtml(imgOnly[2]) +
          '" alt="' +
          escapeHtml(imgOnly[1]) +
          '" loading="lazy" /><figcaption>' +
          escapeHtml(imgOnly[1]) +
          "</figcaption></figure>"
      );
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      i += 1;
      var codeLines = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(escapeHtml(lines[i]));
        i += 1;
      }
      if (i < lines.length) i += 1;
      html.push("<pre><code>" + codeLines.join("\n") + "</code></pre>");
      continue;
    }

    var para = [trimmed];
    i += 1;
    while (i < lines.length) {
      var next = lines[i].trim();
      if (
        !next ||
        /^#{1,3} /.test(next) ||
        listMarker(lines[i]) ||
        /^```/.test(next) ||
        /^!\[/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    html.push("<p>" + inlineMarkdown(para.join(" ")) + "</p>");
  }

  return html.join("\n");
}

function extractTitle(md) {
  var match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Documentação";
}

function buildPageHtml(page, title, bodyHtml) {
  var depth = page.depth;
  var root = depth === 1 ? ".." : "../..";
  var docsHome = depth === 1 ? "index.html" : "../index.html";
  var navTitle = page.navTitle || title;

  return (
    "<!doctype html>\n" +
    '<html lang="pt-BR" data-ui-theme="mr">\n' +
    "  <head>\n" +
    '    <meta charset="utf-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n' +
    "    <title>" +
    escapeHtml(title) +
    " — Pontuação Conclave</title>\n" +
    '    <meta name="description" content="' +
    escapeHtml(title) +
    ' — documentação da Pontuação Conclave." />\n' +
    "    <meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'\" />\n" +
    '    <meta name="theme-color" content="#1b5e20" media="(prefers-color-scheme: light)" />\n' +
    '    <meta name="theme-color" content="#0d4f12" media="(prefers-color-scheme: dark)" />\n' +
    '    <meta name="color-scheme" content="light" />\n' +
    '    <link rel="icon" href="' +
    root +
    '/icons/icon.svg" type="image/svg+xml" />\n' +
    '    <link rel="apple-touch-icon" href="' +
    root +
    '/icons/icon.svg" />\n' +
    '    <link rel="stylesheet" href="' +
    root +
    '/web/styles.css" />\n' +
    "  </head>\n" +
    '  <body class="docs-page">\n' +
    '    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>\n' +
    '    <header class="docs-header">\n' +
    '      <p class="docs-eyebrow"><a href="' +
    root +
    '/index.html">← Voltar ao app</a> · <a href="' +
    docsHome +
    '">Documentação</a></p>\n' +
    "      <h1>" +
    escapeHtml(title) +
    "</h1>\n" +
    "    </header>\n" +
    '    <main id="conteudo" tabindex="-1" class="docs-main docs-prose">\n' +
    '      <article class="docs-article">\n' +
    bodyHtml +
    "\n" +
    "      </article>\n" +
    "    </main>\n" +
    '    <footer class="docs-footer">\n' +
    "      <p>\n" +
    '        <a href="' +
    root +
    '/index.html">Abrir o app</a> ·\n' +
    '        <a href="' +
    docsHome +
    '">Índice</a> ·\n' +
    '        <a href="' +
    (depth === 1 ? "changelog.html" : "../changelog.html") +
    '">Changelog</a>\n' +
    "      </p>\n" +
    "    </footer>\n" +
    "  </body>\n" +
    "</html>\n"
  );
}

async function buildOne(page) {
  var srcPath = resolve(repoRoot, page.src);
  var destPath = resolve(repoRoot, page.dest);
  var md = await readFile(srcPath, "utf8");
  var title = extractTitle(md);
  var bodyHtml = markdownToHtml(md, { skipTitle: true });
  var html = buildPageHtml(page, title, bodyHtml);
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, html, "utf8");
  console.log("[build-docs] gerado " + page.dest);
}

async function main() {
  for (var page of PAGES) {
    await buildOne(page);
  }
  console.log("[build-docs] " + PAGES.length + " páginas HTML");
}

main().catch(function (err) {
  console.error("[build-docs] falhou:", err);
  process.exit(1);
});
