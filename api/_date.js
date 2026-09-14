// "Today" for a request.
//
// Vercel runs in UTC, so new Date() on the server is a day behind Oslo (and
// most customers) between local midnight and 01:00/02:00. The client therefore
// sends its own local calendar date as ?date=YYYY-MM-DD, and the server uses
// that for "today", week selection and isToday.
//
// Missing or malformed -> fall back to the server's own local midnight.
// Dates are built with new Date(y, m, d) (local midnight) so they compare
// cleanly with the sheet dates produced by serialToDate().

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseISODate(s) {
  const m = DATE_RE.exec(String(s || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  // reject things like 2026-02-31 that Date silently rolls over
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function todayFrom(req) {
  const fromClient = parseISODate(req && req.query && req.query.date);
  if (fromClient) return fromClient;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

const pad2 = n => (n < 10 ? '0' : '') + n;
const isoLocal = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

module.exports = { todayFrom, parseISODate, isoLocal };
