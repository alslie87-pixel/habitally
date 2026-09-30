const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom } = require('./_date');
const { sheetYearFrom, sheetEndOfYear, yearState, outOfYearMessage } = require('./_year');
const V = require('./_validate');

// Applies a batch of habit ticks in ONE Sheets write.
//
// The app queues taps in an outbox and flushes them here every few seconds,
// so spamming a chip costs one write against the Google quota — which the
// service account shares across every customer — instead of one read and
// one write per tap (which is what tripped the per-minute quota and made
// parallel flips race each other in toggle-habit).
//
// Each change carries the DESIRED value (set, not flip). A delayed,
// repeated or double-delivered flush therefore cannot double-flip a cell,
// and the current value never needs to be read. The last change per cell
// wins. Only day rows in the C..P band of the twelve month tabs can be
// written, exactly like toggle-habit, and the involved tabs get the same
// year gate: a batch into a sheet whose year is over is refused whole.

const MAX_CHANGES = 100; // a full week of every slot is 7 x 14 = 98 cells

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!V.requirePost(req, res)) return;
  try {
    const body = req.body || {};
    const changes = Array.isArray(body.changes) ? body.changes : null;
    if (!changes || !changes.length) return res.status(400).json({ success: false, error: 'Missing changes' });
    if (changes.length > MAX_CHANGES) return res.status(400).json({ success: false, error: 'Too many changes' });

    const clean = [];
    for (const c of changes) {
      const sheetName = c && c.sheetName;
      const row = V.toInt(c && c.row);
      const col = V.toInt(c && c.col);
      const value = c && c.value;
      if (!V.isMonthName(sheetName)) return res.status(400).json({ success: false, error: 'Invalid sheetName' });
      if (!V.isDayRow(row))          return res.status(400).json({ success: false, error: 'Invalid row' });
      if (!V.isHabitCol(col))        return res.status(400).json({ success: false, error: 'Invalid col' });
      if (typeof value !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid value' });
      clean.push({ sheetName, row, col, value });
    }

    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    // The same year gate as toggle-habit, once per involved tab: one
    // batchGet however many cells the flush carries.
    const today = todayFrom(req);
    const tabs = Array.from(new Set(clean.map(c => c.sheetName)));
    const gate = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: tabs.map(t => "'" + t + "'!A1:P46"),
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    for (const vr of (gate.data.valueRanges || [])) {
      const gridYear = sheetYearFrom((vr && vr.values) || []);
      const year = yearState(gridYear === null ? null : sheetEndOfYear(gridYear), today);
      if (year.outOfYear) {
        return res.status(409).json({ success: false, error: outOfYearMessage() });
      }
    }

    // last value per cell wins, then one batched write
    const byCell = new Map();
    clean.forEach(c => byCell.set(c.sheetName + '!' + c.row + ':' + c.col, c));
    const data = Array.from(byCell.values()).map(c => ({
      range: "'" + c.sheetName + "'!" + String.fromCharCode(64 + c.col) + c.row,
      values: [[c.value]]
    }));
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data }
    });

    res.status(200).json({ success: true, applied: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
