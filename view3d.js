/*
 * view3d.js — 3D bar view (regions × years) plus the 2D/3D toggle.
 * Three.js r128 is loaded from cdnjs only when the user first opens the 3D view.
 *
 * Backend contract (assumed; see config.js):
 *   GET /api/ozone/grid?start=&end=
 *     -> { unit, source, years: [..], regions: [{ name, values: [..] }] }
 * If the request fails, illustrative sample data is shown and the notice says so.
 * If Three.js or WebGL is unavailable, the page stays on the 2D chart.
 *
 * Rendering is on demand (no animation loop). Bar mesh is built by hand so it
 * does not depend on newer Three.js features; it needs only position/normal/color.
 */
(function () {
  'use strict';

  const T = window.TROPOS;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const $ = (id) => document.getElementById(id);
  const sel = T.getSelection();
  const btn2d = $('view-2d');
  const btn3d = $('view-3d');
  const pane2d = $('pane-2d');
  const pane3d = $('pane-3d');
  const stage = $('view3d-stage');
  const tip = $('view3d-tip');

  const X_LEN = 12, Z_LEN = 8, BAR_H = 5; // scene size in world units, independent of data size
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (v) => String(+Number(v).toFixed(1));
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  let ready = null;
  let renderer, scene, camera, canvas, mesh, THREE_;
  let grid = null;
  let gridError = null;
  let owners = [];
  const center = { x: 0, y: 0, z: 0 };
  const view = { theta: 0.55, phi: 1.0, radius: 24 };
  const HOME = { ...view };
  let frameQueued = false;

  /* ---------- toggle ---------- */
  btn2d.addEventListener('click', () => show('2d'));
  btn3d.addEventListener('click', () => show('3d'));

  async function show(mode) {
    T.state.active = mode;
    const is3d = mode === '3d';
    btn2d.setAttribute('aria-pressed', String(!is3d));
    btn3d.setAttribute('aria-pressed', String(is3d));
    pane2d.hidden = is3d;
    pane3d.hidden = !is3d;

    if (!is3d) { T.ui.showError(null); T.ui.sync2d(); T.setNotice(T.state.view2d); return; }

    T.ui.showError(null);
    T.ui.setLoading(null);
    T.setNotice(T.state.grid);
    if (!ready) ready = init();
    try {
      await ready;
      if (T.state.active === '3d') { resize(); T.setNotice(T.state.grid); }
    } catch (err) {
      ready = null; // clicking "3D view" again retries
      if (err.code === 'NO_WEBGL') { btn3d.disabled = true; btn3d.title = err.message; }
      show('2d');
      T.ui.showError(`3D view unavailable (${err.message}). Showing the 2D chart.`, null);
    }
  }

  async function init() {
    T.ui.setLoading('Loading 3D view…');
    try {
      await loadThree();
      THREE_ = window.THREE;
      if (!webglOk()) throw Object.assign(new Error('WebGL is not available in this browser'), { code: 'NO_WEBGL' });
      createRenderer();
      if (document.fonts && document.fonts.ready) await document.fonts.ready; // so labels use Roboto Mono
      await refreshGrid();
    } finally {
      if (T.state.active === '3d') T.ui.setLoading(null); else T.ui.sync2d();
    }
  }

  function loadThree() {
    if (window.THREE) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => reject(new Error('could not load the Three.js library'));
      document.head.appendChild(s);
    });
  }
  function webglOk() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch { return false; }
  }

  /* ---------- data ---------- */
  async function fetchGrid() {
    gridError = null;
    try {
      const g = T.parseGrid(await T.request(T.CONFIG.endpoints.grid, { params: { start: sel.start, end: sel.end } }));
      g.isSample = false;
      T.state.grid = { status: 'live', source: g.source };
      return g;
    } catch (err) {
      const g = T.sampleGrid(sel.start, sel.end);
      g.isSample = true;
      T.state.grid = { status: 'sample' };
      gridError = `Couldn't load regional data (${err.message}). The 3D view is showing illustrative sample data.`;
      return g;
    }
  }
  async function refreshGrid() {
    T.ui.setLoading('Loading regional data…');
    grid = await fetchGrid();
    build(grid);
    if (T.state.active === '3d') {
      T.ui.setLoading(null);
      T.ui.showError(gridError, gridError ? refreshGrid : null);
      T.setNotice(T.state.grid);
      resize();
    }
  }

  /* ---------- scene ---------- */
  function createRenderer() {
    renderer = new THREE_.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    canvas = renderer.domElement;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-labelledby', 'view3d-desc');
    canvas.setAttribute('aria-describedby', 'view3d-help');
    stage.insertBefore(canvas, stage.firstChild);

    scene = new THREE_.Scene();
    camera = new THREE_.PerspectiveCamera(40, 1, 0.1, 200);
    scene.add(new THREE_.AmbientLight(0xffffff, 0.65));
    const sun = new THREE_.DirectionalLight(0xffffff, 0.55);
    sun.position.set(6, 12, 8);
    scene.add(sun);

    bindControls();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
  }

  function disposeObject(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }

  function makeLabel(text, { color = '#ffffff', height = 0.5, ax = 0.5, ay = 0.5 } = {}) {
    const fontPx = 48;
    const font = `700 ${fontPx}px "Roboto Mono", monospace`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 8;
    const h = fontPx + 16;
    c.width = w; c.height = h;
    g.font = font; g.fillStyle = color; g.textBaseline = 'middle';
    g.fillText(text, 4, h / 2);
    const tex = new THREE_.CanvasTexture(c);
    tex.minFilter = THREE_.LinearFilter;
    const sprite = new THREE_.Sprite(new THREE_.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.center.set(ax, ay);
    sprite.scale.set((height * w) / h, height, 1);
    return sprite;
  }

  function build(g) {
    scene.children.filter((o) => o.userData.dynamic).forEach((o) => { scene.remove(o); disposeObject(o); });
    mesh = null;
    owners = [];

    const nx = g.years.length, nr = g.regions.length;
    const all = g.regions.flatMap((r) => r.values).filter((v) => v !== null);
    if (!all.length) throw new Error('no values to plot');
    const ticks = T.niceTicks(Math.min(...all), Math.max(...all), 4);
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const dx = nx > 1 ? X_LEN / (nx - 1) : 2;
    const dz = nr > 1 ? Z_LEN / (nr - 1) : 2;
    const bw = dx * 0.78, bd = dz * 0.78;
    const xMax = (nx - 1) * dx, zMax = (nr - 1) * dz;
    const xl = -dx / 2, xr = xMax + dx / 2, zb = -dz / 2, zf = zMax + dz / 2;
    const yOf = (v) => ((v - lo) / (hi - lo)) * BAR_H;
    const selIdx = g.regions.findIndex((r) => r.name.toLowerCase() === sel.region.toLowerCase());
    const group = new THREE_.Group();
    group.userData.dynamic = true;

    // Bars: one merged mesh, 5 faces (10 triangles) per bar; the top and four sides are visible from above.
    const pos = [], nor = [], col = [], idx = [];
    let v0 = 0;
    const face = (corners, n, c) => {
      corners.forEach((p) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(c.r, c.g, c.b); });
      idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      v0 += 4;
    };
    const cLow = new THREE_.Color('#27388f'), cHigh = new THREE_.Color('#8da2ff'), cSel = new THREE_.Color('#67d9ff');
    g.regions.forEach((reg, r) => reg.values.forEach((val, c) => {
      if (val === null) return;
      const h = Math.max(0.03, yOf(val));
      const x0 = c * dx - bw / 2, x1 = x0 + bw, z0 = r * dz - bd / 2, z1 = z0 + bd;
      const color = r === selIdx ? cSel : cLow.clone().lerp(cHigh, (val - lo) / (hi - lo));
      face([[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0]], [0, 1, 0], color);
      face([[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], color);
      face([[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], color);
      face([[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1]], [1, 0, 0], color);
      face([[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], color);
      owners.push({ r, c });
    }));
    const geo = new THREE_.BufferGeometry();
    geo.setAttribute('position', new THREE_.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE_.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE_.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    mesh = new THREE_.Mesh(geo, new THREE_.MeshLambertMaterial({ vertexColors: true }));
    group.add(mesh);

    // Floor and value guide lines on the back and left walls.
    const floor = new THREE_.Mesh(
      new THREE_.PlaneGeometry(xr - xl, zf - zb),
      new THREE_.MeshBasicMaterial({ color: 0x101a4a, transparent: true, opacity: 0.6, side: THREE_.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((xl + xr) / 2, -0.01, (zb + zf) / 2);
    group.add(floor);

    const gp = [];
    ticks.forEach((t) => { const y = yOf(t); gp.push(xl, y, zb, xr, y, zb, xl, y, zb, xl, y, zf); });
    const gg = new THREE_.BufferGeometry();
    gg.setAttribute('position', new THREE_.Float32BufferAttribute(gp, 3));
    group.add(new THREE_.LineSegments(gg, new THREE_.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })));

    // Labels (sprites always face the camera, so they stay readable while rotating).
    const put = (sprite, x, y, z) => { sprite.position.set(x, y, z); group.add(sprite); };
    ticks.forEach((t) => put(makeLabel(fmt(t), { ax: 0, height: 0.5 }), xr + 0.25, yOf(t), zb));
    put(makeLabel(short(g.isSample ? 'Sample index' : g.unit, 18), { ax: 0, color: '#67d9ff', height: 0.5 }), xr + 0.25, BAR_H + 0.8, zb);
    g.regions.forEach((reg, r) =>
      put(makeLabel(short(reg.name, 18), { ax: 1, height: 0.4, color: r === selIdx ? '#67d9ff' : '#ffffff' }), xl - 0.25, 0.1, r * dz));
    put(makeLabel('Region', { ax: 1, height: 0.45, color: '#67d9ff' }), xl - 0.25, 0.1, zb - 0.7);
    const yearIdx = nx <= 8 ? g.years.map((_, i) => i) : [...new Set([0, 1, 2, 3, 4, 5].map((i) => Math.round((i * (nx - 1)) / 5)))];
    yearIdx.forEach((i) => put(makeLabel(String(g.years[i]), { ay: 1, height: 0.45 }), i * dx, 0, zf + 0.3));
    put(makeLabel('Year', { ay: 1, height: 0.45, color: '#67d9ff' }), xMax / 2, 0, zf + 1.4);

    scene.add(group);
    center.x = xMax / 2; center.y = BAR_H / 3; center.z = zMax / 2;

    renderDescription(g, lo, hi, selIdx);
    renderTable(g);
    render();
  }

  /* ---------- text equivalents ---------- */
  function renderDescription(g, lo, hi, selIdx) {
    let max = null, min = null;
    g.regions.forEach((reg) => reg.values.forEach((v, i) => {
      if (v === null) return;
      if (!max || v > max.v) max = { v, region: reg.name, year: g.years[i] };
      if (!min || v < min.v) min = { v, region: reg.name, year: g.years[i] };
    }));
    let text = `3D bar chart of ${g.isSample ? 'a sample ozone index' : g.unit} by region and year, ${g.years[0]}–${g.years[g.years.length - 1]}. ` +
      `Rows are regions, columns are years, and bar height is the value on an axis from ${fmt(lo)} to ${fmt(hi)}. `;
    if (selIdx >= 0) {
      const vals = g.regions[selIdx].values;
      const first = vals.findIndex((v) => v !== null);
      let last = -1;
      vals.forEach((v, i) => { if (v !== null) last = i; });
      if (first >= 0) text += `Cyan bars show ${g.regions[selIdx].name}, which goes from ${fmt(vals[first])} in ${g.years[first]} to ${fmt(vals[last])} in ${g.years[last]}. `;
    }
    text += `Highest value: ${fmt(max.v)} (${max.region}, ${max.year}). Lowest value: ${fmt(min.v)} (${min.region}, ${min.year}).`;
    if (g.isSample) text += ' These are generated sample values, not real measurements.';
    $('view3d-desc').textContent = text;
  }

  function renderTable(g) {
    const wrap = $('view3d-table');
    wrap.replaceChildren();
    const table = document.createElement('table');
    table.className = 'data-table';
    table.createCaption().textContent = `${g.isSample ? 'Sample ozone index (illustrative)' : g.unit} by region and year`;
    const head = table.createTHead().insertRow();
    const th0 = document.createElement('th');
    th0.scope = 'col'; th0.textContent = 'Region';
    head.append(th0);
    g.years.forEach((y) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = y; head.append(th); });
    const body = table.createTBody();
    g.regions.forEach((reg) => {
      const row = body.insertRow();
      const th = document.createElement('th');
      th.scope = 'row'; th.textContent = reg.name;
      row.append(th);
      reg.values.forEach((v) => { row.insertCell().textContent = v === null ? '—' : fmt(v); });
    });
    wrap.append(table);
  }

  /* ---------- camera, sizing, rendering ---------- */
  function placeCamera() {
    const sp = Math.sin(view.phi);
    camera.position.set(
      center.x + view.radius * sp * Math.sin(view.theta),
      center.y + view.radius * Math.cos(view.phi),
      center.z + view.radius * sp * Math.cos(view.theta)
    );
    camera.lookAt(center.x, center.y, center.z);
  }
  function render() {
    if (frameQueued || !renderer) return;
    frameQueued = true;
    requestAnimationFrame(() => {
      frameQueued = false;
      if (pane3d.hidden) return;
      placeCamera();
      renderer.render(scene, camera);
    });
  }
  function resize() {
    if (!renderer || pane3d.hidden) return;
    const w = stage.clientWidth;
    if (!w) return;
    const h = w < 700 ? Math.round(Math.max(300, w * 0.8)) : Math.round(Math.min(520, w * 0.55)); // same 700px breakpoint as the CSS
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  /* ---------- interaction ---------- */
  function rotate(dTheta, dPhi) { view.theta += dTheta; view.phi = clamp(view.phi + dPhi, 0.25, 1.45); render(); }
  function zoom(factor) { view.radius = clamp(view.radius * factor, 10, 40); render(); }
  function reset() { Object.assign(view, HOME); render(); }

  function bindControls() {
    $('v3-left').addEventListener('click', () => rotate(-0.2, 0));
    $('v3-right').addEventListener('click', () => rotate(0.2, 0));
    $('v3-in').addEventListener('click', () => zoom(0.85));
    $('v3-out').addEventListener('click', () => zoom(1 / 0.85));
    $('v3-reset').addEventListener('click', reset);

    canvas.addEventListener('keydown', (e) => {
      const actions = {
        ArrowLeft: () => rotate(-0.12, 0), ArrowRight: () => rotate(0.12, 0),
        ArrowUp: () => rotate(0, -0.08), ArrowDown: () => rotate(0, 0.08),
        '+': () => zoom(0.9), '=': () => zoom(0.9), '-': () => zoom(1 / 0.9), _: () => zoom(1 / 0.9), 0: reset,
      };
      if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
    });

    // Pointer drag rotates; two pointers (pinch) zoom. touch-action: pan-y in CSS keeps vertical page scrolling working on phones.
    const pointers = new Map();
    let moved = 0;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      tip.hidden = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') showTip(e); return; }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (after > 0) zoom(before / after);
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX; p.y = e.clientY;
      rotate(-dx * 0.008, e.pointerType === 'mouse' ? -dy * 0.006 : 0);
    });
    const end = (e) => {
      if (pointers.has(e.pointerId) && pointers.size === 1 && moved < 6 && e.type === 'pointerup') showTip(e); // tap
      pointers.delete(e.pointerId);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
  }

  const ray = { caster: null, ndc: null };
  function showTip(e) {
    if (!mesh) return;
    if (!ray.caster) { ray.caster = new THREE_.Raycaster(); ray.ndc = new THREE_.Vector2(); }
    const r = canvas.getBoundingClientRect();
    ray.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.caster.setFromCamera(ray.ndc, camera);
    const hit = ray.caster.intersectObject(mesh)[0];
    const owner = hit && owners[Math.floor(hit.faceIndex / 10)]; // 10 triangles per bar
    if (!owner) { tip.hidden = true; return; }
    const reg = grid.regions[owner.r];
    tip.textContent = `${reg.name}, ${grid.years[owner.c]}: ${fmt(reg.values[owner.c])}${grid.isSample ? ' (illustrative)' : ''}`;
    tip.hidden = false;
    const s = stage.getBoundingClientRect();
    tip.style.left = clamp(e.clientX - s.left + 12, 4, Math.max(4, s.width - tip.offsetWidth - 4)) + 'px';
    tip.style.top = e.clientY - s.top + 12 + 'px';
  }
})();