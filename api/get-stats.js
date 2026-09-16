const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom, isoLocal } = require('./_date');
const { sheetYearFromGrids, yearState, outOfYearPayload } = require('./_year');


// v28 stats endpoint — one batchGet, everything the stats page needs.
// Month grid columns (0-based within A1:X47):
//   B=1 date · C..I=2..8 bad · J..P=9..15 good · Q=16 BH% · R=17 GH%
//   W=22 weekday helper · X=23 numeric GH daily helper
//   Row 46 (idx 45) = monthly counts per habit · M47=[46][12] · H47=[46][7]
// Control Panel: E7:H20 habit slots · Z1 = hidden app-onboarded marker.

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const WEEK_STARTS = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2,11,20,29,38)
const DEFAULT_HABITS = ['No alcohol','No social media','No sugar','Exercise','Read','Early to bed'];

function serialToDate(v) {
  if (typeof v !== 'number') return null;
  const ud = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
  return new Date(ud.getUTCFullYear(), ud.getUTCMonth(), ud.getUTCDate());
}
const isChecked = v => v === true || v === 'TRUE';
const num = v => (typeof v === 'number' && !isNaN(v)) ? v : null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await resolveSheetId(req);
    if (!sheetId) return res.status(404).json({ error: 'unknown user' });

    const ranges = MONTHS.map(m => `'${m}'!A1:X47`);
    ranges.push("'⚙️ Control Panel'!E7:H20");
    ranges.push("'⚙️ Control Panel'!Z1");

    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const vr = batch.data.valueRanges;
    const monthGrids = vr.slice(0, 12).map(r => r.values || []);
    const cpRows = vr[12].values || [];
    const markerCell = (vr[13].values && vr[13].values[0] && vr[13].values[0][0]) || '';

    const today = todayFrom(req); // client's local date (?date=YYYY-MM-DD) or server midnight
    const curMonth = today.getMonth();

    // The Progress page is nothing but aggregates, so an out-of-year sheet
    // has nothing honest to show.
    const year = yearState(sheetYearFromGrids(monthGrids), today);
    if (year.outOfYear) return res.status(200).json(outOfYearPayload(year));

    // ── habits (position-based, like get-habits) ─────────────
    const habits = [];
    cpRows.forEach((row, idx) => {
      const type = (row[0] || '').toString().trim().toLowerCase();
      const name = (row[1] || '').toString().trim();
      const status = (row[2] || '').toString().trim().toLowerCase();
      if (!type || !name || status === 'empty') return;
      const colIndex = idx <= 6 ? 2 + idx : 9 + (idx - 7);
      habits.push({ name, type, status, colIndex });
    });
    const active = habits.filter(h => h.status === 'active');

    // ── helpers over one month grid ──────────────────────────
    function dayRows(grid) {
      const out = [];
      WEEK_STARTS.forEach(ws => {
        for (let d = 0; d < 7; d++) {
          const r = ws + d;
          const row = grid[r]; if (!row) continue;
          const date = serialToDate(row[1]); if (!date) continue;
          out.push({ r, row, date });
        }
      });
      return out;
    }

    // ── per-month aggregates + daily series ──────────────────
    const months = [];
    const daily = [];
    let checksYTD = 0, perfectDays = 0, bestDayEver = 0, bestWeekEver = 0;

    monthGrids.forEach((grid, mi) => {
      const g47 = grid[46] || [];
      const good = num(g47[12]);
      const bad  = num(g47[7]);
      months.push({ name: MONTHS[mi].slice(0, 3), good, bad });

      [9, 18, 27, 36, 45].forEach(sr => {
        const w = grid[sr] && num(grid[sr][17]);
        if (w !== null && w !== undefined && w > bestWeekEver) bestWeekEver = w;
      });

      dayRows(grid).forEach(({ row, date }) => {
        if (date > today) return;
        const p = num(row[23]);
        if (p !== null) {
          daily.push({ t: isoLocal(date), p });
          if (p > bestDayEver) bestDayEver = p;
          if (p >= 0.999 && active.some(h => h.type === 'good')) perfectDays++;
        }
        for (let c = 2; c <= 15; c++) if (isChecked(row[c])) checksYTD++;
      });
    });
    daily.sort((a, b) => a.t < b.t ? -1 : 1);

    const monthVals = months.map(m => m.good).filter(v => v !== null && v > 0);
    const bestMonthIdx = months.reduce((bi, m, i) =>
      (m.good !== null && (bi === -1 || m.good > months[bi].good)) ? i : bi, -1);
    const vsBest = (bestMonthIdx >= 0 && months[curMonth] && months[curMonth].good)
      ? months[curMonth].good / months[bestMonthIdx].good : null;

    // ── current month detail ─────────────────────────────────
    const cg = monthGrids[curMonth];
    const rowsNow = dayRows(cg).filter(x => x.date <= today);
    const elapsed = rowsNow.length || 1;

    const consistency = rowsNow.filter(x => (num(x.row[23]) || 0) >= 0.66).length / elapsed;

    const wkendRows = rowsNow.filter(x => (x.row[22] || 0) > 5);
    const wkdayRows = rowsNow.filter(x => { const w = x.row[22] || 0; return w >= 1 && w <= 5; });
    const avg = rs => rs.length ? rs.reduce((s, x) => s + (num(x.row[23]) || 0), 0) / rs.length : null;
    const weekendGap = (wkendRows.length && wkdayRows.length) ? avg(wkendRows) - avg(wkdayRows) : null;

    const weekday = [];
    for (let d = 1; d <= 7; d++) {
      const rs = rowsNow.filter(x => x.row[22] === d);
      weekday.push(rs.length ? Math.round(avg(rs) * 100) : null);
    }

    const matrix = active.map(h => {
      const days = [];
      for (let d = 1; d <= 7; d++) {
        const rs = rowsNow.filter(x => x.row[22] === d);
        days.push(rs.length
          ? Math.round(rs.filter(x => isChecked(x.row[h.colIndex])).length / rs.length * 100)
          : null);
      }
      return { name: h.name, type: h.type, days };
    });

    // comebacks: >=66% day right after a <66% day (consecutive dates)
    let comebacks = 0;
    for (let i = 1; i < rowsNow.length; i++) {
      const prev = num(rowsNow[i - 1].row[23]) || 0;
      const cur  = num(rowsNow[i].row[23]) || 0;
      const gap = (rowsNow[i].date - rowsNow[i - 1].date) / 86400000;
      if (gap === 1 && cur >= 0.66 && prev < 0.66) comebacks++;
    }

    // habit momentum: this month elapsed pct vs last month pct
    const countIn = (grid, colIndex, upTo) => {
      let c = 0, days = 0;
      dayRows(grid).forEach(({ row, date }) => {
        if (upTo && date > upTo) return;
        days++;
        if (isChecked(row[colIndex])) c++;
      });
      return days ? c / days : null;
    };
    const lastGrid = curMonth > 0 ? monthGrids[curMonth - 1] : null;
    const momentum = active.map(h => {
      const nowP  = countIn(cg, h.colIndex, today);
      const lastP = lastGrid ? countIn(lastGrid, h.colIndex, null) : null;
      // per-habit monthly series (Jan..current)
      const series = [];
      for (let m = 0; m <= curMonth; m++) {
        const p = countIn(monthGrids[m], h.colIndex, m === curMonth ? today : null);
        series.push(p !== null ? Math.round(p * 100) : 0);
      }
      // best streak + all-time across the year
      let best = 0, run = 0, prevDate = null, checksAll = 0, daysAll = 0;
      monthGrids.forEach(grid => {
        dayRows(grid).forEach(({ row, date }) => {
          if (date > today) return;
          daysAll++;
          const ok = isChecked(row[h.colIndex]);
          if (ok) {
            checksAll++;
            const gap = prevDate ? (date - prevDate) / 86400000 : 1;
            run = gap === 1 && prevDate ? run + 1 : 1;
            if (run > best) best = run;
            prevDate = date;
          } else {
            run = 0; prevDate = null;
          }
        });
      });
      return {
        name: h.name, type: h.type,
        now: nowP !== null ? Math.round(nowP * 100) : null,
        delta: (nowP !== null && lastP !== null) ? Math.round((nowP - lastP) * 100) : null,
        series,
        bestStreak: best,
        allTime: daysAll ? Math.round(checksAll / daysAll * 100) : 0
      };
    });

    // leaderboard (current month)
    const leaderboard = active.map(h => ({
      name: h.name, type: h.type,
      pct: Math.round((countIn(cg, h.colIndex, today) || 0) * 100)
    })).sort((a, b) => b.pct - a.pct);

    const conqueredCount = habits.filter(h => h.status === 'conquered').length;

    // ── onboarding state ─────────────────────────────────────
    const names = active.map(h => h.name).sort();
    const isDefault = names.length === 6 &&
      DEFAULT_HABITS.slice().sort().every((n, i) => n === names[i]);
    const onboarded = String(markerCell).trim() === 'app-onboarded';
    const needsOnboarding = !onboarded && isDefault && checksYTD === 0;

    res.status(200).json({
      needsOnboarding,
      habits: active.map(h => ({ name: h.name, type: h.type })),
      months, daily, weekday, matrix, momentum, leaderboard,
      consistency: Math.round(consistency * 100),
      weekendGap: weekendGap !== null ? Math.round(weekendGap * 100) : null,
      perfectDays, comebacks, checksYTD,
      vsBest: vsBest !== null ? Math.round(vsBest * 100) : null,
      bestDayEver: Math.round(bestDayEver * 100),
      bestWeekEver: Math.round(bestWeekEver * 100),
      bestMonthEver: bestMonthIdx >= 0
        ? { name: months[bestMonthIdx].name, pct: Math.round(months[bestMonthIdx].good * 100) }
        : null,
      conqueredCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
