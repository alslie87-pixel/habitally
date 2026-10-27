// The home screen step: which guide a phone gets (platform.js) and the
// per-customer manifest (api/manifest.js) that makes the home screen icon
// open the personal link.
//
// Pure functions and one handler without sheet access: nothing here
// touches the network, the Google API or a real sheet.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');

const P = require('../platform');
const manifest = require('../api/manifest');

// ── detectPlatform ─────────────────────────────────────────

const UA = {
  ios26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ios18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0 (iPhone15,2; iOS 18_6; nb_NO; nb; scale=3.00; 1179x2556)',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0;]',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
};

// the cases from the task, expected result in brackets there
const CASES = [
  ['iOS 26 Safari (OS frozen at 18_6, Version/26)', UA.ios26, { id: 'ios26' }],
  ['iOS 18 Safari', UA.ios18, { id: 'ios18' }],
  ['Chrome on iPhone', UA.iosChrome, { id: 'ioschrome' }],
  ['Instagram on iPhone', UA.instagramIos, { id: 'inapp', os: 'ios', app: 'Instagram' }],
  ['Facebook on Android (WebView)', UA.facebookAndroid, { id: 'inapp', os: 'android', app: 'Facebook' }],
  ['Chrome on Android', UA.chromeAndroid, { id: 'android', sub: 'chrome' }],
  ['Samsung Internet', UA.samsung, { id: 'android', sub: 'samsung' }],
  ['Firefox on Android', UA.firefoxAndroid, { id: 'android', sub: 'firefox' }],
  ['Chrome on a Mac', UA.macChrome, { id: 'desktop' }]
];

CASES.forEach(([label, ua, want]) => {
  test('detectPlatform: ' + label, () => {
    assert.deepEqual(P.detectPlatform(ua, { standalone: false, maxTouchPoints: 0 }), want);
  });
});

test('detectPlatform: opened from the home screen wins over everything', () => {
  for (const ua of Object.values(UA)) {
    assert.deepEqual(P.detectPlatform(ua, { standalone: true }), { id: 'installed' });
  }
});

test('detectPlatform: an iPad in desktop mode is told apart by its touch points', () => {
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
  assert.deepEqual(P.detectPlatform(ipad, { maxTouchPoints: 5 }), { id: 'ios26' });
  assert.deepEqual(P.detectPlatform(ipad, { maxTouchPoints: 0 }), { id: 'desktop' }); // a real Mac
});

test('detectPlatform: Safari without a Version token is treated as iOS 26', () => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1';
  assert.deepEqual(P.detectPlatform(ua, {}), { id: 'ios26' });
  const v25 = UA.ios18.replace('Version/18.5', 'Version/25.9');
  assert.deepEqual(P.detectPlatform(v25, {}), { id: 'ios18' });
});

test('detectPlatform: in-app browsers are named when known, otherwise not', () => {
  const messengerIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/500.0]';
  assert.deepEqual(P.detectPlatform(messengerIos, {}), { id: 'inapp', os: 'ios', app: 'Messenger' });
  const lineIos = UA.ios18.replace('Safari/604.1', 'Safari/604.1 Line/14.0.0');
  assert.deepEqual(P.detectPlatform(lineIos, {}), { id: 'inapp', os: 'ios', app: 'LINE' });
  // an unknown app's web view: iOS without "Safari/", Android with "; wv)"
  const unknownIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  assert.deepEqual(P.detectPlatform(unknownIos, {}), { id: 'inapp', os: 'ios', app: null });
  const unknownAndroid = UA.facebookAndroid.replace(' [FB_IAB/FB4A;FBAV/500.0;]', '');
  assert.deepEqual(P.detectPlatform(unknownAndroid, {}), { id: 'inapp', os: 'android', app: null });
});

test('variantFor: Android gets the install button only with a captured prompt', () => {
  const det = P.detectPlatform(UA.chromeAndroid, {});
  assert.equal(P.variantFor(det, true), 'android');
  assert.equal(P.variantFor(det, false), 'androidtext');
  assert.equal(P.variantFor(P.detectPlatform(UA.samsung, {}), true), 'android');
  assert.equal(P.variantFor(P.detectPlatform(UA.ios26, {}), true), 'ios26');
});

test('isPhone: phones in a browser, not a computer and not the installed app', () => {
  assert.equal(P.isPhone({ id: 'ios26' }), true);
  assert.equal(P.isPhone({ id: 'inapp' }), true);
  assert.equal(P.isPhone({ id: 'android' }), true);
  assert.equal(P.isPhone({ id: 'desktop' }), false);
  assert.equal(P.isPhone({ id: 'installed' }), false);
});

// ── the personal link and the manifest link ────────────────

test('personalLink: the full link, encoded as the welcome email builds it', () => {
  assert.equal(P.personalLink('https://habitally.example', '?user=Kari%20Nordmann&t=abcdefghijklmnop'),
    'https://habitally.example/?user=Kari%20Nordmann&t=abcdefghijklmnop');
  assert.equal(P.personalLink('https://habitally.example', '?t=abcdefghijklmnop&user=%C3%85se&date=x'),
    'https://habitally.example/?user=%C3%85se&t=abcdefghijklmnop');
  assert.equal(P.personalLink('https://habitally.example', ''), 'https://habitally.example/');
});

test('manifestHref: the page links the manifest with its own user and token', () => {
  assert.equal(P.manifestHref('?user=Kari%20Nordmann&t=abcdefghijklmnop'), '/api/manifest?user=Kari+Nordmann&t=abcdefghijklmnop');
  assert.equal(P.manifestHref('?t=abcdefghijklmnop&user=martin&x=1'), '/api/manifest?user=martin&t=abcdefghijklmnop');
  assert.equal(P.manifestHref(''), '/api/manifest');
});

// ── the reminder ───────────────────────────────────────────

test('reminderDue: 3 days after onboarding, right away without a timestamp, never once done', () => {
  const day = 24 * 60 * 60 * 1000, t0 = Date.UTC(2026, 9, 1);
  assert.equal(P.reminderDue(t0 + 2 * day, t0, false), false);
  assert.equal(P.reminderDue(t0 + 3 * day - 1, t0, false), false);
  assert.equal(P.reminderDue(t0 + 3 * day, t0, false), true);
  assert.equal(P.reminderDue(t0, null, false), true);          // finished before this release
  assert.equal(P.reminderDue(t0, NaN, false), true);           // a broken value counts as none
  assert.equal(P.reminderDue(t0 + 30 * day, t0, true), false); // "Show me", × or "I've added it"
  assert.equal(P.reminderDue(t0, null, true), false);
});

// ── api/manifest ───────────────────────────────────────────

function callManifest(query) {
  const res = {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b; return this; }
  };
  manifest({ method: 'GET', query }, res);
  return res;
}

test('manifest: start_url is the personal link, URL-encoded, with a stable id', () => {
  const res = callManifest({ user: 'Kari Nordmann', t: 'abcdefghijklmnop' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/manifest+json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'private, no-store');
  const m = JSON.parse(res.body);
  assert.equal(m.start_url, '/?user=Kari%20Nordmann&t=abcdefghijklmnop');
  assert.equal(m.id, '/?user=Kari%20Nordmann');
  assert.equal(m.scope, '/');
  assert.equal(m.name, 'HabiTally');
  assert.equal(m.short_name, 'HabiTally');
  assert.equal(m.display, 'standalone');
  assert.equal(m.background_color, '#0B0D1C');
  assert.equal(m.theme_color, '#0B0D1C');
  assert.deepEqual(m.icons.map(i => i.sizes + ' ' + i.purpose),
    ['192x192 any', '512x512 any', '512x512 maskable']);

  // what the page sends: the start_url is the same link the app runs on
  const fromPage = new URLSearchParams(P.manifestHref('?user=%C3%85se%20%26%20co&t=0123456789abcdef').split('?')[1]);
  const m2 = JSON.parse(callManifest(Object.fromEntries(fromPage)).body);
  assert.equal(m2.start_url, '/?user=%C3%85se%20%26%20co&t=0123456789abcdef');
  assert.equal(new URL(m2.start_url, 'https://x').searchParams.get('user'), 'Åse & co');
});

test('manifest: without user and token the app starts at /', () => {
  const m = JSON.parse(callManifest({}).body);
  assert.equal(m.start_url, '/');
  assert.equal(m.id, '/');
});

test('manifest: a malformed user or token is refused, not turned into a start_url', () => {
  const bad = [
    { user: 'martin' },                                       // no token
    { t: 'abcdefghijklmnop' },                                // no user
    { user: 'martin', t: 'ABCDEFGHIJKLMNOP' },                // token: a-z0-9 only
    { user: 'martin', t: 'abc' },                             // token: 16 characters
    { user: 'martin', t: 'abcdefghijklmnop"' },
    { user: 'mar\ntin', t: 'abcdefghijklmnop' },              // control character
    { user: 'x'.repeat(101), t: 'abcdefghijklmnop' }
  ];
  for (const q of bad) {
    const res = callManifest(q);
    assert.equal(res.statusCode, 400, JSON.stringify(q));
    assert.equal(JSON.parse(res.body).error, 'Invalid user or t');
  }
});
