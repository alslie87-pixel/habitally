// The web app manifest, per customer.
//
// An iPhone home screen app does not share storage with Safari, so the icon
// has to launch with the customer's ?user=...&t=... in its URL, or the app
// opens empty. The page links here with its own user and token (see
// manifestHref in platform.js), and this answers with a start_url that
// carries them. No sheet access: the link is only checked for its format,
// the same format _user.js and the welcome email use. Without user and t
// (single-user mode) the app starts at "/".

const TOKEN_RE = /^[a-z0-9]{16}$/;   // as in _user.js
const USER_MAX = 100;

// The name is column A of the Customers sheet, so anything printable goes.
const isUser = u => u.length > 0 && u.length <= USER_MAX && !/\p{Cc}/u.test(u);

module.exports = (req, res) => {
  const q = req.query || {};
  const user = q.user === undefined ? '' : String(q.user).trim();
  const t = q.t === undefined ? '' : String(q.t).trim();

  let startUrl = '/';
  let id = '/';
  if (user || t) {
    if (!isUser(user) || !TOKEN_RE.test(t)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Invalid user or t' }));
    }
    startUrl = '/?user=' + encodeURIComponent(user) + '&t=' + t;
    id = '/?user=' + encodeURIComponent(user);   // the app stays the same app if the token changes
  }

  const manifest = {
    id,
    name: 'HabiTally',
    short_name: 'HabiTally',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    background_color: '#0B0D1C',
    theme_color: '#0B0D1C',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  // the token is in it: keep it out of shared caches
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(manifest));
};
