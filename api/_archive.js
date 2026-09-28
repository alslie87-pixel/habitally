// Past years, read from the sheet's own year archives.
//
// Starting a new year is done in the sheet (HabiTally menu -> Start new year,
// rolloverYear in the sheet's Code.gs, allowed only after the sheet's last
// date), never from the app. Before that script clears the ticks it saves
// the year in a hidden tab named "Archive <startyear>", laid out as:
//
//   row 1   Date   | name of habit slot 1 | ... | name of slot 14   (Control Panel F7:F20)
//   row 2   Type   | copy of Control Panel E7:E20 — not read, see below
//   row 3   Status | active / conquered / ...                        (G7:G20)
//   row 4+  date as text YYYY-MM-DD | TRUE/FALSE per slot, one row per day the sheet covered
//
// Slots 1-7 are the bad habits (month-tab columns C..I), 8-14 the good ones
// (J..P), exactly like the Control Panel. The type comes from that position
// alone, as everywhere else: column E is a label for people ("bad habit
// calendar slot 1 --->"), so its copy in row 2 is ignored.
//
// The archive stores ALL day rows of the year-sheet, so "Archive 2026"
// also carries 29-31 Dec 2025 and 1-3 Jan 2027: the 2026 sheet's own first
// and last weeks. The app only READS these tabs; _timeline.js merges their
// days with the live sheet into the one timeline everything is derived
// from, per calendar date, so no day is counted twice.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TAB_RE = /^Archive (\d{4})$/;

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

module.exports = { readArchives, MON };
