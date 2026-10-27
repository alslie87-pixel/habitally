/* ============================================================
   HABITALLY — PUT HABITALLY ON YOUR HOME SCREEN
   The last onboarding step, the reminder banner, Android's install
   prompt and the service worker. Loaded before the page's own script, so
   beforeinstallprompt is caught at app start, not at the last step.

   The guide is the design mock (homescreen-guide.html) as approved: its
   CSS, markup, hand, texts and timings, copied as they are. It is drawn in
   a shadow root, so the mock's class names and ids (.sheet, .ring, #app,
   …) can neither take styles from the app nor leak into it. Left out, as
   the mock only needs them for its preview: the chip row, the "This
   device" line, the note under the phone, the Samsung/Firefox/Chrome and
   iPhone/Android toggles and the demo QR link. The mock's phone frame is
   the phone itself here, so the guide fills the screen. Two changes after
   review: Android's fake install dialog sits inside the illustration, so
   it never covers the real buttons, and in the light theme everything
   outside the illustration follows the app (the illustration stays dark).
   ============================================================ */
(function () {
  'use strict';
  const P = window.HTPlatform;
  if (!P) return;

  /* ---------- service worker (pass-through, see sw.js) ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  /* ---------- Android install prompt ---------- */
  // Kept from app start: by the last onboarding step the event has long fired.
  let installPrompt = null;
  const guides = new Set();
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    guides.forEach(g => g.promptReady());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    guides.forEach(g => g.installed());
  });

  /* ---------- device + storage ---------- */
  const standalone = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const detect = () => P.detectPlatform(navigator.userAgent, { standalone: standalone(), maxTouchPoints: navigator.maxTouchPoints || 0 });
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const ONBOARDED_AT = 'hbt-onboarded-at';   // when onboarding was saved (ms)
  const GUIDE_DONE = 'hbt-a2hs-done';        // "1" once the reminder must never show again
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  // Only the banner's own "Show me" and × turn the reminder off. "I've
  // added it" does not: whether the icon really landed cannot be checked.
  function turnOffReminder() { store.set(GUIDE_DONE, '1'); }

  const LINK = P.personalLink(location.origin, location.search);
  const HOST = location.host || 'myhabitallyapp.vercel.app';
  const ICON = '/icons/icon-192.png';

  // The full link on the clipboard. Some in-app browsers have no clipboard
  // API, so the old textarea way is tried next, and a prompt is the last resort.
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* try the next way */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) return true;
    } catch (e) { /* last resort below */ }
    window.prompt('Copy your HabiTally link', text);
    return false;
  }

  // The desktop QR code is drawn in the browser by qrcodejs 1.0.0
  // (davidshimjs, MIT), kept in vendor/ so the personal link with its token
  // never meets an outside service or CDN. It is fetched only when needed.
  // vendor/qrcode.min.js sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==
  let qrLib = null;
  function loadQr() {
    if (window.QRCode) return Promise.resolve(window.QRCode);
    if (!qrLib) {
      qrLib = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/vendor/qrcode.min.js';
        s.onload = () => (window.QRCode ? resolve(window.QRCode) : reject(new Error('QRCode missing')));
        s.onerror = () => { qrLib = null; reject(new Error('QRCode failed to load')); };
        document.head.appendChild(s);
      });
    }
    return qrLib;
  }

  /* ---------- the guide's CSS: the mock's, scoped to the shadow root ---------- */
  const CSS = `
  :host{all:initial;display:block;
        --bg:#0B0D1C;--card:#13162A;--line:rgba(160,168,255,.14);--text:#EEF0FF;--muted:#8A8FB6;--accent:#7C6BF5;--soft:rgba(124,107,245,.18);
        --ios:#1C1C1E;--ios2:#2C2C2E;--iostext:#F2F2F7;--iosblue:#0A84FF;--and:#202124;--and2:#2D2E31;--andblue:#A8C7FA;
        color:var(--text);font-family:Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  *{box-sizing:border-box}

  /* light theme: everything outside the illustration follows the app. Its
     tokens (--text-primary, --accent-text, …) reach in here as inherited
     custom properties; the mock's own names are re-pointed at them, and the
     rules that use --accent, a name the app has too, are set directly. */
  :host([data-theme="light"]){--bg:transparent;--text:var(--text-primary);--muted:var(--text-secondary);--soft:var(--accent-tint)}
  :host([data-theme="light"]) .step,:host([data-theme="light"]) .num,:host([data-theme="light"]) .captxt b,
  :host([data-theme="light"]) .steps li::before,:host([data-theme="light"]) .fallback a{color:var(--accent-text)}
  :host([data-theme="light"]) .dots i{background:var(--track)}
  :host([data-theme="light"]) .dots i.on{background:var(--accent-text)}
  :host([data-theme="light"]) .btn{background:var(--cta-bg)}
  :host([data-theme="light"]) .btn.ghost{background:transparent;border-color:var(--accent-text)}

  /* phone + app: the screen is the phone, so no frame and no fixed height */
  .phone{width:100%;max-width:390px;min-height:100%;margin:0 auto;background:var(--bg);position:relative;overflow:hidden;display:flex;flex-direction:column}
  .app{position:relative;flex:1 0 auto;padding:50px 20px 0;display:flex;flex-direction:column}
  :host([data-mode="sheet"]) .app{padding-top:24px}
  .step{font-size:11px;letter-spacing:.14em;color:var(--accent);font-weight:800}
  .app h2{font-size:25px;line-height:1.15;margin:8px 0 8px;letter-spacing:-.02em}
  .lead{color:var(--muted);font-size:15px;line-height:1.5;margin:0 0 16px}
  .stage{position:relative;height:300px;border-radius:18px;background:#0E1020;border:1px solid var(--line);flex:0 0 auto}
  /* the illustration is the dark phone in both themes */
  .stage{--text:#EEF0FF;--muted:#8A8FB6;--line:rgba(160,168,255,.14);--card:#13162A;color:var(--text)}
  .stage.short{height:230px}
  .mini{position:absolute;inset:0;overflow:hidden;border-radius:18px}
  .caprow{display:flex;align-items:center;gap:10px;margin:14px 0 0;min-height:28px}
  .num{flex:0 0 24px;height:24px;border-radius:50%;background:var(--soft);color:var(--accent);font:800 12px Manrope,system-ui;display:grid;place-items:center}
  .captxt{font-size:15px;font-weight:700;transition:opacity .2s}
  .captxt b{color:var(--accent)}
  .dots{display:flex;gap:5px;margin-left:auto}
  .dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.15);transition:background .2s}
  .dots i.on{background:var(--accent)}
  .steps{list-style:none;margin:14px 0 0;padding:0;counter-reset:s}
  .steps li{display:flex;gap:10px;align-items:flex-start;font-size:14px;font-weight:600;line-height:1.45;margin:0 0 9px;color:var(--muted)}
  .steps li b{color:var(--text)}
  .steps li::before{counter-increment:s;content:counter(s);flex:0 0 22px;height:22px;border-radius:50%;background:var(--soft);color:var(--accent);font:800 11px Manrope,system-ui;display:grid;place-items:center;margin-top:-1px}
  .fallback{font-size:12px;color:var(--muted);line-height:1.5;margin:10px 0 0}
  .fallback a{color:var(--accent);font-weight:700;text-decoration:none;cursor:pointer}
  .fallback b{color:var(--text)}
  .btns{margin-top:auto;padding-bottom:calc(22px + env(safe-area-inset-bottom, 0px))}
  .btn{display:block;width:100%;border:0;border-radius:12px;padding:15px;background:var(--accent);color:#fff;font:800 15px Manrope,system-ui;cursor:pointer}
  .btn.ghost{background:transparent;border:1px solid var(--line);color:var(--text)}
  .skip{display:block;width:100%;background:none;border:0;color:var(--muted);font:700 13px Manrope,system-ui;padding:12px 0 0;cursor:pointer}

  /* icons */
  .i{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
  .i circle{fill:currentColor;stroke:none}

  /* placeholder page inside mini browser */
  .ph{position:absolute;left:0;right:0;padding:16px;opacity:.5}
  .ph .t{height:10px;width:60%;background:#2A2D45;border-radius:5px;margin-bottom:10px}
  .ph .b{height:44px;background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:8px}

  /* iOS 26 compact bar */
  .bar26{position:absolute;left:0;right:0;bottom:0;height:64px;background:linear-gradient(180deg,rgba(14,16,32,0),rgba(14,16,32,.92) 40%)}
  .circ{position:absolute;bottom:14px;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);display:grid;place-items:center;color:var(--iostext)}
  .circ.left{left:12px}.circ.right{right:12px}
  .pill{position:absolute;left:54px;right:54px;bottom:12px;height:38px;border-radius:19px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 12px;color:var(--iostext);font:600 11px -apple-system,system-ui,sans-serif;transition:transform .2s}
  .pill span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .pill.held{transform:scale(.96)}
  .menu{position:absolute;left:56px;right:56px;bottom:62px;background:rgba(44,44,48,.98);border-radius:14px;padding:4px 0;font-family:-apple-system,system-ui,sans-serif;color:var(--iostext);opacity:0;transform:translateY(8px) scale(.96);transition:opacity .25s,transform .25s;transform-origin:bottom center}
  .menu.show{opacity:1;transform:none}
  .mrow{display:flex;align-items:center;gap:10px;padding:9px 14px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.08);transition:background .2s}
  .mrow:last-child{border-bottom:0}

  /* iOS 18 classic bar */
  .classic{position:absolute;left:0;right:0;bottom:0;background:rgba(28,28,30,.96);border-top:1px solid rgba(255,255,255,.08);padding:8px 10px 6px;font-family:-apple-system,system-ui,sans-serif;color:var(--iostext)}
  .addr{height:34px;border-radius:10px;background:var(--ios2);display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:12px}
  .addr .u{display:flex;align-items:center;gap:5px}
  .addr .u .i{width:11px;height:11px}
  .tools{display:flex;justify-content:space-around;align-items:center;padding:9px 0 3px;color:var(--iosblue)}
  .tools .i{width:19px;height:19px}
  .tools .dim{color:rgba(10,132,255,.4)}

  /* iOS Chrome */
  .ctop{position:absolute;left:0;right:0;top:0;background:#1F1F1F;padding:8px 10px;font-family:-apple-system,system-ui,sans-serif;color:#E3E3E3}
  .ctop .omni{height:34px;border-radius:17px;background:#2E2E2E;display:flex;align-items:center;gap:8px;padding:0 6px 0 12px;font-size:12px}
  .ctop .omni span{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .ctop .omni .sh{width:28px;height:28px;border-radius:50%;display:grid;place-items:center}
  .cbot{position:absolute;left:0;right:0;bottom:0;background:#1F1F1F;display:flex;justify-content:space-around;padding:10px 0 12px;color:#E3E3E3}
  .cbot .i{width:19px;height:19px}

  /* share sheet (iOS) */
  .sheet{position:absolute;left:0;right:0;bottom:-290px;height:280px;background:var(--ios);border-radius:14px 14px 0 0;transition:bottom .45s cubic-bezier(.2,.8,.2,1);font-family:-apple-system,system-ui,sans-serif;color:var(--iostext)}
  .sheet.show{bottom:0}
  .grab{width:36px;height:4px;border-radius:2px;background:#555;margin:7px auto 9px}
  .sh-head{display:flex;align-items:center;gap:10px;padding:0 14px 10px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:10px}
  .sh-head img{width:30px;height:30px;border-radius:7px}
  .sh-head b{display:block;font-size:12px}.sh-head small{font-size:10px;color:#8E8E93}
  .approw{display:flex;gap:12px;padding:0 14px 10px}
  .approw div{width:40px;height:40px;border-radius:10px;background:var(--ios2)}
  .list{margin:0 12px;background:var(--ios2);border-radius:10px;overflow:hidden}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.07);transition:background .2s}
  .row:last-child{border-bottom:0}
  .hl{background:rgba(124,107,245,.28)!important}

  /* iOS confirm screen */
  .confirm{position:absolute;left:0;right:0;top:100%;height:100%;background:var(--ios);transition:top .45s cubic-bezier(.2,.8,.2,1);font-family:-apple-system,system-ui,sans-serif;color:var(--iostext);padding:12px}
  .confirm.show{top:0}
  .chdr{display:flex;justify-content:space-between;align-items:center;font-size:13px;margin:4px 2px 16px}
  .chdr b{font-size:13px}
  .chdr .c-cancel{color:var(--iosblue)}
  .chdr .c-add{color:var(--iosblue);font-weight:700;padding:4px 8px;border-radius:8px;transition:background .2s}
  .cbox{background:var(--ios2);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:12px;margin-bottom:10px;font-size:13px}
  .cbox img{width:44px;height:44px;border-radius:10px}
  .cbox b{display:block;font-weight:500}.cbox small{color:#8E8E93;font-size:11px}
  .ctog{justify-content:space-between}
  .tog{width:40px;height:24px;border-radius:12px;background:#30D158;position:relative}
  .tog::after{content:"";position:absolute;right:2px;top:2px;width:20px;height:20px;border-radius:50%;background:#fff}

  /* home screen result */
  .result{position:absolute;inset:0;background:radial-gradient(120% 90% at 30% 10%,#26214A,#0E1020 60%);opacity:0;transition:opacity .4s;display:flex;align-items:center;justify-content:center}
  .result.show{opacity:1}
  .grid{display:grid;grid-template-columns:repeat(4,52px);gap:16px 18px}
  .gi{display:flex;flex-direction:column;align-items:center;gap:5px;font:500 9px -apple-system,system-ui,sans-serif;color:rgba(255,255,255,.75)}
  .gi i{display:block;width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,.08)}
  .gi.hab{position:relative}.gi.hab i{background:none}.gi.hab img{position:absolute;top:0;left:2px;width:48px;height:48px;border-radius:12px;box-shadow:0 6px 16px rgba(0,0,0,.45);transform:scale(0);transition:transform .45s cubic-bezier(.3,1.6,.5,1)}
  .result.show .gi.hab img{transform:scale(1);transition-delay:.25s}
  .gi.slot i{border:1.5px dashed rgba(160,150,255,.45)}.nmini.done .gi.slot i{border-color:transparent}

  /* Android */
  .nmini{position:absolute;inset:0;border-radius:18px;overflow:hidden;background:radial-gradient(120% 90% at 30% 10%,#1F2A3A,#0E1020 65%);display:flex;align-items:center;justify-content:center}
  .nmini.done .gi.hab img{transform:scale(1)}
  .nmini .gi.hab span{opacity:0;transition:opacity .3s .3s}
  .nmini.done .gi.hab span{opacity:1}
  /* the fake install dialog and its scrim live inside the illustration, like
     the iPhone share sheet: clipped to its corners, at about 4/5 of the mock's
     full-screen size, so the real buttons below are never covered */
  .ndlg{position:absolute;left:0;right:0;bottom:-200px;background:var(--and);border-radius:18px 18px 0 0;padding:16px 16px 18px;font-family:Roboto,system-ui,sans-serif;color:#E3E3E3;transition:bottom .4s cubic-bezier(.2,.8,.2,1);z-index:3;box-shadow:0 -8px 24px rgba(0,0,0,.5)}
  .ndlg.show{bottom:0}
  .scrim{position:absolute;inset:0;background:rgba(0,0,0,.5);opacity:0;transition:opacity .3s;z-index:2;pointer-events:none}
  .scrim.show{opacity:1}
  .nd-title{font-size:16px;margin:0 0 12px}
  .nd-app{display:flex;align-items:center;gap:12px;margin-bottom:16px}
  .nd-app img{width:36px;height:36px;border-radius:9px}
  .nd-app b{display:block;font-size:13px;font-weight:500}.nd-app small{font-size:11px;color:#9AA0A6}
  .nd-btns{display:flex;justify-content:flex-end;gap:6px;font-size:12px;font-weight:500}
  .nd-btns span{padding:8px 13px;border-radius:16px;color:var(--andblue)}
  .nd-btns .inst{background:var(--andblue);color:#062E6F}
  .ntop{position:absolute;left:0;right:0;top:0;background:var(--and);padding:8px 8px 8px 12px;display:flex;align-items:center;gap:8px;font:13px Roboto,system-ui,sans-serif;color:#E3E3E3}
  .ntop .omni{flex:1;height:34px;border-radius:17px;background:var(--and2);display:flex;align-items:center;gap:6px;padding:0 12px;font-size:12px;overflow:hidden;white-space:nowrap}
  .ntop .ib{width:30px;height:30px;border-radius:50%;display:grid;place-items:center}
  .nbot{position:absolute;left:0;right:0;bottom:0;background:var(--and);display:flex;justify-content:space-around;padding:11px 0 13px;color:#E3E3E3}
  .nbot .i{width:19px;height:19px}

  /* in-app browser */
  .iatop{position:absolute;left:0;right:0;top:0;background:#fff;color:#111;padding:10px 12px;display:flex;align-items:center;gap:10px;font:13px -apple-system,system-ui,sans-serif}
  .iatop .t{flex:1;text-align:center;line-height:1.2}
  .iatop .t b{display:block;font-size:12px}.iatop .t small{font-size:10px;color:#777}
  .iatop .ib{width:30px;height:30px;border-radius:50%;display:grid;place-items:center}
  .iamenu{position:absolute;right:10px;top:52px;width:200px;background:#fff;color:#111;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:13px -apple-system,system-ui,sans-serif;overflow:hidden}
  .iamenu div{padding:10px 14px;border-bottom:1px solid #eee}
  .iamenu div:last-child{border-bottom:0}
  .iamenu .hl{background:rgba(124,107,245,.2)!important}

  /* desktop */
  .qrwrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:18px;padding:16px}
  .qr{width:150px;height:150px;background:#fff;border-radius:14px;padding:10px;display:grid;place-items:center}
  .qr img,.qr canvas{width:130px!important;height:130px!important}
  .qrside{font-size:12px;color:var(--muted);line-height:1.5;max-width:150px}
  .qrside b{color:var(--text);display:block;font-size:13px;margin-bottom:4px}

  /* hand + rings */
  .hand{position:absolute;width:40px;height:40px;left:240px;top:420px;transition:left .6s ease,top .6s ease,opacity .3s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45));z-index:10;pointer-events:none;opacity:0}
  .hand.press{transform:scale(.9);transform-origin:14px 4px}
  .hand svg{display:block}
  .hand.edge .hshape{stroke:#0B0D1C}
  .ring{position:absolute;width:30px;height:30px;border-radius:50%;border:2px solid var(--accent);opacity:0;z-index:9;pointer-events:none}
  .ring.tapgo{animation:tap .5s ease-out}
  .ring.holdgo{animation:hold 1s ease-out}
  @keyframes tap{0%{opacity:.95;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}
  @keyframes hold{0%{opacity:.95;transform:scale(.5)}70%{opacity:.95;transform:scale(1.15)}100%{opacity:0;transform:scale(1.5)}}
  `;

  const HAND = `<svg width="40" height="40" viewBox="-1 0 26 25">
        <path class="hshape" d="M6 4a2 2 0 0 1 4 0V9a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L6 14Z" fill="#FFFFFF" stroke="none" stroke-width="1" stroke-linejoin="round"/>
        <path d="M10 9v3.5M14 10v3M18 11v2.5" fill="none" stroke="#C9CCE0" stroke-width="1.2" stroke-linecap="round"/>
      </svg>`;
  const TIPX = 9 * 40 / 26, TIPY = 2 * 40 / 26 + (40 - 25 * 40 / 26) / 2; // fingertip inside the 40x40 hand

  /* ---------- icons ---------- */
  const PATHS = {
    back:'<path d="M15 6l-6 6 6 6"/>', fwd:'<path d="M9 6l6 6-6 6"/>',
    share:'<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    book:'<path d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5V19c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5z"/><path d="M12 6v13.5"/>',
    tabs:'<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M8 20h10a2 2 0 0 0 2-2V8"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', page:'<path d="M4 7h16M4 12h10M4 17h16"/>',
    dots:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    vdots:'<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    reload:'<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>', plus:'<path d="M12 5v14M5 12h14"/>',
    home:'<path d="M4 11l8-7 8 7v9H4z"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    star:'<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    addsq:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>', lock:'<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
    glasses:'<circle cx="7" cy="14" r="3.2" fill="none" stroke="currentColor"/><circle cx="17" cy="14" r="3.2" fill="none" stroke="currentColor"/><path d="M10.2 14h3.6"/>'
  };
  const ic = (k, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${PATHS[k]}</svg>`;
  const ph = (top, bottom) => `<div class="ph" style="top:${top}px;bottom:${bottom}px"><div class="t"></div><div class="b"></div><div class="b"></div><div class="b"></div></div>`;

  /* ---------- shared iOS pieces ---------- */
  const sheet = () => `<div class="sheet" id="sheet"><div class="grab"></div>
    <div class="sh-head"><img src="${ICON}" alt=""><div><b>HabiTally</b><small>${HOST}</small></div></div>
    <div class="approw"><div></div><div></div><div></div><div></div><div></div></div>
    <div class="list">
      <div class="row">Copy ${ic('copy')}</div>
      <div class="row">Add Bookmark ${ic('book')}</div>
      <div class="row">Add to Favourites ${ic('star')}</div>
      <div class="row" id="ahs">Add to Home Screen ${ic('addsq')}</div>
    </div></div>`;
  const confirm = webapp => `<div class="confirm" id="confirm">
    <div class="chdr"><span class="c-cancel">Cancel</span><b>Add to Home Screen</b><span class="c-add" id="addBtn">Add</span></div>
    <div class="cbox"><img src="${ICON}" alt=""><div><b>HabiTally</b><small>${HOST}</small></div></div>
    ${webapp ? '<div class="cbox ctog"><span>Open as Web App</span><i class="tog"></i></div>' : ''}
  </div>`;
  const homeGrid = (cls = '') => `<div class="grid">
    ${['Photos','Mail','Maps','Notes','Camera'].map(n => `<div class="gi"><i></i>${n}</div>`).join('')}
    <div class="gi hab ${cls}"><i></i><img src="${ICON}" alt=""><span>HabiTally</span></div>
    ${['Music','Clock'].map(n => `<div class="gi"><i></i>${n}</div>`).join('')}
  </div>`;
  const result = () => `<div class="result" id="result">${homeGrid()}</div>`;

  const ANDROID_TXT = {
    samsung: { name: 'Samsung Internet', btn: 'menu', steps: ['Tap the menu <b>≡</b> at the bottom right', 'Tap <b>Add page to</b>', 'Tap <b>Home screen</b>'] },
    firefox: { name: 'Firefox', btn: 'top', steps: ['Tap the menu <b>⋮</b>', 'Tap <b>Add to Home screen</b>', 'Tap <b>Add</b>'] },
    chrome: { name: 'Chrome', btn: 'top', steps: ['Tap the menu <b>⋮</b> at the top right', 'Tap <b>Add to Home screen</b> or <b>Install app</b>', 'Tap <b>Install</b>'] }
  };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- one guide, drawn into `hostEl` ----------
     opts.step      "STEP 5 OF 5", or null in the reminder sheet
     opts.onFinish  called once, with 'added' | 'accepted' | 'done' | 'later'  */
  function createGuide(hostEl, opts) {
    const det = detect();
    // the app's theme, as an attribute the shadow CSS can see (html.light
    // is outside the shadow root); kept in step if the theme changes
    const syncTheme = () => { hostEl.dataset.theme = document.documentElement.classList.contains('light') ? 'light' : 'dark'; };
    syncTheme();
    const themeWatch = typeof MutationObserver === 'function' ? new MutationObserver(syncTheme) : null;
    if (themeWatch) themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const sr = hostEl.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${CSS}</style>
    <div class="phone" id="phone">
      <div class="app" id="app"></div>
      <div class="ring" id="ring" aria-hidden="true"></div>
      <div class="hand" id="hand" aria-hidden="true">
      ${HAND}
      </div>
    </div>`;

    /* ---------- engine ---------- */
    const $ = s => sr.querySelector(s);
    const phone = $('#phone'), appEl = $('#app'), hand = $('#hand'), ringEl = $('#ring');
    let timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stopAll = () => { timers.forEach(clearTimeout); timers = []; };
    function rel(el) { const p = phone.getBoundingClientRect(), r = el.getBoundingClientRect(); return [r.left - p.left + r.width / 2, r.top - p.top + r.height / 2]; }
    function point(el, dx = 0, dy = 0, instant = false) {
      const [x, y] = rel(el);
      if (instant) hand.style.transition = 'none';
      hand.style.left = (x + dx - TIPX) + 'px'; hand.style.top = (y + dy - TIPY) + 'px'; hand.style.opacity = 1;
      if (instant) { void hand.offsetWidth; hand.style.transition = ''; }
      return [x + dx, y + dy];
    }
    function ring(p, kind = 'tap') {
      ringEl.style.left = (p[0] - 15) + 'px'; ringEl.style.top = (p[1] - 15) + 'px'; ringEl.className = 'ring'; void ringEl.offsetWidth; ringEl.classList.add(kind + 'go');
      hand.classList.add('press'); at(kind == 'hold' ? 900 : 220, () => hand.classList.remove('press'));
    }
    function park() {
      const s = $('#stage'); if (!s) return; const p = phone.getBoundingClientRect(), r = s.getBoundingClientRect();
      hand.style.transition = 'none'; hand.style.left = (r.right - p.left - 80) + 'px'; hand.style.top = (r.top - p.top + r.height * .42) + 'px'; hand.style.opacity = 1; void hand.offsetWidth; hand.style.transition = '';
    }
    function cap(i, html) {
      const n = $('#num'); if (!n) return; n.textContent = i; $('#captxt').innerHTML = html;
      sr.querySelectorAll('#dots i').forEach((d, k) => d.classList.toggle('on', k < i));
    }
    const on = (id, c = 'show') => $('#' + id).classList.add(c), off = (id, c = 'show') => { const e = $('#' + id); if (e) e.classList.remove(c); };

    function shell(o) {
      return `${opts.step ? `<div class="step">${opts.step}</div>` : ''}
    <h2>${o.title || 'Put HabiTally on your home screen'}</h2>
    <p class="lead">${o.lead || 'Then it opens like any other app, full screen, one tap away.'}</p>
    <div class="stage ${o.short ? 'short' : ''}" id="stage" aria-hidden="true">${o.stage}</div>
    ${o.below || ''}
    <div class="btns"><button class="btn ${o.ghost ? 'ghost' : ''}" id="primary">${o.primary || "I've added it"}</button><button class="skip">${o.secondary || 'Not now'}</button></div>`;
    }
    const capRow = n => `<div class="caprow"><span class="num" id="num">1</span><span class="captxt" id="captxt"></span><span class="dots" id="dots" aria-hidden="true">${'<i></i>'.repeat(n)}</span></div>`;
    const go = (to, text) => `<a data-go="${to}" role="button" tabindex="0">${text}</a>`;

    /* ---------- variants ---------- */
    const androidSub = det.sub || 'chrome';
    const inappOS = det.os || 'ios';
    const V = {};

    V.ios26 = {
      html: () => shell({
        stage: `<div class="mini">${ph(0, 64)}
        <div class="bar26">
          <div class="circ left">${ic('back')}</div>
          <div class="pill" id="pill">${ic('page')}<span>${HOST}</span>${ic('reload')}</div>
          <div class="circ right" id="more">${ic('dots')}</div>
        </div>
        <div class="menu" id="menu">
          <div class="mrow" id="shareRow">${ic('share')}Share</div>
          <div class="mrow">${ic('link')}Copy</div>
          <div class="mrow">${ic('mic')}Voice Search</div>
        </div>
        ${sheet()}${confirm(true)}${result()}</div>`,
        below: capRow(4) + `<p class="fallback">Or tap ••• next to the address bar, then Share. Looks different? ${go('ios18', 'Show the other layout')}</p>`
      }),
      rest() { cap(1, '<b>Press and hold</b> the address bar'); point($('#pill'), 0, 0, true); },
      run() {
        cap(1, '<b>Press and hold</b> the address bar'); park();
        at(400, () => { const p = point($('#pill')); at(650, () => { ring(p, 'hold'); on('pill', 'held'); }); });
        at(2000, () => { on('menu'); off('pill', 'held'); cap(2, 'Tap <b>Share</b>'); });
        at(2400, () => { const p = point($('#shareRow'), -30, 0); at(600, () => { ring(p); on('shareRow', 'hl'); }); });
        at(3500, () => { off('menu'); on('sheet'); cap(3, 'Tap <b>Add to Home Screen</b>'); });
        at(4100, () => { const p = point($('#ahs'), 40, 0); at(650, () => { ring(p); on('ahs', 'hl'); }); });
        at(5500, () => { on('confirm'); cap(4, 'Tap <b>Add</b>'); });
        at(6100, () => { const p = point($('#addBtn')); at(650, () => { ring(p); on('addBtn', 'hl'); }); });
        at(7400, () => { on('result'); hand.style.opacity = 0; cap(4, '<b>Done.</b> It is on your home screen'); });
        return 10200;
      }
    };

    V.ios18 = {
      html: () => shell({
        stage: `<div class="mini">${ph(0, 92)}
        <div class="classic">
          <div class="addr"><span>AA</span><span class="u">${ic('lock')}${HOST}</span>${ic('reload')}</div>
          <div class="tools">${ic('back')}${ic('fwd', 'dim')}<span id="shareIcon" style="display:grid">${ic('share')}</span>${ic('book')}${ic('tabs')}</div>
        </div>
        ${sheet()}${confirm(false)}${result()}</div>`,
        below: capRow(3) + `<p class="fallback">Looks different? ${go('ios26', 'Show the iOS 26 layout')}</p>`
      }),
      rest() { cap(1, 'Tap <b>Share</b> at the bottom'); point($('#shareIcon'), 0, 0, true); },
      run() {
        cap(1, 'Tap <b>Share</b> at the bottom'); park();
        at(400, () => { const p = point($('#shareIcon')); at(700, () => { ring(p); on('shareIcon', 'hl'); }); });
        at(1700, () => { off('shareIcon', 'hl'); on('sheet'); cap(2, 'Tap <b>Add to Home Screen</b>'); });
        at(2300, () => { const p = point($('#ahs'), 40, 0); at(650, () => { ring(p); on('ahs', 'hl'); }); });
        at(3700, () => { on('confirm'); cap(3, 'Tap <b>Add</b>'); });
        at(4300, () => { const p = point($('#addBtn')); at(650, () => { ring(p); on('addBtn', 'hl'); }); });
        at(5600, () => { on('result'); hand.style.opacity = 0; cap(3, '<b>Done.</b> It is on your home screen'); });
        return 8400;
      }
    };

    V.ioschrome = {
      html: () => shell({
        short: true,
        stage: `<div class="mini">
        <div class="ctop"><div class="omni">${ic('lock')}<span>${HOST}</span><b class="sh" id="cShare">${ic('share')}</b></div></div>
        ${ph(52, 48)}
        <div class="cbot">${ic('back')}${ic('fwd')}${ic('plus')}${ic('tabs')}${ic('dots')}</div></div>`,
        below: `<ol class="steps"><li><span>Tap <b>Share</b> at the right of the address bar</span></li><li><span>Scroll down and tap <b>Add to Home Screen</b></span></li><li><span>Tap <b>Add</b></span></li></ol>
        <p class="fallback">Don't see it? <a data-copy role="button" tabindex="0">Copy the link</a> and open it in Safari.</p>`
      }),
      run() { point($('#cShare'), 0, 0, true); return 0; }
    };

    V.android = {
      html: () => shell({
        stage: `<div class="nmini" id="nmini">${homeGrid('slot')}
        <div class="scrim" id="scrim"></div>
        <div class="ndlg" id="ndlg">
          <div class="nd-title">Install app</div>
          <div class="nd-app"><img src="${ICON}" alt=""><div><b>HabiTally</b><small>${HOST}</small></div></div>
          <div class="nd-btns"><span>Cancel</span><span class="inst" id="ndInstall">Install</span></div>
        </div></div>`,
        below: capRow(2) + `<p class="fallback">Nothing happens? Tap ⋮ at the top right, then <b>Add to Home screen</b>.</p>`,
        primary: 'Add to home screen'
      }),
      rest() { off('nmini', 'done'); cap(1, 'Tap <b>Add to home screen</b>'); point($('#primary'), 40, 0, true); },
      run() {
        off('nmini', 'done'); cap(1, 'Tap <b>Add to home screen</b>'); park();
        at(400, () => { const p = point($('#primary'), 40, 0); at(700, () => { ring(p); }); });
        at(1500, () => { on('scrim'); on('ndlg'); cap(2, 'Tap <b>Install</b>'); });
        at(2100, () => { const p = point($('#ndInstall')); at(650, () => { ring(p); }); });
        at(3300, () => { off('scrim'); off('ndlg'); hand.style.opacity = 0; on('nmini', 'done'); cap(2, '<b>Done.</b> It is on your home screen'); });
        return 6200;
      }
    };

    V.androidtext = {
      html: () => {
        const t = ANDROID_TXT[androidSub] || ANDROID_TXT.chrome;
        const stage = t.btn == 'menu'
          ? `<div class="mini" style="background:#121212">${ph(0, 48)}<div class="nbot">${ic('back')}${ic('fwd')}${ic('home')}${ic('tabs')}<span id="aMenu" style="display:grid">${ic('menu')}</span></div></div>`
          : `<div class="mini" style="background:#121212"><div class="ntop"><div class="omni">${ic('lock')}${HOST}</div><span class="ib">${ic('tabs')}</span><span class="ib" id="aMenu">${ic('vdots')}</span></div>${ph(50, 0)}</div>`;
        return shell({
          short: true, stage,
          below: `<ol class="steps">${t.steps.map(s => `<li><span>${s}</span></li>`).join('')}</ol>`
        });
      },
      run() { point($('#aMenu'), 0, 0, true); return 0; }
    };

    V.inapp = {
      html: () => {
        const br = inappOS == 'ios' ? 'Safari' : 'Chrome';
        return shell({
          short: true,
          title: `Open HabiTally in ${br} first`,
          lead: `You opened this inside ${det.app ? esc(det.app) : 'another app'}. Home screen shortcuts only work from ${br}.`,
          stage: `<div class="mini" style="background:#f2f2f2">
          <div class="iatop"><span class="ib">${ic('x')}</span><div class="t"><b>HabiTally</b><small>${HOST}</small></div><span class="ib" id="iaDots">${ic('dots')}</span></div>
          <div class="ph" style="top:52px;bottom:0;opacity:.18"><div class="t"></div><div class="b"></div><div class="b"></div></div>
          <div class="iamenu"><div>Copy link</div><div class="hl" id="iaOpen">Open in external browser</div><div>Report</div></div></div>`,
          below: `<ol class="steps"><li><span>Tap <b>•••</b> at the top right</span></li><li><span>Tap <b>${inappOS == 'ios' ? 'Open in external browser</b> or <b>Open in Safari' : 'Open in Chrome</b> or <b>Open in external browser'}</b></span></li><li><span>The setup continues in ${br}</span></li></ol>`,
          primary: 'Copy link', ghost: true, secondary: 'Skip for now'
        });
      },
      run() { point($('#iaOpen'), 50, 0, true); return 0; }
    };

    V.desktop = {
      html: () => shell({
        short: true,
        title: 'Get HabiTally on your phone',
        lead: 'Ticking off habits works best from your phone. Scan this with your phone camera.',
        stage: `<div class="qrwrap"><div class="qr" id="qr"></div><div class="qrside"><b>Your personal link</b>Opens your HabiTally on the phone. Then add it to the home screen there.</div></div>`,
        below: `<p class="fallback">Or open the welcome email on your phone and tap the button.</p>`,
        primary: 'Done', secondary: 'Skip'
      }),
      run() {
        hand.style.opacity = 0;
        const q = $('#qr');
        loadQr().then(QR => {
          if (!q.isConnected || q.firstChild) return;
          new QR(q, { text: LINK, width: 130, height: 130, colorDark: '#0B0D1C', colorLight: '#ffffff', correctLevel: QR.CorrectLevel.M });
        }).catch(() => {
          if (q.isConnected) q.innerHTML = `<span style="font:600 10px/1.4 Manrope,system-ui;color:#0B0D1C;word-break:break-all">${esc(LINK)}</span>`;
        });
        return 0;
      }
    };

    /* ---------- the buttons ---------- */
    let current, finished = false, copyTimer = null;
    function finish(reason) {
      if (finished) return;
      finished = true;
      destroy();
      opts.onFinish(reason);
    }
    // "Copied" for 2 seconds, then the label comes back; the step stays
    async function copyLink(el) {
      const label = el.dataset.label || (el.dataset.label = el.textContent);
      if (await copyText(LINK)) {
        el.textContent = 'Copied';
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => { el.textContent = label; }, 2000);
      }
    }
    // Android: the browser's own install dialog. Accepted ends onboarding;
    // dismissed stays here, where the line under the image gives the menu way.
    async function install() {
      const ev = installPrompt;
      if (!ev) return;
      installPrompt = null;            // a prompt can be shown only once
      stopAll();
      try {
        await ev.prompt();
        const choice = await ev.userChoice;
        if (choice && choice.outcome === 'accepted') { finish('accepted'); return; }
      } catch (e) { /* the prompt could not be shown */ }
      if (!finished) show(current);
    }
    const ACTIONS = {
      ios26: { primary: () => finish('added') },
      ios18: { primary: () => finish('added') },
      ioschrome: { primary: () => finish('added') },
      androidtext: { primary: () => finish('added') },
      android: { primary: install },
      inapp: { primary: el => copyLink(el) },
      desktop: { primary: () => finish('done') }
    };
    const onKey = (el, fn) => {
      el.onclick = () => fn(el);
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(el); } };
    };

    /* ---------- switcher ---------- */
    function show(id) {
      stopAll(); current = id;
      hand.style.opacity = 0;
      hand.classList.toggle('edge', id == 'inapp');
      appEl.innerHTML = V[id].html();
      const primary = $('#primary');
      primary.onclick = () => ACTIONS[id].primary(primary);
      $('.skip').onclick = () => finish('later');
      sr.querySelectorAll('[data-go]').forEach(a => onKey(a, () => show(a.dataset.go)));
      sr.querySelectorAll('[data-copy]').forEach(a => onKey(a, copyLink));
      requestAnimationFrame(() => {
        if (current !== id || finished) return;
        if (reducedMotion()) { (V[id].rest || V[id].run)(); return; }   // the hand rests on the first target
        const loop = V[id].run();
        if (loop) at(loop, () => { if (current == id) show(id); });
      });
    }

    // the loop runs only while the guide is on screen
    function onVisibility() {
      if (document.hidden) stopAll();
      else if (!finished && current) show(current);
    }
    document.addEventListener('visibilitychange', onVisibility);

    const self = {
      promptReady() { if (current === 'androidtext') show('android'); },
      installed() { if (current === 'android' || current === 'androidtext') finish('accepted'); }
    };
    function destroy() {
      stopAll();
      clearTimeout(copyTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      if (themeWatch) themeWatch.disconnect();
      guides.delete(self);
    }
    guides.add(self);
    show(P.variantFor(det, !!installPrompt));
    return { destroy, variant: () => current };
  }

  /* ---------- light-DOM styles: the step's screen, the sheet, the banner ---------- */
  const style = document.createElement('style');
  style.textContent = `
  .hsg-step{position:fixed;inset:0;z-index:210;overflow-y:auto;overscroll-behavior:contain;background:#0B0D1C;-webkit-overflow-scrolling:touch}
  .hsg-sheet{position:fixed;inset:0;z-index:300;display:flex;align-items:flex-end;justify-content:center}
  .hsg-sheet-back{position:absolute;inset:0;background:var(--overlay);opacity:0;transition:opacity .3s ease;touch-action:none}
  .hsg-sheet-panel{position:relative;width:100%;max-width:480px;height:92vh;height:min(92dvh,820px);border-radius:28px 28px 0 0;overflow:hidden;
    background:#0B0D1C;box-shadow:0 -20px 50px rgba(0,0,0,0.25);transform:translateY(100%);transition:transform .3s ease}
  .hsg-sheet.show .hsg-sheet-back{opacity:1}
  .hsg-sheet.show .hsg-sheet-panel{transform:none}
  .hsg-sheet-host{height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
  html.light .hsg-step{background-color:var(--bg-page);background-image:var(--page-glow);background-repeat:no-repeat}
  html.light .hsg-sheet-panel{background:var(--sheet-bg)}
  .a2hs-banner{display:flex;align-items:center;gap:6px;margin-top:12px;padding:4px 4px 4px 12px;border-radius:14px;
    background:var(--accent-tint);border:1px solid var(--accent-edge)}
  .a2hs-banner span{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:700;color:var(--text-primary)}
  .a2hs-show{flex:none;height:36px;padding:0 10px;border:none;border-radius:999px;background:var(--accent);color:#FFFFFF;font-size:12px;font-weight:800;cursor:pointer}
  .a2hs-x{flex:none;width:32px;height:36px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--text-muted);cursor:pointer;
    display:flex;align-items:center;justify-content:center}
  .a2hs-show:focus-visible,.a2hs-x:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  @media (prefers-reduced-motion: reduce){ .hsg-sheet-back,.hsg-sheet-panel{transition:none} }`;
  document.head.appendChild(style);

  /* ---------- the last onboarding step ---------- */
  // Full screen over the onboarding. opts: { step: "STEP 5 OF 5", onFinish }
  function mountStep(opts) {
    const host = document.createElement('div');
    host.className = 'hsg-step';
    document.body.appendChild(host);
    const g = createGuide(host, {
      step: opts.step,
      onFinish: reason => opts.onFinish(reason)
    });
    return { destroy() { g.destroy(); host.remove(); }, variant: g.variant };
  }

  /* ---------- the reminder: one banner, then the same guide as a sheet ---------- */
  function openSheet() {
    const wrap = document.createElement('div');
    wrap.className = 'hsg-sheet';
    wrap.innerHTML = '<div class="hsg-sheet-back"></div>' +
      '<div class="hsg-sheet-panel" role="dialog" aria-modal="true" aria-label="Put HabiTally on your home screen"><div class="hsg-sheet-host" data-mode="sheet"></div></div>';
    document.body.appendChild(wrap);
    if (typeof window.lockBody === 'function') window.lockBody();
    let g = null, closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (g) g.destroy();
      document.removeEventListener('keydown', onEsc);
      wrap.classList.remove('show');
      setTimeout(() => { wrap.remove(); if (typeof window.unlockBody === 'function') window.unlockBody(); }, reducedMotion() ? 0 : 300);
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    wrap.querySelector('.hsg-sheet-back').onclick = close;
    g = createGuide(wrap.querySelector('.hsg-sheet-host'), { step: null, onFinish: close });
    requestAnimationFrame(() => wrap.classList.add('show'));
  }

  // On a phone, in a browser tab, 3 days or more after onboarding finished,
  // and never again after "Show me" or ×. Called by stats.js once it knows
  // onboarding is behind the user.
  function maybeRemind() {
    const det = detect();
    if (!P.isPhone(det)) return false;
    const at = store.get(ONBOARDED_AT);
    if (!P.reminderDue(Date.now(), at === null ? null : Number(at), store.get(GUIDE_DONE) === '1')) return false;
    const app = document.getElementById('app');
    if (!app || document.getElementById('a2hs-banner')) return false;
    const b = document.createElement('div');
    b.id = 'a2hs-banner';
    b.className = 'a2hs-banner';
    b.innerHTML = '<span>Add HabiTally to your home screen</span>' +
      '<button type="button" class="a2hs-show">Show me</button>' +
      '<button type="button" class="a2hs-x" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    app.insertBefore(b, app.firstChild);
    b.querySelector('.a2hs-show').onclick = () => { turnOffReminder(); b.remove(); openSheet(); };
    b.querySelector('.a2hs-x').onclick = () => { turnOffReminder(); b.remove(); };
    return true;
  }

  window.HTHome = {
    // false when the app already runs from the home screen: then the step is skipped
    offerStep: () => detect().id !== 'installed',
    mountStep,
    markOnboarded() { store.set(ONBOARDED_AT, String(Date.now())); },
    maybeRemind
  };
})();
