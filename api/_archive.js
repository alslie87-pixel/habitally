// Past years, read from the sheet's own year archives.
//
// Starting a new year is done in the sheet (HabiTally menu -> Start new year,
// rolloverYear in the sheet's Code.gs), never from the app. Before that
// script clears the ticks it saves the year in a hidden tab named
// "Archive <year>", laid out as:
//
//   row 1   Date   | name of habit slot 1 | ... | name of slot 14   (Control Panel F7:F20)
//   row 2   Type   | bad / good ...                                 (E7:E20)
//   row 3   Status | active / conquered / ...                        (G7:G20)
//   row 4+  date as text YYYY-MM-DD | TRUE/FALSE per slot, one row per calendar day of that year
//
// Slots 1-7 are the bad habits (month-tab columns C..I), 8-14 the good ones
// (J..P), exactly like the Control Panel. The app only reads these tabs: it
// works out each past year's trophies from the saved ticks with the same
// rules _trophies.js uses for the running year, so a trophy never depends on
// which side counted it.

const { monthThreshold, yearThreshold, SEASONS, KEEPS_TROPHIES } = require('./_trophies');

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TAB_RE = /^Archive (\d{4})$/;
const isChecked = v => v === true || v === 'TRUE';

function serialToDate(v) {
  if (typeof v === 'number') {
    const ud = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return new Date(ud.getUTCFullYear(), ud.getUTCMonth(), ud.getUTCDate());
  }
  // the sheet script writes dates as text 'YYYY-MM-DD', so no time zone can move them
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim()) : null;
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

// Every "Archive <year>" tab as { year, rows }. A sheet that has never been
// rolled over has none, which costs one small metadata call.
async function readArchives(sheets, spreadsheetId) {
  let titles = [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
    titles = ((meta.data && meta.data.sheets) || []).map(s => s.properties && s.properties.title).filter(t => TAB_RE.test(t || ''));
  } catch (e) {
    return [];
  }
  if (!titles.length) return [];
  try {
    const r = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: titles.map(t => "'" + t + "'!A1:O400"),
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    return (r.data.valueRanges || []).map((vr, i) => ({ year: Number(TAB_RE.exec(titles[i])[1]), rows: (vr && vr.values) || [] }));
  } catch (e) {
    console.error('[archive] read failed', e && e.message);
    return [];
  }
}

// One archived year -> { year, months: [{ name, m, when }], seasons: [...], years: [...] }
function trophiesFromArchive(year, rows) {
  const out = { year, months: [], seasons: [], years: [] };
  if (!rows || rows.length < 4) return out;
  const names = rows[0] || [], types = rows[1] || [], statuses = rows[2] || [];
  const slots = [];
  for (let c = 1; c <= 14; c++) {
    const name = String(names[c] || '').trim();
    const type = String(types[c] || '').trim().toLowerCase();
    const status = String(statuses[c] || '').trim().toLowerCase();
    if (name && type === 'bad' && KEEPS_TROPHIES.indexOf(status) !== -1) slots.push({ c, name, counts: new Array(12).fill(0) });
  }
  rows.slice(3).forEach(row => {
    const date = serialToDate(row && row[0]);
    if (!date || date.getFullYear() !== year) return;
    slots.forEach(s => { if (isChecked(row[s.c])) s.counts[date.getMonth()]++; });
  });
  slots.forEach(s => {
    const won = s.counts.map((n, m) => n >= monthThreshold(year, m));
    won.forEach((w, m) => { if (w) out.months.push({ name: s.name, m, when: MON[m] }); });
    SEASONS.forEach(se => { if (se.months.every(m => won[m])) out.seasons.push({ name: s.name, key: se.key, label: se.label }); });
    if (s.counts.reduce((a, b) => a + b, 0) >= yearThreshold(year)) out.years.push({ name: s.name });
  });
  out.months.sort((a, b) => a.m - b.m || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

// All archived years, newest first, leaving out the running year.
async function pastTrophies(sheets, spreadsheetId, currentYear) {
  const archives = await readArchives(sheets, spreadsheetId);
  return archives
    .filter(a => Number.isInteger(a.year) && a.year !== currentYear)
    .map(a => trophiesFromArchive(a.year, a.rows))
    .sort((a, b) => b.year - a.year);
}

module.exports = { readArchives, trophiesFromArchive, pastTrophies, MON };
