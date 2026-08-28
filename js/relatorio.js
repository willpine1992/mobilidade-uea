/* Relatório — tabelas estáticas geradas a partir do recorte de filtros
   ativo no Painel (lido de localStorage, mesma chave usada por index.html
   e flowmap.html). Dados: js/data.js (MOB_ROWS) — sem PII, exceto Nome_ABNT
   (citação acadêmica, já autorizado para divulgação pública). */

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
  refreshThemeColors();
  buildReport();
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

const EDICAO_ORDER = ["2022-2023", "2023-2024", "2024-2025", "2025-2026", "2026"];

function fmt(n) { return (n || 0).toLocaleString("pt-BR"); }

/* ---------------------------------------------------------------------- */
/* Filtros ativos (definidos no Painel) — mesma chave de localStorage      */
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
function activeFilterChips() {
  const chips = [];
  if (state.modalidade !== "TODAS") chips.push(`${FILTER_LABELS.modalidade}: ${state.modalidade}`);
  if (state.ppg) {
    const row = MOB_ROWS.find((r) => r.ppg_codigo === state.ppg);
    chips.push(`${FILTER_LABELS.ppg}: ${row ? row.ppg : state.ppg}`);
  }
  if (state.pais) {
    const row = MOB_ROWS.find((r) => r.iso2 === state.pais);
    chips.push(`${FILTER_LABELS.pais}: ${row ? row.pais : state.pais}`);
  }
  if (state.continente) chips.push(`${FILTER_LABELS.continente}: ${state.continente}`);
  if (state.situacao) chips.push(`${FILTER_LABELS.situacao}: ${state.situacao}`);
  if (state.financiamento) chips.push(`${FILTER_LABELS.financiamento}: ${state.financiamento}`);
  if (state.nivel) chips.push(`${FILTER_LABELS.nivel}: ${state.nivel}`);
  if (state.sexo) chips.push(`${FILTER_LABELS.sexo}: ${state.sexo}`);
  if (state.fluxo) chips.push(`${FILTER_LABELS.fluxo}: ${state.fluxo}`);
  if (state.tipo) chips.push(`${FILTER_LABELS.tipo}: ${state.tipo}`);
  return chips;
}

function countBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) { const k = keyFn(item); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
function topEntries(map, n) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); }

/* ---------------------------------------------------------------------- */
/* Construção das tabelas                                                  */
/* ---------------------------------------------------------------------- */
function table(el, headers, rows, numCols = []) {
  if (!rows.length) { el.innerHTML = '<tbody><tr><td class="empty-hint">Sem dados no recorte atual.</td></tr></tbody>'; return; }
  const thead = `<thead><tr>${headers.map((h, i) => `<th${numCols.includes(i) ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
  el.innerHTML = thead + tbody;
}

/* ---------------------------------------------------------------------- */
/* Mapa de países de origem (mesmo desenho de index.html)                  */
/* ---------------------------------------------------------------------- */
const PT_TO_EN_COUNTRY = {
  "Peru": "Peru", "Moçambique": "Mozambique", "Angola": "Angola", "Colômbia": "Colombia",
  "Haiti": "Haiti", "Guiné-Bissau": "Guinea-Bissau", "República Dominicana": "Dominican Rep.",
  "Equador": "Ecuador", "México": "Mexico", "Benim": "Benin", "Nigéria": "Nigeria",
  "Timor-Leste": "Timor-Leste", "Etiópia": "Ethiopia", "Honduras": "Honduras", "Itália": "Italy",
};

let _worldCache = null;
async function getWorld() {
  if (!_worldCache) {
    const topo = await fetch("lib/countries-110m.json").then((r) => r.json());
    _worldCache = topojson.feature(topo, topo.objects.countries);
  }
  return _worldCache;
}

async function renderMap(oficiais) {
  const el = document.getElementById("map-container");
  if (!el) return;
  const width = el.clientWidth, height = el.clientHeight;
  if (width < 10 || height < 10) return;

  const world = await getWorld();
  const counts = countBy(oficiais, (r) => r.pais);
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
    .data(world.features).join("path")
    .attr("class", "map-country").attr("d", path)
    .attr("fill", (d) => { const v = countryNameToCount.get(d.properties.name); return v ? colorScale(v) : CHART_MAP_FILL; })
    .attr("stroke", CHART_MAP_BORDER).attr("stroke-width", 0.6)
    .on("mousemove", (ev, d) => {
      const v = countryNameToCount.get(d.properties.name);
      if (!v) return;
      showTooltip(ev.clientX, ev.clientY, `<b>${d.properties.name}</b><br>${fmt(v)} estudante${v === 1 ? "" : "s"}`);
    })
    .on("mouseleave", hideTooltip);

  const legendEl = document.getElementById("map-legend-swatches");
  if (legendEl) legendEl.innerHTML = GREEN_SEQUENTIAL.map((c) => `<span style="background:${c}"></span>`).join("");
}

/* ---------------------------------------------------------------------- */
/* Evolução por edição (mesmo desenho de index.html)                       */
/* ---------------------------------------------------------------------- */
function renderEvolucaoChart(oficiais) {
  const el = document.getElementById("evolucao-chart");
  if (!el) return;
  const width = el.clientWidth, height = el.clientHeight;
  d3.select(el).selectAll("*").remove();
  if (width < 10 || height < 10) return;

  const edicoes = EDICAO_ORDER.filter((ed) => oficiais.some((r) => r.edicao === ed));
  const niveis = ["Mestrado", "Doutorado", "Graduação"];
  const nivelColor = { "Mestrado": CAT_COLORS[0], "Doutorado": CAT_COLORS[2], "Graduação": CAT_COLORS[3] };

  const legendEl = document.getElementById("evolucao-legend");
  if (legendEl) {
    legendEl.innerHTML = niveis.map((niv) => `
      <div class="flow-legend__item"><span class="flow-legend__swatch" style="background:${nivelColor[niv]}; width:10px; height:10px; border-radius:3px;"></span>${niv}</div>
    `).join("");
  }

  const data = edicoes.map((ed) => {
    const rs = oficiais.filter((r) => r.edicao === ed);
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
  let acumulado = 0;
  for (const d of data) { acumulado += d.total; d.acumulado = acumulado; }

  const margin = { top: 14, right: 46, bottom: 26, left: 40 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxTotal = d3.max(data, (d) => d.total) || 1;
  const maxAcumulado = d3.max(data, (d) => d.acumulado) || 1;
  const lineColor = readCssVar("--ink-primary");

  const x = d3.scaleBand().domain(edicoes).range([0, innerW]).padding(0.32);
  const y = d3.scaleLinear().domain([0, maxTotal]).nice().range([innerH, 0]);
  const yRight = d3.scaleLinear().domain([0, maxAcumulado]).nice().range([innerH, 0]);

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

  g.append("text")
    .attr("class", "bar-label").attr("fill", readCssVar("--ink-muted"))
    .attr("transform", `translate(${-margin.left + 10},${innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text("Alunos por edição");

  g.append("g")
    .attr("transform", `translate(${innerW},0)`)
    .call(d3.axisRight(yRight).ticks(4).tickSize(0))
    .call((sel) => sel.select(".domain").attr("stroke", readCssVar("--border-hairline")))
    .selectAll("text").attr("class", "bar-label").attr("fill", lineColor);

  g.append("text")
    .attr("class", "bar-label").attr("fill", lineColor)
    .attr("transform", `translate(${innerW + margin.right - 10},${innerH / 2}) rotate(90)`)
    .attr("text-anchor", "middle")
    .text("Total de alunos participantes");

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
      .on("mousemove", function (ev, d) {
        showTooltip(ev.clientX, ev.clientY, `<b>${d.edicao}</b><br>${niv}: ${fmt(d[niv].v)}<br>Total oficial: ${fmt(d.total)}<br>Acumulado: ${fmt(d.acumulado)}`);
      })
      .on("mouseleave", hideTooltip);
  }

  const lineGen = d3.line()
    .x((d) => x(d.edicao) + x.bandwidth() / 2)
    .y((d) => yRight(d.acumulado));

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", lineColor)
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "3 3")
    .attr("d", lineGen);

  g.selectAll("circle.acumulado").data(data).join("circle")
    .attr("class", "acumulado")
    .attr("cx", (d) => x(d.edicao) + x.bandwidth() / 2)
    .attr("cy", (d) => yRight(d.acumulado))
    .attr("r", 3.5)
    .attr("fill", lineColor)
    .on("mousemove", function (ev, d) {
      showTooltip(ev.clientX, ev.clientY, `<b>${d.edicao}</b><br>Total acumulado: ${fmt(d.acumulado)} aluno${d.acumulado === 1 ? "" : "s"}`);
    })
    .on("mouseleave", hideTooltip);
}

function buildReport() {
  const rows = MOB_ROWS.filter(matchRow);
  const oficiais = rows.filter((r) => r.oficial);

  renderMap(oficiais);
  renderEvolucaoChart(oficiais);

  // cabeçalho
  const chips = activeFilterChips();
  document.getElementById("report-meta").innerHTML = `
    Gerado em <strong>${new Date().toLocaleString("pt-BR")}</strong><br>
    Filtros aplicados: <strong>${chips.length ? chips.join(" · ") : "nenhum (todos os registros)"}</strong>
  `;

  // KPIs
  const recebidos = rows.filter((r) => r.recebido).length;
  const pctRecebidos = oficiais.length ? Math.round((recebidos / oficiais.length) * 1000) / 10 : 0;
  const paises = new Set(oficiais.map((r) => r.iso2)).size;
  const ppgs = new Set(oficiais.filter((r) => r.ppg_codigo !== "Não informado").map((r) => r.ppg_codigo)).size;
  document.getElementById("report-kpis").innerHTML = `
    <div class="stat-tile"><b>${fmt(rows.length)}</b><small>Cadastrados</small></div>
    <div class="stat-tile"><b>${fmt(oficiais.length)}</b><small>Total oficial</small></div>
    <div class="stat-tile"><b>${fmt(recebidos)}</b><small>Recebidos</small></div>
    <div class="stat-tile"><b>${pctRecebidos.toLocaleString("pt-BR")}%</b><small>% recebidos</small></div>
    <div class="stat-tile"><b>${fmt(paises)}</b><small>Países de origem</small></div>
    <div class="stat-tile"><b>${fmt(ppgs)}</b><small>PPGs envolvidos</small></div>
  `;

  // por modalidade
  const modCounts = countBy(rows, (r) => r.modalidade);
  table(document.getElementById("tbl-modalidade"), ["Programa", "Registros"],
    MOB_MODALIDADES.map((m) => [m.nome + (m.possui_dados === "Sim" ? "" : " (aguardando dados)"), fmt(modCounts.get(m.programa) || 0)]),
    [1]);

  // por país
  const paisRows = oficiais.filter((r) => r.iso2);
  const paisCounts = countBy(paisRows, (r) => r.iso2);
  const nameByIso = new Map(paisRows.map((r) => [r.iso2, r.pais]));
  const contByIso = new Map(paisRows.map((r) => [r.iso2, r.continente]));
  table(document.getElementById("tbl-pais"), ["País", "Continente", "Estudantes"],
    topEntries(paisCounts, 50).map(([iso, v]) => [nameByIso.get(iso), contByIso.get(iso), fmt(v)]),
    [2]);

  // por ppg
  const ppgRows = oficiais.filter((r) => r.ppg_codigo !== "Não informado");
  const ppgCounts = countBy(ppgRows, (r) => r.ppg_codigo);
  const ppgName = new Map(ppgRows.map((r) => [r.ppg_codigo, r.ppg]));
  table(document.getElementById("tbl-ppg"), ["Sigla", "Programa", "Estudantes"],
    topEntries(ppgCounts, 50).map(([codigo, v]) => [codigo, ppgName.get(codigo), fmt(v)]),
    [2]);

  // por nível
  const nivelCounts = countBy(rows, (r) => r.nivel);
  table(document.getElementById("tbl-nivel"), ["Nível acadêmico", "Total"],
    topEntries(nivelCounts, 10), [1]);

  // por gênero
  const generoRows = rows.filter((r) => r.sexo);
  const generoCounts = countBy(generoRows, (r) => r.sexo);
  const totalGenero = generoRows.length || 1;
  table(document.getElementById("tbl-genero"), ["Gênero", "Total", "%"],
    topEntries(generoCounts, 10).map(([k, v]) => [k, fmt(v), `${Math.round((v / totalGenero) * 100)}%`]),
    [1, 2]);

  // por situação
  const situacaoCounts = countBy(rows, (r) => r.situacao);
  table(document.getElementById("tbl-situacao"), ["Situação", "Total"],
    topEntries(situacaoCounts, 10), [1]);

  // por financiamento
  const financiamentoCounts = countBy(rows, (r) => r.financiamento);
  table(document.getElementById("tbl-financiamento"), ["Fonte de financiamento", "Total"],
    topEntries(financiamentoCounts, 10), [1]);

  // por continente
  const continenteCounts = countBy(oficiais, (r) => r.continente);
  table(document.getElementById("tbl-continente"), ["Continente", "Total"],
    topEntries(continenteCounts, 10), [1]);

  // participantes
  const participantes = rows.filter((r) => r.nome_abnt).slice().sort((a, b) => a.nome_abnt.localeCompare(b.nome_abnt, "pt-BR"));
  table(document.getElementById("tbl-participantes"), ["Nome (ABNT)", "País", "Edição", "Programa", "PPG", "Nível", "Situação"],
    participantes.map((r) => [r.nome_abnt, r.pais, r.edicao, r.modalidade, r.ppg_codigo === "Não informado" ? "—" : r.ppg_codigo, r.nivel, r.situacao]),
    []);
}

document.addEventListener("DOMContentLoaded", () => {
  loadFiltersFromStorage();
  initThemeToggle();
  buildReport();
  const exportBtn = document.getElementById("export-pdf-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => window.print());
});
