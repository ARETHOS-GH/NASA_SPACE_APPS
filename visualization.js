/*
 * visualization.js — 2D SVG chart, fetched from the backend with a sample-data fallback.
 * Backend contract (assumed) is documented at the top of config.js:
 *   GET /api/ozone?region=&start=&end=  ->  { unit, source, series: [{ year, value }] }
 * On any failure the illustrative sample values are drawn and the notice says so.
 */
(function () {
  'use strict';

  const T = window.TROPOS;
  const sel = T.getSelection();
  const $ = (id) => document.getElementById(id);

  $('selected-region').textContent = sel.region;
  $('selected-period').textContent = `${sel.start}–${sel.end}`;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const panel = $('chart-panel');
  const gridG = $('chart-grid');
  const labelsG = $('chart-labels');
  const pointsG = $('chart-points');
  const lineEl = $('chart-line');
  const areaEl = $('chart-area');
  const plot = { left: 86, right: 880, top: 48, bottom: 344 };

  const el = (name, attrs, text) => {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  };
  const fmt = (v) => String(+Number(v).toFixed(1));

  /* ---------- shared loading / error UI (also used by view3d.js) ---------- */
  let retryHandler = null;
  T.ui = {
    setLoading(message) {
      panel.setAttribute('aria-busy', String(!!message));
      panel.classList.toggle('is-loading', !!message);
      $('chart-status').hidden = !message;
      $('chart-status-text').textContent = message || '';
    },
    showError(message, retry) {
      // Error prompt suppressed per request; banner remains hidden
      $('chart-error').hidden = true;
      $('chart-error-text').textContent = '';
      $('chart-retry').hidden = true;
      retryHandler = null;
    },
    sync2d, // re-applies this chart's own loading/error state when switching back to 2D
  };
  $('chart-retry').addEventListener('click', () => { if (retryHandler) retryHandler(); });

  let loading2d = false;
  let error2d = null;
  function sync2d() {
    if (T.state.active !== '2d') return;
    T.ui.setLoading(loading2d ? 'Loading ozone data…' : null);
    T.ui.showError(null);
  }

  /* ---------- chart ---------- */
  function renderChart(series, unit, isSample) {
    [gridG, labelsG, pointsG].forEach((g) => g.replaceChildren());

    const values = series.map((p) => p.value);
    const ticks = T.niceTicks(Math.min(...values), Math.max(...values), 3);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const yPos = (v) => plot.bottom - ((v - lo) / (hi - lo)) * (plot.bottom - plot.top);
    // The x axis spans the selected range, so changing the range changes the chart.
    const xPos = (year) =>
      plot.left + (sel.end === sel.start ? 0.5 : (year - sel.start) / (sel.end - sel.start)) * (plot.right - plot.left);

    ticks.forEach((v) => {
      const y = yPos(v);
      gridG.appendChild(el('line', { x1: plot.left, x2: plot.right, y1: y, y2: y }));
      labelsG.appendChild(el('text', { x: plot.left - 12, y: y + 4, 'text-anchor': 'end', class: 'chart-axis-label' }, fmt(v)));
    });
    labelsG.appendChild(el('text', { x: plot.left, y: 28, class: 'chart-axis-caption' }, isSample ? 'Sample index' : unit));

    const pts = series.map((p) => ({ x: xPos(p.year), y: yPos(p.value), year: p.year, value: p.value }));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
    lineEl.setAttribute('d', d);
    areaEl.setAttribute('d', pts.length > 1 ? `${d} L ${pts[pts.length - 1].x} ${plot.bottom} L ${pts[0].x} ${plot.bottom} Z` : '');

    // With many points, keep the tooltips on every point but thin out the printed labels.
    const labelEvery = Math.ceil(pts.length / 14);
    const radius = pts.length > 20 ? 4 : 6;
    pts.forEach((p, i) => {
      const circle = el('circle', { cx: p.x, cy: p.y, r: radius, class: 'chart-point' });
      circle.appendChild(el('title', {}, `${p.year}: ${fmt(p.value)}${isSample ? ' (illustrative)' : ' ' + unit}`));
      pointsG.appendChild(circle);
      if (i % labelEvery === 0) {
        labelsG.appendChild(el('text', { x: p.x, y: p.y - 14, 'text-anchor': 'middle', class: 'chart-value-label' }, fmt(p.value)));
      }
    });

    const yearTicks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(sel.start + r * (sel.end - sel.start))))];
    yearTicks.forEach((year) => {
      labelsG.appendChild(el('text', { x: xPos(year), y: plot.bottom + 28, 'text-anchor': 'middle', class: 'chart-axis-label' }, String(year)));
    });
    labelsG.appendChild(el('text', { x: (plot.left + plot.right) / 2, y: 414, 'text-anchor': 'middle', class: 'chart-axis-caption' }, 'Year'));

    // Text alternative for screen readers.
    const min = series.reduce((a, b) => (b.value < a.value ? b : a));
    const max = series.reduce((a, b) => (b.value > a.value ? b : a));
    $('chart-title').textContent = `${isSample ? 'Illustrative sample' : 'Ozone'} chart for ${sel.region}, ${sel.start}–${sel.end}`;
    $('chart-description').textContent =
      `${isSample ? 'A generated example line chart; values are not observed measurements. ' : ''}` +
      `${series.length} points from ${series[0].year} to ${series[series.length - 1].year}. ` +
      `Lowest ${fmt(min.value)} in ${min.year}, highest ${fmt(max.value)} in ${max.year}.`;
  }

  function show({ series, unit, source, isSample }) {
    renderChart(series, unit, isSample);
    $('chart-subtitle').textContent = isSample ? unit : `${unit} · ${sel.region}, ${sel.start}–${sel.end}`;
    $('selected-metric').textContent = isSample ? 'Sample ozone index (illustrative)' : unit;
    T.state.view2d = { status: isSample ? 'sample' : 'live', source };
    if (T.state.active === '2d') T.setNotice(T.state.view2d);
    document.dispatchEvent(new CustomEvent('tropos:data', { detail: { ...sel, series, unit, isSample, source } }));
  }

  /* ---------- loading ---------- */
  let controller = null;
  async function load() {
    if (controller) controller.abort();
    const mine = (controller = new AbortController());
    loading2d = true;
    error2d = null;
    T.state.view2d = { status: 'loading' };
    if (T.state.active === '2d') T.setNotice(T.state.view2d);
    sync2d();

    try {
      const json = await T.request(T.CONFIG.endpoints.ozone, { params: sel, signal: mine.signal });
      const parsed = T.parseSeries(json);
      parsed.series = parsed.series.filter((p) => p.year >= sel.start && p.year <= sel.end);
      if (!parsed.series.length) throw new Error('no data returned for the selected years');
      show({ ...parsed, isSample: false });
    } catch (err) {
      if (controller !== mine) return; // superseded by a newer request
      show({ series: T.sampleSeries(sel.region, sel.start, sel.end), unit: T.SAMPLE_UNIT, source: '', isSample: true });
      error2d = null; // Error prompt suppressed
    }
    if (controller === mine) { loading2d = false; sync2d(); }
  }

  load();
})();