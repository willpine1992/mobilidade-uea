/* Dashboard Mobilidade Acadêmica UEA — lógica de tema, filtros e gráficos.
   Dados: js/data.js (MOB_ROWS, MOB_MODALIDADES) — apenas colunas não pessoais
   de Fato_Mobilidades + Dim_Programas_Mobilidade. */

/* ---------------------------------------------------------------------- */
/* Tema claro/escuro                                                       */
/* ---------------------------------------------------------------------- */
const THEME_KEY = "mobuea-theme";

function readCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getTheme() {
  return document.documentElement.getAttribute("data-theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  refreshThemeColors();
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro");
  window.dispatchEvent(new CustomEvent("mobuea:themechange", { detail: { theme } }));
}

function toggleTheme() { applyTheme(getTheme() === "dark" ? "light" : "dark"); }

function initThemeToggle() {
  refreshThemeColors();
  const theme = getTheme();
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-label", theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro");
    btn.addEventListener("click", toggleTheme);
  }
}

let CAT_COLORS = [];
let GREEN_SEQUENTIAL = [];
let CHART_MAP_FILL = "#eef5f1";
let CHART_MAP_BORDER = "#0b6b45";

function refreshThemeColors() {
  CAT_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => readCssVar(`--cat-${i}`));
  GREEN_SEQUENTIAL = [1, 2, 3, 4, 5, 6, 7].map((i) => readCssVar(`--chart-seq-${i}`));
  CHART_MAP_FILL = readCssVar("--chart-map-fill");
  CHART_MAP_BORDER = readCssVar("--chart-map-border");
}

// Re-renderiza tudo no toggle de tema: CSS var() não é lido nativamente por
// fill/stroke de SVG nem por estilos inline "gravados" no HTML em cada
// render — sem isso, os gráficos ficam com as cores presas no tema anterior.
window.addEventListener("mobuea:themechange", () => {
  if (typeof renderAll === "function") renderAll();
});
window.addEventListener("resize", debounce(() => { renderMap(); renderEvolucaoChart(); }, 200));

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------------------------------------------------------------- */
/* Tooltip global                                                          */
/* ---------------------------------------------------------------------- */
let tooltipEl = null;
function ensureTooltip() {
  if (!tooltipEl) tooltipEl = document.getElementById("viz-tooltip");
  return tooltipEl;
}
function showTooltip(x, y, html) {
  const el = ensureTooltip();
  el.innerHTML = html;
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.classList.add("is-visible");
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove("is-visible");
}

function fmt(n) { return (n || 0).toLocaleString("pt-BR"); }
function truncateLabel(s, n) { return s && s.length > n ? s.slice(0, n - 1) + "…" : s; }

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
// Ícone "!" que troca o texto explicativo por um popup — ver initHelpTooltips
// (aparece após ~3s de mouse parado em cima, igual ao resto do painel).
function hintIcon(text) {
  return `<span class="hint-icon" data-help="${escapeAttr(text)}">!</span>`;
}
function setHint(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = hintIcon(text);
}

/* ---------------------------------------------------------------------- */
/* Estado / filtros                                                        */
/* ---------------------------------------------------------------------- */
const EDICAO_ORDER = ["2022-2023", "2023-2024", "2024-2025", "2025-2026", "2026"];

const state = {
  modalidade: "TODAS", // TODAS | GCUB-MOB | ERASMUS+
  ppg: null,              // null = todos | Codigo_PPG
  pais: null,             // null = todos | Codigo_Pais_ISO2
  continente: null,       // null = todos | Continente_Origem
  situacao: null,         // null = todas | Situacao_Participacao
  financiamento: null,    // null = todas | Fonte_Financiamento
  nivel: null,            // null = todos | Nivel_Academico
  sexo: null,             // null = todos | Sexo_Genero
  fluxo: null,            // null = todos | Fluxo_Mobilidade
  tipo: null,             // null = todos | Tipo_Mobilidade
};

const FILTER_LABELS = {
  modalidade: "Modalidade",
  ppg: "PPG",
  pais: "País",
  continente: "Continente",
  situacao: "Situação",
  financiamento: "Financiamento",
  nivel: "Nível",
  sexo: "Gênero",
  fluxo: "Fluxo",
  tipo: "Tipo",
};

function matchRow(r, exclude) {
  if (!exclude.has("modalidade") && state.modalidade !== "TODAS" && r.modalidade !== state.modalidade) return false;
  if (!exclude.has("ppg") && state.ppg && r.ppg_codigo !== state.ppg) return false;
  if (!exclude.has("pais") && state.pais && r.iso2 !== state.pais) return false;
  if (!exclude.has("continente") && state.continente && r.continente !== state.continente) return false;
  if (!exclude.has("situacao") && state.situacao && r.situacao !== state.situacao) return false;
  if (!exclude.has("financiamento") && state.financiamento && r.financiamento !== state.financiamento) return false;
  if (!exclude.has("nivel") && state.nivel && r.nivel !== state.nivel) return false;
  if (!exclude.has("sexo") && state.sexo && r.sexo !== state.sexo) return false;
  if (!exclude.has("fluxo") && state.fluxo && r.fluxo !== state.fluxo) return false;
  if (!exclude.has("tipo") && state.tipo && r.tipo !== state.tipo) return false;
  return true;
}

const NO_EXCLUSION = new Set();
function getFilteredRows() {
  return MOB_ROWS.filter((r) => matchRow(r, NO_EXCLUSION));
}

// Linhas para os painéis de seleção (rankings, barras, faixas): respeitam
// todos os filtros ativos MENOS o da própria dimensão — assim a lista de
// opções continua completa e o usuário pode trocar a seleção com um clique
// (em vez de sumir assim que uma opção é escolhida).
function getRowsExcluding(dim) {
  return MOB_ROWS.filter((r) => matchRow(r, new Set([dim])));
}

function toggleFilter(dim, value) {
  state[dim] = state[dim] === value ? null : value;
  renderAll();
}

function clearFilters() {
  state.modalidade = "TODAS";
  state.ppg = null;
  state.pais = null;
  state.continente = null;
  state.situacao = null;
  state.financiamento = null;
  state.nivel = null;
  state.sexo = null;
  state.fluxo = null;
  state.tipo = null;
  renderAll();
}

function activeFilterChips() {
  const chips = [];
  if (state.modalidade !== "TODAS") chips.push({ dim: "modalidade", label: FILTER_LABELS.modalidade, value: state.modalidade });
  if (state.ppg) {
    const row = MOB_ROWS.find((r) => r.ppg_codigo === state.ppg);
    chips.push({ dim: "ppg", label: FILTER_LABELS.ppg, value: row ? row.ppg : state.ppg });
  }
  if (state.pais) {
    const row = MOB_ROWS.find((r) => r.iso2 === state.pais);
    chips.push({ dim: "pais", label: FILTER_LABELS.pais, value: row ? row.pais : state.pais });
  }
  if (state.continente) chips.push({ dim: "continente", label: FILTER_LABELS.continente, value: state.continente });
  if (state.situacao) chips.push({ dim: "situacao", label: FILTER_LABELS.situacao, value: state.situacao });
  if (state.financiamento) chips.push({ dim: "financiamento", label: FILTER_LABELS.financiamento, value: state.financiamento });
  if (state.nivel) chips.push({ dim: "nivel", label: FILTER_LABELS.nivel, value: state.nivel });
  if (state.sexo) chips.push({ dim: "sexo", label: FILTER_LABELS.sexo, value: state.sexo });
  if (state.fluxo) chips.push({ dim: "fluxo", label: FILTER_LABELS.fluxo, value: state.fluxo });
  if (state.tipo) chips.push({ dim: "tipo", label: FILTER_LABELS.tipo, value: state.tipo });
  return chips;
}

function renderFiltersBar() {
  const bar = document.getElementById("filters-bar");
  if (!bar) return;
  const chips = activeFilterChips();
  if (!chips.length) {
    bar.classList.remove("is-visible");
    bar.innerHTML = "";
    return;
  }
  bar.classList.add("is-visible");
  bar.innerHTML = `
    <span class="filters-bar__label">Filtros ativos</span>
    <div class="filters-bar__chips">
      ${chips.map((c) => `
        <button type="button" class="filter-chip" data-dim="${c.dim}">
          <span class="filter-chip__label">${c.label}:</span> ${c.value}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `).join("")}
    </div>
    <button type="button" class="btn btn--ghost filters-bar__clear" id="filters-clear-btn">Limpar filtros</button>
  `;
  bar.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state[chip.dataset.dim] = chip.dataset.dim === "modalidade" ? "TODAS" : null;
      renderAll();
    });
  });
  const clearBtn = document.getElementById("filters-clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", clearFilters);
}

function countBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/* ---------------------------------------------------------------------- */
/* Segmentador de modalidade                                               */
/* ---------------------------------------------------------------------- */
function renderSegModalidade() {
  const base = getRowsExcluding("modalidade");
  const total = base.length;
  const gcub = base.filter((r) => r.modalidade === "GCUB-MOB").length;
  const erasmus = base.filter((r) => r.modalidade === "ERASMUS+").length;
  const opts = [
    { id: "TODAS", label: "Todas", n: total },
    { id: "GCUB-MOB", label: "GCUB-MOB", n: gcub },
    { id: "ERASMUS+", label: "ERASMUS+", n: erasmus },
  ];
  const el = document.getElementById("seg-modalidade");
  el.innerHTML = opts.map((o) =>
    `<button type="button" class="seg-btn${state.modalidade === o.id ? " is-active" : ""}" data-modalidade="${o.id}">${o.label}<span class="n">${fmt(o.n)}</span></button>`
  ).join("");
  el.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.modalidade = btn.dataset.modalidade;
      renderAll();
    });
  });
}

/* ---------------------------------------------------------------------- */
/* KPIs (statbar)                                                          */
/* ---------------------------------------------------------------------- */
function computeKpis(rows) {
  const oficiais = rows.filter((r) => r.oficial);
  const recebidos = rows.filter((r) => r.recebido).length;
  const totalOficial = oficiais.length;
  return {
    totalCadastrados: rows.length,
    totalOficial,
    recebidos,
    percentualRecebidos: totalOficial ? Math.round((recebidos / totalOficial) * 1000) / 10 : 0,
    paises: new Set(oficiais.map((r) => r.iso2)).size,
    ppgs: new Set(oficiais.filter((r) => r.ppg_codigo !== "Não informado").map((r) => r.ppg_codigo)).size,
  };
}

function renderStats(rows) {
  const k = computeKpis(rows);
  const el = document.getElementById("topbar-stats");
  el.innerHTML = `
    <div class="topbar__stat" data-help="Todos os registros da fonte, incluindo pendências e casos ainda em conferência."><b>${fmt(k.totalCadastrados)}</b><small>Cadastrados</small></div>
    <div class="topbar__stat" data-help="Registros aptos para indicadores oficiais — exclui inconsistências de alta severidade."><b>${fmt(k.totalOficial)}</b><small>Total oficial</small></div>
    <div class="topbar__stat is-highlight" data-help="Estudantes com chegada confirmada em Manaus, entre os registros aptos."><b>${fmt(k.recebidos)}</b><small>Recebidos</small></div>
    <div class="topbar__stat" data-help="Percentual de recebidos sobre o total oficial do recorte atual."><b>${k.percentualRecebidos.toLocaleString("pt-BR")}%</b><small>% recebidos</small></div>
    <div class="topbar__stat" data-help="Países de origem distintos entre os registros oficiais."><b>${fmt(k.paises)}</b><small>Países de origem</small></div>
    <div class="topbar__stat" data-help="Programas de pós-graduação da UEA envolvidos, entre os registros oficiais."><b>${fmt(k.ppgs)}</b><small>PPGs envolvidos</small></div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Cartões clicáveis genéricos (nível acadêmico, fluxo, tipo)               */
/* ---------------------------------------------------------------------- */
function renderTiles(containerId, keys, dim, rowFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const base = getRowsExcluding(dim);
  const c = countBy(base, rowFn);
  el.innerHTML = keys.map((key) => `
    <div class="stat-tile${state[dim] === key ? " is-active" : ""}" data-key="${key}">
      <b>${fmt(c.get(key) || 0)}</b><small>${key}</small>
    </div>
  `).join("");
  el.querySelectorAll(".stat-tile[data-key]").forEach((tile) => {
    tile.addEventListener("click", () => toggleFilter(dim, tile.dataset.key));
  });
}

function renderNivelTiles() {
  renderTiles("nivel-tiles", ["Mestrado", "Doutorado", "Graduação"], "nivel", (r) => r.nivel);
}

function renderFluxoTipoTiles() {
  // IN/OUT sempre exibidos, mesmo com 0 — Fluxo_Mobilidade hoje só tem "IN",
  // mas ERASMUS+ já prevê OUT no modelo (ver Dim_Programas_Mobilidade).
  const fluxoKeys = ["IN", "OUT"];
  const tipoKeys = [...new Set(getRowsExcluding("tipo").map((r) => r.tipo))];
  renderTiles("fluxo-tiles", fluxoKeys, "fluxo", (r) => r.fluxo);
  renderTiles("tipo-tiles", tipoKeys, "tipo", (r) => r.tipo);
}

/* ---------------------------------------------------------------------- */
/* Gênero (infográfico — barra dividida + legenda)                         */
/* ---------------------------------------------------------------------- */
const GENERO_ORDER = ["Feminino", "Masculino", "Prefiro não declarar", "Não informado"];

function renderGenero() {
  const base = getRowsExcluding("sexo").filter((r) => r.sexo);
  const c = countBy(base, (r) => r.sexo);
  const total = base.length || 1;
  const keys = GENERO_ORDER.filter((k) => c.has(k));
  const colorFor = { "Feminino": CAT_COLORS[4], "Masculino": CAT_COLORS[0], "Prefiro não declarar": readCssVar("--ink-muted"), "Não informado": readCssVar("--ink-muted") };

  setHint("genero-hint", state.sexo
    ? `Filtrando por ${state.sexo}. Clique de novo para limpar.`
    : `${fmt(base.length)} participantes · clique numa fatia para filtrar.`);

  document.getElementById("genero-splitbar").innerHTML = keys.map((k) => {
    const v = c.get(k) || 0;
    const pct = (v / total) * 100;
    const dim = state.sexo && state.sexo !== k;
    return `<span class="split-bar__seg" style="width:${pct}%; background:${colorFor[k]}; opacity:${dim ? 0.35 : 1}"></span>`;
  }).join("");

  document.getElementById("genero-legend").innerHTML = keys.map((k) => {
    const v = c.get(k) || 0;
    const pct = Math.round((v / total) * 100);
    return `
      <div class="split-legend__row${state.sexo === k ? " is-active" : ""}" data-sexo="${k}">
        <span class="split-legend__dot" style="background:${colorFor[k]}"></span>
        <span class="split-legend__label">${k}</span>
        <span class="split-legend__pct">${pct}%</span>
        <span class="split-legend__val">${fmt(v)}</span>
      </div>`;
  }).join("");

  document.querySelectorAll("#genero-legend .split-legend__row").forEach((el) => {
    el.addEventListener("click", () => toggleFilter("sexo", el.dataset.sexo));
  });
}

/* ---------------------------------------------------------------------- */
/* Continente de origem (barras horizontais)                               */
/* ---------------------------------------------------------------------- */
function renderContinenteBars() {
  const rows = getRowsExcluding("continente").filter((r) => r.oficial);
  const order = ["África", "Europa", "América do Sul", "América do Norte", "Ásia"];
  const colorIdx = { "África": 5, "Europa": 0, "América do Sul": 2, "América do Norte": 3, "Ásia": 6 };
  const c = countBy(rows, (r) => r.continente);
  const entries = order.filter((k) => c.has(k)).map((k) => [k, c.get(k)]);
  setHint("continente-hint", state.continente
    ? `Filtrando por ${state.continente}. Clique de novo para limpar.`
    : "Mostra apenas os registros aptos para indicadores oficiais. Clique numa barra para filtrar.");
  renderHBars("continente-bars", entries, {
    colorFn: ([k]) => CAT_COLORS[colorIdx[k] % CAT_COLORS.length],
    activeKey: state.continente,
    onClick: (k) => toggleFilter("continente", k),
  });
}

/* ---------------------------------------------------------------------- */
/* PPG — siglas (Codigo_PPG), mesma dimensão de filtro do ranking por nome */
/* ---------------------------------------------------------------------- */
function renderPpgSiglas() {
  const rows = getRowsExcluding("ppg").filter((r) => r.oficial && r.ppg_codigo !== "Não informado");
  const nameByCode = new Map(rows.map((r) => [r.ppg_codigo, r.ppg]));
  const c = countBy(rows, (r) => r.ppg_codigo);
  const entries = topEntries(c, 20);
  setHint("ppgsiglas-hint", state.ppg
    ? `Filtrando por ${nameByCode.get(state.ppg) || state.ppg} (${state.ppg}). Clique de novo para limpar.`
    : "Siglas de Codigo_PPG, o programa de pós-graduação da UEA que recebeu o estudante. Clique numa sigla para filtrar.");
  document.getElementById("ppgsiglas-badges").innerHTML = entries.map(([codigo, v]) => `
    <button type="button" class="badge badge--link${state.ppg === codigo ? " is-active" : ""}" data-ppg="${codigo}" title="${escapeAttr(nameByCode.get(codigo) || "")}">${codigo} <span class="muted">${fmt(v)}</span></button>
  `).join("") || '<div class="empty-hint">Sem dados.</div>';

  document.querySelectorAll("#ppgsiglas-badges .badge[data-ppg]").forEach((el) => {
    el.addEventListener("click", () => toggleFilter("ppg", el.dataset.ppg));
  });
}

/* ---------------------------------------------------------------------- */
/* Situação da participação (meters)                                       */
/* ---------------------------------------------------------------------- */
const SITUACAO_LABELS = [
  "Recebido", "A confirmar", "Chegada prevista", "Desistente", "Em conferência – possível desligamento",
];

function renderSituacaoMeters() {
  const base = getRowsExcluding("situacao");
  const c = countBy(base, (r) => r.situacao);
  const total = base.length || 1;
  setHint("situacao-total", state.situacao
    ? `Filtrando por ${state.situacao}. Clique de novo para limpar.`
    : `${fmt(base.length)} registros · clique numa situação para filtrar.`);
  document.getElementById("situacao-meters").innerHTML = SITUACAO_LABELS.map((label) => {
    const v = c.get(label) || 0;
    const pct = Math.round((v / total) * 100);
    return `
      <div class="meter-row${state.situacao === label ? " is-active" : ""}" data-situacao="${label}">
        <div class="meter-row__label"><span>${label}</span><b>${fmt(v)}</b></div>
        <div class="meter-track"><span style="width:${pct}%"></span></div>
      </div>`;
  }).join("");
  document.querySelectorAll("#situacao-meters .meter-row").forEach((el) => {
    el.addEventListener("click", () => toggleFilter("situacao", el.dataset.situacao));
  });
}

/* ---------------------------------------------------------------------- */
/* Status das modalidades do modelo                                        */
/* ---------------------------------------------------------------------- */
function renderModalidadesStatus() {
  const base = getRowsExcluding("modalidade");
  const counts = countBy(base, (r) => r.modalidade);
  document.getElementById("modalidades-status").innerHTML = MOB_MODALIDADES.map((m) => {
    const n = m.possui_dados === "Sim" ? (counts.get(m.programa) || 0) : m.qtd_atual;
    const active = state.modalidade === m.programa;
    return `
      <div class="info-row${active ? " is-active" : ""}" data-programa="${m.programa}" style="cursor:pointer;">
        <span>${m.nome}${m.possui_dados === "Sim" ? "" : " · aguardando"}</span>
        <span>${fmt(n)} registro${n === 1 ? "" : "s"}</span>
      </div>`;
  }).join("");
  document.querySelectorAll("#modalidades-status .info-row").forEach((el) => {
    el.addEventListener("click", () => {
      const p = el.dataset.programa;
      state.modalidade = state.modalidade === p ? "TODAS" : p;
      renderAll();
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Mapa coroplético de países de origem                                    */
/* ---------------------------------------------------------------------- */
const PT_TO_EN_COUNTRY = {
  "Peru": "Peru",
  "Moçambique": "Mozambique",
  "Angola": "Angola",
  "Colômbia": "Colombia",
  "Haiti": "Haiti",
  "Guiné-Bissau": "Guinea-Bissau",
  "República Dominicana": "Dominican Rep.",
  "Equador": "Ecuador",
  "México": "Mexico",
  "Benim": "Benin",
  "Nigéria": "Nigeria",
  "Timor-Leste": "Timor-Leste",
  "Etiópia": "Ethiopia",
  "Honduras": "Honduras",
  "Itália": "Italy",
};

let _worldCache = null;
async function getWorld() {
  if (!_worldCache) {
    const topo = await fetch("lib/countries-110m.json").then((r) => r.json());
    _worldCache = topojson.feature(topo, topo.objects.countries);
  }
  return _worldCache;
}

let _lastMapCounts = null;
async function renderMap() {
  const rows = getFilteredRows().filter((r) => r.oficial);
  const el = document.getElementById("map-container");
  if (!el) return;
  const width = el.clientWidth, height = el.clientHeight;
  if (width < 10 || height < 10) return;

  const world = await getWorld();
  const counts = countBy(rows, (r) => r.pais);
  _lastMapCounts = counts;
  const maxV = d3.max([...counts.values()]) || 1;
  const colorScale = d3.scaleQuantize().domain([1, maxV]).range(GREEN_SEQUENTIAL);

  const countryNameToCount = new Map();
  for (const [pt, v] of counts) countryNameToCount.set(PT_TO_EN_COUNTRY[pt] || pt, v);

  d3.select(el).selectAll("*").remove();
  const svg = d3.select(el).append("svg").attr("width", width).attr("height", height);

  const projection = d3.geoNaturalEarth1().fitExtent([[6, 6], [width - 6, height - 6]], { type: "Sphere" });
  const path = d3.geoPath(projection);

  svg.append("path").attr("class", "map-sphere").attr("d", path({ type: "Sphere" }));
  svg.append("path").attr("class", "map-graticule").attr("d", path(d3.geoGraticule10()));

  svg.selectAll("path.country")
    .data(world.features)
    .join("path")
    .attr("class", "map-country")
    .attr("d", path)
    .attr("fill", (d) => {
      const v = countryNameToCount.get(d.properties.name);
      return v ? colorScale(v) : CHART_MAP_FILL;
    })
    .attr("stroke", CHART_MAP_BORDER)
    .attr("stroke-width", 0.6)
    .on("mousemove", (ev, d) => {
      const v = countryNameToCount.get(d.properties.name);
      if (!v) return;
      showTooltip(ev.clientX, ev.clientY, `<b>${d.properties.name}</b><br>${fmt(v)} estudante${v === 1 ? "" : "s"}`);
    })
    .on("mouseleave", hideTooltip);

  renderMapLegend(maxV);
}

function renderMapLegend(maxV) {
  const el = document.getElementById("map-legend-swatches");
  if (!el) return;
  el.innerHTML = GREEN_SEQUENTIAL.map((c) => `<span style="background:${c}"></span>`).join("");
}

/* ---------------------------------------------------------------------- */
/* Evolução por edição (barras empilhadas por nível)                       */
/* ---------------------------------------------------------------------- */
function renderEvolucaoChart() {
  const base = getFilteredRows().filter((r) => r.oficial);
  const el = document.getElementById("evolucao-chart");
  if (!el) return;
  const width = el.clientWidth, height = el.clientHeight;
  d3.select(el).selectAll("*").remove();
  if (width < 10 || height < 10) return;

  const edicoes = EDICAO_ORDER.filter((ed) => base.some((r) => r.edicao === ed));
  const niveis = ["Mestrado", "Doutorado", "Graduação"];
  const nivelColor = { "Mestrado": CAT_COLORS[0], "Doutorado": CAT_COLORS[2], "Graduação": CAT_COLORS[3] };

  const data = edicoes.map((ed) => {
    const rs = base.filter((r) => r.edicao === ed);
    const row = { edicao: ed };
    let y0 = 0;
    for (const niv of niveis) {
      const v = rs.filter((r) => r.nivel === niv).length;
      row[niv] = { v, y0, y1: y0 + v };
      y0 += v;
    }
    row.total = y0;
    return row;
  });

  const margin = { top: 10, right: 10, bottom: 26, left: 30 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxTotal = d3.max(data, (d) => d.total) || 1;

  const x = d3.scaleBand().domain(edicoes).range([0, innerW]).padding(0.32);
  const y = d3.scaleLinear().domain([0, maxTotal]).nice().range([innerH, 0]);

  const svg = d3.select(el).append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSize(0))
    .call((sel) => sel.select(".domain").attr("stroke", readCssVar("--border-hairline")))
    .selectAll("text").attr("class", "bar-label").attr("fill", readCssVar("--ink-muted"));

  g.append("g")
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerW))
    .call((sel) => sel.select(".domain").remove())
    .call((sel) => sel.selectAll("line").attr("stroke", readCssVar("--border-hairline")))
    .selectAll("text").attr("class", "bar-label").attr("fill", readCssVar("--ink-muted"));

  const edGroups = g.selectAll("g.ed").data(data).join("g")
    .attr("class", "ed")
    .attr("transform", (d) => `translate(${x(d.edicao)},0)`);

  for (const niv of niveis) {
    edGroups.append("rect")
      .attr("y", (d) => y(d[niv].y1))
      .attr("height", (d) => Math.max(0, y(d[niv].y0) - y(d[niv].y1)))
      .attr("width", x.bandwidth())
      .attr("fill", nivelColor[niv])
      .attr("rx", 3)
      .style("cursor", "pointer")
      .on("mousemove", function (ev, d) {
        showTooltip(ev.clientX, ev.clientY, `<b>${d.edicao}</b><br>${niv}: ${fmt(d[niv].v)}<br>Total oficial: ${fmt(d.total)}`);
      })
      .on("mouseleave", hideTooltip);
  }
}

/* ---------------------------------------------------------------------- */
/* Barras horizontais genéricas (financiamento, continente)                */
/* ---------------------------------------------------------------------- */
function renderHBars(containerId, entries, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  if (!entries.length) {
    el.innerHTML = '<div class="empty-hint">Sem dados.</div>';
    return;
  }
  const width = el.clientWidth || 260;
  const rowH = opts.rowH || 30;
  const height = rowH * entries.length;
  const maxV = d3.max(entries, (e) => e[1]) || 1;

  const svg = d3.select(el).append("svg").attr("width", width).attr("height", height);
  const gs = svg.selectAll("g.bar-track").data(entries).join("g")
    .attr("class", "bar-track")
    .attr("transform", (_, i) => `translate(0, ${i * rowH})`);

  gs.append("text").attr("class", "bar-label")
    .attr("x", 0).attr("y", rowH * 0.34)
    .text(([k]) => truncateLabel(String(k), 30));

  const barY = rowH * 0.46, barH = Math.max(5, rowH * 0.3);
  gs.append("rect").attr("class", "bg")
    .attr("x", 0).attr("y", barY).attr("width", width).attr("height", barH).attr("rx", barH / 2);

  gs.append("rect").attr("class", "fg")
    .attr("x", 0).attr("y", barY).attr("height", barH).attr("rx", barH / 2)
    .attr("width", ([, v]) => Math.max(4, (v / maxV) * (width - 46)))
    .attr("fill", (_, i) => (opts.colorFn ? opts.colorFn(entries[i], i) : CAT_COLORS[i % CAT_COLORS.length]))
    .attr("opacity", ([k]) => (!opts.activeKey || k === opts.activeKey ? 1 : 0.4))
    .style("cursor", opts.onClick ? "pointer" : null)
    .on("mousemove", function (ev, [k, v]) { showTooltip(ev.clientX, ev.clientY, `<b>${k}</b><br>${fmt(v)} registro${v === 1 ? "" : "s"}`); })
    .on("mouseleave", hideTooltip)
    .on("click", (ev, [k]) => { if (opts.onClick) opts.onClick(k); });

  gs.append("text").attr("class", "bar-value")
    .attr("x", width).attr("y", barY + barH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(([, v]) => fmt(v));
}

function renderFinanciamentoBars() {
  const rows = getRowsExcluding("financiamento");
  const c = countBy(rows, (r) => r.financiamento);
  const entries = topEntries(c, 8);
  setHint("financiamento-hint", state.financiamento
    ? `Filtrando por ${state.financiamento}. Clique de novo para limpar.`
    : "Clique numa barra para filtrar por fonte de financiamento.");
  renderHBars("financiamento-bars", entries, {
    colorFn: ([k]) => (k === "Não informado" ? readCssVar("--ink-muted") : CAT_COLORS[0]),
    activeKey: state.financiamento,
    onClick: (k) => toggleFilter("financiamento", k),
  });
}

/* ---------------------------------------------------------------------- */
/* Rankings (países, PPGs)                                                 */
/* ---------------------------------------------------------------------- */
function renderPaisRank() {
  const rows = getRowsExcluding("pais").filter((r) => r.oficial);
  const nameByIso = new Map(rows.map((r) => [r.iso2, r.pais]));
  const c = countBy(rows, (r) => r.iso2);
  const entries = topEntries(c, 20);
  setHint("pais-total", state.pais
    ? `Filtrando por ${nameByIso.get(state.pais) || state.pais}. Clique de novo para limpar.`
    : `${entries.length} países · clique para filtrar.`);
  document.getElementById("pais-rank").innerHTML = entries.map(([iso2, v], i) => `
    <div class="rank${state.pais === iso2 ? " is-active" : ""}" data-pais="${iso2}">
      <span class="rank__pos">${i + 1}</span><span class="rank__name">${nameByIso.get(iso2)}</span><span class="rank__val">${fmt(v)}</span>
    </div>
  `).join("") || '<div class="empty-hint">Sem dados.</div>';

  document.querySelectorAll("#pais-rank .rank[data-pais]").forEach((el) => {
    el.addEventListener("click", () => toggleFilter("pais", el.dataset.pais));
  });
}

/* ---------------------------------------------------------------------- */
/* Lista de participantes (nome no padrão ABNT) — abaixo de "Evolução por edição" */
/* ---------------------------------------------------------------------- */
function renderParticipantesList(rows) {
  const q = (document.getElementById("participantes-search").value || "").trim().toLowerCase();
  const list = rows
    .filter((r) => r.nome_abnt)
    .filter((r) => !q || [r.nome_abnt, r.pais, r.ppg].filter(Boolean).join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.nome_abnt.localeCompare(b.nome_abnt, "pt-BR"));

  setHint("participantes-total", `${fmt(list.length)} participante${list.length === 1 ? "" : "s"} · nome no padrão ABNT (sobrenome, inicial).`);
  document.getElementById("participantes-list").innerHTML = list.map((r) => `
    <div class="pickrow" style="cursor:default;">
      <span class="dot" style="background:${r.oficial ? "var(--accent)" : "var(--border-strong)"}"></span>
      <span class="label">${r.nome_abnt}</span>
      <span class="count">${r.pais} · ${r.edicao}</span>
    </div>
  `).join("") || '<div class="empty-hint">Nenhum participante encontrado.</div>';
}

/* ---------------------------------------------------------------------- */
/* Orquestração                                                            */
/* ---------------------------------------------------------------------- */
function renderAll() {
  const rows = getFilteredRows();
  renderFiltersBar();
  renderSegModalidade();
  renderStats(rows);
  renderNivelTiles();
  renderGenero();
  renderSituacaoMeters();
  renderModalidadesStatus();
  renderContinenteBars();
  renderFluxoTipoTiles();
  renderFinanciamentoBars();
  renderPaisRank();
  renderPpgSiglas();
  renderParticipantesList(rows);
  renderMap();
  renderEvolucaoChart();
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  renderAll();
  initHelpTooltips();
  document.getElementById("participantes-search").addEventListener("input", () => renderParticipantesList(getFilteredRows()));
});

/* ---------------------------------------------------------------------- */
/* Tooltip de ajuda (hover parado por ~1.2s sobre [data-help])             */
/* ---------------------------------------------------------------------- */
function initHelpTooltips() {
  let helpEl = null, timer = null;
  function ensureHelp() {
    if (!helpEl) {
      helpEl = document.createElement("div");
      helpEl.className = "help-tooltip";
      document.body.appendChild(helpEl);
    }
    return helpEl;
  }
  document.body.addEventListener("mouseover", (ev) => {
    const t = ev.target.closest("[data-help]");
    if (!t) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const el = ensureHelp();
      el.textContent = t.dataset.help;
      const r = t.getBoundingClientRect();
      el.style.left = r.left + "px";
      el.style.top = r.bottom + 10 + "px";
      el.classList.add("is-visible");
    }, 3000);
  });
  document.body.addEventListener("mouseout", (ev) => {
    const t = ev.target.closest("[data-help]");
    if (!t) return;
    clearTimeout(timer);
    if (helpEl) helpEl.classList.remove("is-visible");
  });
}
