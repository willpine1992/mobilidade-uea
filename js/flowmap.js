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
/* KPIs (statbar)                                                          */
/* ---------------------------------------------------------------------- */
function renderStats() {
  const oficiais = MOB_ROWS.filter((r) => r.oficial);
  const inCount = MOB_ROWS.filter((r) => r.fluxo === "IN").length;
  const outCount = MOB_ROWS.filter((r) => r.fluxo === "OUT").length;
  const paises = new Set(oficiais.map((r) => r.iso2)).size;
  document.getElementById("topbar-stats").innerHTML = `
    <div class="topbar__stat" data-help="Todos os registros da fonte."><b>${fmt(MOB_ROWS.length)}</b><small>Cadastrados</small></div>
    <div class="topbar__stat" data-help="Registros aptos para indicadores oficiais."><b>${fmt(oficiais.length)}</b><small>Total oficial</small></div>
    <div class="topbar__stat" data-help="Países de origem/destino distintos, entre os registros oficiais."><b>${fmt(paises)}</b><small>Países no mapa</small></div>
    <div class="topbar__stat is-highlight" data-help="Fluxo IN: estudantes chegando a Manaus."><b>${fmt(inCount)}</b><small>Fluxo IN</small></div>
    <div class="topbar__stat" data-help="Fluxo OUT: estudantes/docentes saindo de Manaus. Ainda sem dados nesta base."><b>${fmt(outCount)}</b><small>Fluxo OUT</small></div>
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

  // agregados por país e sentido de fluxo (indicadores oficiais)
  const oficiais = MOB_ROWS.filter((r) => r.oficial && COUNTRY_COORDS[r.iso2]);
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

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  renderStats();
  renderLegend();
  renderFlowMap();
});
