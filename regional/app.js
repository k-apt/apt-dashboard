/* REGIONAL 41 — 지방 41개 구·군 부동산 데이터 랩 */
(function () {
'use strict';

const C = window.CORE, L = window.LISTINGS;
const M = C.meta, SGG = C.sgg, CITIES = C.cities, YEARS = M.years;
const COUNT = M.counts;
let TX = window.TXONLY || [];          // 실거래 전용 단지(지연 로드)
const SGGI = new Map(SGG.map((r, i) => [r.s, i]));
const CIDX = new Map(CITIES.map(c => [c.n, c]));

/* ── 유틸 ─────────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('ko-KR');
const eok = v => (v == null) ? '—' : (v / 10000).toFixed(2) + '억';
const pct = v => (v == null) ? '—' : v.toFixed(1) + '%';
const sgn = v => (v == null) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function cv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function colorCity(cityName) {
  const c = CIDX.get(cityName); return c ? cv('--c-' + c.k) : cv('--acc');
}
function svgEl(tag, a) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
}
function txtEl(x, y, s, a) {
  const t = svgEl('text', Object.assign({ x: x, y: y, fill: cv('--sub'), 'font-size': 10 }, a || {}));
  t.textContent = s; return t;
}
function cityOfSgg(s) {
  for (let i = 0; i < CITIES.length; i++) { const c = CITIES[i].n; if (s.indexOf(c) === 0) return c; }
  return null;
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400);
}

/* ── 상태 ─────────────────────────────────────────────── */
const S = {
  city: 'all', sel: new Set(),
  tier: new Set(), area: new Set(), price: new Set(),
  series: 'mmed', rank: 'mmed', rankTable: false, scatter: 'cx',
  cxSort: 'mmed', q: '', page: 1, opened: null, rankAll: false,
};
const TIERS = [{ k: 0, l: '1~299' }, { k: 1, l: '300~999' }, { k: 2, l: '1,000+' }];
const AREAS = [{ k: 0, l: '60㎡↓' }, { k: 1, l: '60~85' }, { k: 2, l: '85~102' }, { k: 3, l: '102㎡↑' }];
const PRICES = [
  { k: 0, l: '3억↓', lo: -1, hi: 30000 },
  { k: 1, l: '3~5억', lo: 30000, hi: 50000 },
  { k: 2, l: '5~7억', lo: 50000, hi: 70000 },
  { k: 3, l: '7~10억', lo: 70000, hi: 100000 },
  { k: 4, l: '10억↑', lo: 100000, hi: 1e9 },
];

/* ── 단지 접근자 ──────────────────────────────────────── */
const F = { sgg: 0, dong: 1, name: 2, hh: 3, tier: 4, ap: 5, mn: 6, mmed: 7, mmin: 8, mmax: 9,
  jn: 10, jmed: 11, ratio: 12, tx: 13, gap: 14, txjr: 15, diff: 16, match: 17, bands: 18, src: 19 };
function areaBand(a) {
  if (!a || a <= 0) return null;
  return a < 60 ? 0 : a < 85 ? 1 : a < 102 ? 2 : 3;
}
function priceOf(r) {
  if (r[F.mmed] != null) return r[F.mmed];
  if (r[F.tx] && r[F.tx][1] != null) return r[F.tx][1];
  return null;
}
function inScope(s) {
  if (S.city !== 'all' && cityOfSgg(s) !== S.city) return false;
  if (S.sel.size && !S.sel.has(s)) return false;
  return true;
}
function cxOk(r) {
  if (S.tier.size && !S.tier.has(r[F.tier])) return false;
  if (S.area.size) {
    if (r[F.bands] && r[F.bands].length) {
      if (!r[F.bands].some(b => S.area.has(b[0]))) return false;
    } else {
      const b = areaBand(r[F.tx] ? r[F.tx][3] : null);
      if (b == null || !S.area.has(b)) return false;
    }
  }
  if (S.price.size) {
    const v = priceOf(r); if (v == null) return false;
    if (!Array.from(S.price).some(k => v >= PRICES[k].lo && v < PRICES[k].hi)) return false;
  }
  return true;
}
function scopeList() {
  return SGG.filter(r => (S.city === 'all' || r.c === S.city) && (!S.sel.size || S.sel.has(r.s)));
}
function allCx() { return TX.length ? L.concat(TX) : L; }

function next(fn, arr, idx) { const r = arr.find(fn); return r ? r[idx] : null; }

/* ── 시계열: 범위 집계(합산 중위) ─────────────────────── */
function medianFromHist(parts, step) {
  let total = 0;
  for (const p of parts) for (const b of p) total += b[1];
  if (!total) return null;
  const half = total / 2;
  const merged = new Map();
  for (const p of parts) for (const b of p) merged.set(b[0], (merged.get(b[0]) || 0) + b[1]);
  const keys = Array.from(merged.keys()).sort((a, b) => a - b);
  let cum = 0;
  for (const k of keys) {
    const n = merged.get(k);
    if (cum + n >= half) {
      const frac = n ? (half - cum) / n : 0;
      return (k + frac) * step;
    }
    cum += n;
  }
  return null;
}
function poolRow(list, y) {
  let n = 0, jn = 0, wn = 0, pppN = 0, pppSum = 0, rN = 0, rSum = 0;
  const mh = [], jh = [];
  for (const r of list) {
    const row = C.serSgg[r.s].find(x => x[0] === y); if (!row) continue;
    n += row[1] || 0; jn += row[4] || 0; wn += row[6] || 0;
    if (row[3] != null && row[1]) { pppSum += row[3] * row[1]; pppN += row[1]; }
    const rt = C.ratio[r.s] && C.ratio[r.s][String(y)];
    if (rt && rt[0] != null && rt[1]) { rSum += rt[0] * rt[1]; rN += rt[1]; }
    const h = C.hist[r.s] && C.hist[r.s][String(y)];
    if (h) { mh.push(h[0]); jh.push(h[1]); }
  }
  const medM = medianFromHist(mh, 1000);
  const medJ = medianFromHist(jh, 1000);
  return [y, n, medM == null ? null : Math.round(medM), pppN ? Math.round(pppSum / pppN) : null,
    jn, medJ == null ? null : Math.round(medJ), wn,
    (jn + wn) ? Math.round(1000 * wn / (jn + wn)) / 10 : null,
    rN ? Math.round(rSum / rN * 10) / 10 : null];
}
function scopeSeriesCity() {   // 흐린 비교선으로 쓸 시도 (현재 범위와 같은 시도 제외)
  if (S.city !== 'all' && !S.sel.size) return CITIES.filter(c => c.n !== S.city);
  return CITIES;
}
function seriesRows() {
  const list = scopeList();
  if (S.city === 'all' && !S.sel.size) return C.serAll;
  if (S.city !== 'all' && !S.sel.size) return C.serCity[CIDX.get(S.city).k];
  if (list.length === 1) return C.serSgg[list[0].s];
  return YEARS.map(y => poolRow(list, y));
}
function scopeName() {
  const list = scopeList();
  if (S.sel.size === 1) return list[0].s;
  if (S.sel.size > 1) return (S.city === 'all' ? '' : S.city + ' ') + '선택 ' + list.length + '개 구·군';
  if (S.city === 'all') return '지방 41개 구·군 전체';
  return S.city + ' ' + list.length + '개 구·군';
}

/* ── KPI ──────────────────────────────────────────────── */
function renderKPI() {
  const list = scopeList();
  const scopeSet = new Set(list.map(r => r.s));
  const lx = L.filter(r => scopeSet.has(r[F.sgg]) && cxOk(r));
  const mae = lx.reduce((a, r) => a + (r[F.mn] || 0), 0);
  const jeon = lx.reduce((a, r) => a + (r[F.jn] || 0), 0);
  const rows = seriesRows();
  const cur = rows[rows.length - 1] || [];
  const filt = S.tier.size || S.area.size || S.price.size;
  const ratios = lx.map(r => r[F.ratio]).filter(v => v != null);
  const gaps = lx.map(r => r[F.gap]).filter(v => v != null);
  const med = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const gMed = med(gaps), rMed = med(ratios);

  const txA = list.reduce((a, r) => a + (r.txA || 0), 0);
  const txJ = list.reduce((a, r) => a + (r.txJ || 0), 0);
  const txW = list.reduce((a, r) => a + (r.txW || 0), 0);
  const cells = [
    { l: '범위 SCOPE', v: list.length, s: ' 개 구·군', d: S.city === 'all' ? '6개 시도 · 41개 구·군 전체' : S.city + ' · ' + list.length + '개 구·군' },
    { l: '호가 매물', v: fmtN(mae + jeon), s: ' 건', d: '2,788단지 · 매매 ' + fmtN(mae) + ' · 전세 ' + fmtN(jeon) },
    { l: '실거래', v: fmtN(txA + txJ + txW), s: ' 건', d: '매매 ' + fmtN(txA) + ' · 전월세 ' + fmtN(txJ + txW) },
    { l: '매매 중위', v: cur[2] == null ? '—' : (cur[2] / 10000).toFixed(2), s: ' 억', d: '2026.1~11월 ' + fmtN(cur[1]) + '건', acc: true },
    { l: '전세가율', v: cur[8] == null ? '—' : cur[8].toFixed(1), s: ' %', d: '실거래 단지중위 · 호가 ' + (rMed == null ? '—' : rMed.toFixed(1) + '%') },
    { l: '호가 괴리율', v: gMed == null ? '—' : (gMed > 0 ? '+' : '') + gMed.toFixed(1), s: ' %', d: '호가−실거래 · ' + fmtN(gaps.length) + '단지 중위' },
  ];
  $('#kpis').innerHTML = cells.map(c => `
    <div class="kp${c.acc ? ' acc' : ''}">
      <div class="l">${c.l}</div>
      <div class="v">${c.v}<small>${c.s}</small></div>
      <div class="d">${c.d}</div>
    </div>`).join('');
}

function renderScopeStrip() {
  const list = scopeList();
  const scopeSet = new Set(list.map(r => r.s));
  const lx = L.filter(r => scopeSet.has(r[F.sgg]) && cxOk(r));
  const parts = [];
  parts.push(`<span><b>${esc(scopeName())}</b></span>`);
  parts.push(`<span class="dot"></span><span>호가 ${fmtN(lx.length)}단지</span>`);
  const filt = [];
  if (S.tier.size) filt.push('세대수 ' + Array.from(S.tier).map(k => TIERS[k].l).join('·'));
  if (S.area.size) filt.push('면적 ' + Array.from(S.area).map(k => AREAS[k].l).join('·'));
  if (S.price.size) filt.push('가격 ' + Array.from(S.price).map(k => PRICES[k].l).join('·'));
  if (filt.length) parts.push(`<span class="pill">${esc(filt.join(' / '))}</span>`);
  else parts.push(`<span class="pill">필터 없음</span>`);
  if (S.sel.size) parts.push(`<button class="pill" id="clearSel" style="color:var(--acc)">선택 해제 ✕</button>`);
  $('#scopeStrip').innerHTML = parts.join('');
  const cs = $('#clearSel'); if (cs) cs.onclick = () => { S.sel.clear(); sync(); };
}

/* ── 필터 UI ──────────────────────────────────────────── */
function renderFilters() {
  // 시도 탭
  const tabs = [{ k: 'all', n: '전체', c: 41 }].concat(CITIES.map(c => ({
    k: c.n, n: c.n, c: SGG.filter(r => r.c === c.n).length })));
  $('#cityTabs').innerHTML = tabs.map(t => `<button class="tab" data-city="${t.k}" aria-pressed="${S.city === t.k}">${esc(t.n)}<span class="n">${t.c}</span></button>`).join('');
  $$('#cityTabs .tab').forEach(b => b.onclick = () => {
    S.city = b.dataset.city; S.sel.clear(); S.page = 1; sync();
  });

  // 구·군 빠른 선택 (현재 시도 상위)
  const quickPool = SGG.filter(r => S.city === 'all' || r.c === S.city);
  const qn = (window.innerWidth || 390) >= 820 ? 12 : 6;
  $('#ggQuick').innerHTML = quickPool.slice(0, qn).map(r => chipSel(r.n, S.sel.has(r.s), r.s)).join('')
    + (quickPool.length > qn ? '<span class="more">+' + (quickPool.length - qn) + '</span>' : '');

  // 구·군 전체 선택 패널
  const wrap = $('#ggWrap');
  let html = '';
  CITIES.forEach(c => {
    const rs = SGG.filter(r => r.c === c.n);
    if (S.city !== 'all' && S.city !== c.n) return;
    html += `<div class="ggcity" style="--c:${colorCity(c.n)}"><i></i>${c.n}</div><div class="gg">`;
    html += rs.map(r => chipSel(r.n, S.sel.has(r.s), r.s)).join('');
    html += '</div>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => {
    const v = b.dataset.sel; S.sel.has(v) ? S.sel.delete(v) : S.sel.add(v);
    S.page = 1; sync();
  });
  $('#ggToggle').setAttribute('aria-pressed', wrap.classList.contains('on'));
  $('#ggToggle').innerHTML = '구·군 선택' + (S.sel.size ? ' <b style="color:var(--acc)">' + S.sel.size + '</b>' : '') + ' <span class="x">' + (wrap.classList.contains('on') ? '▴' : '▾') + '</span>';
  $('#ggToggle').onclick = () => {
    wrap.classList.toggle('on');
    $('#ggToggle').setAttribute('aria-pressed', wrap.classList.contains('on'));
    $('#ggToggle').innerHTML = '구·군 선택' + (S.sel.size ? ' <b style="color:var(--acc)">' + S.sel.size + '</b>' : '') + ' <span class="x">' + (wrap.classList.contains('on') ? '▴' : '▾') + '</span>';
  };

  // 세대수·면적·가격
  $('#tierChips').innerHTML = allChip(S.tier.size) + TIERS.map(t => chipSel(t.l, S.tier.has(t.k), null, 'tier:' + t.k)).join('');
  $('#areaChips').innerHTML = allChip(S.area.size) + AREAS.map(t => chipSel(t.l, S.area.has(t.k), null, 'area:' + t.k)).join('');
  $('#priceChips').innerHTML = allChip(S.price.size) + PRICES.map(t => chipSel(t.l, S.price.has(t.k), null, 'price:' + t.k)).join('');
  bindSets('#tierChips', S.tier, 'tier');
  bindSets('#areaChips', S.area, 'area');
  bindSets('#priceChips', S.price, 'price');
}
function chipSel(label, on, sid, fid) {
  if (sid) return `<button class="chip" data-sel="${esc(sid)}" aria-pressed="${on}">${esc(label)}</button>`;
  return `<button class="chip" data-f="${fid}" aria-pressed="${on}">${esc(label)}</button>`;
}
function allChip(n) { return `<button class="chip" data-f="all" aria-pressed="${!n}" style="${!n ? '' : 'opacity:.65'}">전체</button>`; }
function bindSets(sel, set, key) {
  $$(sel + ' [data-f]').forEach(b => b.onclick = () => {
    const v = b.dataset.f;
    if (v === 'all') set.clear();
    else { const k = +v.split(':')[1]; set.has(k) ? set.delete(k) : set.add(k); }
    S.page = 1; sync();
  });
  const quickHost = sel === '#tierChips' ? null : null;
}

/* ── 차트: 공통 ───────────────────────────────────────── */
function niceTicks(min, max, n) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag, step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let x = lo; x <= hi + 1e-9; x += step) ticks.push(+x.toFixed(6));
  return { ticks, lo, hi };
}
function makeTooltip(host) {
  let tip = host.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip); }
  return tip;
}
function pngFooter(title) {
  return { left: 'REGIONAL 41 · ' + title + ' · ' + scopeName(), right: '2026-11-27' };
}

/* ── 01 시계열 ────────────────────────────────────────── */
const METRIC = {
  mmed: { l: '매매 중위가', get: r => r[2] == null ? null : r[2] / 10000, fmt: v => v.toFixed(2) + '억', tick: v => v.toFixed(1), unit: '억' },
  ratio: { l: '전세가율', get: r => r[8], fmt: v => v.toFixed(1) + '%', tick: v => v.toFixed(0), unit: '%' },
  n: { l: '거래량', get: r => r[1], fmt: v => fmtN(v) + '건', tick: v => v >= 10000 ? (v / 10000).toFixed(0) + '만' : fmtN(v), unit: '건' },
  wol: { l: '월세 비중', get: r => r[7], fmt: v => v.toFixed(1) + '%', tick: v => v.toFixed(0), unit: '%' },
};
function renderSeriesTabs() {
  $('#seriesTabs').innerHTML = Object.keys(METRIC).map(k =>
    `<button class="mtab" data-m="${k}" aria-pressed="${S.series === k}">${METRIC[k].l}</button>`).join('');
  $$('#seriesTabs .mtab').forEach(b => b.onclick = () => { S.series = b.dataset.m; renderSeries(); renderSeriesTabs(); });
}
function renderSeries() {
  const host = $('#seriesPlot'); if (!host) return;
  host.innerHTML = '';
  const W = Math.max(270, Math.round(host.clientWidth || 320));
  const H = Math.round(clamp(W * 0.46, 210, 380));
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': '시계열 차트' });
  const met = METRIC[S.series];
  const rows = seriesRows();
  const prim = rows.map((r, i) => ({ x: i, v: met.get(r), y: r[0] }));
  const cityLines = scopeSeriesCity().map(c => ({
    n: c.n, col: colorCity(c.n),
    pts: C.serCity[c.k].map((r, i) => ({ x: i, v: met.get(r) })),
  })).filter(s => s.pts.some(p => p.v != null));

  const vals = [];
  prim.forEach(p => { if (p.v != null) vals.push(p.v); });
  cityLines.forEach(s => s.pts.forEach(p => { if (p.v != null) vals.push(p.v); }));
  if (!vals.length) { host.innerHTML = '<div class="empty">데이터 없음</div>'; return; }
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (S.series === 'n') lo = 0;
  const padV = (hi - lo) * 0.16 || 1;
  const sc = niceTicks(lo - padV * 0.4, hi + padV, 4);
  const pad = { l: 44, r: 14, t: 14, b: 26 };
  const X = i => pad.l, _ = 0;
  const xpos = i => pad.l + (W - pad.l - pad.r) * (i / (YEARS.length - 1));
  const ypos = v => pad.t + (H - pad.t - pad.b) * (1 - (v - sc.lo) / (sc.hi - sc.lo));

  // 그리드
  sc.ticks.forEach(t => {
    const y = ypos(t);
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: cv('--grid'), 'stroke-width': 1 }));
    svg.appendChild(txtEl(pad.l - 7, y + 3.5, met.tick(t), { 'text-anchor': 'end', 'font-size': 9.5, fill: cv('--axis') }));
  });
  // y축 단위
  svg.appendChild(txtEl(pad.l - 7, pad.t - 3, met.unit, { 'text-anchor': 'end', 'font-size': 8.5, fill: cv('--axis'), 'font-weight': 700 }));
  // 2026(진행 중) 음영
  const x26 = xpos(YEARS.length - 1);
  svg.appendChild(svgEl('rect', { x: x26 - 12, y: pad.t, width: W - pad.r - x26 + 12, height: H - pad.t - pad.b, fill: cv('--tile'), opacity: .75 }));
  svg.appendChild(svgEl('line', { x1: x26 - 12, y1: pad.t, x2: x26 - 12, y2: H - pad.b, stroke: cv('--line'), 'stroke-dasharray': '3 3' }));

  // x축
  const stepX = W < 430 ? 2 : 1;
  YEARS.forEach((y, i) => {
    if (i % stepX && i !== YEARS.length - 1) return;
    svg.appendChild(txtEl(xpos(i), H - 8, String(y).slice(2) + (y === M.partialYear ? '.' : ''), {
      'text-anchor': 'middle', 'font-size': 9.5, fill: cv('--axis'), 'font-weight': y === M.partialYear ? 700 : 400 }));
  });

  // 도시 비교선
  cityLines.forEach(s => {
    let d = '', on = false;
    s.pts.forEach(p => {
      if (p.v == null) { on = false; return; }
      d += (on ? 'L' : 'M') + xpos(p.x).toFixed(1) + ' ' + ypos(p.v).toFixed(1);
      on = true;
    });
    if (!d) return;
    svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: s.col, 'stroke-width': 1.35, opacity: .5, 'stroke-linejoin': 'round' }));
    const last = s.pts.filter(p => p.v != null).pop();
    if (last) svg.appendChild(svgEl('circle', { cx: xpos(last.x), cy: ypos(last.v), r: 2.2, fill: s.col, opacity: .75 }));
  });

  // 대표선
  let d = '', on = false, area = '';
  const solid = prim.filter(p => p.v != null);
  prim.forEach(p => {
    if (p.v == null) { on = false; return; }
    d += (on ? 'L' : 'M') + xpos(p.x).toFixed(1) + ' ' + ypos(p.v).toFixed(1);
    on = true;
  });
  if (solid.length) {
    area = d + 'L' + xpos(solid[solid.length - 1].x) + ' ' + (H - pad.b) + 'L' + xpos(solid[0].x) + ' ' + (H - pad.b) + 'Z';
    const gid = 'g' + Math.random().toString(36).slice(2, 7);
    const defs = svgEl('defs', {});
    const g = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    g.appendChild(svgEl('stop', { offset: '0%', 'stop-color': cv('--acc'), 'stop-opacity': .22 }));
    g.appendChild(svgEl('stop', { offset: '100%', 'stop-color': cv('--acc'), 'stop-opacity': .01 }));
    defs.appendChild(g); svg.appendChild(defs);
    svg.appendChild(svgEl('path', { d: area, fill: 'url(#' + gid + ')' }));
    svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: cv('--acc'), 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    solid.forEach(p => svg.appendChild(svgEl('circle', { cx: xpos(p.x), cy: ypos(p.v), r: 2.6, fill: cv('--card'), stroke: cv('--acc'), 'stroke-width': 1.6 })));
    const last = solid[solid.length - 1];
    const lx = Math.min(W - pad.r - 4, xpos(last.x));
    const ly = ypos(last.v) - 10;
    const lab = met.fmt(last.v);
    svg.appendChild(svgEl('rect', { x: lx - 46, y: ly - 11, width: 46, height: 16, rx: 4, fill: cv('--ink') }));
    svg.appendChild(txtEl(lx - 23, ly + 0.5, lab, { 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: cv('--card'), dominant_baseline: 'middle' }));
  }
  host.appendChild(svg);

  // 범례
  const legend = [`<span><i style="background:${cv('--acc')}"></i>${esc(scopeName())}</span>`]
    .concat(cityLines.map(s => `<span class="mut"><i style="background:${s.col};opacity:.65"></i>${s.n}</span>`));
  $('#seriesLegend').innerHTML = legend.join('');

  // 인사이트
  $('#seriesDesc').textContent = met.l + ' · 2016~2026' + (S.series === 'n' ? ' (2026년은 11월까지)' : '');
  const a = rows[0], b = rows[rows.length - 1], pv = rows[rows.length - 2];
  let ins = '';
  if (S.series === 'mmed') {
    const ch = (b[2] && a[2]) ? (b[2] / a[2] - 1) * 100 : null;
    const hist = rows.filter(r => r[0] !== M.partialYear && r[2]);
    const peak = hist.reduce((m, r) => (r[2] && (!m || r[2] > m[2])) ? r : m, null);
    ins = `<b>2016 ${eok(a[2])}</b> → <b>2026 ${eok(b[2])}</b>` +
      (ch != null ? ` · 10년 <em>${ch > 0 ? '+' : ''}${ch.toFixed(1)}%</em>` : '') +
      (peak ? (b[2] >= peak[2]
          ? ` · 2026년이 기간 최고 <em>+${((b[2] / peak[2] - 1) * 100).toFixed(1)}%</em> (직전 최고 ${peak[0]} ${eok(peak[2])})`
          : ` · ${peak[0]} 고점 ${eok(peak[2])} 대비 <em>${((b[2] / peak[2] - 1) * 100).toFixed(1)}%</em>`) : '');
  } else if (S.series === 'ratio') {
    const dpp = (a[8] != null && b[8] != null) ? b[8] - a[8] : null;
    ins = `<b>2016 ${pct(a[8])}</b> → <b>2026 ${pct(b[8])}</b>` + (dpp != null ? ` · <em>${dpp > 0 ? '+' : ''}${dpp.toFixed(1)}pp</em>` : '') +
      ` · 시도별로는 <b>${CITIES.map(c => c.n + ' ' + pct(C.serCity[c.k][C.serCity[c.k].length - 1][8])).join(' · ')}</b>`;
  } else if (S.series === 'n') {
    const ch = pv && pv[1] ? (b[1] / pv[1] - 1) * 100 : null;
    ins = `<b>2026.1~11 ${fmtN(b[1])}건</b>` + (ch != null ? ` · 2025 같은 기간 <b>${fmtN(pv[1])}건</b> 대비 <em>${ch > 0 ? '+' : ''}${ch.toFixed(1)}%</em>` : '') +
      ` · 10년 최다 <b>${fmtN(Math.max.apply(null, rows.map(r => r[1])))}건</b>`;
  } else {
    const dpp = (a[7] != null && b[7] != null) ? b[7] - a[7] : null;
    ins = `월세 비중 <b>2016 ${pct(a[7])}</b> → <b>2026 ${pct(b[7])}</b>` + (dpp != null ? ` · <em>${dpp > 0 ? '+' : ''}${dpp.toFixed(1)}pp</em>` : '') +
      ` · 최근 3년 평균 <b>${pct(rows.slice(-3).reduce((s, r) => s + (r[7] || 0), 0) / 3)}</b>`;
  }
  $('#seriesInsight').innerHTML = ins;

  // 툴팁
  const tip = makeTooltip(host);
  const overlay = svgEl('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
  svg.appendChild(overlay);
  const move = ev => {
    const rect = svg.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const i = clamp(Math.round((px - pad.l) / ((W - pad.l - pad.r) / (YEARS.length - 1))), 0, YEARS.length - 1);
    const r = rows[i];
    let h = `<b>${r[0]}${r[0] === M.partialYear ? ' (1~11월)' : ''}</b>`;
    h += `<div class="r"><span><i style="background:${cv('--acc')}"></i>${met.l}</span><b>${met.fmt(met.get(r))}</b></div>`;
    if (S.series !== 'n') h += `<div class="r"><span>매매</span><b>${fmtN(r[1])}건</b></div>`;
    if (S.series === 'mmed') h += `<div class="r"><span>전세 중위</span><b>${eok(r[5])}</b></div>`;
    if (S.series === 'ratio' || S.series === 'mmed') h += `<div class="r"><span>월세 비중</span><b>${pct(r[7])}</b></div>`;
    tip.innerHTML = h; tip.classList.add('on');
    tip.style.left = clamp(xpos(i), 70, W - 70) + 'px';
    tip.style.top = Math.max(46, ypos(met.get(r) == null ? sc.lo : met.get(r)) - 6) + 'px';
  };
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerdown', move);
  overlay.addEventListener('pointerleave', () => tip.classList.remove('on'));
}

/* ── 02 랭킹 ──────────────────────────────────────────── */
const RANK = {
  mmed: { l: '매매 중위가', get: r => r.mmed, fmt: eok, sub: '2026.1~11' },
  ppp: { l: '평당가', get: r => r.ppp, fmt: v => fmtN(v) + '만/평', sub: '2026' },
  ratio: { l: '호가 전세가율', get: r => r.ratio, fmt: pct, sub: '호가 단지중위' },
  gap: { l: '호가 괴리율', get: r => r.gap, fmt: sgn, sub: '호가−실거래' },
  n26: { l: '거래량', get: r => r.n26, fmt: v => fmtN(v) + '건', sub: '2026.1~11' },
  hn: { l: '호가 매물', get: r => r.hn, fmt: v => fmtN(v) + '건', sub: '12차 수집' },
  hh: { l: '세대수', get: r => r.hh, fmt: v => fmtN(v) + '세대', sub: '단지마스터' },
};
function renderRankTabs() {
  $('#rankTabs').innerHTML = Object.keys(RANK).map(k =>
    `<button class="mtab" data-r="${k}" aria-pressed="${S.rank === k}">${RANK[k].l}</button>`).join('');
  $$('#rankTabs .mtab').forEach(b => b.onclick = () => { S.rank = b.dataset.r; renderRankTabs(); renderRank(); });
}
function renderRank() {
  const met = RANK[S.rank];
  const all01 = SGG.filter(r => met.get(r) != null).slice().sort((a, b) => met.get(b) - met.get(a));
  const list = S.rankAll ? all01 : all01.slice(0, 15);
  const maxv = met.get(all01[0]), minv = Math.min.apply(null, all01.map(r => met.get(r)));
  const inScope = new Set(scopeList().map(r => r.s));
  $('#rankDesc').textContent = met.l + ' (' + met.sub + ') · ' + (S.rankAll || S.rankTable ? all01.length : list.length + '/' + all01.length) + '개 구·군 · 행을 누르면 드릴다운';
  if (S.rankTable) {
    $('#rankBody').innerHTML = `<div class="tblwrap" style="padding:10px 14px 14px"><table>
      <thead><tr><th>구·군</th><th>매매중위</th><th>평당가</th><th>전세가율</th><th>괴리율</th><th>2026거래</th><th>호가단지</th></tr></thead><tbody>
      ${all01.map((r, i) => `<tr data-s="${esc(r.s)}"><td>${esc(r.n)} <span class="mini">${esc(r.c)}</span></td>
        <td class="n">${eok(r.mmed)}</td><td>${fmtN(r.ppp)}</td><td>${pct(r.ratio)}</td>
        <td>${sgn(r.gap)}</td><td>${fmtN(r.n26)}</td><td>${r.hcx}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else {
    $('#rankBody').innerHTML = `<div class="rank">${list.map((r, i) => {
      const v = met.get(r), w = 4 + 96 * (maxv === minv ? 1 : (v - minv) / (maxv - minv));
      const dim = inScope.has(r.s) ? 1 : .42;
      return `<div class="rrow" data-s="${esc(r.s)}" style="opacity:${dim}">
        <span class="rk">${i + 1}</span>
        <span class="rname">${esc(r.n)}<i>${esc(r.c)}</i></span>
        <span class="rbar"><i style="width:${w.toFixed(1)}%;background:${colorCity(r.c)}"></i></span>
        <span class="rval">${met.fmt(v)}</span>
      </div>`;
    }).join('')}</div>
    ${all01.length > 15 ? `<button class="loadmore" id="rankAll">${S.rankAll ? '상위 15개만 보기' : '41개 전체 보기'}</button>` : ''}`;
    const ra = $('#rankAll'); if (ra) ra.onclick = () => { S.rankAll = !S.rankAll; renderRank(); };
  }
  $$('#rankBody [data-s]').forEach(n => n.onclick = () => {
    const s = n.dataset.s; S.city = cityOfSgg(s); S.sel = new Set([s]); S.page = 1; sync();
    document.getElementById('sec-cx').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#rankView').textContent = S.rankTable ? '차트로 보기' : '표로 보기';
}
$('#rankView').onclick = () => { S.rankTable = !S.rankTable; renderRank(); };

/* ── 03 산점도 ────────────────────────────────────────── */
function renderScatter() {
  const host = $('#scatterPlot'); if (!host) return;
  host.innerHTML = '';
  const W = Math.max(270, Math.round(host.clientWidth || 320));
  const H = Math.round(clamp(W * 0.82, 260, 520));
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': '괴리율·전세가율 산점도' });
  const pad = { l: 58, r: 16, t: 18, b: 34 };
  let pts;
  if (S.scatter === 'sgg') {
    pts = scopeList().filter(r => r.r26 != null && r.gap != null).map(r => ({
      x: r.r26, y: r.gap, r: 5, col: colorCity(r.c), label: r.n, raw: r, kind: 'sgg' }));
  } else {
    const scopeSet = new Set(scopeList().map(r => r.s));
    pts = L.filter(r => scopeSet.has(r[F.sgg]) && cxOk(r) && r[F.gap] != null && r[F.txjr] != null).map(r => ({
      x: r[F.txjr], y: r[F.gap],
      r: clamp(2.6 + Math.sqrt(r[F.hh] || 100) / 26, 2.6, 9),
      col: colorCity(cityOfSgg(r[F.sgg])), label: r[F.name], raw: r, kind: 'cx',
      flag: r[F.match] === '확인필요',
    }));
  }
  if (!pts.length) { host.innerHTML = '<div class="empty">조건에 맞는 단지가 없습니다</div>'; return; }
  const xs = pts.map(p => p.x).sort((a, b) => a - b);
  const ys = pts.map(p => clamp(p.y, -60, 120)).sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))];
  let x0 = Math.floor((q(xs, .01) - 2) / 5) * 5, x1 = Math.ceil((q(xs, .99) + 2) / 5) * 5;
  let y0 = Math.floor((q(ys, .015) - 2) / 5) * 5, y1 = Math.ceil((q(ys, .97) + 2) / 5) * 5;
  if (x1 - x0 < 10) { x0 -= 5; x1 += 5; }
  if (y1 - y0 < 10) { y0 -= 5; y1 += 5; }
  const gx = niceTicks(x0, x1, 4), gy = niceTicks(y0, y1, 4);
  x0 = gx.lo; x1 = gx.hi; y0 = gy.lo; y1 = gy.hi;
  const X = v => pad.l + (W - pad.l - pad.r) * ((v - x0) / (x1 - x0));
  const Y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - y0) / (y1 - y0));
  const mx = xs[Math.floor(xs.length / 2)], my = ys[Math.floor(ys.length / 2)];
  gx.ticks.forEach(t => {
    svg.appendChild(svgEl('line', { x1: X(t), y1: pad.t, x2: X(t), y2: H - pad.b, stroke: cv('--grid'), 'stroke-width': 1 }));
    svg.appendChild(txtEl(X(t), H - pad.b + 14, t.toFixed(0) + '%', { 'text-anchor': 'middle', 'font-size': 9.5, fill: cv('--axis') }));
  });
  gy.ticks.forEach(t => {
    svg.appendChild(svgEl('line', { x1: pad.l, y1: Y(t), x2: W - pad.r, y2: Y(t), stroke: cv('--grid'), 'stroke-width': 1 }));
    svg.appendChild(txtEl(pad.l - 6, Y(t) + 3, (t > 0 ? '+' : '') + t.toFixed(0) + '%', { 'text-anchor': 'end', 'font-size': 9.5, fill: cv('--axis') }));
  });
  // 기준선
  svg.appendChild(svgEl('line', { x1: X(mx), y1: pad.t, x2: X(mx), y2: H - pad.b, stroke: cv('--axis'), 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .55 }));
  svg.appendChild(svgEl('line', { x1: pad.l, y1: Y(my), x2: W - pad.r, y2: Y(my), stroke: cv('--axis'), 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .55 }));

  // 축 이름
  svg.appendChild(txtEl((pad.l + W - pad.r) / 2, H - 6, '실거래 전세가율 (%)', { 'text-anchor': 'middle', 'font-size': 9.5, fill: cv('--sub'), 'font-weight': 600 }));
  const yl = txtEl(0, 0, '호가 − 실거래 괴리율 (%)', { 'text-anchor': 'middle', 'font-size': 9.5, fill: cv('--sub'), 'font-weight': 600 });
  yl.setAttribute('transform', `translate(13 ${(pad.t + H - pad.b) / 2}) rotate(-90)`);
  svg.appendChild(yl);

  // 점
  const sorted = pts.slice().sort((a, b) => b.r - a.r);
  sorted.forEach(p => {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return;
    const c = svgEl('circle', { cx: X(p.x), cy: Y(p.y), r: p.r, fill: p.flag ? 'none' : p.col,
      stroke: p.col, 'stroke-width': p.flag ? 1.4 : 0, opacity: p.flag ? .9 : .62 });
    c.dataset.k = p.kind;
    svg.appendChild(c);
  });
  // 라벨(괴리율 상위)
  const outl = S.scatter === 'sgg' ? pts.filter(p => !p.flag && p.y > y0 && p.y < y1 && p.x > x0 && p.x < x1)
    .sort((a, b) => b.y - a.y).slice(0, 41) : [];
  const boxes = [];
  outl.forEach(p => {
    const short = p.label.length > 9 ? p.label.slice(0, 8) + '…' : p.label;
    const fs = S.scatter === 'sgg' ? 8 : 8.5;
    let tx = X(p.x) + (p.r || 4) + 3, ty = clamp(Y(p.y) - 2, pad.t + fs + 3, H - pad.b - 3);
    const tw = short.length * fs * 1.02;
    if (tx + tw > W - pad.r) tx = Math.max(pad.l, X(p.x) - tw - p.r - 3);
    if (boxes.some(b => Math.abs(b[1] - ty) < fs + 5 && tx < b[0] + b[2] + 4 && tx + tw > b[0] - 4)) return;
    boxes.push([tx, ty, tw]);
    svg.appendChild(txtEl(tx, ty, short, { 'font-size': fs, fill: cv('--label'), 'font-weight': 650 }));
  });

  host.appendChild(svg);

  // 범례
  const legendCities = CITIES.filter(c => scopeList().some(r => r.c === c.n));
  $('#scatterLegend').innerHTML = legendCities.map(c => `<span><i style="background:${colorCity(c.n)}"></i>${c.n}</span>`).join('')
    + (S.scatter === 'cx' ? '<span class="mut"><i style="border:1.4px solid var(--sub);background:none"></i>확인필요</span>' : '')
    + (S.scatter === 'cx' ? '<span class="mut">점 크기 = 세대수</span>' : '<span class="mut">점 1개 = 구·군 1곳</span>')
    + '<span class="mut">점선 = 중위 (전세가율 ' + Math.round(mx) + '% · 괴리율 ' + (my > 0 ? '+' : '') + my.toFixed(1) + '%)</span>'
    + (() => { const out = pts.filter(p => p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1).length;
        return out ? '<span class="mut">범위 밖 ' + out + '곳</span>' : ''; })();
  $('#scatterDesc').textContent = S.scatter === 'sgg'
    ? '구·군 ' + pts.length + '개 평균 · 가로 실거래 전세가율, 세로 호가 괴리율'
    : '단지 ' + fmtN(pts.length) + '곳 · 점 크기 세대수 · 확인필요 28곳은 빈 원';

  const gapAll = pts.map(p => p.y).sort((a, b) => a - b);
  const me = gapAll[Math.floor(gapAll.length / 2)];
  const cityMed = CITIES.map(c => {
    const arr = pts.filter(p => (p.kind === 'cx' ? cityOfSgg(p.raw[F.sgg]) : p.raw.c) === c.n).map(p => p.y).sort((a, b) => a - b);
    return arr.length ? { n: c.n, v: arr[Math.floor(arr.length / 2)] } : null;
  }).filter(Boolean).sort((a, b) => b.v - a.v);
  $('#scatterInsight').innerHTML = `<b>괴리율 중위 ${sgn(me)}</b> · 호가가 실거래보다 높은 단지 <em>${Math.round(100 * gapAll.filter(v => v > 0).length / gapAll.length)}%</em>` +
    `<br>시도별 중위: ` + cityMed.map(c => `<b>${c.n}</b> ${sgn(c.v)}`).join(' · ') +
    (S.scatter === 'cx' ? '<br><span style="color:var(--sub)">표본이 적거나 평형이 다른 단지에서 값이 크게 튑니다 — 점을 눌러 단지별로 확인하세요.</span>' : '');

  // 툴팁·탭
  const tip = makeTooltip(host);
  const overlay = svgEl('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
  svg.appendChild(overlay);
  let tapped = null;
  const pick = ev => {
    const rect = svg.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    let best = null, bd = 1e9;
    pts.forEach(p => {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return;
      const dd = Math.pow(X(p.x) - px, 2) + Math.pow(Y(p.y) - py, 2);
      if (dd < bd) { bd = dd; best = p; }
    });
    if (!best || bd > 900) { tip.classList.remove('on'); return null; }
    let h = `<b>${esc(best.label)}</b>`;
    if (best.kind === 'cx') h += `<div class="r"><span>${esc(best.raw[F.dong])} · ${fmtN(best.raw[F.hh])}세대</span></div>`;
    h += `<div class="r"><span>실거래 전세가율</span><b>${pct(best.x)}</b></div>`;
    h += `<div class="r"><span>괴리율</span><b>${sgn(best.y)}</b></div>`;
    if (best.kind === 'cx' && best.raw[F.mmed] != null) h += `<div class="r"><span>호가 중위</span><b>${eok(best.raw[F.mmed])}</b></div>`;
    if (best.kind === 'sgg') h += `<div class="r"><span>매매 중위</span><b>${eok(best.raw.mmed)}</b></div>`;
    tip.innerHTML = h; tip.classList.add('on');
    tip.style.left = clamp(X(best.x), 74, W - 74) + 'px';
    tip.style.top = Math.max(50, Y(best.y) - 8) + 'px';
    return best;
  };
  overlay.addEventListener('pointermove', pick);
  overlay.addEventListener('pointerdown', ev => { tapped = pick(ev); });
  overlay.addEventListener('pointerup', () => { if (tapped && tapped.kind === 'cx') openCx(tapped.raw); tapped = null; });
  overlay.addEventListener('pointerleave', () => tip.classList.remove('on'));
  renderGapTable();
}
function renderGapTable() {
  const list = scopeList().filter(r => r.gap != null || r.r26 != null);
  const rows = list.slice().sort((a, b) => (b.gap || -99) - (a.gap || -99)).slice(0, 41);
  $('#gapTableCard').innerHTML = `<div class="tblwrap" style="padding:11px 14px 13px">
    <div style="font-size:11px;font-weight:800;color:var(--sub);letter-spacing:.06em;margin-bottom:6px">구·군별 괴리율·전세가율 <span style="font-weight:600;letter-spacing:0">· 호가 단지중위 vs 실거래 2026</span></div>
    <table><thead><tr><th>구·군</th><th>호가 전세가율</th><th>실거래 전세가율</th><th>차이</th><th>괴리율</th></tr></thead><tbody>
    ${rows.map(r => {
      const diff = (r.ratio != null && r.r26 != null) ? r.ratio - r.r26 : null;
      return `<tr data-s="${esc(r.s)}"><td>${esc(r.n)} <span class="mini">${esc(r.c)}</span></td>
        <td>${pct(r.ratio)}</td><td>${pct(r.r26)}</td>
        <td style="color:${diff == null ? 'inherit' : diff > 0 ? 'var(--bad)' : 'var(--good)'}">${diff == null ? '—' : (diff > 0 ? '+' : '') + diff.toFixed(1) + 'pp'}</td>
        <td class="n" style="color:${r.gap > 20 ? 'var(--bad)' : 'inherit'}">${sgn(r.gap)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  $$('#gapTableCard [data-s]').forEach(n => n.onclick = () => {
    const s = n.dataset.s; S.city = cityOfSgg(s); S.sel = new Set([s]); S.page = 1; sync();
    document.getElementById('sec-cx').scrollIntoView({ behavior: 'smooth' });
  });
}
$('#scatterView').onclick = () => {
  S.scatter = S.scatter === 'cx' ? 'sgg' : 'cx';
  $('#scatterView').textContent = S.scatter === 'cx' ? '구·군 평균' : '단지별';
  $('#scatterView').setAttribute('aria-pressed', S.scatter === 'sgg');
  renderScatter();
};

/* ── 04 단지 리스트 ───────────────────────────────────── */
const CXSORT = { mmed: { l: '매매 중위', f: r => r[F.mmed] }, ratio: { l: '전세가율', f: r => r[F.ratio] },
  gap: { l: '괴리율', f: r => r[F.gap] }, hh: { l: '세대수', f: r => r[F.hh] },
  n26: { l: '거래량', f: r => r[F.tx] ? r[F.tx][0] : null }, jn: { l: '전세 매물', f: r => r[F.jn] } };
function renderCxTabs() {
  $('#cxTabs').innerHTML = Object.keys(CXSORT).map(k =>
    `<button class="mtab" data-c="${k}" aria-pressed="${S.cxSort === k}">${CXSORT[k].l}</button>`).join('');
  $$('#cxTabs .mtab').forEach(b => b.onclick = () => { S.cxSort = b.dataset.c; S.page = 1; renderCxTabs(); renderCx(); });
}
function cxFiltered() {
  const scopeSet = new Set(scopeList().map(r => r.s));
  const q = S.q.replace(/\s+/g, '');
  return allCx().filter(r => scopeSet.has(r[F.sgg]) && cxOk(r) &&
    (!q || (r[F.name] + r[F.dong] + r[F.sgg]).replace(/\s+/g, '').indexOf(q) >= 0));
}
function renderCx() {
  const arr = cxFiltered();
  const f = CXSORT[S.cxSort].f;
  const sorted = arr.slice().sort((a, b) => (f(b) == null ? -1e18 : f(b)) - (f(a) == null ? -1e18 : f(a)));
  const per = 40, show = sorted.slice(0, S.page * per);
  const nH = arr.filter(r => r[F.src]).length;
  $('#cxDesc').textContent = fmtN(arr.length) + '단지 (호가 ' + fmtN(nH) + ' · 실거래만 ' + fmtN(arr.length - nH) + ') · ' + CXSORT[S.cxSort].l + ' 순' + (TX.length ? '' : ' · 실거래 단지 불러오는 중');
  if (!arr.length) { $('#cxBody').innerHTML = '<div class="empty">조건에 맞는 단지가 없습니다.<br>필터를 줄이거나 검색어를 바꿔 보세요.</div>'; return; }
  $('#cxBody').innerHTML = `<div class="cxlist">${show.map(r => {
    const p = priceOf(r);
    const gapTxt = r[F.gap] != null ? sgn(r[F.gap]) : '';
    return `<div class="cx" data-i="${allCx().indexOf(r)}">
      <div class="cxm">
        <div class="cxn">${esc(r[F.name])}</div>
        <div class="cxs"><span>${esc(r[F.dong])}</span><span>·</span><span>${fmtN(r[F.hh])}세대</span>
          ${r[F.mn] ? '<span class="badge hg">호가 ' + r[F.mn] + '</span>' : ''}
          ${r[F.tx] ? '<span class="badge">실거래 ' + fmtN(r[F.tx][0]) + '</span>' : ''}
          ${gapTxt ? '<span class="badge" style="color:' + (r[F.gap] > 20 ? 'var(--bad)' : 'var(--sub)') + '">괴리 ' + gapTxt + '</span>' : ''}
        </div>
      </div>
      <div class="cxr"><b>${eok(p)}</b><span>${r[F.ratio] != null ? '전세 ' + r[F.ratio].toFixed(0) + '%' : (r[F.tx] && r[F.tx][7] != null ? '전세 ' + r[F.tx][7].toFixed(0) + '%' : '—')}</span></div>
    </div>`;
  }).join('')}</div>
  ${sorted.length > show.length ? `<button class="loadmore" id="moreCx">더 보기 (${fmtN(sorted.length - show.length)}단지 남음)</button>` : ''}`;
  $$('#cxBody .cx').forEach(n => n.onclick = () => openCx(allCx()[+n.dataset.i]));
  const mb = $('#moreCx'); if (mb) mb.onclick = () => { S.page++; renderCx(); };
}
function openCx(r) {
  S.opened = r;
  const pp = r[F.tx];
  const bands = r[F.bands] || [];
  const bandRows = bands.map(b => `<tr><td>${AREAS[b[0]].l}</td><td>${b[1] ? fmtN(b[1]) + '건' : '—'}</td>
      <td class="n">${b[2] ? eok(b[2]) : '—'}</td><td>${b[3] ? fmtN(b[3]) : '—'}</td>
      <td>${b[4] ? fmtN(b[4]) + '건' : '—'}</td><td>${b[5] ? eok(b[5]) : '—'}</td></tr>`).join('');
  const ratioH = r[F.ratio];
  $('#sheetIn').innerHTML = `
    <div class="grab"></div>
    <div class="xh"><div>
      <h3>${esc(r[F.name])}</h3>
      <div class="meta">${esc(r[F.sgg])} ${esc(r[F.dong])} · ${fmtN(r[F.hh])}세대 · ${r[F.hh] ? '' : '세대 미확인'}${r[F.ap] ? ' · ' + r[F.ap].slice(0, 4) + '년 승인' : ''}</div>
    </div><button class="xbtn" data-close="1">✕</button></div>
    <div class="kv">
      <div><div class="k">호가 매매 중위</div><div class="v">${eok(r[F.mmed])}<small>${r[F.mn] || 0}건</small></div></div>
      <div><div class="k">호가 전세 중위</div><div class="v">${eok(r[F.jmed])}<small>${r[F.jn] || 0}건</small></div></div>
      <div><div class="k">호가 전세가율</div><div class="v">${pct(ratioH)}</div></div>
      <div><div class="k">호가 범위</div><div class="v" style="font-size:12px">${r[F.mmin] ? eok(r[F.mmin]) + ' ~ ' + eok(r[F.mmax]) : '—'}</div></div>
      <div><div class="k">실거래 매매 중위 (24~26)</div><div class="v">${pp ? eok(pp[1]) : '—'}<small>${pp ? fmtN(pp[0]) + '건' : ''}</small></div></div>
      <div><div class="k">실거래 전세가율</div><div class="v">${pp && pp[7] != null ? pct(pp[7]) : '—'}</div></div>
      <div><div class="k">호가 괴리율</div><div class="v" style="color:${r[F.gap] > 20 ? 'var(--bad)' : 'inherit'}">${sgn(r[F.gap])}</div></div>
      <div><div class="k">평당가 (2024~26)</div><div class="v">${pp && pp[2] ? fmtN(pp[2]) + '만' : '—'}<small>/평</small></div></div>
    </div>
    ${bandRows ? `<div class="stitle">평형별 호가 (전용면적)</div>
    <div class="tblwrap" style="margin:0"><table><thead><tr><th>면적</th><th>매매</th><th>매매 중위</th><th>평당</th><th>전세</th><th>전세 중위</th></tr></thead><tbody>${bandRows}</tbody></table></div>` : ''}
    <div class="stitle">해석</div>
    <div style="font-size:11.5px;color:var(--sub);line-height:1.6">
      ${r[F.gap] != null ? `호가가 실거래보다 <b style="color:var(--label)">${Math.abs(r[F.gap]).toFixed(1)}% ${r[F.gap] > 0 ? '높습니다' : '낮습니다'}</b>. ` : ''}
      ${pp && pp[8] ? `최근 거래 ${pp[8].slice(0, 4)}.${pp[8].slice(4)}. ` : ''}
      ${ratioH != null && pp && pp[7] != null ? `호가 전세가율 ${ratioH.toFixed(1)}% vs 실거래 ${pp[7].toFixed(1)}% (${(ratioH - pp[7] > 0 ? '+' : '') + (ratioH - pp[7]).toFixed(1)}pp).` : ''}
      ${(pp && pp[2]) ? ` 실거래 평당 ${fmtN(pp[2])}만원.` : ''}
    </div>
    ${r[F.match] ? `<div class="meta" style="margin-top:8px">호가–실거래 연결: ${esc(r[F.match])}${r[F.match] === '확인필요' ? ' (단지명 유사도 낮음 · 값 해석 주의)' : ''}</div>` : ''}
  `;
  $('#sheet').classList.add('on'); $('#sheet').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('#sheet').classList.remove('on'); $('#sheet').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
$('#sheet').addEventListener('click', e => { if (e.target.dataset.close || e.target.classList.contains('bd')) closeSheet(); });

/* ── 05 월별 흐름 ─────────────────────────────────────── */
function renderFlow() {
  const host = $('#flowPlot'); if (!host) return;
  host.innerHTML = '';
  const key = (S.city === 'all' || S.sel.size) ? 'ALL' : CIDX.get(S.city).k;
  const scopeLabel = S.city === 'all' ? '지방 41개 구·군' : (S.sel.size ? S.city : S.city + ' 전체');
  const all = C.monthly[key] || [];
  const arr = all.slice(-36);
  const W = Math.max(270, Math.round(host.clientWidth || 320));
  const H = Math.round(clamp(W * 0.46, 200, 330));
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': '월별 거래량' });
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const maxv = Math.max.apply(null, arr.map(a => a[1] + a[2] + a[3]));
  const sc = niceTicks(0, maxv, 3);
  const bw = (W - pad.l - pad.r) / arr.length;
  sc.ticks.forEach(t => {
    const y = pad.t + (H - pad.t - pad.b) * (1 - t / sc.hi);
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: cv('--grid') }));
    svg.appendChild(txtEl(pad.l - 5, y + 3, t >= 10000 ? (t / 10000).toFixed(0) + '만' : fmtN(t), { 'text-anchor': 'end', 'font-size': 9, fill: cv('--axis') }));
  });
  const segs = [1, 2, 3], cols = [cv('--acc'), '#6FA88E', '#D9A760'];
  arr.forEach((a, i) => {
    let base = 0;
    segs.forEach((s, si) => {
      const v = a[s]; if (!v) return;
      const h = (H - pad.t - pad.b) * (v / sc.hi);
      const y = pad.t + (H - pad.t - pad.b) - base - h;
      svg.appendChild(svgEl('rect', { x: pad.l + i * bw + bw * 0.18, y: y, width: Math.max(1.2, bw * 0.64), height: h, fill: cols[si], opacity: si ? .8 : .95, rx: 1 }));
      base += h;
    });
    if (i % 6 === 0) {
      svg.appendChild(txtEl(pad.l + i * bw + bw / 2, H - 8, a[0].slice(2, 4) + '.' + a[0].slice(5), { 'text-anchor': 'middle', 'font-size': 8.5, fill: cv('--axis') }));
    }
  });
  host.appendChild(svg);
  $('#flowLegend').innerHTML = `<span><i style="background:${cols[0]}"></i>매매</span><span><i style="background:${cols[1]}"></i>전세</span><span><i style="background:${cols[2]}"></i>월세</span>`;
  $('#flowDesc').textContent = scopeLabel + ' · 최근 36개월 (2023-12~2026-11)';
  const last3 = arr.slice(-3), prev3 = arr.slice(-6, -3);
  const avg = a => a.reduce((s, x) => s + x[1], 0) / (a.length || 1);
  const l3 = avg(last3), p3 = avg(prev3);
  const ch = p3 ? (l3 / p3 - 1) * 100 : null;
  $('#flowInsight').innerHTML = `최근 3개월 월평균 매매 <b>${fmtN(l3)}건</b>` +
    (ch != null ? ` · 직전 3개월 대비 <em>${ch > 0 ? '+' : ''}${ch.toFixed(1)}%</em>` : '') +
    ` · 최근 12개월 월세 비중 <b>${pct(100 * arr.slice(-12).reduce((s, a) => s + a[3], 0) / Math.max(1, arr.slice(-12).reduce((s, a) => s + a[2] + a[3], 0)))}</b>`;
}

/* ── 데이터 노트 ─────────────────────────────────────── */
function renderNotes() {
  const c = COUNT;
  $('#notes').innerHTML = `
    <div class="src">
      <span>호가 12차 · 2026-11-26</span><span>실거래 2016-01~2026-11</span>
      <span>단지마스터 ${fmtN(c.masterCx)}단지</span><span>${fmtN(c.masterHh)}세대</span>
    </div>
    <b>원천</b>
    <ul>
      <li><b>호가</b> — 네이버부동산 단지별 매매·전세 매물 ${fmtN(125468)}·${fmtN(6743)}건(합 ${fmtN(132211)}건), 매물 있는 ${fmtN(c.hogaCxWithListing)}단지 / 300세대+ ${fmtN(c.hogaCx)}단지. 동일매물 묶기(ad=true) 기준이라 같은 집의 중복 광고는 1건.</li>
      <li><b>실거래</b> — 국토부 실거래가 2016~2026년 11개년, 6개 시도 원천 3,583,697행(해제 54,232 제외 후 3,529,465) 중 <b>41개 구·군 ${fmtN(c.txTotal)}건</b>(매매 ${fmtN(c.txMae)} · 전세 ${fmtN(c.txJeon)} · 월세 ${fmtN(c.txWolse)}). 해제 거래 54,232건 제외. 나머지는 아산·계룡 등 41개 지역 밖 시군구.</li>
      <li><b>전세가율</b> — 같은 단지의 매매·전세를 매칭한 단지 중위값(실거래 ${M.ratioMiddleReal}%). 호가는 매물 ${fmtN(COUNT.ratioCxHoga)}단지 기준으로 따로 계산합니다.</li>
      <li><b>괴리율</b> — 호가 매매중위 ÷ 실거래 매매중위 − 1. ${fmtN(c.gapCx)}단지 연결, 중위 +${M.gapMedian}%.</li>
    </ul>
    <b>읽는 법·한계</b>
    <ul>
      <li>2026년은 <b>1~11월(11/26까지)</b> 누계라 다른 해와 직접 비교하면 적게 보입니다. 차트의 마지막 점은 점선 음영으로 표시했습니다.</li>
      <li>호가는 <b>매물 호가</b>이지 체결가가 아닙니다. 실거래는 계약일 기준이며 2024~2026 단지 요약은 3년 누적입니다.</li>
      <li>다중 선택 시 중위가는 구·군별 분포를 합쳐 다시 계산합니다(1,000만원 버킷, 오차 ±500만원 이내).</li>
      <li>세대수는 단지마스터 기준. 호가 데이터가 없는 소형 단지는 '세대 미확인'으로, 세대수 필터를 걸면 빠집니다.</li>
      <li>괴리율은 표본이 적은 단지에서 크게 튑니다. '확인필요' 28곳은 단지명 유사도가 낮아 산점도에서 빈 원으로 표시했습니다.</li>
      <li>지역 라벨은 시·군·구 단위(예: 부산 해운대구)이고, 청주·천안은 충북·충남 소속입니다.</li>
    </ul>
    <div style="font-size:10.5px;color:var(--sub)">단지 단위 집계는 단지 요약(132,025건) 기준이라 원천 매물 수(132,211건)와 186건 차이가 있습니다. 수도권 83개 지역은 <a href="../" style="color:var(--acc);font-weight:700">METRO 83</a>에서 봅니다. 이 페이지는 지방 41개 지역 전용으로 완전히 분리된 데이터셋을 씁니다.</div>`;
}

/* ── 랭킹 PNG용 SVG ──────────────────────────────────── */
function buildRankSvg() {
  const met = RANK[S.rank];
  const list = SGG.filter(r => met.get(r) != null).slice().sort((a, b) => met.get(b) - met.get(a));
  const W = 900, rowH = 26, top = 66, H = top + list.length * rowH + 26;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: cv('--card') }));
  const t = txtEl(18, 30, 'REGIONAL 41 · 구·군 랭킹 — ' + met.l, { 'font-size': 20, 'font-weight': 800, fill: cv('--ink') });
  svg.appendChild(t);
  svg.appendChild(txtEl(18, 50, met.sub + ' · ' + list.length + '개 구·군 · ' + scopeName(), { 'font-size': 13, fill: cv('--sub') }));
  const maxv = met.get(list[0]), minv = Math.min.apply(null, list.map(r => met.get(r)));
  const bx = 210, bw = 520;
  list.forEach((r, i) => {
    const y = top + i * rowH;
    const v = met.get(r);
    const w = 6 + bw * (maxv === minv ? 1 : (v - minv) / (maxv - minv));
    svg.appendChild(txtEl(18, y + 17, String(i + 1), { 'font-size': 12, fill: cv('--axis'), 'font-weight': 700 }));
    svg.appendChild(txtEl(44, y + 17, r.n + ' (' + r.c + ')', { 'font-size': 14, fill: cv('--ink'), 'font-weight': 650 }));
    svg.appendChild(svgEl('rect', { x: bx, y: y + 6, width: bw, height: 10, rx: 5, fill: cv('--tile') }));
    svg.appendChild(svgEl('rect', { x: bx, y: y + 6, width: w, height: 10, rx: 5, fill: colorCity(r.c) }));
    svg.appendChild(txtEl(bx + bw + 12, y + 17, met.fmt(v), { 'font-size': 14, fill: cv('--ink'), 'font-weight': 750 }));
  });
  return svg;
}

/* ── PNG 저장 ────────────────────────────────────────── */
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent || '');
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function pngBlob(svg, foot) {
  return new Promise(res => {
    const vb = (svg.getAttribute('viewBox') || '0 0 1000 400').split(/\s+/).map(Number);
    const W = vb[2], H = vb[3], SC = 3, FOOT = 54;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', W); clone.setAttribute('height', H);
    const bg = svgEl('rect', { width: W, height: H, fill: cv('--card') });
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const cw = Math.round(W * SC), ch = Math.round((H + FOOT) * SC), fy = Math.round(H * SC);
      const cv2 = document.createElement('canvas'); cv2.width = cw; cv2.height = ch;
      const ctx = cv2.getContext('2d');
      ctx.fillStyle = cv('--card'); ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, fy);
      ctx.fillStyle = cv('--tile'); ctx.fillRect(0, fy, cw, ch - fy);
      ctx.fillStyle = cv('--acc'); ctx.fillRect(0, fy, Math.round(4 * SC), ch - fy);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = `600 ${11 * SC}px -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
      ctx.fillStyle = cv('--sub');
      const rw = ctx.measureText(foot.right).width;
      ctx.fillText(foot.right, cw - 14 * SC - rw, fy + (ch - fy) / 2);
      ctx.font = `700 ${12 * SC}px -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
      ctx.fillStyle = cv('--ink');
      let t = foot.left, maxw = cw - 28 * SC - rw - 10 * SC;
      while (ctx.measureText(t).width > maxw && t.length > 6) t = t.slice(0, -2);
      ctx.fillText(t, 18 * SC, fy + (ch - fy) / 2);
      cv2.toBlob(b => res(b), 'image/png');
    };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  });
}
function showPng(blob, name) {
  const m = $('#pngModal');
  if (m._url) URL.revokeObjectURL(m._url);
  m._url = URL.createObjectURL(blob);
  $('#pngImg').src = m._url; $('#pngName').textContent = name;
  m.classList.add('on'); m.setAttribute('aria-hidden', 'false');
  $('#pngDl').onclick = () => download(name, blob);
}
async function savePng(kind) {
  let svg, foot, name;
  if (kind === 'series') { svg = $('#seriesPlot svg'); foot = pngFooter('시계열 · ' + METRIC[S.series].l); name = 'regional41_시계열_' + METRIC[S.series].l; }
  if (kind === 'scatter') { svg = $('#scatterPlot svg'); foot = pngFooter('괴리율×전세가율'); name = 'regional41_괴리율산점도'; }
  if (kind === 'flow') { svg = $('#flowPlot svg'); foot = pngFooter('월별 거래 흐름'); name = 'regional41_월별거래'; }
  if (kind === 'rank') { svg = buildRankSvg(); foot = pngFooter('구·군 랭킹 · ' + RANK[S.rank].l); name = 'regional41_랭킹_' + RANK[S.rank].l; }
  if (!svg) return toast('차트를 먼저 표시해 주세요');
  const blob = await pngBlob(svg, foot); if (!blob) return toast('이미지 생성에 실패했습니다');
  const file = new File([blob], name + '.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return toast('공유 시트에서 「이미지 저장」을 고르면 사진첩에 저장됩니다');
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (IS_IOS) { showPng(blob, name + '.png'); toast('이미지를 길게 눌러 「사진에 저장」하세요'); }
  else { download(name + '.png', blob); toast('PNG 파일로 저장했습니다'); }
}
$$('[data-png]').forEach(b => b.onclick = () => savePng(b.dataset.png));
$('#pngModal').addEventListener('click', e => {
  if (e.target.dataset.pngclose) { $('#pngModal').classList.remove('on'); $('#pngModal').setAttribute('aria-hidden', 'true'); }
});

/* ── 테마 ────────────────────────────────────────────── */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('#themeBtn').textContent = t === 'dark' ? '☀' : '☾';
  const mc = document.querySelector('meta[name=theme-color]');
  if (mc) mc.setAttribute('content', t === 'dark' ? '#0D1420' : '#F4F6F9');
  try { localStorage.setItem('apt_theme', t); } catch (e) {}
}
$('#themeBtn').onclick = () => {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(t); renderSeries(); renderScatter(); renderFlow();
};

/* ── 상태 동기화·URL ─────────────────────────────────── */
let syncT;
function sync() {
  renderFilters(); renderKPI(); renderScopeStrip(); renderSeries(); renderRank();
  renderScatter(); renderCx(); renderFlow();
  clearTimeout(syncT); syncT = setTimeout(pushHash, 300);
}
function pushHash() {
  const p = [];
  if (S.city !== 'all') p.push('c=' + encodeURIComponent(S.city));
  if (S.sel.size) p.push('s=' + encodeURIComponent(Array.from(S.sel).join(',')));
  if (S.tier.size) p.push('t=' + Array.from(S.tier).join(','));
  if (S.area.size) p.push('a=' + Array.from(S.area).join(','));
  if (S.price.size) p.push('p=' + Array.from(S.price).join(','));
  if (S.series !== 'mmed') p.push('m=' + S.series);
  const h = p.length ? '#' + p.join('&') : location.pathname + location.search;
  try { history.replaceState(null, '', h); } catch (e) {}
}
function readHash() {
  const h = location.hash.replace(/^#/, ''); if (!h) return;
  const o = {}; h.split('&').forEach(kv => { const [k, v] = kv.split('='); o[k] = decodeURIComponent(v || ''); });
  if (o.c && (o.c === 'all' || CIDX.has(o.c))) S.city = o.c;
  if (o.s) o.s.split(',').filter(x => SGGI.has(x)).forEach(x => S.sel.add(x));
  if (o.t) o.t.split(',').forEach(x => S.tier.add(+x));
  if (o.a) o.a.split(',').forEach(x => S.area.add(+x));
  if (o.p) o.p.split(',').forEach(x => S.price.add(+x));
  if (o.m && METRIC[o.m]) S.series = o.m;
}

/* ── 검색 ────────────────────────────────────────────── */
$('#cxSearch').addEventListener('input', e => {
  S.q = e.target.value.trim(); S.page = 1;
  $('#cxClear').classList.toggle('hide', !S.q);
  renderCx();
});
$('#cxClear').onclick = () => { $('#cxSearch').value = ''; S.q = ''; S.page = 1; $('#cxClear').classList.add('hide'); renderCx(); };

/* ── 지연 로드: 실거래 전용 단지 ──────────────────────── */
function loadTx() {
  if (TX.length) return;
  const s = document.createElement('script');
  s.src = 'data/txonly.js';
  s.onload = () => { TX = window.TXONLY || []; renderCx(); renderScatter(); };
  document.body.appendChild(s);
}

/* ── 초기화 ──────────────────────────────────────────── */
function init() {
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  readHash();
  $('#hdmeta').innerHTML = `<span>기준일 <b>${M.asof}</b></span><span>호가 <b>${M.hogaAsOf}</b></span>` +
    `<span>실거래 <b>${fmtN(COUNT.txMae + COUNT.txJeon + 707673)}건</b></span><span>단지마스터 <b>${fmtN(COUNT.masterCx)}단지</b></span>`;
  renderSeriesTabs(); renderRankTabs(); renderCxTabs();
  sync(); renderNotes();
  setTimeout(loadTx, 900);
  requestAnimationFrame(() => { renderSeries(); renderScatter(); renderFlow(); });
  setTimeout(() => { renderSeries(); renderScatter(); renderFlow(); }, 320);
  let rT;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { renderSeries(); renderScatter(); renderFlow(); }, 180); });
  window.addEventListener('hashchange', () => {
    S.city = 'all'; S.sel.clear(); S.tier.clear(); S.area.clear(); S.price.clear(); readHash(); sync();
  });
}
init();
})();
