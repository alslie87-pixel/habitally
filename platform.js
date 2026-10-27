/* ============================================================
   HABITALLY — WHICH PHONE AND BROWSER IS THIS?
   Picks the home screen guide (homescreen.js) from the user agent.
   Ported from the design mock (homescreen-guide.html). Everything here is
   a pure function of its arguments, so the tests run it on plain strings:
   loaded as window.HTPlatform in the page, require()d in Node.
   ============================================================ */
(function (root) {
  'use strict';

  // In-app browsers, and the app's name for "You opened this inside …".
  // Messenger comes before Facebook: its user agent carries FBAN/FBAV too.
  const IN_APP = [
    [/Instagram/, 'Instagram'],
    [/Messenger|Orca-Android/, 'Messenger'],
    [/FBAN|FBAV|FB_IAB/, 'Facebook'],
    [/TikTok|musical_ly/, 'TikTok'],
    [/LinkedInApp/, 'LinkedIn'],
    [/Snapchat/, 'Snapchat'],
    [/Pinterest/, 'Pinterest'],
    [/Line\//, 'LINE']
  ];

  // ua: navigator.userAgent. env: { standalone, maxTouchPoints }.
  // Returns { id } and, where it applies:
  //   installed   already opened from the home screen (the step is skipped)
  //   inapp       { os: 'ios'|'android', app: 'Instagram'|… or null }
  //   ioschrome   Chrome, Edge, Firefox or Opera on iPhone
  //   ios26       Safari reporting Version/26 or higher, or no Version token
  //   ios18       Safari reporting Version/25 or lower
  //   android     { sub: 'chrome'|'samsung'|'firefox' }; whether the install
  //               prompt is there is decided at runtime (variantFor)
  //   desktop     everything else
  // iOS 26 Safari freezes the OS version in the user agent at 18_6, so the
  // Safari "Version/" token decides, never the OS version.
  function detectPlatform(ua, env) {
    ua = String(ua || '');
    env = env || {};
    const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
    const iOS = /iPhone|iPod/.test(ua) || iPad;
    const android = /Android/.test(ua);
    if (env.standalone) return { id: 'installed' };
    const hit = IN_APP.find(([re]) => re.test(ua));
    if (hit || (iOS && !/Safari\//.test(ua)) || (android && /; wv\)/.test(ua))) {
      return { id: 'inapp', os: iOS ? 'ios' : 'android', app: hit ? hit[1] : null };
    }
    if (iOS) {
      if (/CriOS|EdgiOS|FxiOS|OPiOS/.test(ua)) return { id: 'ioschrome' };
      const v = +((ua.match(/Version\/(\d+)/) || [])[1] || 0);
      return { id: v === 0 || v >= 26 ? 'ios26' : 'ios18' };
    }
    if (android) {
      return { id: 'android', sub: /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : 'chrome' };
    }
    return { id: 'desktop' };
  }

  // The guide to show: Android gets the one-tap install button only when
  // the browser handed over its install prompt, otherwise the menu steps
  // for the browser it is.
  function variantFor(det, hasPrompt) {
    if (det.id === 'android') return hasPrompt ? 'android' : 'androidtext';
    return det.id;
  }

  // A phone in a browser tab: the only place the reminder banner shows.
  const isPhone = det => ['ios26', 'ios18', 'ioschrome', 'android', 'inapp'].includes(det.id);

  // The customer's own link, exactly as the welcome email builds it
  // (pipeline_token.gs): origin + /?user=<name>&t=<token>.
  function personalLink(origin, search) {
    const q = new URLSearchParams(search || '');
    const user = (q.get('user') || '').trim();
    const t = (q.get('t') || '').trim();
    if (!user && !t) return origin + '/';
    return origin + '/?user=' + encodeURIComponent(user) + '&t=' + encodeURIComponent(t);
  }

  // Where the page's <link rel="manifest"> points: the manifest route with
  // the same user and token, so the home screen icon opens the personal link.
  function manifestHref(search) {
    const q = new URLSearchParams(search || '');
    const out = new URLSearchParams();
    ['user', 't'].forEach(k => { const v = (q.get(k) || '').trim(); if (v) out.set(k, v); });
    const s = out.toString();
    return '/api/manifest' + (s ? '?' + s : '');
  }

  // The reminder banner: once the guide was dealt with (done), never again;
  // otherwise 3 days after onboarding finished. No timestamp means onboarding
  // finished before the guide existed, so the banner is due right away.
  const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
  function reminderDue(now, onboardedAt, done) {
    if (done) return false;
    if (onboardedAt === null || onboardedAt === undefined || !isFinite(onboardedAt)) return true;
    return now - onboardedAt >= REMIND_AFTER_MS;
  }

  const api = { detectPlatform, variantFor, isPhone, personalLink, manifestHref, reminderDue, REMIND_AFTER_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HTPlatform = api;
})(typeof window !== 'undefined' ? window : this);
