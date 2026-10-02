#!/usr/bin/env node
/**
 * Percorre o app com Playwright, tira prints e gera o guia visual.
 *
 *   npm run guia:visual
 *
 * Requer Chromium do Playwright (`npx playwright install chromium`) e o
 * app servido em http://127.0.0.1:8765 (sobe sozinho se a porta estiver livre).
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const OUT_DIR = resolve(repoRoot, "docs/usuario/guia-visual");
const MD_PATH = resolve(repoRoot, "docs/usuario/guia-visual.md");
const BASE = process.env.GUIA_BASE_URL || "http://127.0.0.1:8765";
const NOMES = ["Lucas", "Pedro", "João", "Mateus", "Tiago", "André"];

function buildDemoDados(evento) {
  const ids = evento.igrejas.map(function (g) {
    return g.id;
  });
  const participacao = {};
  evento.igrejas.forEach(function (g, i) {
    const tot = 6 + (i % 5);
    participacao[g.id] = {
      inscricao: true,
      pontualidade: i % 5 !== 4,
      mr_total: tot,
      mr_camisa: i % 4 === 3 ? tot - 1 : tot,
      mr_biblia: tot,
      visitantes: 0,
      animacao: i % 2 === 0,
      mau_comportamento: i === 7,
      pontuacao_extra: i % 3 === 0 ? 150 : i % 3 === 1 ? 100 : 50,
    };
  });
  const podium = {};
  evento.provas.forEach(function (p, pi) {
    podium[p.id] = {
      ou: { igrejaId: ids[pi % ids.length], competidor: NOMES[pi % NOMES.length] },
      pt: {
        igrejaId: ids[(pi + 1) % ids.length],
        competidor: NOMES[(pi + 1) % NOMES.length],
      },
      br: {
        igrejaId: ids[(pi + 2) % ids.length],
        competidor: NOMES[(pi + 2) % NOMES.length],
      },
    };
  });
  const metricasEscrita = {};
  evento.provas
    .filter(function (p) {
      return p.tipo === "escrita";
    })
    .forEach(function (p) {
      metricasEscrita[p.id] = ids.slice(0, 6).map(function (igrejaId, i) {
        return {
          id: "demo-" + p.id + "-" + i,
          nome: NOMES[i],
          igrejaId: igrejaId,
          acertos: 12 + (i % 8),
        };
      });
    });
  return { participacao: participacao, podium: podium, metricasEscrita: metricasEscrita };
}

async function portOpen() {
  try {
    const res = await fetch(BASE + "/index.html", { method: "GET" });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

function startServer() {
  const candidates = [
    ["py", ["-3", "-m", "http.server", "8765", "--bind", "127.0.0.1"]],
    ["python", ["-m", "http.server", "8765", "--bind", "127.0.0.1"]],
    ["python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"]],
  ];
  for (const [cmd, args] of candidates) {
    try {
      return spawn(cmd, args, { cwd: repoRoot, stdio: "ignore", windowsHide: true });
    } catch (_e) {
      /* tenta o próximo */
    }
  }
  return null;
}

async function shot(page, file) {
  const dest = resolve(OUT_DIR, file);
  await page.screenshot({ path: dest, fullPage: false });
  return "guia-visual/" + file;
}

async function scrollMainToTop(page) {
  await page.evaluate(function () {
    var content = document.querySelector(".content");
    if (content) content.scrollTop = 0;
    window.scrollTo(0, 0);
  });
}

async function clearFeedback(page) {
  await page.evaluate(function () {
    var host = document.getElementById("feedback");
    if (host) host.innerHTML = "";
  });
}

async function goTab(page, name) {
  const tab = page.locator(".sidebar-nav").getByRole("tab", { name: name, exact: true });
  await tab.click();
  await scrollMainToTop(page);
  await page.waitForTimeout(280);
}

const CONFIG_KEYS = ["geral", "igrejas", "pesosParticipacao", "categorias", "provas"];

async function showOnlySection(page, key) {
  for (const k of CONFIG_KEYS) {
    const btn = page.locator('[data-config-section-toggle="' + k + '"]');
    const expanded = (await btn.getAttribute("aria-expanded")) === "true";
    if (k === key && !expanded) {
      await btn.click();
      await page.waitForTimeout(80);
    } else if (k !== key && expanded) {
      await btn.click();
      await page.waitForTimeout(80);
    }
  }
  await scrollMainToTop(page);
  await page.waitForTimeout(180);
}

function mdImg(src, alt) {
  return "![" + alt + "](" + src + ")";
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const evento = JSON.parse(
    await readFile(resolve(repoRoot, "eventos/conclave-er-2026-2.evento.json"), "utf8")
  );
  const projeto = { evento: evento, dados: buildDemoDados(evento) };

  let child = null;
  if (!(await portOpen())) {
    child = startServer();
    for (let i = 0; i < 20; i++) {
      if (await portOpen()) break;
      await new Promise(function (r) {
        setTimeout(r, 250);
      });
    }
    if (!(await portOpen())) {
      throw new Error("Não foi possível servir o app em " + BASE);
    }
  }

  const browser = await chromium.launch({ headless: true }).catch(function (err) {
    console.error("[guia-visual] Chromium não encontrado. Rode: npm run guia:install");
    throw err;
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "pt-BR",
  });
  await context.addInitScript(function (payload) {
    localStorage.setItem("conclave-projeto-conclave-er-2026-2", JSON.stringify(payload));
    localStorage.setItem("conclave-ui-theme", "er");
  }, projeto);

  const page = await context.newPage();
  await page.route("**/sw.js", function (route) {
    return route.abort();
  });
  await page.goto(BASE + "/index.html?guia=1", { waitUntil: "load" });
  await page.getByRole("heading", { name: "Conclave ER 2026/2" }).first().waitFor();
  await page.locator(".dashboard-kpi-grid").waitFor();
  await page.waitForTimeout(400);

  const imgs = {};

  imgs.inicio = await shot(page, "01-inicio.png");

  await page.getByRole("button", { name: "Mais ações" }).click();
  await page.locator("#more-menu").waitFor({ state: "visible" });
  await page.waitForTimeout(150);
  imgs.menuMais = await shot(page, "02-menu-mais.png");
  await page.getByRole("menuitem", { name: "Eventos salvos" }).click();
  await page.waitForTimeout(300);
  imgs.eventosSalvos = await shot(page, "03-eventos-salvos.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await goTab(page, "Configuração");
  await page.locator("#panel-config").waitFor();
  await showOnlySection(page, "geral");
  imgs.configGeral = await shot(page, "04-config-geral.png");

  await showOnlySection(page, "igrejas");
  imgs.configIgrejas = await shot(page, "05-config-igrejas.png");

  await showOnlySection(page, "pesosParticipacao");
  imgs.configPesos = await shot(page, "06-config-pesos.png");

  await showOnlySection(page, "categorias");
  imgs.configCategorias = await shot(page, "07-config-categorias.png");

  await showOnlySection(page, "provas");
  imgs.configProvas = await shot(page, "08-config-provas.png");

  await goTab(page, "Participação");
  await page.locator("#panel-participacao").waitFor();
  await page.waitForTimeout(200);
  imgs.participacao = await shot(page, "09-participacao.png");

  await goTab(page, "Pódio por prova");
  await page.locator("#panel-podio").waitFor();
  const expandir = page.locator("#panel-podio").getByRole("button", { name: "Expandir todas" });
  if (await expandir.count()) await expandir.first().click();
  await page.waitForTimeout(350);
  imgs.podio = await shot(page, "10-podio.png");

  await goTab(page, "Prova escrita");
  await page.locator("#panel-escrita").waitFor();
  await page.waitForTimeout(500);
  imgs.escrita = await shot(page, "11-prova-escrita.png");

  await goTab(page, "Classificação");
  await page.locator("#panel-classificacao").waitFor();
  await page.waitForTimeout(300);
  imgs.classificacao = await shot(page, "12-classificacao.png");

  await goTab(page, "Relatórios");
  await page.locator("#panel-relatorios").waitFor();
  const gerar = page.locator("#btn-relatorio-gerar-resumo");
  if (await gerar.count()) await gerar.click();
  await page.waitForTimeout(400);
  await clearFeedback(page);
  imgs.relatorios = await shot(page, "13-relatorios.png");

  await page.getByRole("button", { name: "Modo apresentação" }).click();
  await page.waitForFunction(function () {
    return document.body.classList.contains("presentation-mode");
  });
  await page.waitForTimeout(600);
  imgs.apresentacao = await shot(page, "14-apresentacao.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "load" });
  await page.getByRole("heading", { name: "Conclave ER 2026/2" }).first().waitFor();
  await page.locator(".dashboard-kpi-grid").waitFor();
  await page.locator("#tab-bn-dashboard").click();
  await clearFeedback(page);
  await page.waitForTimeout(400);
  imgs.mobile = await shot(page, "15-mobile.png");

  await browser.close();
  if (child) child.kill();

  const md = [
    "# Guia visual do Pontuação Conclave",
    "",
    "Tour ilustrado de **todas as telas** do app, com capturas geradas pelo Playwright a partir do evento **Conclave ER 2026/2**. Os números nas telas são de demonstração — no dia do evento você lança os dados reais.",
    "",
    "Para regenerar as imagens:",
    "",
    "```",
    "npm run guia:visual",
    "npm run build:docs",
    "```",
    "",
    "## Sumário",
    "",
    "- [Início (dashboard)](#inicio-dashboard)",
    "- [Menu Mais](#menu-mais)",
    "- [Eventos salvos](#eventos-salvos)",
    "- [Configuração](#configuracao)",
    "- [Participação](#participacao)",
    "- [Pódio por prova](#podio-por-prova)",
    "- [Prova escrita](#prova-escrita)",
    "- [Esgrima](#esgrima)",
    "- [Classificação](#classificacao)",
    "- [Relatórios](#relatorios)",
    "- [Modo apresentação](#modo-apresentacao)",
    "- [Celular](#celular)",
    "",
    "## Início (dashboard)",
    "",
    "Primeira aba. Mostra o evento ativo (nome, data, local), atalhos para Participação, Pódio, Classificação e Relatório, e a lista de projetos guardados neste navegador.",
    "",
    mdImg(imgs.inicio, "Aba Início com o Conclave ER 2026/2 ativo"),
    "",
    "A **sidebar** (à esquerda no desktop) lista as oito abas, o seletor de tema **MR / ER** (só troca as cores) e o link da documentação.",
    "",
    "## Menu Mais",
    "",
    "No canto superior direito. Agrupa carregar/exportar evento e projeto, novo evento, eventos salvos e limpar dados. **Modo apresentação** e **Regulamento** ficam na topbar, fora deste menu.",
    "",
    mdImg(imgs.menuMais, "Menu Mais aberto com as ações de arquivo"),
    "",
    "- **Carregar evento** — só a configuração (`.evento.json`).",
    "- **Carregar projeto** — configuração + dados lançados (`.projeto.json`).",
    "- **Exportar evento / projeto** — backup. Exporte o projeto cedo no dia do evento.",
    "- **Limpar dados** — zera participação e pódio, mantém igrejas e provas.",
    "",
    "## Eventos salvos",
    "",
    "Projetos neste navegador (`localStorage`). Dá para carregar, exportar ou remover. O Conclave MR 2026/1 pode aparecer aqui se você já o usou — no dia do ER, deixe o **Conclave ER 2026/2** como evento ativo.",
    "",
    mdImg(imgs.eventosSalvos, "Modal de eventos salvos no navegador"),
    "",
    "## Configuração",
    "",
    "Cadastro do evento. Seções recolhíveis: Geral, Igrejas, Pesos, Categorias e Provas.",
    "",
    "### Geral",
    "",
    "Nome, data, local, horários e PDF do regulamento (botão **Regulamento** na topbar).",
    "",
    mdImg(imgs.configGeral, "Configuração — seção Geral"),
    "",
    "### Igrejas",
    "",
    "Uma linha por igreja. Dá para adicionar em lote (um nome por linha). Remover uma igreja apaga a linha na Participação e as medalhas dela no pódio.",
    "",
    mdImg(imgs.configIgrejas, "Configuração — lista de igrejas padronizadas PIB/IB"),
    "",
    "### Pesos e medalhas",
    "",
    "No ER 2026/2: inscrição 100, pontualidade 200, uniforme/bíblia 50, grito de guerra 50, mau comportamento −150, visitantes 0. Medalhas 300 / 200 / 100. **Não clique no tema ER para “aplicar preset”** — o tema agora é só visual.",
    "",
    mdImg(imgs.configPesos, "Configuração — pesos da participação"),
    "",
    "### Categorias",
    "",
    "Faixas etárias do regulamento. No ER 2026/2: Junior 9–11, Adolescente 12–14 e Juvenil 15–18. Cada prova é lançada por categoria.",
    "",
    mdImg(imgs.configCategorias, "Configuração — categorias etárias"),
    "",
    "### Provas",
    "",
    "15 provas (Evangelhos, Organização, Montagem, Esgrima e Debate × Junior / Adolescente / Juvenil). Tipo **escrita** alimenta a aba Prova escrita; tipo **oral** só entra no pódio. A aba **Esgrima** sorteia referências para o líder ditar e não pontua.",
    "",
    mdImg(imgs.configProvas, "Configuração — lista de provas e valores de medalha"),
    "",
    "## Participação",
    "",
    "Uma linha por igreja. No tema ER as colunas são:",
    "",
    "- **Inscr.** — inscrição até o prazo (100 pts).",
    "- **Pont.** — pontualidade no evento (200 pts).",
    "- **Presentes / Camisa / Bíblia** — uniforme e Bíblia só pontuam se a contagem for igual ao total de presentes. Não inclua visitantes nesses números.",
    "- **Grito** — grito de guerra (50 pts).",
    "- **Mau comp.** — conversa/saídas (−150 pts naquela igreja).",
    "- **Extra** — CER no pré-conclave (+100) + pastor presente (+50). Se houver penalidade de conservação do templo, subtraia 100 de **todas** as igrejas.",
    "",
    "Se inscrição estiver desmarcada **e** Presentes = 0, a linha inteira de participação zera.",
    "",
    mdImg(imgs.participacao, "Aba Participação com lançamento de demonstração"),
    "",
    "## Pódio por prova",
    "",
    "Ouro, prata e bronze por prova. Digite a igreja (lista automática) e, se quiser, o nome do competidor. Filtros no topo: categoria, busca, avisos, desempate. As medalhas somam na classificação geral.",
    "",
    mdImg(imgs.podio, "Aba Pódio por prova com medalhas preenchidas"),
    "",
    "## Prova escrita",
    "",
    "Cadastro de **acertos por participante** nas provas do tipo escrita. Serve para gráficos e CSV. **Não altera** a classificação — a medalha continua sendo lançada no Pódio. Mínimo do regulamento ER: 12 acertos em 20 (60%) para pontuar medalha.",
    "",
    mdImg(imgs.escrita, "Aba Prova escrita com ranking individual de demonstração"),
    "",
    "## Esgrima",
    "",
    "Sorteio de referências para o líder da **Esgrima (Debate Bíblico)** ditar, sem repetir na mesma categoria. Cronômetro 20 s (MR) ou 30 s (ER). **Não altera** a classificação — medalhas continuam no Pódio. Debate de versículos e Esgrima avançada não usam esta aba.",
    "",
    "## Classificação",
    "",
    "Ranking geral: participação + punições + medalhas + extra. Desempate no ER: ouro → prata → Debate de Versículos → Conhecimentos gerais da Organização → nome. A prova de Evangelhos conta medalhas, mas não entra sozinha no critério de desempate. Use **Exportar CSV** para planilha.",
    "",
    mdImg(imgs.classificacao, "Aba Classificação com ranking e blocos de premiação"),
    "",
    "## Relatórios",
    "",
    "**Resumo** (capa, top 3, pódio, encerramento) para divulgação. **Oficial completo** inclui participação, classificação e critérios para arquivo. Gere e use a impressão do navegador (Salvar como PDF).",
    "",
    mdImg(imgs.relatorios, "Aba Relatórios com consulta rápida e pódio"),
    "",
    "## Modo apresentação",
    "",
    "Tela cheia para projetor, com cerimônia de revelação do 5.º ao 1.º lugar. Clique ou use as setas para avançar. **Esc** sai. A classificação fica congelada até a cerimônia terminar.",
    "",
    mdImg(imgs.apresentacao, "Modo apresentação — cerimônia de revelação"),
    "",
    "## Celular",
    "",
    "Abaixo de 768 px a navegação vai para a **barra inferior**. As mesmas oito abas. Prefira um notebook no dia do evento; o celular serve para consulta.",
    "",
    mdImg(imgs.mobile, "App em viewport de celular com barra inferior"),
    "",
    "## Backup no dia do evento",
    "",
    "1. Abra o app (tema azul ER, evento ER 2026/2).",
    "2. Lance Participação e Pódio.",
    "3. **Mais → Exportar projeto** várias vezes (pen-drive + nuvem).",
    "4. Não clique no tema ER esperando mudar pesos — ele só muda as cores.",
    "",
  ].join("\n");

  await writeFile(MD_PATH, md, "utf8");
  console.log("[guia-visual] capturas em " + OUT_DIR);
  console.log("[guia-visual] markdown em " + MD_PATH);
}

main().catch(function (err) {
  console.error("[guia-visual] falhou:", err);
  process.exit(1);
});
