#!/usr/bin/env python3
"""Fallback Python para build-docs quando Node não está no PATH."""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PAGES = [
    {"src": "docs/usuario/manual-uso.md", "dest": "docs/usuario/manual-uso.html", "depth": 2},
    {"src": "docs/usuario/faq.md", "dest": "docs/usuario/faq.html", "depth": 2},
    {"src": "docs/usuario/glossario.md", "dest": "docs/usuario/glossario.html", "depth": 2},
    {"src": "docs/usuario/troubleshooting.md", "dest": "docs/usuario/troubleshooting.html", "depth": 2},
    {"src": "docs/usuario/atalhos-teclado.md", "dest": "docs/usuario/atalhos-teclado.html", "depth": 2},
    {"src": "docs/usuario/regulamento-mapeado.md", "dest": "docs/usuario/regulamento-mapeado.html", "depth": 2},
    {"src": "docs/usuario/guia-visual.md", "dest": "docs/usuario/guia-visual.html", "depth": 2},
    {"src": "CHANGELOG.md", "dest": "docs/changelog.html", "depth": 1},
    {"src": "README.md", "dest": "docs/sobre.html", "depth": 1},
]


def slugify(text: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def rewrite_href(href: str) -> str:
    if not href or href.startswith("#") or href.startswith("http"):
        return href
    if href.endswith(".md"):
        href = re.sub(r"(^|/)README\.md$", r"\1sobre.html", href, flags=re.I)
        href = re.sub(r"(^|/)CHANGELOG\.md$", r"\1changelog.html", href, flags=re.I)
        return re.sub(r"\.md$", ".html", href, flags=re.I)
    return href


def is_dev_only_href(href: str) -> bool:
    return bool(
        re.search(r"(?:^|/)docs/operacional/|CONTRIBUTING\.md|AGENTS\.md|pull_request_template", href, re.I)
    )


def link_label_html(label: str) -> str:
    label_html = re.sub(r"^`([^`]+)`$", r"\1", label)
    label_html = re.sub(r"\.md$", "", label_html, flags=re.I)
    label_html = re.sub(r"`([^`]+)`", r"<code>\1</code>", label_html)
    label_html = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", label_html)
    return label_html


def inline_md(text: str) -> str:
    out = html.escape(text, quote=True)

    def img_repl(m):
        alt, src = m.group(1), m.group(2)
        return (
            f'<img src="{html.escape(src, quote=True)}" alt="{html.escape(alt, quote=True)}" '
            f'loading="lazy" />'
        )

    out = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", img_repl, out)

    def link_repl(m):
        label, href = m.group(1), m.group(2)
        if is_dev_only_href(href):
            clean = re.sub(r"^`|`$", "", label)
            return f"<code>{html.escape(clean)}</code>"
        return (
            f'<a href="{html.escape(rewrite_href(href), quote=True)}">{link_label_html(label)}</a>'
        )

    out = re.sub(r"\[(`[^`]+`|[^\]]+)\]\(([^)]+)\)", link_repl, out)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    return out


def list_marker(line: str):
    m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
    if not m:
        return None
    return {"indent": len(m.group(1)), "ordered": m.group(2)[0].isdigit(), "text": m.group(3)}


def parse_list_block(lines: list[str], start_index: int, min_indent: int):
    first = list_marker(lines[start_index])
    if not first or first["indent"] < min_indent:
        return None
    base_indent = first["indent"]
    tag = "ol" if first["ordered"] else "ul"
    html_parts = [f"<{tag}>"]
    i = start_index

    while i < len(lines):
        mk = list_marker(lines[i])
        if not mk or mk["indent"] < base_indent:
            break
        if mk["indent"] > base_indent:
            nested = parse_list_block(lines, i, mk["indent"])
            if nested:
                html_parts[-1] = html_parts[-1].replace("</li>", "") + nested["html"] + "</li>"
                i = nested["next_index"]
                continue
        if mk["indent"] != base_indent:
            break

        parts = [mk["text"]]
        i += 1
        while i < len(lines):
            peek = lines[i]
            if not peek.strip():
                break
            peek_mk = list_marker(peek)
            if peek_mk and peek_mk["indent"] <= base_indent:
                break
            if peek_mk and peek_mk["indent"] > base_indent:
                break
            if re.match(r"^#{1,3} ", peek.strip()):
                break
            if peek.strip().startswith("```"):
                break
            parts.append(peek.strip())
            i += 1
        html_parts.append(f"<li>{inline_md(' '.join(parts))}</li>")

    html_parts.append(f"</{tag}>")
    return {"html": "\n".join(html_parts), "next_index": i}


def markdown_to_html(md: str, skip_title: bool = True) -> str:
    lines = md.replace("\r\n", "\n").split("\n")
    html_parts = []
    i = 0
    skipped = not skip_title

    while i < len(lines):
        line = lines[i]
        trimmed = line.strip()
        if not trimmed:
            i += 1
            continue

        m = re.match(r"^# (.+)$", trimmed)
        if m:
            if not skipped:
                skipped = True
                i += 1
                continue
            html_parts.append(f'<h2 id="{slugify(m.group(1))}">{inline_md(m.group(1))}</h2>')
            i += 1
            continue

        m = re.match(r"^## (.+)$", trimmed)
        if m:
            html_parts.append(f'<h2 id="{slugify(m.group(1))}">{inline_md(m.group(1))}</h2>')
            i += 1
            continue

        m = re.match(r"^### (.+)$", trimmed)
        if m:
            html_parts.append(f'<h3 id="{slugify(m.group(1))}">{inline_md(m.group(1))}</h3>')
            i += 1
            continue

        if re.match(r"^[-*] ", trimmed) or re.match(r"^\d+\. ", trimmed):
            list_block = parse_list_block(lines, i, 0)
            if list_block:
                html_parts.append(list_block["html"])
                i = list_block["next_index"]
                continue

        img_only = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", trimmed)
        if img_only:
            alt, src = img_only.group(1), img_only.group(2)
            html_parts.append(
                f'<figure class="docs-shot"><img src="{html.escape(src, quote=True)}" '
                f'alt="{html.escape(alt, quote=True)}" loading="lazy" />'
                f"<figcaption>{html.escape(alt)}</figcaption></figure>"
            )
            i += 1
            continue

        if trimmed.startswith("```"):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(html.escape(lines[i]))
                i += 1
            if i < len(lines):
                i += 1
            html_parts.append(f"<pre><code>{chr(10).join(code_lines)}</code></pre>")
            continue

        para = [trimmed]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (
                not nxt
                or re.match(r"^#{1,3} ", nxt)
                or list_marker(lines[i])
                or nxt.startswith("```")
                or nxt.startswith("![")
            ):
                break
            para.append(nxt)
            i += 1
        html_parts.append(f"<p>{inline_md(' '.join(para))}</p>")

    return "\n".join(html_parts)


def extract_title(md: str) -> str:
    m = re.search(r"^#\s+(.+)$", md, re.M)
    return m.group(1).strip() if m else "Documentação"


def build_page(page: dict, title: str, body: str) -> str:
    depth = page["depth"]
    root = ".." if depth == 1 else "../.."
    docs_home = "index.html" if depth == 1 else "../index.html"
    changelog = "changelog.html" if depth == 1 else "../changelog.html"
    return f"""<!doctype html>
<html lang="pt-BR" data-ui-theme="mr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{html.escape(title)} — Pontuação Conclave</title>
    <meta name="description" content="{html.escape(title)} — documentação da Pontuação Conclave." />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" />
    <meta name="theme-color" content="#1b5e20" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0d4f12" media="(prefers-color-scheme: dark)" />
    <meta name="color-scheme" content="light" />
    <link rel="icon" href="{root}/icons/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="{root}/icons/icon.svg" />
    <link rel="stylesheet" href="{root}/web/styles.css" />
  </head>
  <body class="docs-page">
    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <header class="docs-header">
      <p class="docs-eyebrow"><a href="{root}/index.html">← Voltar ao app</a> · <a href="{docs_home}">Documentação</a></p>
      <h1>{html.escape(title)}</h1>
    </header>
    <main id="conteudo" tabindex="-1" class="docs-main docs-prose">
      <article class="docs-article">
{body}
      </article>
    </main>
    <footer class="docs-footer">
      <p>
        <a href="{root}/index.html">Abrir o app</a> ·
        <a href="{docs_home}">Índice</a> ·
        <a href="{changelog}">Changelog</a>
      </p>
    </footer>
  </body>
</html>
"""


def main() -> int:
    for page in PAGES:
        src = ROOT / page["src"]
        dest = ROOT / page["dest"]
        md = src.read_text(encoding="utf-8")
        title = extract_title(md)
        body = markdown_to_html(md)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(build_page(page, title, body), encoding="utf-8")
        print(f"[build-docs] gerado {page['dest']}")
    print(f"[build-docs] {len(PAGES)} páginas HTML")
    return 0


if __name__ == "__main__":
    sys.exit(main())
