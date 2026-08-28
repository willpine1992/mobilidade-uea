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

window.addEventListener("mobuea:themechange", () => {
  renderMap();
  renderEvolucaoChart();
  renderMapLegend();
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

/* ---------------------------------------------------------------------- */
/* Estado / filtros                                                        */
/* ---------------------------------------------------------------------- */
const EDICAO_ORDER = ["2022-2023", "2023-2024", "2024-2025", "2025-2026", "2026"];

const state = {
  modalidade: "TODAS", // TODAS | GCUB-MOB | ERASMUS+
  edicao: null,        // null = todas
};

function getFilteredRows() {
  return MOB_ROWS.filter((r) =>
    (state.modalidade === "TODAS" || r.modalidade === state.modalidade) &&
    (!state.edicao || r.edicao === state.edicao)
  );
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
  const total = MOB_ROWS.length;
  const gcub = MOB_ROWS.filter((r) => r.modalidade === "GCUB-MOB").length;
  const erasmus = MOB_ROWS.filter((r) => r.modalidade === "ERASMUS+").length;
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
/* Faixa de edições                                                        */
/* ---------------------------------------------------------------------- */
function renderEdicaoStrip() {
  const base = MOB_ROWS.filter((r) => state.modalidade === "TODAS" || r.modalidade === state.modalidade);
  const counts = countBy(base, (r) => r.edicao);
  const el = document.getElementById("edicao-strip");
  el.innerHTML = EDICAO_ORDER.filter((ed) => counts.has(ed)).map((ed) => `
    <div class="edicao-card${state.edicao === ed ? " is-active" : ""}" data-edicao="${ed}">
      <b>${fmt(counts.get(ed) || 0)}</b>
      <small>${ed}</small>
    </div>
  `).join("");
  el.querySelectorAll(".edicao-card").forEach((card) => {
    card.addEventListener("click", () => {
      const ed = card.dataset.edicao;
      state.edicao = state.edicao === ed ? null : ed;
      renderAll();
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Nível acadêmico (tiles)                                                 */
/* ---------------------------------------------------------------------- */
function renderNivelTiles(rows) {
  const c = countBy(rows, (r) => r.nivel);
  const items = [
    { label: "Mestrado", v: c.get("Mestrado") || 0 },
    { label: "Doutorado", v: c.get("Doutorado") || 0 },
    { label: "Graduação", v: c.get("Graduação") || 0 },
  ];
  document.getElementById("nivel-tiles").innerHTML = items.map((it) => `
    <div class="stat-tile"><b>${fmt(it.v)}</b><small>${it.label}</small></div>
  `).join("");
}

/* ---------------------------------------------------------------------- */
/* Situação da participação (meters)                                       */
/* ---------------------------------------------------------------------- */
const SITUACAO_LABELS = [
  "Recebido", "A confirmar", "Chegada prevista", "Desistente", "Em conferência – possível desligamento",
];

function renderSituacaoMeters(rows) {
  const c = countBy(rows, (r) => r.situacao);
  const total = rows.length || 1;
  document.getElementById("situacao-total").textContent = `${fmt(rows.length)} registros`;
  document.getElementById("situacao-meters").innerHTML = SITUACAO_LABELS.map((label) => {
    const v = c.get(label) || 0;
    const pct = Math.round((v / total) * 100);
    return `
      <div class="meter-row">
        <div class="meter-row__label"><span>${label}</span><b>${fmt(v)}</b></div>
        <div class="meter-track"><span style="width:${pct}%"></span></div>
      </div>`;
  }).join("");
}

/* ---------------------------------------------------------------------- */
/* Status das modalidades do modelo                                        */
/* ---------------------------------------------------------------------- */
function renderModalidadesStatus() {
  document.getElementById("modalidades-status").innerHTML = MOB_MODALIDADES.map((m) => `
    <div class="info-row">
      <span>${m.nome}${m.possui_dados === "Sim" ? "" : " · aguardando"}</span>
      <span>${fmt(m.qtd_atual)} registro${m.qtd_atual === 1 ? "" : "s"}</span>
    </div>
  `).join("");
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
  const base = MOB_ROWS.filter((r) =>
    (state.modalidade === "TODAS" || r.modalidade === state.modalidade) && r.oficial
  );
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
/* Barras horizontais genéricas (qualidade, financiamento)                 */
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
    .on("mousemove", function (ev, [k, v]) { showTooltip(ev.clientX, ev.clientY, `<b>${k}</b><br>${fmt(v)} registro${v === 1 ? "" : "s"}`); })
    .on("mouseleave", hideTooltip);

  gs.append("text").attr("class", "bar-value")
    .attr("x", width).attr("y", barY + barH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(([, v]) => fmt(v));
}

function renderQualidadeBars(rows) {
  const c = countBy(rows, (r) => r.qualidade);
  const order = ["Validado", "Parcial", "Pendente"];
  const colors = { "Validado": CAT_COLORS[2], "Parcial": CAT_COLORS[3], "Pendente": CAT_COLORS[7] };
  const entries = order.filter((k) => c.has(k)).map((k) => [k, c.get(k)]);
  renderHBars("qualidade-bars", entries, { colorFn: ([k]) => colors[k] });
}

function renderFinanciamentoBars(rows) {
  const c = countBy(rows, (r) => r.financiamento);
  const entries = topEntries(c, 8);
  renderHBars("financiamento-bars", entries, {
    colorFn: ([k]) => (k === "Não informado" ? readCssVar("--ink-muted") : CAT_COLORS[0]),
  });
}

/* ---------------------------------------------------------------------- */
/* Rankings (países, PPGs)                                                 */
/* ---------------------------------------------------------------------- */
function renderPaisRank(rows) {
  const oficiais = rows.filter((r) => r.oficial);
  const c = countBy(oficiais, (r) => r.pais);
  const entries = topEntries(c, 20);
  document.getElementById("pais-total").textContent = `${entries.length} países`;
  document.getElementById("pais-rank").innerHTML = entries.map(([pais, v], i) => `
    <div class="rank"><span class="rank__pos">${i + 1}</span><span class="rank__name">${pais}</span><span class="rank__val">${fmt(v)}</span></div>
  `).join("") || '<div class="empty-hint">Sem dados.</div>';
}

function renderPpgRank(rows) {
  const oficiais = rows.filter((r) => r.oficial && r.ppg_codigo !== "Não informado");
  const c = countBy(oficiais, (r) => r.ppg);
  const entries = topEntries(c, 20);
  document.getElementById("ppg-total").textContent = `${entries.length} PPGs`;
  document.getElementById("ppg-rank").innerHTML = entries.map(([ppg, v], i) => `
    <div class="rank"><span class="rank__pos">${i + 1}</span><span class="rank__name">${ppg}</span><span class="rank__val">${fmt(v)}</span></div>
  `).join("") || '<div class="empty-hint">Sem dados.</div>';
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

  document.getElementById("participantes-total").textContent = `${fmt(list.length)} participante${list.length === 1 ? "" : "s"} · nome no padrão ABNT`;
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
  renderSegModalidade();
  renderEdicaoStrip();
  renderStats(rows);
  renderNivelTiles(rows);
  renderSituacaoMeters(rows);
  renderModalidadesStatus();
  renderQualidadeBars(rows);
  renderFinanciamentoBars(rows);
  renderPaisRank(rows);
  renderPpgRank(rows);
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
    }, 550);
  });
  document.body.addEventListener("mouseout", (ev) => {
    const t = ev.target.closest("[data-help]");
    if (!t) return;
    clearTimeout(timer);
    if (helpEl) helpEl.classList.remove("is-visible");
  });
}
