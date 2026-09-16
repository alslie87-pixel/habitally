/* ============================================================
   HABIT TRACKER — PROGRESS PAGE (Claude Design port) + ONBOARDING
   Self-contained. Loaded via <script src="stats.js" defer>.
   ============================================================ */
(function () {
  'use strict';
  const API = '/api';
  // multi-user: forward ?user= and ?t= (link token) on every API call
  const HT_QS_S = new URLSearchParams(location.search);
  const HT_USER_S = (HT_QS_S.get('user') || '').trim();
  const HT_TOKEN_S = (HT_QS_S.get('t') || '').trim();
  const localDateS = () => {
    const d = new Date(), p = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  const apiUrl = p => {
    const q = new URLSearchParams();
    if (HT_USER_S) q.set('user', HT_USER_S);
    if (HT_TOKEN_S) q.set('t', HT_TOKEN_S);
    q.set('date', localDateS());
    const s = q.toString();
    return s ? p + (p.includes('?') ? '&' : '?') + s : p;
  };
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\x27': '&#39;' })[c]);

  /* Manrope */
  const fl = document.createElement('link');
  fl.rel = 'stylesheet';
  fl.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(fl);

  const GRN = '#97C459', RED = '#F09595', GLD = '#FAC775', LAV = '#AFA9EC', PUR = '#7F77DD';
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONF = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const WD = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const css = `
  #stx-panel{
    --hxP:#08080C; --hxC:#17171F; --hxPage:#0D0D12;
    --hxB:rgba(255,255,255,0.055); --hxB2:rgba(255,255,255,0.05);
    --hxLine:rgba(255,255,255,0.04); --hxLine2:rgba(255,255,255,0.07);
    --hxTrack:rgba(255,255,255,0.045); --hxTrack2:rgba(255,255,255,0.055); --hxAvg:rgba(255,255,255,0.13);
    --hxTile:rgba(255,255,255,0.015); --hxArc:rgba(255,255,255,0.06);
    --hxT1:#F4F3F9; --hxT1b:#E8E7F0; --hxT1c:#C9C7D6; --hxT2:#8A879B;
    --hxT3:#6E6B80; --hxT4:#4F4C60; --hxT5:#5E5B70; --hxFoot:#3F3D4D;
    --hxYr0:#191921; --hxYrF:#101016;
    position:fixed;inset:0;background:var(--hxP);z-index:80;
    transform:translateX(100%);transition:transform .28s ease;overflow-y:auto;
    padding:22px 14px 50px 14px;-webkit-overflow-scrolling:touch;
    font-family:Manrope,system-ui,-apple-system,sans-serif;color:var(--hxT1b)}
  html.light #stx-panel{
    --hxP:var(--bg-page,#F2F1F7); --hxC:var(--bg-card,#FFFFFF); --hxPage:var(--bg-card,#FFFFFF);
    --hxB:rgba(24,20,50,0.10); --hxB2:rgba(24,20,50,0.08);
    --hxLine:rgba(24,20,50,0.06); --hxLine2:rgba(24,20,50,0.10);
    --hxTrack:rgba(24,20,50,0.07); --hxTrack2:rgba(24,20,50,0.08); --hxAvg:rgba(24,20,50,0.22);
    --hxTile:rgba(24,20,50,0.03); --hxArc:rgba(24,20,50,0.08);
    --hxT1:var(--text-primary,#1A1826); --hxT1b:var(--text-primary,#241F38); --hxT1c:#3A3550;
    --hxT2:var(--text-secondary,#5A5770); --hxT3:#6E6B84; --hxT4:#8A87A0; --hxT5:#7A7790; --hxFoot:#A8A5BC;
    --hxYr0:#E9E7F1; --hxYrF:#F2F0F8}
  #stx-panel.open{transform:translateX(0)}
  .hsx-page{max-width:760px;margin:0 auto;background:var(--hxPage);border:1px solid var(--hxB2);
    border-radius:22px;padding:20px;box-sizing:border-box;box-shadow:0 40px 90px -40px rgba(0,0,0,0.9)}
  .hsx-card{background:var(--hxC);border:1px solid var(--hxB);border-radius:16px;padding:18px;margin-top:14px}
  .hsx-k{font:700 10px/1 Manrope;letter-spacing:0.18em;color:var(--hxT3)}
  .hsx-k2{font:600 9.5px/1 Manrope;letter-spacing:0.12em;color:var(--hxT4)}
  .hsx-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .hsx-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  @media(min-width:640px){.hsx-tiles{grid-template-columns:repeat(4,1fr)}}
  .hsx-back{color:var(--hxT2);font:600 12px Manrope;cursor:pointer;padding:4px 0}
  .hsx-theme{cursor:pointer;padding:6px 13px;border-radius:999px;font:700 11px Manrope;letter-spacing:0.04em;background:var(--hxTile);border:1px solid var(--hxB);color:var(--hxT2)}
  @keyframes haloPulse{0%,100%{opacity:.5}50%{opacity:1}}
  #stx-fab{position:fixed;right:14px;bottom:14px;z-index:70;background:#7F77DD;color:#fff;
    border:none;border-radius:50%;width:44px;height:44px;cursor:pointer;
    box-shadow:0 4px 14px rgba(0,0,0,.4), inset 0 1px 2px rgba(255,255,255,.25), inset 0 -2px 4px rgba(0,0,0,.3);
    display:flex;align-items:center;justify-content:center}
  #obx{position:fixed;inset:0;background:var(--bg-page);z-index:90;overflow-y:auto;
    padding:24px 18px;display:none}
  #obx.show{display:block}
  .obx-wrap{max-width:420px;margin:0 auto}
  .obx-dots{text-align:center;color:var(--text-secondary);font-size:10px;margin-bottom:18px}
  .obx-big{text-align:center;font-size:34px;margin-bottom:10px}
  .obx-t{text-align:center;font-weight:700;font-size:17px;margin-bottom:6px}
  .obx-s{text-align:center;color:var(--text-secondary);font-size:12px;line-height:1.6;margin-bottom:16px}
  .obx-info{border-radius:12px;padding:12px;margin-bottom:10px;background:var(--bg-card)}
  .obx-info b{font-size:12px}
  .obx-info div{font-size:10px;color:var(--text-secondary);margin-top:3px}
  .obx-lbl{font-size:10px;font-weight:600;margin:10px 0 5px 0}
  .obx-item{background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;
    padding:9px 12px;margin-bottom:5px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}
  .obx-item input{background:transparent;border:none;color:var(--text-primary);font-size:13px;
    width:100%;outline:none}
  .obx-item.sel{border-color:#639922;background:var(--bg-card-inner)}
  .obx-item.selbad{border-color:#A32D2D;background:var(--bg-card-inner)}
  .obx-btn{display:block;width:100%;background:#7F77DD;border:none;border-radius:12px;
    padding:13px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;margin-top:16px}
  .obx-btn:disabled{opacity:.4}
  .obx-add{border:1px dashed var(--border-default);border-radius:10px;padding:8px;text-align:center;color:var(--text-secondary);font-size:11px;cursor:pointer;margin-bottom:5px}
  .obx-foot{text-align:center;color:var(--text-secondary);font-size:9px;margin-top:10px}`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* carved bars icon */
  const STX_P = 'M6 18V11 M12 18V6 M18 18V14';
  const stxIcon = (size, mainColor) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block">` +
    `<g fill="none" stroke-linecap="round">` +
    `<path d="${STX_P}" stroke="#000" stroke-opacity=".5" stroke-width="3.4" transform="translate(0,0.7)"/>` +
    `<path d="${STX_P}" stroke="#E6E3FF" stroke-opacity=".45" stroke-width="3.4" transform="translate(0,-0.6)"/>` +
    `<path d="${STX_P}" stroke="${mainColor || '#100E24'}" stroke-width="2.9"/>` +
    `</g></svg>`;

  /* ---------- state ---------- */
  let S = null;
  let loadError = null;   // message from the last failed load(); null while loading / after success
  let inflight = null;    // promise of the load() currently running
  const UI = { mi: null, open: null, pd: null, sb: null, day: null };

  /* ---------- panel + fab ---------- */
  const panel = document.createElement('div');
  panel.id = 'stx-panel';
  document.body.appendChild(panel);

  const fab = document.createElement('button');
  fab.id = 'stx-fab';
  fab.title = 'Progress';
  fab.innerHTML = stxIcon(24);
  fab.onclick = openPanel;
  document.body.appendChild(fab);

  function openPanel() { if (!S) loadError = null; render(); panel.classList.add('open'); }
  function closePanel() { panel.classList.remove('open'); }

  /* swipe with horizontal-scroller guard */
  let tx = null, ty = null, txTarget = null;
  document.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX; ty = e.touches[0].clientY; txTarget = e.target;
  }, { passive: true });
  function inHorizontalScroller(el) {
    while (el && el !== document.body) {
      if (el.scrollWidth > el.clientWidth + 5) {
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      el = el.parentElement;
    }
    return false;
  }
  document.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = Math.abs(e.changedTouches[0].clientY - ty);
    if (Math.abs(dx) > 70 && dy < 60) {
      const fromScroller = !panel.classList.contains('open') && inHorizontalScroller(txTarget);
      if (dx < 0 && !panel.classList.contains('open') && !fromScroller) openPanel();
      if (dx > 0 && panel.classList.contains('open')) closePanel();
    }
    tx = null;
  }, { passive: true });

  /* ---------- svg helpers ---------- */
  function smooth(pts) {
    if (pts.length < 2) return '';
    let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    return d;
  }
  function pol(cx, cy, r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  function arcPath(cx, cy, r, a0, a1) {
    const s = pol(cx, cy, r, a0), e = pol(cx, cy, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return 'M ' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + e.x.toFixed(2) + ' ' + e.y.toFixed(2);
  }
  /* ---------- render ---------- */
  function render() {
    if (!S) {
      if (loadError) {
        // one failed attempt -> show the error and wait for the user; never re-fetch on our own
        panel.innerHTML = '<div class="hsx-page"><div class="hsx-back">← back</div>' +
          '<div style="padding:40px 24px;text-align:center">' +
          '<div style="font:700 15px Manrope;color:var(--hxT1);margin-bottom:8px">Couldn’t load your stats</div>' +
          '<div style="font:500 12px/1.6 Manrope;color:var(--hxT3);margin-bottom:22px">Check your connection and try again. If it keeps failing, make sure all twelve month tabs still exist in your sheet.</div>' +
          '<button id="hsx-retry" style="font:700 13px Manrope;padding:10px 22px;border-radius:100px;border:1px solid var(--hxB2);background:transparent;color:var(--hxT1);cursor:pointer">Try again</button>' +
          '<div style="font:500 10px Manrope;color:var(--hxFoot);margin-top:18px;word-break:break-word">' + esc(loadError) + '</div>' +
          '</div></div>';
        bindBack();
        const rb = $('#hsx-retry', panel);
        if (rb) rb.onclick = () => { loadError = null; render(); };
        return;
      }
      panel.innerHTML = '<div class="hsx-page"><div class="hsx-back">← back</div><div style="padding:30px;text-align:center;color:var(--hxT3);font:600 12px Manrope">Loading…</div></div>';
      bindBack(); load().then(() => render()); return;
    }
    if (S.outOfYear) {
      panel.innerHTML = '<div class="hsx-page"><div class="hsx-back">← back</div>' +
        '<div style="padding:40px 24px;text-align:center">' +
        '<div style="font-size:34px;margin-bottom:14px">🗓️</div>' +
        '<div style="font:500 13px/1.7 Manrope;color:var(--hxT2)">' + esc(S.message) + '</div>' +
        '</div></div>';
      bindBack(); return;
    }
    const now = new Date();
    const curM = now.getMonth();
    const yr = now.getFullYear();
    const cw = 500;

    let MV = S.months.slice(0, curM + 1).map(m => Math.round((m.good || 0) * 100));
    if (!MV.length) MV = [0];
    const single = MV.length === 1;
    if (UI.mi === null || UI.mi >= MV.length) UI.mi = MV.length - 1;
    const mi = UI.mi;

    const H = (S.momentum || []).map(m => {
      const mx = (S.matrix || []).find(x => x.name === m.name);
      return {
        n: m.name, p: m.now == null ? 0 : m.now, d: m.delta == null ? 0 : m.delta,
        s: (m.series && m.series.length > 1) ? m.series : [(m.now || 0), (m.now || 0)],
        b: m.bestStreak || 0, all: m.allTime || 0,
        row: mx ? mx.days.map(v => v == null ? 0 : v) : [0,0,0,0,0,0,0]
      };
    });

    const dayMap = {};
    (S.daily || []).forEach(d => { dayMap[d.t] = d.p; });
    const dailyVals = (S.daily || []).map(d => d.p * 100);
    const score = dailyVals.length ? Math.round(dailyVals.reduce((a,b)=>a+b,0) / dailyVals.length) : 0;
    let wkS = 0, wkN = 0, weS = 0, weN = 0;
    (S.daily || []).forEach(d => {
      const wd = (new Date(d.t + 'T00:00:00').getDay() + 6) % 7;
      if (wd >= 5) { weS += d.p * 100; weN++; } else { wkS += d.p * 100; wkN++; }
    });
    const wkday = wkN ? Math.round(wkS / wkN) : 0;
    const wkend = weN ? Math.round(weS / weN) : 0;

    const pd = (S.weekday || []).map(v => v == null ? 0 : v);
    while (pd.length < 7) pd.push(0);
    const bestD = pd.indexOf(Math.max.apply(null, pd));

    const bestPrev = curM > 0 ? Math.max.apply(null, MV.slice(0, curM)) : null;
    const vsTile = bestPrev !== null ? ((MV[curM] - bestPrev >= 0 ? '+' : '') + (MV[curM] - bestPrev)) : '–';
    const tiles = [
      { v: S.perfectDays, l: 'PERFECT DAYS', c: '#F4F3F9' },
      { v: (S.checksYTD || 0).toLocaleString(), l: 'HABIT WINS', c: '#F4F3F9' },
      { v: S.comebacks, l: 'COMEBACKS', c: '#F4F3F9' },
      { v: vsTile, l: 'VS BEST MONTH', c: GLD }
    ];

    /* momentum */
    const mh = 152, top = 16, base = 120;
    let dmin = Math.min.apply(null, MV) - 16, dmax = Math.max.apply(null, MV) + 10;
    if (dmax - dmin < 12) { dmax += 6; dmin -= 6; }
    const yOf = x => top + (1 - (x - dmin) / (dmax - dmin)) * (base - top);
    const n = MV.length, step = cw / n, padX = step / 2;
    const pts = MV.map((m, i) => ({ x: padX + i * step, y: yOf(m) }));
    let momPath;
    if (single) {
      momPath = 'M 0 ' + pts[0].y.toFixed(1) + ' L ' + cw + ' ' + pts[0].y.toFixed(1);
    } else {
      const line = smooth(pts);
      momPath = 'M 0 ' + pts[0].y.toFixed(1) + ' L ' + line.slice(2) + ' L ' + cw + ' ' + pts[n-1].y.toFixed(1);
    }
    const momArea = momPath + ' L ' + cw + ' ' + base + ' L 0 ' + base + ' Z';
    const dl = mi === 0 ? 0 : MV[mi] - MV[mi - 1];
    const hSub = mi === 0 ? MONF[0] + ' · first month tracked'
      : MONF[mi] + ' vs ' + MONF[mi - 1] + (mi === curM ? ' · ' + now.getDate() + ' days in' : '');

    const momSvg = `
      <svg width="100%" height="152" viewBox="0 0 ${cw} ${mh}" preserveAspectRatio="none" style="display:block">
      <defs>
        <linearGradient id="hsFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${PUR}" stop-opacity="0.40"/><stop offset="0.5" stop-color="${PUR}" stop-opacity="0.13"/><stop offset="1" stop-color="${PUR}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="hsLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${PUR}"/><stop offset="1" stop-color="${LAV}"/></linearGradient>
        <filter id="hsBlur" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      ${[0.34,0.67,1].map(t => `<line x1="0" y1="${(top + t*(base-top)).toFixed(1)}" x2="${cw}" y2="${(top + t*(base-top)).toFixed(1)}" stroke="var(--hxLine)"/>`).join('')}
      <path d="${momArea}" fill="url(#hsFill)"/>
      <path d="${momPath}" fill="none" stroke="url(#hsLine)" stroke-width="7" opacity="0.22" filter="url(#hsBlur)" stroke-linecap="round"/>
      <path d="${momPath}" fill="none" stroke="url(#hsLine)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="${pts[mi].x.toFixed(1)}" y1="${pts[mi].y.toFixed(1)}" x2="${pts[mi].x.toFixed(1)}" y2="${base}" stroke="rgba(175,169,236,0.22)" stroke-dasharray="2 3"/>
      <circle cx="${pts[mi].x.toFixed(1)}" cy="${pts[mi].y.toFixed(1)}" r="12" fill="rgba(175,169,236,0.14)" style="animation:haloPulse 2.8s ease-in-out infinite"/>
      <circle cx="${pts[mi].x.toFixed(1)}" cy="${pts[mi].y.toFixed(1)}" r="5.4" fill="var(--hxPage)" stroke="${LAV}" stroke-width="2.4"/>
      ${MV.map((m,i)=>`<rect data-mi="${i}" x="${(i*step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${mh}" fill="transparent" style="cursor:pointer"/>`).join('')}
      </svg>
      <div style="display:flex;margin-top:8px">
        ${MV.map((m,i)=>`<div style="flex:1 1 0;text-align:center;font:600 10px Manrope;letter-spacing:0.04em;color:${i===mi?LAV:'#4F4C60'}">${MON[i]}</div>`).join('')}
      </div>`;

    /* habit momentum */
    const sw = cw;
    const habitRows = H.map((h, i) => {
      const open = UI.open === i;
      let spark = '';
      if (open) {
        const lo = Math.min.apply(null, h.s) - 8, hi = Math.max.apply(null, h.s) + 6;
        const sp = h.s.map((val, j) => ({ x: (j / (h.s.length - 1)) * sw, y: 6 + (1 - (val - lo) / (hi - lo)) * 34 }));
        const path = smooth(sp);
        spark = `<div style="padding:2px 0 18px">
          <svg width="100%" height="46" viewBox="0 0 ${sw} 46" preserveAspectRatio="none" style="display:block">
            <defs><linearGradient id="sk${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PUR}" stop-opacity="0.3"/><stop offset="1" stop-color="${PUR}" stop-opacity="0"/></linearGradient></defs>
            <path d="${path} L ${sw} 40 L 0 40 Z" fill="url(#sk${i})"/>
            <path d="${path}" fill="none" stroke="#8B84E2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${sp[sp.length-1].x.toFixed(1)}" cy="${sp[sp.length-1].y.toFixed(1)}" r="3.4" fill="${LAV}"/>
          </svg>
          <div style="display:flex;gap:18px;margin-top:11px">
            <div style="font:500 11px/1.5 Manrope;color:var(--hxT2)">Best streak <span style="color:var(--hxT1b);font-weight:700">${h.b} days</span></div>
            <div style="font:500 11px/1.5 Manrope;color:var(--hxT2)">All-time <span style="color:var(--hxT1b);font-weight:700">${h.all}%</span></div>
          </div></div>`;
      }
      const col = h.d > 0 ? GRN : (h.d < 0 ? RED : 'var(--hxT3)');
      const dot = h.p >= 75 ? 'rgba(151,196,89,0.85)' : (h.p >= 55 ? 'rgba(250,199,117,0.8)' : 'rgba(240,149,149,0.8)');
      return `<div style="border-bottom:1px solid var(--hxB2)">
        <div data-open="${i}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0;cursor:pointer">
          <div style="display:flex;align-items:center;gap:9px;min-width:0">
            <div style="width:5px;height:5px;border-radius:999px;flex:none;background:${dot}"></div>
            <div style="font:600 13.5px/1.4 Manrope;color:var(--hxT1b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.n}</div>
          </div>
          <div style="display:flex;align-items:center;gap:11px;flex:none">
            <div style="font:700 13.5px/1 Manrope;color:var(--hxT1c);font-variant-numeric:tabular-nums">${h.p}%</div>
            <div style="font:700 11.5px/1 Manrope;color:${col};min-width:34px;text-align:right">${h.d >= 0 ? '↑ ' : '↓ '}${Math.abs(h.d)}</div>
          </div>
        </div>${spark}</div>`;
    }).join('');

    /* consistency arc */
    const A0 = 132, SWP = 276, R = 56, CX = 73, CY = 62;
    const tip = pol(CX, CY, R, A0 + SWP * Math.min(100, score) / 100);

    /* power days */
    const sel = UI.pd == null ? bestD : UI.pd;
    const tX = 40, tW = cw - 96, rowH = 32, pdH = 7 * rowH;
    const lanes = pd.map((val, i) => ({ i, val })).sort((a, b) => b.val - a.val).map((o, ri) => {
      const y = ri * rowH + 4;
      return { i: o.i, val: o.val, y, isB: o.i === bestD, isS: o.i === sel };
    });

    /* slope chart */
    const px5 = 22, sx5 = (cw - 44) / 6;
    const y5 = val => 150 - (Math.max(0, Math.min(100, val)) / 100) * 130;
    const means = H.map(h => h.row.reduce((a,b)=>a+b,0) / 7);
    const weak = means.length ? means.indexOf(Math.min.apply(null, means)) : 0;
    const focusIdx = UI.sb == null ? weak : UI.sb;

    /* year grid */
    const gap = 1.6;
    const cell = (cw + gap) / 53 - gap;
    const jan1wd = (new Date(yr, 0, 1).getDay() + 6) % 7;
    const lv = ['var(--hxYr0)','rgba(151,196,89,0.20)','rgba(151,196,89,0.38)','rgba(151,196,89,0.62)',GRN];
    const yrCells = [];
    for (let i = 0; i < 366; i++) {
      const dt = new Date(yr, 0, 1 + i);
      if (dt.getFullYear() !== yr) break;
      const wd = (dt.getDay() + 6) % 7;
      const k = jan1wd + i, colI = Math.floor(k / 7);
      const iso = yr + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
      const future = dt > now;
      let fill = 'var(--hxYrF)';
      if (!future) {
        const p = dayMap[iso];
        const lvl = p == null || p === 0 ? 0 : (p <= 0.34 ? 1 : (p <= 0.67 ? 2 : (p < 0.999 ? 3 : 4)));
        fill = lv[lvl];
      }
      yrCells.push({ x: (colI * (cell + gap)).toFixed(2), y: (wd * (cell + gap)).toFixed(2), fill, iso, p: dayMap[iso], future });
    }
    const yrH = (7 * (cell + gap) - gap).toFixed(1);
    const selDay = UI.day != null ? yrCells.find(c => c.iso === UI.day) : null;
    const yrNote = selDay ? selDay.iso + ' · ' + Math.round((selDay.p || 0) * 100) + '%' : (S.daily || []).length + ' days logged';
    const yrCol = selDay ? ((selDay.p || 0) >= 0.8 ? GRN : ((selDay.p || 0) >= 0.5 ? 'var(--hxT1c)' : RED)) : 'var(--hxT2)';

    /* leaderboard */
    const badge = [
      { bg: GLD, fg: '#17171F', bd: GLD },
      { bg: 'rgba(175,169,236,0.9)', fg: '#17171F', bd: 'rgba(175,169,236,0.9)' },
      { bg: 'rgba(175,169,236,0.14)', fg: LAV, bd: 'rgba(175,169,236,0.4)' }
    ];
    const board = H.map(h => ({ n: h.n, b: h.b, all: h.all }))
      .sort((a, b) => b.all - a.all)
      .map((h, i) => Object.assign(h, { rank: i + 1,
        bg: badge[i] ? badge[i].bg : 'transparent',
        fg: badge[i] ? badge[i].fg : 'var(--hxT5)',
        bd: badge[i] ? badge[i].bd : 'var(--hxB)',
        pc: i === 0 ? GLD : 'var(--hxT1c)' }));

    const monthsIn = curM + 1;
    const scrollY = panel.scrollTop;

    panel.innerHTML = `
    <div class="hsx-page">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:2px 2px 18px">
      <div style="display:flex;flex-direction:column;gap:7px">
        <div class="hsx-back">← back</div>
        <div style="display:flex;align-items:center;gap:9px">${stxIcon(20, PUR)}
          <div style="font:800 25px/1 Manrope;letter-spacing:-0.03em;color:var(--hxT1)">${monthsIn === 1 ? 'First month in' : monthsIn + ' months in'}</div>
        </div>
        <div style="font:500 12px/1.4 Manrope;color:var(--hxT2)">Jan 1 – ${MON[curM]} ${now.getDate()}, ${yr} · ${H.length} habits</div>
      </div>
      <div class="hsx-theme" id="hsx-theme">${document.documentElement.classList.contains('light') ? '☾ Dark' : '☀ Light'}</div>
      </div>

      <div class="hsx-tiles">
        ${tiles.map(t => `<div style="background:var(--hxTile);border:1px solid var(--hxB2);border-radius:14px;padding:15px 14px;display:flex;flex-direction:column;gap:7px">
          <div style="font:800 23px/1 Manrope;letter-spacing:-0.03em;color:${t.c}">${t.v}</div>
          <div style="font:700 9px/1.3 Manrope;letter-spacing:0.14em;color:var(--hxT5)">${t.l}</div>
        </div>`).join('')}
      </div>

      <div class="hsx-card" style="padding:18px 18px 14px">
        <div class="hsx-row"><div class="hsx-k">MOMENTUM</div><div class="hsx-k2">MONTHLY COMPLETION</div></div>
        <div style="display:flex;align-items:flex-end;gap:10px;margin:16px 0 0">
          <div style="font:800 46px/0.9 Manrope;letter-spacing:-0.04em;color:var(--hxT1)">${MV[mi]}<span style="font:700 19px Manrope;color:var(--hxT2)">%</span></div>
          <div style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;font:700 11.5px Manrope;background:${dl >= 0 ? 'rgba(151,196,89,0.12)' : 'rgba(240,149,149,0.11)'};color:${dl >= 0 ? GRN : RED};margin-bottom:7px">${dl >= 0 ? '↑ ' : '↓ '}${Math.abs(dl)} pts</div>
        </div>
        <div style="font:500 12px/1 Manrope;color:var(--hxT2);margin:9px 0 10px">${hSub}</div>
        ${momSvg}
      </div>

      <div class="hsx-card" style="padding:18px 18px 8px">
        <div class="hsx-row"><div class="hsx-k">HABIT MOMENTUM</div><div class="hsx-k2">VS ${curM > 0 ? MONF[curM-1].toUpperCase() : 'LAST MONTH'}</div></div>
        <div style="display:flex;flex-direction:column;margin-top:6px">${habitRows}</div>
      </div>

      <div class="hsx-card">
        <div class="hsx-k">CONSISTENCY</div>
        <div style="display:flex;align-items:center;gap:18px;margin-top:12px;flex-wrap:wrap">
          <div style="position:relative;width:146px;height:132px;flex:none">
            <svg width="146" height="132" viewBox="0 0 146 132" style="display:block;overflow:visible">
              <defs><linearGradient id="hsArc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${PUR}"/><stop offset="1" stop-color="${LAV}"/></linearGradient></defs>
              <path d="${arcPath(CX, CY, R, A0, A0 + SWP)}" fill="none" stroke="var(--hxArc)" stroke-width="10" stroke-linecap="round"/>
              <path d="${arcPath(CX, CY, R, A0, A0 + SWP * Math.min(100, score) / 100)}" fill="none" stroke="url(#hsArc)" stroke-width="10" stroke-linecap="round"/>
              <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="9" fill="rgba(175,169,236,0.16)"/>
              <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="3.4" fill="#DAD6FA"/>
            </svg>
            <div style="position:absolute;left:0;top:0;width:146px;height:124px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;pointer-events:none">
              <div style="font:800 34px/1 Manrope;letter-spacing:-0.04em;color:var(--hxT1)">${score}</div>
              <div style="font:700 9px/1 Manrope;letter-spacing:0.18em;color:var(--hxT3)">ON PLAN</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px;flex:1 1 180px;min-width:0">
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;align-items:baseline;justify-content:space-between"><div style="font:600 11.5px Manrope;color:var(--hxT2)">Weekdays</div><div style="font:800 15px Manrope;color:var(--hxT1b)">${wkday}%</div></div>
              <div style="height:5px;border-radius:999px;background:var(--hxTrack2);overflow:hidden"><div style="width:${wkday}%;height:100%;border-radius:999px;background:${GRN}"></div></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;align-items:baseline;justify-content:space-between"><div style="font:600 11.5px Manrope;color:var(--hxT2)">Weekends</div><div style="font:800 15px Manrope;color:var(--hxT1b)">${wkend}%</div></div>
              <div style="height:5px;border-radius:999px;background:var(--hxTrack2);overflow:hidden"><div style="width:${wkend}%;height:100%;border-radius:999px;background:${RED}"></div></div>
            </div>
            <div style="font:600 11px/1.4 Manrope;color:${wkday - wkend > 0 ? RED : GRN};white-space:nowrap">${wkday - wkend > 0 ? 'Weekend dip · ' + (wkday - wkend) + ' pts' : 'Weekend lift · ' + (wkend - wkday) + ' pts'}</div>
          </div>
        </div>
      </div>

      <div class="hsx-card" style="padding:18px 18px 12px">
        <div class="hsx-row"><div class="hsx-k">POWER DAYS</div>
          <div style="padding:5px 10px;border-radius:999px;background:${sel === bestD ? 'rgba(250,199,117,0.12)' : 'rgba(175,169,236,0.12)'};font:700 11px Manrope;color:${sel === bestD ? GLD : LAV}">${UI.pd == null ? 'Best · ' : ''}${WD[sel]} ${pd[sel]}%</div>
        </div>
        <div style="position:relative;height:13px;margin-top:16px">
          <div style="position:absolute;left:${((tX + tW * score / 100) / cw * 100).toFixed(1)}%;top:0;transform:translateX(-50%);font:700 8.5px/1 Manrope;letter-spacing:0.14em;color:var(--hxT4);white-space:nowrap">AVG ${score}</div>
        </div>
        <div style="position:relative">
          <svg width="100%" height="${pdH}" viewBox="0 0 ${cw} ${pdH}" preserveAspectRatio="none" style="display:block">
            <line x1="${(tX + tW * score / 100).toFixed(1)}" y1="0" x2="${(tX + tW * score / 100).toFixed(1)}" y2="${pdH}" stroke="var(--hxAvg)" stroke-dasharray="2 4"/>
            ${lanes.map(o => `<g data-pd="${o.i}" style="cursor:pointer">
              <rect x="0" y="${o.y - 10}" width="${cw}" height="32" fill="transparent"/>
              <rect x="${tX}" y="${o.y}" width="${tW.toFixed(1)}" height="12" rx="6" fill="var(--hxTrack)"/>
              <rect x="${tX}" y="${o.y}" width="${(tW * o.val / 100).toFixed(1)}" height="12" rx="6" fill="${o.isB ? GLD : (o.isS ? LAV : 'rgba(127,119,221,0.40)')}"/>
            </g>`).join('')}
          </svg>
          ${lanes.map(o => `<div style="position:absolute;left:0;top:${((o.y + 6) / pdH * 100).toFixed(1)}%;transform:translateY(-50%);font:700 11px/1 Manrope;letter-spacing:0.06em;color:${o.isB || o.isS ? 'var(--hxT1c)' : 'var(--hxT5)'};pointer-events:none">${WD[o.i].toUpperCase()}</div>`).join('')}
          ${lanes.map(o => `<div style="position:absolute;right:0;top:${((o.y + 6) / pdH * 100).toFixed(1)}%;transform:translateY(-50%);font:800 12px/1 Manrope;color:${o.isB ? GLD : (o.isS ? LAV : 'var(--hxT2)')};pointer-events:none">${o.val}%</div>`).join('')}
        </div>
      </div>

      <div class="hsx-card">
        <div class="hsx-row"><div class="hsx-k">WHERE HABITS BREAK</div>
          <div style="font:600 11px/1 Manrope;color:${UI.sb == null ? 'var(--hxT2)' : LAV}">${UI.sb == null ? (H[weak] ? 'Lowest line: ' + H[weak].n : '') : H[UI.sb].n + ' · low ' + Math.min.apply(null, H[UI.sb].row) + '%'}</div>
        </div>
        <div style="position:relative;margin-top:14px">
          <svg width="100%" height="164" viewBox="0 0 ${cw} 164" preserveAspectRatio="none" style="display:block">
            <rect x="${(px5 + 4 * sx5 - sx5 * 0.5).toFixed(1)}" y="0" width="${(sx5 * 2).toFixed(1)}" height="150" rx="10" fill="rgba(240,149,149,0.055)"/>
            <line x1="0" y1="${y5(score).toFixed(1)}" x2="${cw}" y2="${y5(score).toFixed(1)}" stroke="var(--hxLine2)" stroke-dasharray="2 4"/>
            ${H.map((h, i) => {
              const p = smooth(h.row.map((v, j) => ({ x: px5 + j * sx5, y: y5(v) })));
              const on = i === focusIdx;
              return `<path d="${p}" fill="none" stroke="${on ? (UI.sb == null ? RED : LAV) : (UI.sb == null ? 'rgba(127,119,221,0.26)' : 'rgba(127,119,221,0.13)')}" stroke-width="${on ? 2.4 : 1.4}" stroke-linecap="round" stroke-linejoin="round"/>`;
            }).join('')}
            ${H[focusIdx] ? H[focusIdx].row.map((v, j) => `<circle cx="${(px5 + j * sx5).toFixed(1)}" cy="${y5(v).toFixed(1)}" r="3.2" fill="${UI.sb == null ? RED : LAV}"/>`).join('') : ''}
          </svg>
          <div style="position:absolute;left:0;top:${(y5(score) / 164 * 100).toFixed(1)}%;transform:translateY(-50%);font:700 8px/1 Manrope;letter-spacing:0.14em;color:var(--hxT4);background:var(--hxC);padding-right:5px">AVG</div>
        </div>
        <div style="display:flex">
          ${WD.map((w, i) => `<div style="flex:1 1 0;text-align:center;font:700 10px/1 Manrope;letter-spacing:0.06em;color:${i >= 4 && i <= 5 ? 'var(--hxT2)' : '#4F4C60'}">${w.slice(0,2).toUpperCase()}</div>`).join('')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:16px">
          ${H.map((h, i) => {
            const on = i === focusIdx;
            return `<div data-sb="${i}" style="cursor:pointer;padding:6px 10px;border-radius:999px;font:600 10.5px/1 Manrope;background:${on ? 'rgba(175,169,236,0.14)' : 'transparent'};color:${on ? LAV : 'var(--hxT3)'};border:1px solid ${on ? 'rgba(175,169,236,0.35)' : 'var(--hxB)'}">${h.n}</div>`;
          }).join('')}
        </div>
      </div>

      <div class="hsx-card">
        <div class="hsx-row"><div class="hsx-k">YOUR YEAR</div><div style="font:600 11px/1 Manrope;color:${yrCol}">${yrNote}</div></div>
        <div style="display:flex;margin:16px 0 6px">
          ${MON.map(m => `<div style="flex:1 1 0;font:700 9px Manrope;letter-spacing:0.1em;color:var(--hxT4)">${m[0]}</div>`).join('')}
        </div>
        <svg width="100%" height="${yrH}" viewBox="0 0 ${cw} ${yrH}" preserveAspectRatio="none" style="display:block">
          ${yrCells.map(c => `<rect data-day="${c.future ? '' : c.iso}" x="${c.x}" y="${c.y}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${(cell * 0.28).toFixed(2)}" fill="${c.fill}"${c.future ? '' : ' style="cursor:pointer"'}/>`).join('')}
        </svg>
      </div>

      <div class="hsx-card" style="padding:18px 18px 10px">
        <div class="hsx-row"><div class="hsx-k">LEADERBOARD</div><div class="hsx-k2">ALL TIME</div></div>
        <div style="display:flex;flex-direction:column;margin-top:4px">
          ${board.map(b => `<div style="display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--hxB2)">
            <div style="width:23px;height:23px;border-radius:999px;flex:none;display:flex;align-items:center;justify-content:center;font:800 11px Manrope;background:${b.bg};color:${b.fg};border:1px solid ${b.bd}">${b.rank}</div>
            <div style="font:600 13.5px/1.4 Manrope;color:var(--hxT1b);flex:1 1 0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.n}</div>
            <div style="font:500 11px/1 Manrope;color:var(--hxT3);flex:none">${b.b}d best</div>
            <div style="font:800 14px/1 Manrope;color:${b.pc};flex:none;font-variant-numeric:tabular-nums">${b.all}%</div>
          </div>`).join('')}
        </div>
      </div>

      <div style="margin-top:14px;background:rgba(151,196,89,0.06);border:1px solid rgba(151,196,89,0.25);border-radius:12px;padding:10px;text-align:center;font:600 11px Manrope;color:${GRN}">Full honest breakdown → 📈 Insights in your sheet</div>
      <div style="text-align:center;font:500 10.5px/1.6 Manrope;color:var(--hxFoot);padding:18px 0 4px">${(S.daily || []).length} days tracked · updated today</div>
    </div>`;

    bindBack();
    panel.querySelectorAll('[data-mi]').forEach(el => el.addEventListener('click', () => { UI.mi = +el.dataset.mi; render(); }));
    panel.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.open; UI.open = UI.open === i ? null : i; render(); }));
    panel.querySelectorAll('[data-pd]').forEach(el => el.addEventListener('click', () => { UI.pd = +el.dataset.pd; render(); }));
    panel.querySelectorAll('[data-sb]').forEach(el => el.addEventListener('click', () => { UI.sb = +el.dataset.sb; render(); }));
    panel.querySelectorAll('[data-day]').forEach(el => el.addEventListener('click', () => { if (el.dataset.day) { UI.day = el.dataset.day; render(); } }));
    panel.scrollTop = scrollY;
  }
  function bindBack() {
    const b = $('.hsx-back', panel); if (b) b.onclick = closePanel;
    const t = $('#hsx-theme', panel);
    if (t) t.onclick = () => {
      if (typeof window.toggleTheme === 'function') { window.toggleTheme(); }
      else {
        const isLight = document.documentElement.classList.toggle('light');
        try { localStorage.setItem('hbt-theme', isLight ? 'light' : 'dark'); } catch (e) {}
      }
      render();
    };
  }

  // S is only ever set to a payload that has the shape render() needs.
  // Anything else (network error, {error} body, non-2xx, missing fields)
  // leaves S null and puts a message in loadError. A load already in flight
  // is reused so render() and the boot code never fire two requests at once.
  function load() {
    if (inflight) return inflight;
    inflight = (async () => {
      loadError = null;
      try {
        const r = await fetch(apiUrl(API + '/get-stats'));
        let data = null;
        try { data = await r.json(); } catch (e) { /* non-JSON body */ }
        if (!r.ok || !data || data.error || (!data.outOfYear && !Array.isArray(data.months))) {
          loadError = (data && data.error) ? String(data.error) : ('HTTP ' + r.status);
          console.error('stats load failed', loadError);
          S = null;
          return null;
        }
        S = data;
        return S;
      } catch (e) {
        loadError = (e && e.message) || 'network error';
        console.error('stats load failed', e);
        S = null;
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

/* ---------- onboarding ---------- */
  const ob = document.createElement('div');
  ob.id = 'obx';
  document.body.appendChild(ob);
  // delegated events — survive re-renders, immune to blur/re-render races on mobile
  ob.addEventListener('input', e => {
    const inp = e.target.closest('input[data-t]');
    if (inp) obHabits[inp.dataset.t][+inp.dataset.i] = inp.value;
  });
  ob.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      obHabits[add.dataset.add].push('');
      obRender();
      const inputs = ob.querySelectorAll('input[data-t="' + add.dataset.add + '"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
      return;
    }
    const fg = e.target.closest('[data-fg]');
    if (fg) { focus.good = fg.dataset.fg; obRender(); return; }
    const fb = e.target.closest('[data-fb]');
    if (fb) { focus.bad = fb.dataset.fb; obRender(); return; }
    if (e.target.closest('#obx-next')) obNext();
  });
  let step = 0;
  let obHabits = { bad: [], good: [] };
  let obOrig = { bad: [], good: [] };
  let focus = { good: null, bad: null };

  function obRender() {
    const dots = ['●○○○','○●○○','○○●○','○○○●'][step];
    if (step === 0) ob.innerHTML = `<div class="obx-wrap">
      <div class="obx-dots">${dots}</div>
      <div class="obx-big">⚡</div>
      <div class="obx-t">One habit at a time.</div>
      <div class="obx-s">Three minutes from here to your first checkmark.</div>
      <div class="obx-info" style="border:1px solid #27500A"><b style="color:#97C459">▲ Build — good habits</b>
        <div>Tick when you did it. Exercise, read, sleep on time.</div></div>
      <div class="obx-info" style="border:1px solid #501313"><b style="color:#F09595">▼ Avoid — bad habits</b>
        <div>Tick when you resisted. A tick = a win, both ways.</div></div>
      <button class="obx-btn" id="obx-next">Let's set up →</button></div>`;
    if (step === 1) ob.innerHTML = `<div class="obx-wrap">
      <div class="obx-dots">${dots}</div>
      <div class="obx-t" style="text-align:left">Your habits</div>
      <div class="obx-s" style="text-align:left">We filled in six classics — make them yours, or keep them.<br><span style="font-size:10px">min 3 + 3 · max 7 + 7 · tap a name to edit it</span></div>
      <div class="obx-lbl" style="color:#F09595">▼ AVOID</div>
      ${obHabits.bad.map((h, i) => `<div class="obx-item"><input data-t="bad" data-i="${i}" value="${h}" placeholder="Enter habit here"></div>`).join('')}
      ${obHabits.bad.length < 7 ? '<div class="obx-add" data-add="bad">+ add habit</div>' : '<div class="obx-add" style="cursor:default;background:var(--bg-card-inner);border:1px solid var(--border-default);color:var(--text-secondary)">Maxed out!</div>'}
      <div class="obx-lbl" style="color:#97C459">▲ BUILD</div>
      ${obHabits.good.map((h, i) => `<div class="obx-item"><input data-t="good" data-i="${i}" value="${h}" placeholder="Enter habit here"></div>`).join('')}
      ${obHabits.good.length < 7 ? '<div class="obx-add" data-add="good">+ add habit</div>' : '<div class="obx-add" style="cursor:default;background:var(--bg-card-inner);border:1px solid var(--border-default);color:var(--text-secondary)">Maxed out!</div>'}
      <button class="obx-btn" id="obx-next">Keep these ✓</button></div>`;
    if (step === 2) ob.innerHTML = `<div class="obx-wrap">
      <div class="obx-dots">${dots}</div>
      <div class="obx-t" style="text-align:left">Pick your focus</div>
      <div class="obx-s" style="text-align:left">One to build, one to eliminate — 30 days of extra attention.</div>
      <div class="obx-lbl" style="color:#97C459">▲ BUILDING</div>
      ${obHabits.good.filter(Boolean).map(h => `<div class="obx-item ${focus.good === h ? 'sel' : ''}" data-fg="${h}"><span>${focus.good === h ? '●' : '○'} ${h}</span></div>`).join('')}
      <div class="obx-lbl" style="color:#F09595">▼ ELIMINATING</div>
      ${obHabits.bad.filter(Boolean).map(h => `<div class="obx-item ${focus.bad === h ? 'selbad' : ''}" data-fb="${h}"><span>${focus.bad === h ? '●' : '○'} ${h}</span></div>`).join('')}
      <button class="obx-btn" id="obx-next" ${focus.good && focus.bad ? '' : 'disabled'}>Continue →</button></div>`;
    if (step === 3) ob.innerHTML = `<div class="obx-wrap">
      <div class="obx-dots">${dots}</div>
      <div class="obx-big">🎉</div>
      <div class="obx-t">You're ready.</div>
      <div class="obx-s">Six habits. Two in focus.<br>Today's card is waiting.</div>
      <button class="obx-btn" id="obx-next">Tick your first habit →</button>
      <div class="obx-foot">Writes your habits to the sheet · never shows again</div></div>`;

  }

  async function obNext() {
    if (step === 1) {
      obHabits.bad = obHabits.bad.map(s => (s || '').trim());
      obHabits.good = obHabits.good.map(s => (s || '').trim());
      const nBad = obHabits.bad.filter(Boolean).length;
      const nGood = obHabits.good.filter(Boolean).length;
      if (nBad < 3 || nGood < 3) {
        alert('You need at least 3 good and 3 bad habits.'); return;
      }
      focus.good = obHabits.good.filter(Boolean)[0];
      focus.bad = obHabits.bad.filter(Boolean)[0];
    }
    if (step === 3) { await obFinish(); return; }
    step++; obRender();
  }

  async function obFinish() {
    const btn = $('#obx-next', ob);
    btn.disabled = true; btn.textContent = 'Setting up…';
    try {
      // sync habit list: rename / add / remove via existing endpoint
      for (const type of ['bad', 'good']) {
        const n = Math.max(obHabits[type].length, obOrig[type].length);
        for (let i = 0; i < n; i++) {
          const oldName = (obOrig[type][i] || '').trim();
          const newName = (obHabits[type][i] || '').trim();
          const call = body => fetch(apiUrl(API + '/update-config'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (oldName && newName && oldName !== newName) {
            await call({ action: 'replace', type, name: oldName, newName });
          } else if (!oldName && newName) {
            await call({ action: 'add', type, newName });
          } else if (oldName && !newName) {
            await call({ action: 'remove', type, name: oldName });
          }
        }
      }
      await fetch(apiUrl(API + '/update-focus'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'good', habitName: focus.good }) });
      await fetch(apiUrl(API + '/update-focus'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bad', habitName: focus.bad }) });
      await fetch(apiUrl(API + '/set-onboarded'), { method: 'POST' });
    } catch (e) { console.error('onboarding write failed', e); }
    ob.classList.remove('show');
    location.reload();
  }

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    const s = await load();
    if (s && s.needsOnboarding) {
      obHabits.bad  = s.habits.filter(h => h.type === 'bad').map(h => h.name);
      obHabits.good = s.habits.filter(h => h.type === 'good').map(h => h.name);
      obOrig.bad = obHabits.bad.slice(); obOrig.good = obHabits.good.slice();
      step = 0; obRender(); ob.classList.add('show');
    }
  });
})();
