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

  // Ink palette. Charts are SVG strings, so their colours come from here
  // rather than CSS; render() reads the palette for the current theme and
  // the header's theme button redraws Insights in place.
  const INK = {
    dark:  { up: '#8FE0B0', down: '#FF8E80', bad: '#FF8E80', good: '#B6ACFF', gold: '#F2C46D', acc: '#8B7CF6', accT: '#B6ACFF',
             lv: ['var(--hxYr0)', 'rgba(139,124,246,0.30)', 'rgba(139,124,246,0.55)', 'rgba(169,156,255,0.80)', '#C4BBFF'],
             rank1: '#1A1406', rank2: '#15112A' },
    light: { up: '#1E7B4D', down: '#C42A7C', bad: '#C42A7C', good: '#4A3AC4', gold: '#946510', acc: '#5B4BD6', accT: '#4A3AC4',
             lv: ['var(--hxYr0)', 'rgba(91,75,214,0.25)', 'rgba(91,75,214,0.50)', 'rgba(91,75,214,0.75)', '#4A3AC4'],
             rank1: '#FFFFFF', rank2: '#FFFFFF' }
  };
  const pal = () => INK[document.documentElement.classList.contains('light') ? 'light' : 'dark'];
  const al = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONF = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const WD = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const css = `
  #stx-panel{
    --hxC:transparent; --hxPage:var(--bg-page);
    --hxB:var(--line); --hxB2:var(--line); --hxLine:var(--line); --hxLine2:var(--line);
    --hxTrack:var(--track); --hxTrack2:var(--track); --hxAvg:rgba(138,143,182,0.6);
    --hxTile:var(--bg-card); --hxArc:var(--track);
    --hxT1:var(--text-primary); --hxT1b:var(--text-primary); --hxT1c:var(--text-primary); --hxT2:var(--text-secondary);
    --hxT3:var(--text-muted); --hxT4:var(--text-muted); --hxT5:var(--text-muted); --hxFoot:var(--text-muted);
    --hxYr0:rgba(255,255,255,0.06); --hxYrF:rgba(255,255,255,0.025);
    position:fixed;inset:0;z-index:80;background-color:var(--bg-page);background-image:var(--page-glow);background-repeat:no-repeat;
    display:none;opacity:0;transition:opacity .18s ease;overflow-y:auto;overscroll-behavior:contain;
    padding:calc(64px + env(safe-area-inset-top, 0px)) 16px 50px;box-sizing:border-box;-webkit-overflow-scrolling:touch;
    font-family:Manrope,system-ui,-apple-system,sans-serif;color:var(--text-primary)}
  html.light #stx-panel{
    --hxAvg:rgba(100,104,137,0.6); --hxYr0:rgba(40,44,110,0.07); --hxYrF:rgba(40,44,110,0.03)}
  /* Home and Insights are siblings: only one is in the layout at a time, so
     Insights is a screen rather than a panel stacked over the page. It keeps
     its own scroll container, which is what lets the home screen go on
     scrolling the window — pull-to-refresh depends on window.scrollY. */
  #stx-panel.is-on{display:block}
  #stx-panel.is-visible{opacity:1}
  @media (prefers-reduced-motion: reduce){ #stx-panel{transition:none} }
  .hsx-page{max-width:760px;margin:0 auto;box-sizing:border-box}
  .hsx-card{background:var(--bg-card);border:1px solid var(--card-border);border-radius:20px;padding:18px;margin-top:12px;box-shadow:var(--card-shadow)}
  .hsx-k2{font:600 11.5px/1 Manrope;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted)}
  .hsx-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .hsx-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  @media(min-width:640px){.hsx-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
  .hsx-tile{background:var(--bg-card);border:1px solid var(--card-border);border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--card-shadow)}
  @keyframes haloPulse{0%,100%{opacity:.5}50%{opacity:1}}
  /* onboarding: Ink "steps" layout. Named steps on top, numbered habit rows
     like the Habits screen, and the main button pinned to the bottom. */
  #obx{position:fixed;inset:0;z-index:200;overflow-y:auto;overscroll-behavior:contain;display:none;
    background-color:var(--bg-page);background-image:var(--page-glow);background-repeat:no-repeat;
    padding:0 20px calc(150px + env(safe-area-inset-bottom, 0px));box-sizing:border-box;
    font-family:Manrope,system-ui,-apple-system,sans-serif;color:var(--text-primary)}
  #obx.show{display:block}
  .obx-wrap{max-width:440px;margin:0 auto;display:flex;flex-direction:column;gap:16px;padding-top:env(safe-area-inset-top, 0px)}
  .obx-steps{display:flex;padding:22px 0 8px}
  .obx-step{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:6px}
  .obx-step i{width:24px;height:24px;border-radius:8px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
    font:800 11.5px Manrope;font-style:normal;border:1.5px solid var(--inner-border);color:var(--text-muted)}
  .obx-step.on i{border:none;color:#FFFFFF}
  .obx-step span{font:600 11px Manrope;color:var(--text-muted)}
  .obx-step.cur span{font-weight:800;color:var(--text-primary)}
  .obx-h{font:800 26px/1.1 Manrope;letter-spacing:-0.035em;color:var(--text-primary);text-wrap:balance}
  .obx-s{font:400 14px/1.55 Manrope;color:var(--text-secondary);text-wrap:pretty}
  .obx-hero{background:var(--hero-bg);border:1px solid var(--hero-border);border-radius:22px;box-shadow:var(--hero-shadow);
    padding:26px 22px;display:flex;flex-direction:column;gap:12px;margin-top:10px}
  .obx-hero img{width:48px;height:48px;border-radius:11px;display:block}
  .obx-kind{background:var(--bg-card);border:1px solid var(--card-border);border-radius:20px;box-shadow:var(--card-shadow);
    padding:16px;display:flex;gap:14px;align-items:flex-start}
  .obx-kind .ic{width:32px;height:32px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center}
  .obx-kind b{display:block;font:800 15px Manrope;margin-bottom:4px}
  .obx-kind div div{font:400 13px/1.5 Manrope;color:var(--text-secondary)}
  .obx-group{display:flex;flex-direction:column;gap:8px}
  .obx-row{display:flex;align-items:center;gap:12px;height:52px;padding:0 14px;box-sizing:border-box;border-radius:14px;
    background:var(--bg-inner);border:1px solid var(--inner-border)}
  .obx-row:focus-within{border:1.5px solid var(--accent);box-shadow:0 0 0 4px var(--accent-tint-2)}
  .obx-in{display:flex;align-items:center;gap:12px;flex:1 1 0;min-width:0;height:100%;cursor:text}
  .obx-x{width:36px;height:36px;flex:none;margin-right:-8px;padding:0;border:none;border-radius:10px;background:transparent;
    color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center}
  .obx-x:hover{color:var(--bad-color);background:var(--bad-bg)}
  .obx-num{width:28px;height:28px;flex:none;border-radius:8px;color:#FFFFFF;font:800 12px Manrope;display:flex;align-items:center;justify-content:center}
  .obx-row input{flex:1 1 0;min-width:0;background:transparent;border:none;outline:none;color:var(--text-primary);font:600 15px Manrope}
  .obx-row input::placeholder{color:var(--text-muted);font-weight:500}
  .obx-add{height:48px;border-radius:14px;border:1.5px dashed var(--accent-dash);background:transparent;cursor:pointer;
    font:700 14px Manrope;color:var(--accent-text);display:flex;align-items:center;justify-content:center;gap:6px;width:100%}
  .obx-add.full{cursor:default;color:var(--text-muted);border-color:var(--inner-border)}
  .obx-pick{display:flex;align-items:center;gap:12px;width:100%;height:52px;padding:0 14px;box-sizing:border-box;border-radius:14px;cursor:pointer;
    text-align:left;font:600 15px Manrope;color:var(--text-primary);background:var(--bg-inner);border:1px solid var(--inner-border)}
  .obx-pick .dot{width:22px;height:22px;flex:none;box-sizing:border-box;border-radius:999px;border:2px solid var(--inner-border);
    display:flex;align-items:center;justify-content:center;color:#FFFFFF}
  .obx-pick.sel{font-weight:800;border:1.5px solid var(--accent-edge);background:var(--accent-tint)}
  .obx-pick.sel .dot{border:none;background:var(--accent)}
  .obx-pick.sel.bad{border-color:var(--bad-edge);background:var(--bad-bg)}
  .obx-pick.sel.bad .dot{background:var(--bad-color)}
  .obx-sum{background:var(--bg-card);border:1px solid var(--card-border);border-radius:20px;box-shadow:var(--card-shadow);padding:18px;
    display:flex;flex-direction:column;gap:12px}
  .obx-sum div{display:flex;justify-content:space-between;gap:12px;font:400 14px Manrope;color:var(--text-secondary)}
  .obx-sum b{font-weight:800;color:var(--text-primary);text-align:right}
  .obx-sum hr{border:none;height:1px;margin:0;background:var(--line)}
  .obx-err{font:600 13px/1.4 Manrope;color:var(--bad-color);text-align:center}
  .obx-foot-wrap{position:fixed;left:0;right:0;bottom:0;z-index:201;padding:18px 20px calc(28px + env(safe-area-inset-bottom, 0px));
    background:linear-gradient(180deg, transparent 0%, var(--bg-page) 28%);display:none}
  #obx.show + .obx-foot-wrap{display:block}
  .obx-foot-in{max-width:440px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
  .obx-btn{width:100%;height:56px;border:none;border-radius:18px;cursor:pointer;font:800 16px Manrope;color:#FFFFFF;
    background:var(--cta-bg);box-shadow:var(--cta-shadow);display:flex;align-items:center;justify-content:center;gap:8px}
  .obx-btn:disabled{opacity:.5;cursor:default}
  .obx-btn:focus-visible,.obx-add:focus-visible,.obx-pick:focus-visible,.obx-x:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .obx-foot{text-align:center;font:500 12px Manrope;color:var(--text-muted)}`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- state ---------- */
  let S = null;
  let loadError = null;   // message from the last failed load(); null while loading / after success
  let inflight = null;    // promise of the load() currently running
  const UI = { mi: null, open: null, pd: null, sb: null, day: null };

  /* ---------- the two screens ---------- */
  // The way between them is the header's first button (index.html), which
  // replaced the floating button that used to sit in the corner.
  const panel = document.createElement('div');
  panel.id = 'stx-panel';
  document.body.appendChild(panel);

  const home = document.getElementById('home-screen');

  const HT = (window.HT = window.HT || {});
  const FADE = HT.SCREEN_FADE_MS || 180;
  const reduced = () => (typeof HT.reducedMotion === 'function'
    ? HT.reducedMotion()
    : !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));

  let screen = 'home';
  let homeScrollY = 0;          // each screen remembers where the user was
  let pushedState = false;      // did we add a history entry for Insights?
  let fadeTimer = null;

  const isInsights = () => screen === 'insights';
  HT.isInsightsOpen = isInsights;

  const paintHeader = () => { if (typeof HT.paintHeader === 'function') HT.paintHeader(); };

  function after(ms, fn) {
    clearTimeout(fadeTimer);
    if (reduced()) { fn(); return; }
    fadeTimer = setTimeout(fn, ms);
  }

  // Swap which screen is in the layout. Nothing here touches the URL.
  function swapTo(next) {
    if (next === screen) return;
    if (next === 'insights') {
      homeScrollY = window.scrollY;
      if (!S) loadError = null;
      panel.classList.add('is-on');      // in the layout, still transparent
      render();                          // fills it and restores its own scrollTop
      if (home) home.classList.add('is-fading');
      screen = 'insights';
      paintHeader();
      const show = () => panel.classList.add('is-visible');
      if (reduced()) show(); else requestAnimationFrame(show);
      after(FADE, () => { if (home) home.classList.add('is-off'); });
    } else {
      if (home) {
        home.classList.remove('is-off');
        window.scrollTo(0, homeScrollY); // back to exactly where the user was
        const show = () => home.classList.remove('is-fading');
        if (reduced()) show(); else requestAnimationFrame(show);
      }
      panel.classList.remove('is-visible');
      screen = 'home';
      paintHeader();
      after(FADE, () => panel.classList.remove('is-on'));
    }
  }

  function openPanel() {
    if (isInsights()) return;
    swapTo('insights');
    // Same href, byte for byte, so ?user= and &t= survive. The entry only
    // exists so the Android back gesture returns home instead of leaving.
    try { history.pushState({ htScreen: 'insights' }, '', location.href); pushedState = true; }
    catch (e) { pushedState = false; }
  }

  function closePanel() {
    if (!isInsights()) return;
    if (pushedState) { history.back(); return; }  // popstate does the swap
    swapTo('home');
  }

  window.addEventListener('popstate', () => {
    pushedState = false;
    if (isInsights()) swapTo('home');
  });

  HT.openInsights = openPanel;
  HT.closeInsights = closePanel;
  // the theme button lives in the header; Insights redraws its charts in place
  HT.renderInsights = () => { if (isInsights()) render(); };

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
    const habits = typeof HT.isHabitsOpen === 'function' && HT.isHabitsOpen();
    if (Math.abs(dx) > 70 && dy < 60 && !habits) {
      const fromScroller = !isInsights() && inHorizontalScroller(txTarget);
      if (dx < 0 && !isInsights() && !fromScroller) openPanel();
      if (dx > 0 && isInsights()) closePanel();
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
        panel.innerHTML = '<div class="hsx-page">' +
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
      panel.innerHTML = '<div class="hsx-page"><div style="padding:30px;text-align:center;color:var(--hxT3);font:600 12px Manrope">Loading…</div></div>';
      bindBack(); load().then(() => render()); return;
    }
    if (S.outOfYear) {
      panel.innerHTML = '<div class="hsx-page">' +
        '<div style="padding:40px 24px;text-align:center">' +
        '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;margin:0 auto 14px"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>' +
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

    const P = pal();
    const bestPrev = curM > 0 ? Math.max.apply(null, MV.slice(0, curM)) : null;
    const vsTile = bestPrev !== null ? ((MV[curM] - bestPrev >= 0 ? '+' : '−') + Math.abs(MV[curM] - bestPrev)) : '–';
    const tiles = [
      { v: S.perfectDays, l: 'Perfect days', c: 'var(--text-primary)' },
      { v: (S.checksYTD || 0).toLocaleString(), l: 'Habit wins', c: 'var(--text-primary)' },
      { v: S.comebacks, l: 'Comebacks', c: 'var(--text-primary)' },
      { v: vsTile, l: 'Vs best month', c: P.gold }
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
          <stop offset="0" stop-color="${P.acc}" stop-opacity="0.36"/><stop offset="1" stop-color="${P.acc}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="hsLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.acc}"/><stop offset="1" stop-color="${P.accT}"/></linearGradient>
      </defs>
      ${[0.34,0.67,1].map(t => `<line x1="0" y1="${(top + t*(base-top)).toFixed(1)}" x2="${cw}" y2="${(top + t*(base-top)).toFixed(1)}" stroke="var(--hxLine)"/>`).join('')}
      <path d="${momArea}" fill="url(#hsFill)"/>
      <path d="${momPath}" fill="none" stroke="url(#hsLine)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <line x1="${pts[mi].x.toFixed(1)}" y1="${pts[mi].y.toFixed(1)}" x2="${pts[mi].x.toFixed(1)}" y2="${base}" stroke="${al(P.accT, 0.3)}" stroke-dasharray="2 3"/>
      ${MV.map((m,i)=>`<rect data-mi="${i}" x="${(i*step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${mh}" fill="transparent" style="cursor:pointer"/>`).join('')}
      </svg>
      <div style="position:absolute;left:${(pts[mi].x / cw * 100).toFixed(2)}%;top:${(pts[mi].y).toFixed(1)}px;width:0;height:0;pointer-events:none">
        <div style="position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:999px;background:${al(P.accT, 0.16)};animation:haloPulse 2.8s ease-in-out infinite"></div>
        <div style="position:absolute;left:-6.6px;top:-6.6px;width:13.2px;height:13.2px;box-sizing:border-box;border-radius:999px;background:var(--bg-page);border:2.4px solid ${P.accT}"></div>
      </div>`;
    const momLabels = `<div style="display:flex;margin-top:8px">
        ${MV.map((m,i)=>`<div style="flex:1 1 0;text-align:center;font:600 10.5px Manrope;color:${i===mi?P.accT:'var(--text-muted)'}">${MON[i]}</div>`).join('')}
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
            <defs><linearGradient id="sk${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.acc}" stop-opacity="0.3"/><stop offset="1" stop-color="${P.acc}" stop-opacity="0"/></linearGradient></defs>
            <path d="${path} L ${sw} 40 L 0 40 Z" fill="url(#sk${i})"/>
            <path d="${path}" fill="none" stroke="${P.accT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          </svg>
          <div style="display:flex;gap:18px;margin-top:11px">
            <div style="font:500 12px/1.5 Manrope;color:var(--text-secondary)">Best streak <span style="color:var(--text-primary);font-weight:700">${h.b} days</span></div>
            <div style="font:500 12px/1.5 Manrope;color:var(--text-secondary)">All-time <span style="color:var(--text-primary);font-weight:700">${h.all}%</span></div>
          </div></div>`;
      }
      const col = h.d > 0 ? P.up : (h.d < 0 ? P.down : 'var(--text-muted)');
      const dot = h.p >= 75 ? P.good : (h.p >= 55 ? P.gold : P.bad);
      return `<div style="border-bottom:1px solid var(--line)">
        <div data-open="${i}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;cursor:pointer">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <div style="width:7px;height:7px;border-radius:999px;flex:none;background:${dot}"></div>
            <div style="font:600 14px/1.4 Manrope;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.n)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex:none">
            <div style="font:700 14px/1 Manrope;color:var(--text-primary);font-variant-numeric:tabular-nums">${h.p}%</div>
            <div style="font:700 12px/1 Manrope;color:${col};min-width:36px;text-align:right">${h.d >= 0 ? '↑ ' : '↓ '}${Math.abs(h.d)}</div>
          </div>
        </div>${spark}</div>`;
    }).join('');

    /* consistency arc */
    const A0 = 132, SWP = 276, R = 56, CX = 73, CY = 62;
    const tip = pol(CX, CY, R, A0 + SWP * Math.min(100, score) / 100);

    /* power days */
    const sel = UI.pd == null ? bestD : UI.pd;
    const tX = 40, tW = cw - 96, rowH = 34, pdH = 7 * rowH;
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
    const slopeOn = UI.sb == null ? P.bad : P.accT;

    /* year grid */
    const gap = 1.6;
    const cell = (cw + gap) / 53 - gap;
    const jan1wd = (new Date(yr, 0, 1).getDay() + 6) % 7;
    const lv = P.lv;
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
    const yrCol = selDay ? ((selDay.p || 0) >= 0.8 ? P.up : ((selDay.p || 0) >= 0.5 ? 'var(--text-primary)' : P.bad)) : 'var(--text-secondary)';

    /* leaderboard */
    const badge = [
      { bg: P.gold, fg: P.rank1, bd: P.gold },
      { bg: P.accT, fg: P.rank2, bd: P.accT },
      { bg: al(P.acc, 0.16), fg: P.accT, bd: al(P.acc, 0.45) }
    ];
    const board = H.map(h => ({ n: h.n, b: h.b, all: h.all }))
      .sort((a, b) => b.all - a.all)
      .map((h, i) => Object.assign(h, { rank: i + 1,
        bg: badge[i] ? badge[i].bg : 'transparent',
        fg: badge[i] ? badge[i].fg : 'var(--text-muted)',
        bd: badge[i] ? badge[i].bd : 'var(--line)',
        pc: i === 0 ? P.gold : 'var(--text-primary)' }));

    /* trophy case: this year's month trophies, then every year saved by Start <year> */
    const tc = S.trophyCase || { current: { months: [] }, past: [] };
    const tcTiles = list => '<div class="tc-wall">' + list.map(t => '<div class="tc-tile">' +
      '<svg class="tc-cup" aria-hidden="true"><use href="#trophyGold"/></svg>' +
      '<div class="tc-name">' + esc(t.name) + '</div><div class="tc-when">' + esc(t.when) + '</div></div>').join('') + '</div>';
    const tcGroups = [];
    if (tc.current && tc.current.months && tc.current.months.length) tcGroups.push({ year: tc.current.year, months: tc.current.months });
    (tc.past || []).forEach(g => { if (g.months && g.months.length) tcGroups.push(g); });
    const trophyCase = !tcGroups.length ? '' : `
      <section class="trophycase" style="margin-top:12px">
        <div class="tc-title">Trophy Case</div>
        <div class="tc-sub">Your collection so far</div>
        ${tcGroups.map((g, i) => (tcGroups.length > 1 || (tc.past || []).length
          ? `<div class="ink-k" style="margin:${i ? '18px' : '0'} 0 10px">${g.year}</div>` : '') + tcTiles(g.months)).join('')}
      </section>`;

    const monthsIn = curM + 1;
    const scrollY = panel.scrollTop;
    const avgX = tX + tW * score / 100;

    panel.innerHTML = `
    <div class="hsx-page">
      <div style="display:flex;flex-direction:column;gap:6px;padding:18px 2px 16px">
        <div style="font:800 30px/1.05 Manrope;letter-spacing:-0.035em;color:var(--text-primary)">${monthsIn === 1 ? 'First month in' : monthsIn + ' months in'}</div>
        <div style="font:500 13px/1.4 Manrope;color:var(--text-secondary)">Jan 1 – ${MON[curM]} ${now.getDate()}, ${yr} · ${H.length} habits</div>
      </div>

      <div class="hsx-tiles">
        ${tiles.map(t => `<div class="hsx-tile">
          <div style="font:800 30px/1 Manrope;letter-spacing:-0.04em;color:${t.c};font-variant-numeric:tabular-nums">${t.v}</div>
          <div style="font:700 10px/1.3 Manrope;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-muted)">${t.l}</div>
        </div>`).join('')}
      </div>

      ${trophyCase}

      <div class="hsx-card" style="padding:18px 18px 16px">
        <div class="hsx-row"><div class="ink-k">Momentum</div><div class="hsx-k2">Monthly completion</div></div>
        <div style="display:flex;align-items:flex-end;gap:10px;margin-top:16px">
          <div style="font:800 48px/0.95 Manrope;letter-spacing:-0.045em;color:var(--text-primary);font-variant-numeric:tabular-nums">${MV[mi]}<span style="font-size:20px;font-weight:700;margin-left:2px;color:var(--accent-text)">%</span></div>
          <div style="display:flex;align-items:center;padding:5px 10px;border-radius:999px;font:700 12px Manrope;background:${al(dl >= 0 ? P.up : P.down, 0.13)};color:${dl >= 0 ? P.up : P.down};margin-bottom:6px">${dl >= 0 ? '↑ ' : '↓ '}${Math.abs(dl)} pts</div>
        </div>
        <div style="font:500 12.5px/1.3 Manrope;color:var(--text-secondary);margin:10px 0 8px">${hSub}</div>
        <div style="position:relative">${momSvg}</div>
        ${momLabels}
      </div>

      <div class="hsx-card" style="padding:18px 18px 8px">
        <div class="hsx-row"><div class="ink-k">Habit momentum</div><div class="hsx-k2">Vs ${curM > 0 ? MONF[curM-1] : 'last month'}</div></div>
        <div style="display:flex;flex-direction:column;margin-top:6px">${habitRows}</div>
      </div>

      <div class="hsx-card">
        <div class="ink-k">Consistency</div>
        <div style="display:flex;align-items:center;gap:18px;margin-top:12px;flex-wrap:wrap">
          <div style="position:relative;width:146px;height:132px;flex:none">
            <svg width="146" height="132" viewBox="0 0 146 132" style="display:block;overflow:visible">
              <defs><linearGradient id="hsArc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${P.acc}"/><stop offset="1" stop-color="${P.accT}"/></linearGradient></defs>
              <path d="${arcPath(CX, CY, R, A0, A0 + SWP)}" fill="none" stroke="var(--track)" stroke-width="10" stroke-linecap="round"/>
              <path d="${arcPath(CX, CY, R, A0, A0 + SWP * Math.min(100, score) / 100)}" fill="none" stroke="url(#hsArc)" stroke-width="10" stroke-linecap="round"/>
              <circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="3.4" fill="#FFFFFF"/>
            </svg>
            <div style="position:absolute;left:0;top:0;width:146px;height:124px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none">
              <div style="font:800 34px/1 Manrope;letter-spacing:-0.04em;color:var(--text-primary)">${score}</div>
              <div style="font:700 9.5px/1 Manrope;letter-spacing:0.16em;color:var(--text-muted)">ON PLAN</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px;flex:1 1 150px;min-width:0">
            <div style="display:flex;flex-direction:column;gap:7px">
              <div style="display:flex;align-items:baseline;justify-content:space-between"><div style="font:600 12.5px Manrope;color:var(--text-secondary)">Weekdays</div><div style="font:800 15px Manrope;color:var(--text-primary)">${wkday}%</div></div>
              <div style="height:6px;border-radius:999px;background:var(--track);overflow:hidden"><div style="width:${wkday}%;height:100%;border-radius:999px;background:${P.good}"></div></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:7px">
              <div style="display:flex;align-items:baseline;justify-content:space-between"><div style="font:600 12.5px Manrope;color:var(--text-secondary)">Weekends</div><div style="font:800 15px Manrope;color:var(--text-primary)">${wkend}%</div></div>
              <div style="height:6px;border-radius:999px;background:var(--track);overflow:hidden"><div style="width:${wkend}%;height:100%;border-radius:999px;background:${P.bad}"></div></div>
            </div>
            <div style="font:600 12px/1.4 Manrope;color:${wkday - wkend > 0 ? P.bad : P.up};white-space:nowrap">${wkday - wkend > 0 ? 'Weekend dip · ' + (wkday - wkend) + ' pts' : 'Weekend lift · ' + (wkend - wkday) + ' pts'}</div>
          </div>
        </div>
      </div>

      <div class="hsx-card" style="padding:18px 18px 12px">
        <div class="hsx-row"><div class="ink-k">Power days</div>
          <div style="padding:5px 10px;border-radius:999px;background:${sel === bestD ? al(P.gold, 0.13) : al(P.acc, 0.13)};font:700 11.5px Manrope;color:${sel === bestD ? P.gold : P.accT}">${UI.pd == null ? 'Best · ' : ''}${WD[sel]} ${pd[sel]}%</div>
        </div>
        <div style="position:relative;height:13px;margin-top:16px">
          <div style="position:absolute;left:${(avgX / cw * 100).toFixed(1)}%;top:0;transform:translateX(-50%);font:700 9px/1 Manrope;letter-spacing:0.14em;color:var(--text-muted);white-space:nowrap">AVG ${score}</div>
        </div>
        <div style="position:relative">
          <svg width="100%" height="${pdH}" viewBox="0 0 ${cw} ${pdH}" preserveAspectRatio="none" style="display:block">
            <line x1="${avgX.toFixed(1)}" y1="0" x2="${avgX.toFixed(1)}" y2="${pdH}" stroke="var(--hxAvg)" stroke-dasharray="2 4"/>
            ${lanes.map(o => `<g data-pd="${o.i}" style="cursor:pointer">
              <rect x="0" y="${o.y - 11}" width="${cw}" height="${rowH}" fill="transparent"/>
              <rect x="${tX}" y="${o.y}" width="${tW.toFixed(1)}" height="12" rx="6" fill="var(--track)"/>
              <rect x="${tX}" y="${o.y}" width="${(tW * o.val / 100).toFixed(1)}" height="12" rx="6" fill="${o.isB ? P.gold : (o.isS ? P.accT : al(P.acc, 0.45))}"/>
            </g>`).join('')}
          </svg>
          ${lanes.map(o => `<div style="position:absolute;left:0;top:${((o.y + 6) / pdH * 100).toFixed(1)}%;transform:translateY(-50%);font:700 11.5px/1 Manrope;letter-spacing:0.04em;color:${o.isB || o.isS ? 'var(--text-primary)' : 'var(--text-muted)'};pointer-events:none">${WD[o.i]}</div>`).join('')}
          ${lanes.map(o => `<div style="position:absolute;right:0;top:${((o.y + 6) / pdH * 100).toFixed(1)}%;transform:translateY(-50%);font:800 12.5px/1 Manrope;color:${o.isB ? P.gold : (o.isS ? P.accT : 'var(--text-secondary)')};pointer-events:none">${o.val}%</div>`).join('')}
        </div>
      </div>

      <div class="hsx-card">
        <div class="hsx-row"><div class="ink-k">Where habits break</div>
          <div style="font:600 11.5px/1.2 Manrope;text-align:right;color:${UI.sb == null ? 'var(--text-secondary)' : P.accT}">${UI.sb == null ? (H[weak] ? 'Lowest line: ' + esc(H[weak].n) : '') : esc(H[UI.sb].n) + ' · low ' + Math.min.apply(null, H[UI.sb].row) + '%'}</div>
        </div>
        <div style="position:relative;margin-top:14px">
          <svg width="100%" height="164" viewBox="0 0 ${cw} 164" preserveAspectRatio="none" style="display:block">
            <rect x="${(px5 + 4 * sx5 - sx5 * 0.5).toFixed(1)}" y="0" width="${(sx5 * 2).toFixed(1)}" height="150" rx="10" fill="${al(P.bad, 0.06)}"/>
            <line x1="0" y1="${y5(score).toFixed(1)}" x2="${cw}" y2="${y5(score).toFixed(1)}" stroke="var(--hxAvg)" stroke-dasharray="2 4"/>
            ${H.map((h, i) => {
              const p = smooth(h.row.map((v, j) => ({ x: px5 + j * sx5, y: y5(v) })));
              const on = i === focusIdx;
              return `<path d="${p}" fill="none" stroke="${on ? slopeOn : al(P.acc, UI.sb == null ? 0.30 : 0.15)}" stroke-width="${on ? 2.4 : 1.4}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
            }).join('')}
          </svg>
          ${H[focusIdx] ? H[focusIdx].row.map((v, j) => `<div style="position:absolute;left:${((px5 + j * sx5) / cw * 100).toFixed(2)}%;top:${y5(v).toFixed(1)}px;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:999px;background:${slopeOn};pointer-events:none"></div>`).join('') : ''}
          <div style="position:absolute;left:0;top:${y5(score).toFixed(1)}px;transform:translateY(-50%);font:700 8.5px/1 Manrope;letter-spacing:0.14em;color:var(--text-muted);padding-right:5px">AVG</div>
        </div>
        <div style="display:flex">
          ${WD.map((w, i) => `<div style="flex:1 1 0;text-align:center;font:700 10.5px/1 Manrope;letter-spacing:0.06em;color:${i >= 4 && i <= 5 ? 'var(--text-secondary)' : 'var(--text-muted)'}">${w.slice(0,2).toUpperCase()}</div>`).join('')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:16px">
          ${H.map((h, i) => {
            const on = i === focusIdx && UI.sb != null;
            return `<button type="button" data-sb="${i}" style="cursor:pointer;height:32px;padding:0 12px;border-radius:999px;font:600 11.5px/1 Manrope;background:${on ? al(P.acc, 0.14) : 'transparent'};color:${on ? P.accT : 'var(--text-secondary)'};border:1px solid ${on ? al(P.acc, 0.45) : 'var(--line)'}">${esc(h.n)}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="hsx-card">
        <div class="hsx-row"><div class="ink-k">Your year</div><div style="font:600 11.5px/1 Manrope;color:${yrCol}">${yrNote}</div></div>
        <div style="display:flex;margin:16px 0 6px">
          ${MON.map(m => `<div style="flex:1 1 0;font:700 9.5px Manrope;letter-spacing:0.1em;color:var(--text-muted)">${m[0]}</div>`).join('')}
        </div>
        <svg width="100%" height="${yrH}" viewBox="0 0 ${cw} ${yrH}" preserveAspectRatio="none" style="display:block">
          ${yrCells.map(c => `<rect data-day="${c.future ? '' : c.iso}" x="${c.x}" y="${c.y}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${(cell * 0.28).toFixed(2)}" fill="${c.fill}"${c.future ? '' : ' style="cursor:pointer"'}/>`).join('')}
        </svg>
      </div>

      <div class="hsx-card" style="padding:18px 18px 8px">
        <div class="hsx-row"><div class="ink-k">Leaderboard</div><div class="hsx-k2">All time</div></div>
        <div style="display:flex;flex-direction:column;margin-top:4px">
          ${board.map((b, i) => `<div style="display:flex;align-items:center;gap:12px;min-height:50px;${i < board.length - 1 ? 'border-bottom:1px solid var(--line)' : ''}">
            <div style="width:26px;height:26px;border-radius:999px;flex:none;display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:800 11.5px Manrope;background:${b.bg};color:${b.fg};border:1px solid ${b.bd}">${b.rank}</div>
            <div style="font:600 14px/1.4 Manrope;color:var(--text-primary);flex:1 1 0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.n)}</div>
            <div style="font:500 11.5px/1 Manrope;color:var(--text-muted);flex:none">${b.b}d best</div>
            <div style="width:42px;text-align:right;font:800 14.5px/1 Manrope;color:${b.pc};flex:none;font-variant-numeric:tabular-nums">${b.all}%</div>
          </div>`).join('')}
        </div>
      </div>

      <div style="margin-top:14px;background:${al(P.acc, 0.08)};border:1px solid ${al(P.acc, 0.28)};border-radius:14px;padding:13px;text-align:center;font:600 12px Manrope;color:${P.accT}">Full honest breakdown → Insights in your sheet</div>
      <div style="text-align:center;font:500 11px/1.6 Manrope;color:var(--text-muted);padding:14px 0 4px">${(S.daily || []).length} days tracked · updated today</div>
    </div>`;

    bindBack();
    panel.querySelectorAll('[data-mi]').forEach(el => el.addEventListener('click', () => { UI.mi = +el.dataset.mi; render(); }));
    panel.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.open; UI.open = UI.open === i ? null : i; render(); }));
    panel.querySelectorAll('[data-pd]').forEach(el => el.addEventListener('click', () => { UI.pd = +el.dataset.pd; render(); }));
    panel.querySelectorAll('[data-sb]').forEach(el => el.addEventListener('click', () => { UI.sb = +el.dataset.sb; render(); }));
    panel.querySelectorAll('[data-day]').forEach(el => el.addEventListener('click', () => { if (el.dataset.day) { UI.day = el.dataset.day; render(); } }));
    panel.scrollTop = scrollY;
  }
  function bindBack() {}

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

  // Background refresh for the Insights screen. It never switches screens and
  // never shows an error: if the fetch fails the data already on the page is
  // kept exactly as it is. render() restores the panel's own scrollTop, so a
  // refresh while the user is reading does not move them.
  HT.refreshInsights = async function () {
    if (!S) return false;            // nothing loaded yet; the first open fetches
    const keep = S;
    inflight = null;                 // force a fresh request, not the cached one
    const fresh = await load();
    if (!fresh) { S = keep; loadError = null; return false; }
    if (isInsights()) render();      // in place; hidden screens update on open
    return true;
  };

/* ---------- onboarding ---------- */
  const ob = document.createElement('div');
  ob.id = 'obx';
  document.body.appendChild(ob);
  // the button sits outside the scrolling screen so it stays pinned to the bottom
  const obFoot = document.createElement('div');
  obFoot.className = 'obx-foot-wrap';
  document.body.appendChild(obFoot);
  // delegated events — survive re-renders, immune to blur/re-render races on mobile
  ob.addEventListener('input', e => {
    const inp = e.target.closest('input[data-t]');
    if (inp) { obHabits[inp.dataset.t][+inp.dataset.i].name = inp.value; if (obError) { obError = ''; paintFoot(); } }
  });
  ob.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      obHabits[add.dataset.add].push({ orig: '', name: '' });
      obRender();
      const inputs = ob.querySelectorAll('input[data-t="' + add.dataset.add + '"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
      return;
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const t = rm.dataset.rm;
      const [h] = obHabits[t].splice(+rm.dataset.i, 1);
      if (h && h.orig) obRemoved[t].push(h.orig);
      obError = '';
      obRender();
      // a button, not an input, so no keyboard pops up on a phone
      const next = ob.querySelector('[data-add="' + t + '"]');
      if (next) next.focus({ preventScroll: true });
      return;
    }
    const fg = e.target.closest('[data-fg]');
    if (fg) { focus.good = fg.dataset.fg; obRender(); return; }
    const fb = e.target.closest('[data-fb]');
    if (fb) { focus.bad = fb.dataset.fb; obRender(); return; }
  });
  obFoot.addEventListener('click', e => { if (e.target.closest('#obx-next')) obNext(); });
  let step = 0;
  // one row per habit: orig = its name in the sheet ('' for a new one)
  let obHabits = { bad: [], good: [] };
  let obRemoved = { bad: [], good: [] };   // sheet names taken out with ×
  let focus = { good: null, bad: null };
  let obError = '';

  const OB_STEPS = ['Welcome', 'Habits', 'Focus', 'Done'];
  const OB_MAX = 7;
  // the icon's tile check, without its dark square
  const OB_TICK = `<svg width="120" height="105" viewBox="0 0 66.9 58.3" aria-hidden="true" style="display:block"><rect x='60.20' y='0.00' width='6.7' height='6.7' rx='1.6' fill='#ec4899'/><rect x='51.60' y='8.60' width='6.7' height='6.7' rx='1.6' fill='#da4ca5'/><rect x='60.20' y='8.60' width='6.7' height='6.7' rx='1.6' fill='#e24a9f'/><rect x='0.00' y='17.20' width='6.7' height='6.7' rx='1.6' fill='#6366f1'/><rect x='43.00' y='17.20' width='6.7' height='6.7' rx='1.6' fill='#c850b0'/><rect x='51.60' y='17.20' width='6.7' height='6.7' rx='1.6' fill='#d04eab'/><rect x='0.00' y='25.80' width='6.7' height='6.7' rx='1.6' fill='#6665ef'/><rect x='8.60' y='25.80' width='6.7' height='6.7' rx='1.6' fill='#6f63e9'/><rect x='34.40' y='25.80' width='6.7' height='6.7' rx='1.6' fill='#b654bc'/><rect x='43.00' y='25.80' width='6.7' height='6.7' rx='1.6' fill='#be52b6'/><rect x='8.60' y='34.40' width='6.7' height='6.7' rx='1.6' fill='#7861e4'/><rect x='17.20' y='34.40' width='6.7' height='6.7' rx='1.6' fill='#815fde'/><rect x='25.80' y='34.40' width='6.7' height='6.7' rx='1.6' fill='#a458c7'/><rect x='34.40' y='34.40' width='6.7' height='6.7' rx='1.6' fill='#ac56c2'/><rect x='17.20' y='43.00' width='6.7' height='6.7' rx='1.6' fill='#8a5dd8'/><rect x='25.80' y='43.00' width='6.7' height='6.7' rx='1.6' fill='#9a5ace'/><rect x='34.40' y='43.00' width='6.7' height='6.7' rx='1.6' fill='#a258c8'/><rect x='25.80' y='51.60' width='6.7' height='6.7' rx='1.6' fill='#945bd2'/></svg>`;
  const obIcon = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const OB_ARROW = obIcon('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>');
  const OB_CHECK = obIcon('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
  const OB_PLUS = obIcon('<path d="M12 5v14M5 12h14"/>');
  const OB_UP = obIcon('<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>');
  const OB_DOWN = obIcon('<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>');
  const OB_X = obIcon('<path d="M7 7l10 10M17 7L7 17"/>');
  const OB_DOT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5l4 4L18 8"/></svg>';
  const obTile = t => {
    const a = [99, 102, 241], b = [236, 72, 153];
    return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
  };

  function obSteps() {
    return '<div class="obx-steps">' + OB_STEPS.map((n, i) => {
      const on = i <= step;
      return `<div class="obx-step${on ? ' on' : ''}${i === step ? ' cur' : ''}"${i === step ? ' aria-current="step"' : ''}>` +
        `<i${on ? ` style="background:${obTile(i / 3)}"` : ''}>${i + 1}</i><span>${n}</span></div>`;
    }).join('') + '</div>';
  }

  // the names that are filled in, in row order
  const obNames = type => obHabits[type].map(h => h.name.trim()).filter(Boolean);

  function obRows(type) {
    const list = obHabits[type];
    const label = (type === 'bad' ? 'Bad' : 'Good') + ' habit ';
    const rows = list.map((h, i) => `<div class="obx-row"><label class="obx-in"><span class="obx-num" style="background:${obTile(Math.min(i, 6) / 6)}">${i + 1}</span>` +
      `<input data-t="${type}" data-i="${i}" value="${esc(h.name)}" placeholder="Enter habit here" maxlength="30" aria-label="${label}${i + 1}"></label>` +
      `<button type="button" class="obx-x" data-rm="${type}" data-i="${i}" aria-label="Remove ${esc(h.name.trim() || label + (i + 1))}">${OB_X}</button></div>`).join('');
    const add = list.length < OB_MAX
      ? `<button type="button" class="obx-add" data-add="${type}">${OB_PLUS}Add ${type} habit</button>`
      : `<div class="obx-add full">All 7 places are in use</div>`;
    return rows + add;
  }

  function obPicks(type) {
    const cur = type === 'good' ? focus.good : focus.bad;
    const attr = type === 'good' ? 'data-fg' : 'data-fb';
    return obNames(type).map(h => {
      const sel = cur === h;
      return `<button type="button" class="obx-pick${sel ? ' sel' : ''}${type === 'bad' ? ' bad' : ''}" ${attr}="${esc(h)}" aria-pressed="${sel}">` +
        `<span class="dot">${sel ? OB_DOT : ''}</span>${esc(h)}</button>`;
    }).join('');
  }

  function paintFoot() {
    const labels = [['Let’s set up', OB_ARROW], ['Keep these', OB_CHECK], ['Continue', OB_ARROW], ['Tick your first habit', OB_ARROW]];
    const [label, icon] = labels[step];
    const disabled = step === 2 && !(focus.good && focus.bad);
    obFoot.innerHTML = '<div class="obx-foot-in">' +
      (obError ? `<div class="obx-err" role="alert">${esc(obError)}</div>` : '') +
      `<button type="button" class="obx-btn" id="obx-next"${disabled ? ' disabled' : ''}>${label}${icon}</button>` +
      (step === 3 ? '<div class="obx-foot">Writes your habits to the sheet · shows only once</div>' : '') +
      '</div>';
  }

  function obRender() {
    const kicker = (t, c) => `<div class="ink-k" style="color:${c}">${t}</div>`;
    let body = '';
    if (step === 0) body = `
      <div class="obx-hero"><img src="/icons/favicon.svg" alt="">
        <div class="obx-h" style="font-size:30px">One habit at a time.</div>
        <div class="obx-s">Three minutes from here to your first checkmark.</div></div>
      <div class="obx-kind"><span class="ic" style="background:var(--accent-tint);color:var(--good-color)">${OB_UP}</span>
        <div><b style="color:var(--good-color)">Build · good habits</b><div>Tick when you did it. Exercise, read, sleep on time.</div></div></div>
      <div class="obx-kind"><span class="ic" style="background:var(--bad-bg);color:var(--bad-color)">${OB_DOWN}</span>
        <div><b style="color:var(--bad-color)">Avoid · bad habits</b><div>Tick when you resisted. A tick is a win, both ways.</div></div></div>`;
    if (step === 1) body = `
      <div style="display:flex;flex-direction:column;gap:6px"><div class="obx-h">Your habits</div>
        <div class="obx-s">Six classics to start. Make them yours. At least 3 of each, up to 7.</div></div>
      <div class="obx-group">${kicker('Avoid', 'var(--bad-color)')}${obRows('bad')}</div>
      <div class="obx-group">${kicker('Build', 'var(--good-color)')}${obRows('good')}</div>`;
    if (step === 2) body = `
      <div style="display:flex;flex-direction:column;gap:6px"><div class="obx-h">Pick your focus</div>
        <div class="obx-s">One to build, one to eliminate. 30 days of extra attention.</div></div>
      <div class="obx-group">${kicker('Building', 'var(--good-color)')}${obPicks('good')}</div>
      <div class="obx-group">${kicker('Eliminating', 'var(--bad-color)')}${obPicks('bad')}</div>`;
    if (step === 3) {
      const n = obNames('bad').length + obNames('good').length;
      body = `
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding-top:40px">${OB_TICK}
        <div style="height:8px"></div><div class="obx-h" style="font-size:30px">You’re ready.</div>
        <div class="obx-s">Today’s card is waiting.</div></div>
      <div class="obx-sum"><div><span>Habits</span><b>${n}</b></div><hr>
        <div><span>Building</span><b style="color:var(--good-color)">${esc(focus.good || '')}</b></div><hr>
        <div><span>Eliminating</span><b style="color:var(--bad-color)">${esc(focus.bad || '')}</b></div></div>`;
    }
    ob.innerHTML = `<div class="obx-wrap">${obSteps()}${body}</div>`;
    paintFoot();
  }

  async function obNext() {
    if (step === 1) {
      if (obNames('bad').length < 3 || obNames('good').length < 3) {
        obError = 'You need at least 3 good and 3 bad habits.';
        paintFoot(); return;
      }
      obError = '';
      if (!obNames('good').includes(focus.good)) focus.good = obNames('good')[0];
      if (!obNames('bad').includes(focus.bad)) focus.bad = obNames('bad')[0];
    }
    if (step === 3) { await obFinish(); return; }
    step++; obRender();
    ob.scrollTop = 0;
  }

  // POST that throws unless the endpoint answers { success: true }
  async function obPost(path, body) {
    const r = await fetch(apiUrl(API + path), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    let data = null;
    try { data = await r.json(); } catch (e) { /* no JSON body */ }
    if (!r.ok || !data || !data.success) throw new Error((data && data.error) || 'HTTP ' + r.status);
    return data;
  }

  // Writes one type's changes. Renames go first; then a removed habit and a
  // new one are paired into a rename, so the new habit takes over the removed
  // one's slot (in place, while the sheet is in onboarding) and the count
  // never dips under 3 or climbs over 7 on the way. Whatever is left over is
  // added or removed. Each step updates the local state as it lands, so a
  // retry after a failure sends only what is still missing.
  async function obSaveType(type) {
    const list = obHabits[type];
    list.forEach(h => { h.name = h.name.trim(); });
    for (let i = list.length - 1; i >= 0; i--) {          // a cleared row is a removal
      if (!list[i].name) { const [h] = list.splice(i, 1); if (h.orig) obRemoved[type].push(h.orig); }
    }
    const gone = obRemoved[type];
    const config = body => obPost('/update-config', Object.assign({ type }, body));

    for (const h of list) {
      if (h.orig && h.name !== h.orig) { await config({ action: 'replace', name: h.orig, newName: h.name }); h.orig = h.name; }
    }
    for (const h of list) {
      if (h.orig) continue;
      const pair = gone.length > 0;
      await config(pair ? { action: 'replace', name: gone[0], newName: h.name } : { action: 'add', newName: h.name });
      if (pair) gone.shift();
      h.orig = h.name;
    }
    while (gone.length) { await config({ action: 'remove', name: gone[0] }); gone.shift(); }
  }

  async function obFinish() {
    const btn = $('#obx-next', obFoot);
    btn.disabled = true; btn.textContent = 'Setting up…';
    try {
      for (const type of ['bad', 'good']) await obSaveType(type);
      await obPost('/update-focus', { type: 'good', habitName: focus.good });
      await obPost('/update-focus', { type: 'bad', habitName: focus.bad });
      await obPost('/set-onboarded');   // only once everything above is saved
    } catch (e) {
      console.error('onboarding write failed', e);
      obError = 'Couldn’t save your setup (' + e.message + '). Please try again.';
      paintFoot();
      return;
    }
    ob.classList.remove('show');
    location.reload();
  }

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    const s = await load();
    if (s && s.needsOnboarding) {
      for (const type of ['bad', 'good']) {
        obHabits[type] = s.habits.filter(h => h.type === type).map(h => ({ orig: h.name, name: h.name }));
        obRemoved[type] = [];
      }
      step = 0; obRender(); ob.classList.add('show');
    }
  });
})();
