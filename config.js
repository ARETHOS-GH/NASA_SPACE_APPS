/*
 * config.js — shared settings and helpers for visualization.html.
 *
 * BACKEND ASSUMPTIONS (placeholders: change the paths or response shapes here
 * and in the small parse* functions below if your backend differs):
 *
 *   GET  {API_BASE}/api/ozone?region=<name>&start=<year>&end=<year>
 *        -> { region, start, end, unit, source, series: [{ year, value }] }
 *
 *   GET  {API_BASE}/api/ozone/grid?start=<year>&end=<year>        (3D view)
 *        -> { unit, source, years: [1980, ...],
 *             regions: [{ name, values: [...] }] }   values[i] matches years[i]; null = no data
 *
 *   POST {API_BASE}/api/chat                                     (chat.js)
 *        body:  { message, context: { region, start, end, dataSource },
 *                 history: [{ role: "user" | "assistant", content }] }
 *        -> { reply: "text" }
 *
 * API_BASE '' means "same origin as this page". If your API is elsewhere,
 * set e.g. 'https://api.example.com' (and enable CORS on the backend).
 */
(function () {
  'use strict';

  const CONFIG = {
    API_BASE: '',
    endpoints: { ozone: '/api/ozone', grid: '/api/ozone/grid', chat: '/api/chat' },
    timeoutMs: 12000,
  };

  // Matches the options in region.html. Used only for the illustrative 3D fallback.
  const REGION_NAMES = [
    'Global', 'North America', 'Central America and the Caribbean', 'South America',
    'Europe', 'North Africa', 'Sub-Saharan Africa', 'Middle East', 'Central Asia',
    'South Asia', 'East Asia', 'Southeast Asia', 'Oceania', 'Antarctica',
  ];
  const SAMPLE_UNIT = 'Relative sample index (0–60)';

  // Page state shared between scripts. status: idle | loading | sample | live
  const state = { active: '2d', view2d: { status: 'loading' }, grid: { status: 'idle' } };

  /* ---------- selection (same URL contract as region.js) ---------- */
  function getSelection() {
    const params = new URLSearchParams(window.location.search);
    const year = (value, fallback) => {
      const y = Number(value);
      return Number.isInteger(y) && y >= 1980 && y <= 2026 ? y : fallback;
    };
    let start = year(params.get('start'), 1980);
    let end = year(params.get('end'), 2026);
    if (start > end) [start, end] = [end, start];
    return { region: params.get('region') || 'Global', start, end };
  }

  /* ---------- network ---------- */
  async function request(path, { method = 'GET', params, body, timeoutMs = CONFIG.timeoutMs, signal } = {}) {
    const url = new URL(CONFIG.API_BASE + path, window.location.href);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
    if (signal) signal.addEventListener('abort', () => ctrl.abort('cancelled'), { once: true });
    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('server responded ' + res.status);
      try { return await res.json(); } catch { throw new Error('server returned an unexpected response'); }
    } catch (err) {
      if (ctrl.signal.aborted) throw new Error(ctrl.signal.reason === 'cancelled' ? 'cancelled' : 'the request timed out');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseSeries(json) {
    const rows = json && Array.isArray(json.series) ? json.series : null;
    if (!rows) throw new Error('response had no "series" array');
    const series = rows
      .filter((r) => r && r.value != null)
      .map((r) => ({ year: Number(r.year), value: Number(r.value) }))
      .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.value))
      .sort((a, b) => a.year - b.year);
    if (!series.length) throw new Error('no data returned for this region and period');
    return { series, unit: json.unit || 'Ozone', source: json.source || '' };
  }

  function parseGrid(json) {
    const years = json && Array.isArray(json.years) ? json.years.map(Number) : null;
    const regions = json && Array.isArray(json.regions) ? json.regions : null;
    if (!years || !years.length || !years.every(Number.isFinite) || !regions || !regions.length) {
      throw new Error('response had no valid "years" and "regions" arrays');
    }
    return {
      unit: json.unit || 'Ozone',
      source: json.source || '',
      years,
      regions: regions.map((r) => ({
        name: String(r.name),
        values: years.map((_, i) => {
          const v = r.values && r.values[i];
          return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
        }),
      })),
    };
  }

  /* ---------- illustrative fallback data (deterministic, so 2D and 3D agree) ---------- */
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function sampleValue(region, year) {
    const base = 15 + hash01(region + ':base') * 25;
    const slope = 0.1 + hash01(region + ':slope') * 0.3;
    const wobble = (hash01(region + ':' + year) - 0.5) * 8;
    return Math.round(Math.min(58, Math.max(2, base + slope * (year - 1980) + wobble)) * 10) / 10;
  }
  function pickYears(start, end, max) {
    const span = end - start + 1;
    if (span <= max) return Array.from({ length: span }, (_, i) => start + i);
    const out = [];
    for (let i = 0; i < max; i++) {
      const y = Math.round(start + (i * (end - start)) / (max - 1));
      if (out[out.length - 1] !== y) out.push(y);
    }
    return out;
  }
  function sampleSeries(region, start, end) {
    return pickYears(start, end, 9).map((year) => ({ year, value: sampleValue(region, year) }));
  }
  function sampleGrid(start, end) {
    const years = pickYears(start, end, 12);
    return {
      unit: SAMPLE_UNIT, source: '', years,
      regions: REGION_NAMES.map((name) => ({ name, values: years.map((y) => sampleValue(name, y)) })),
    };
  }

  /* ---------- small helpers ---------- */
  function niceTicks(min, max, target = 4) {
    if (min === max) { min -= 1; max += 1; }
    const rough = (max - min) / target;
    const p = Math.pow(10, Math.floor(Math.log10(rough)));
    const f = rough / p;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  // Keeps the notice truthful for whichever data is currently on screen.
  function setNotice(s) {
    const el = document.getElementById('data-notice');
    if (!el) return;
    el.replaceChildren();
    if (!s || s.status === 'loading' || s.status === 'idle') { el.textContent = 'Loading data…'; return; }
    const strong = document.createElement('strong');
    let text;
    if (s.status === 'sample') {
      strong.textContent = 'Sample data only:';
      text = ' These generated values are illustrative, not real measurements or NASA observations.';
    } else {
      strong.textContent = 'Data source:';
      text = ' ' + (s.source || 'Tropos backend') + '. Values are shown as returned by the backend for the selected region and period.';
    }
    el.append(strong, document.createTextNode(text));
  }

  window.TROPOS = {
    CONFIG, REGION_NAMES, SAMPLE_UNIT, state,
    getSelection, request, parseSeries, parseGrid,
    sampleSeries, sampleGrid, niceTicks, setNotice,
  };
})();