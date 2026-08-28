/* Mapa de Fluxo — Manaus ⇄ países de origem/destino.
   Dados: js/data.js (MOB_ROWS) — mesma fonte pública do index.html, sem PII.
   Coordenadas de país são aproximações (centro geográfico), só para
   posicionar as linhas no mapa — não vêm da planilha (que não tem lat/lon). */

/* ---------------------------------------------------------------------- */
/* Tema claro/escuro (mesmo padrão do index.html)                          */
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
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro");
  window.dispatchEvent(new CustomEvent("mobuea:themechange", { detail: { theme } }));
}
function toggleTheme() { applyTheme(getTheme() === "dark" ? "light" : "dark"); }
function initThemeToggle() {
  const theme = getTheme();
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-label", theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro");
    btn.addEventListener("click", toggleTheme);
  }
}
window.addEventListener("mobuea:themechange", () => renderFlowMap());
window.addEventListener("resize", debounce(() => renderFlowMap(), 200));
// outra aba/janela mudou os filtros (ex.: no Painel) — reflete aqui também
window.addEventListener("storage", (ev) => {
  if (ev.key === "mobuea-filters") { loadFiltersFromStorage(); renderPage(); }
});
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function fmt(n) { return (n || 0).toLocaleString("pt-BR"); }

/* ---------------------------------------------------------------------- */
/* Tooltip                                                                 */
/* ---------------------------------------------------------------------- */
let tooltipEl = null;
function ensureTooltip() { if (!tooltipEl) tooltipEl = document.getElementById("viz-tooltip"); return tooltipEl; }
function showTooltip(x, y, html) {
  const el = ensureTooltip();
  el.innerHTML = html;
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.classList.add("is-visible");
}
function hideTooltip() { if (tooltipEl) tooltipEl.classList.remove("is-visible"); }

/* ---------------------------------------------------------------------- */
/* Coordenadas aproximadas [lon, lat] dos países presentes em MOB_ROWS      */
/* ---------------------------------------------------------------------- */
const MANAUS = { lon: -60.0261, lat: -3.1190, nome: "Manaus" };

const COUNTRY_COORDS = {
  PE: [-75.0, -9.5],    // Peru
  MZ: [35.5, -18.5],    // Moçambique
  AO: [17.5, -12.5],    // Angola
  CO: [-74.3, 4.5],     // Colômbia
  HT: [-72.3, 18.9],    // Haiti
  GW: [-15.0, 12.0],    // Guiné-Bissau
  DO: [-70.5, 18.8],    // República Dominicana
  EC: [-78.5, -1.5],    // Equador
  MX: [-102.5, 23.5],   // México
  BJ: [2.3, 9.5],       // Benim
  NG: [8.0, 9.5],       // Nigéria
  TL: [125.6, -8.8],    // Timor-Leste
  ET: [39.5, 8.5],      // Etiópia
  HN: [-86.5, 15.0],    // Honduras
  IT: [12.5, 42.5],     // Itália
  TR: [35.2, 39.0],     // Turquia (registros não oficiais também aparecem no mapa)
};

function countBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) { const k = keyFn(item); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

/* ---------------------------------------------------------------------- */
/* Filtros ativos — compartilhados com index.html via localStorage. Este   */
/* mapa não define novos filtros, só lê e permite limpar os que já        */
/* estavam ativos no painel (mesma chave de armazenamento).                */
/* ---------------------------------------------------------------------- */
const FILTERS_STORAGE_KEY = "mobuea-filters";
const state = {
  modalidade: "TODAS", ppg: null, pais: null, continente: null, situacao: null,
  financiamento: null, nivel: null, sexo: null, fluxo: null, tipo: null,
};
const FILTER_LABELS = {
  modalidade: "Modalidade", ppg: "PPG", pais: "País", continente: "Continente",
  situacao: "Situação", financiamento: "Financiamento", nivel: "Nível",
  sexo: "Gênero", fluxo: "Fluxo", tipo: "Tipo",
};

function loadFiltersFromStorage() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.keys(state).forEach((k) => { if (k in saved) state[k] = saved[k]; });
  } catch (e) { /* ignora */ }
}
function saveFiltersToStorage() {
  try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
}

function matchRow(r) {
  if (state.modalidade !== "TODAS" && r.modalidade !== state.modalidade) return false;
  if (state.ppg && r.ppg_codigo !== state.ppg) return false;
  if (state.pais && r.iso2 !== state.pais) return false;
  if (state.continente && r.continente !== state.continente) return false;
  if (state.situacao && r.situacao !== state.situacao) return false;
  if (state.financiamento && r.financiamento !== state.financiamento) return false;
  if (state.nivel && r.nivel !== state.nivel) return false;
  if (state.sexo && r.sexo !== state.sexo) return false;
  if (state.fluxo && r.fluxo !== state.fluxo) return false;
  if (state.tipo && r.tipo !== state.tipo) return false;
  return true;
}
function getFilteredRows() { return MOB_ROWS.filter(matchRow); }

function clearFilters() {
  state.modalidade = "TODAS";
  state.ppg = null; state.pais = null; state.continente = null; state.situacao = null;
  state.financiamento = null; state.nivel = null; state.sexo = null; state.fluxo = null; state.tipo = null;
  renderPage();
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
  if (!chips.length) { bar.classList.remove("is-visible"); bar.innerHTML = ""; return; }
  bar.classList.add("is-visible");
  bar.innerHTML = `
    <span class="filters-bar__label">Filtros ativos (definidos no Painel)</span>
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
      renderPage();
    });
  });
  const clearBtn = document.getElementById("filters-clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", clearFilters);
}

/* ---------------------------------------------------------------------- */
/* KPIs (statbar)                                                          */
/* ---------------------------------------------------------------------- */
function renderStats(rows) {
  const oficiais = rows.filter((r) => r.oficial);
  const inCount = rows.filter((r) => r.fluxo === "IN").length;
  const outCount = rows.filter((r) => r.fluxo === "OUT").length;
  const paises = new Set(oficiais.map((r) => r.iso2)).size;
  document.getElementById("topbar-stats").innerHTML = `
    <div class="topbar__stat" data-help="Registros do recorte atual (respeitando os filtros ativos)."><b>${fmt(rows.length)}</b><small>Cadastrados</small></div>
    <div class="topbar__stat" data-help="Registros aptos para indicadores oficiais, no recorte atual."><b>${fmt(oficiais.length)}</b><small>Total oficial</small></div>
    <div class="topbar__stat" data-help="Países de origem/destino distintos, entre os registros oficiais do recorte atual."><b>${fmt(paises)}</b><small>Países no mapa</small></div>
    <div class="topbar__stat is-highlight" data-help="Fluxo IN: estudantes chegando a Manaus, no recorte atual."><b>${fmt(inCount)}</b><small>Fluxo IN</small></div>
    <div class="topbar__stat" data-help="Fluxo OUT: estudantes/docentes saindo de Manaus, no recorte atual. Ainda sem dados nesta base."><b>${fmt(outCount)}</b><small>Fluxo OUT</small></div>
  `;
}

function renderLegend() {
  document.getElementById("flow-legend").innerHTML = `
    <div class="flow-legend__item"><span class="flow-legend__swatch flow-legend__swatch--in"></span>IN — chegando a Manaus</div>
    <div class="flow-legend__item"><span class="flow-legend__swatch flow-legend__swatch--out"></span>OUT — saindo de Manaus</div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Mapa                                                                     */
/* ---------------------------------------------------------------------- */
let _worldCache = null;
async function getWorld() {
  if (!_worldCache) {
    const topo = await fetch("lib/countries-110m.json").then((r) => r.json());
    _worldCache = topojson.feature(topo, topo.objects.countries);
  }
  return _worldCache;
}

async function renderFlowMap() {
  const el = document.getElementById("flow-chart");
  if (!el) return;
  const width = el.clientWidth, height = el.clientHeight;
  if (width < 10 || height < 10) return;

  const world = await getWorld();
  const mapFill = readCssVar("--chart-map-fill");
  const mapBorder = readCssVar("--chart-map-border");
  const inColor = readCssVar("--accent");
  const outColor = readCssVar("--cat-2");

  const projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [width - 10, height - 10]], { type: "Sphere" });
  const path = d3.geoPath(projection);

  d3.select(el).selectAll("*").remove();
  const svg = d3.select(el).append("svg").attr("width", width).attr("height", height);

  svg.append("path").attr("class", "map-sphere").attr("d", path({ type: "Sphere" }));
  svg.append("path").attr("class", "map-graticule").attr("d", path(d3.geoGraticule10()));
  svg.selectAll("path.country")
    .data(world.features).join("path")
    .attr("class", "map-country").attr("d", path)
    .attr("fill", mapFill).attr("stroke", mapBorder).attr("stroke-width", 0.6);

  // agregados por país e sentido de fluxo (indicadores oficiais, respeitando os filtros ativos)
  const oficiais = getFilteredRows().filter((r) => r.oficial && COUNTRY_COORDS[r.iso2]);
  const inRows = oficiais.filter((r) => r.fluxo === "IN");
  const outRows = oficiais.filter((r) => r.fluxo === "OUT");
  const inByIso = countBy(inRows, (r) => r.iso2);
  const outByIso = countBy(outRows, (r) => r.iso2);
  const nameByIso = new Map(oficiais.map((r) => [r.iso2, r.pais]));

  const allCounts = [...inByIso.values(), ...outByIso.values()];
  const maxV = d3.max(allCounts) || 1;
  const widthScale = d3.scaleSqrt().domain([1, maxV]).range([1.4, 6]);
  const dotScale = d3.scaleSqrt().domain([1, maxV]).range([4, 13]);

  const manausXY = projection([MANAUS.lon, MANAUS.lat]);

  function arcPath(from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
    const curve = 0.18;
    const cx = mx - dy * curve, cy = my + dx * curve;
    return `M${from[0]},${from[1]} Q${cx},${cy} ${to[0]},${to[1]}`;
  }

  const g = svg.append("g");

  function drawFlows(byIso, dir) {
    const isIn = dir === "in";
    for (const [iso2, v] of byIso) {
      const coord = COUNTRY_COORDS[iso2];
      if (!coord) continue;
      const countryXY = projection(coord);
      if (!countryXY) continue;
      const from = isIn ? countryXY : manausXY;
      const to = isIn ? manausXY : countryXY;
      const d = arcPath(from, to);
      const dash = 4 + (v > 5 ? 1 : 0);

      g.append("path")
        .attr("class", `flow-line flow-line--${dir} flow-line__anim`)
        .attr("d", d)
        .attr("stroke-width", widthScale(v))
        .attr("stroke-dasharray", `${dash} ${dash + 4}`)
        .attr("opacity", 0.85)
        .on("mousemove", (ev) => {
          const label = isIn
            ? `<b>${nameByIso.get(iso2) || iso2} → Manaus</b><br>${fmt(v)} estudante${v === 1 ? "" : "s"} (IN)`
            : `<b>Manaus → ${nameByIso.get(iso2) || iso2}</b><br>${fmt(v)} registro${v === 1 ? "" : "s"} (OUT)`;
          showTooltip(ev.clientX, ev.clientY, label);
        })
        .on("mouseleave", hideTooltip);

      g.append("circle")
        .attr("class", "flow-dot-country")
        .attr("cx", countryXY[0]).attr("cy", countryXY[1])
        .attr("r", dotScale(v))
        .attr("fill", isIn ? inColor : outColor)
        .attr("opacity", 0.85)
        .on("mousemove", (ev) => {
          const label = isIn
            ? `<b>${nameByIso.get(iso2) || iso2}</b><br>${fmt(v)} estudante${v === 1 ? "" : "s"} chegando (IN)`
            : `<b>${nameByIso.get(iso2) || iso2}</b><br>${fmt(v)} registro${v === 1 ? "" : "s"} saindo (OUT)`;
          showTooltip(ev.clientX, ev.clientY, label);
        })
        .on("mouseleave", hideTooltip);

      g.append("text")
        .attr("class", "flow-country-label")
        .attr("x", countryXY[0]).attr("y", countryXY[1] - dotScale(v) - 4)
        .attr("text-anchor", "middle")
        .text(nameByIso.get(iso2) || iso2);
    }
  }

  drawFlows(inByIso, "in");
  drawFlows(outByIso, "out");

  // Manaus — ponto central com pulso
  const manausG = svg.append("g").attr("transform", `translate(${manausXY[0]},${manausXY[1]})`);
  manausG.append("circle").attr("class", "flow-dot-manaus__pulse").attr("r", 6);
  manausG.append("circle").attr("class", "flow-dot-manaus").attr("r", 6);
  manausG.append("text").attr("class", "flow-manaus-label").attr("x", 10).attr("y", 4).text("Manaus");
}

function renderPage() {
  saveFiltersToStorage();
  renderFiltersBar();
  renderStats(getFilteredRows());
  renderFlowMap();
}

document.addEventListener("DOMContentLoaded", () => {
  loadFiltersFromStorage();
  initThemeToggle();
  renderLegend();
  renderPage();
});
