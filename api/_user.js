const { google } = require('googleapis');

// Resolves which spreadsheet to use for this request.
//
// CUSTOMERS_SHEET_ID not set  -> single-user mode: always GOOGLE_SHEET_ID.
// CUSTOMERS_SHEET_ID set      -> ?user=<name> is required and must match
//                                column A (case-insensitive) in the Customers
//                                sheet; the sheet URL in that row is used.
//                                Missing or unknown user -> null. Callers
//                                must answer 404 {error:"unknown user"}.
//                                GOOGLE_SHEET_ID is never used as a fallback
//                                in this mode.

const cache = new Map(); // name -> { id, t }
const TTL = 5 * 60 * 1000;

async function resolveSheetId(req) {
  const customersId = process.env.CUSTOMERS_SHEET_ID;
  if (!customersId) return process.env.GOOGLE_SHEET_ID;

  const user = (req.query && req.query.user ? String(req.query.user) : '').trim().toLowerCase();
  if (!user) return null;

  const hit = cache.get(user);
  if (hit && Date.now() - hit.t < TTL) return hit.id;

  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  let rows = [];
  for (const range of ["'Customers'!A1:H400", 'A1:H400']) {
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: customersId, range });
      rows = resp.data.values || [];
      if (rows.length) break;
    } catch (e) { /* tab name miss — try next */ }
  }
  for (const row of rows) {
    const name = (row[0] || '').toString().trim().toLowerCase();
    if (name !== user) continue;
    for (const cell of row) {
      const m = /\/d\/([a-zA-Z0-9-_]+)/.exec((cell || '').toString());
      if (m) { cache.set(user, { id: m[1], t: Date.now() }); return m[1]; }
    }
  }
  return null;
}

module.exports = { resolveSheetId };
