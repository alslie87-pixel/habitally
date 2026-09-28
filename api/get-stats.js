const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom } = require('./_date');
const { sheetEndFromGrids, yearState, outOfYearPayload } = require('./_year');
const { computeTrophiesForYear } = require('./_trophies');
const { readArchives, MON } = require('./_archive');
const TL = require('./_timeline');
const CP = require('./_controlPanel');


// v28 stats endpoint — one batchGet + the year archives, everything the
// stats page needs.
//
// Month grid columns (0-based within A1:X47):
//   B=1 date · C..I=2..8 bad · J..P=9..15 good
//   Row 47 (idx 46) = the sheet's own monthly counts, kept for the month
//   bars; every other number is derived from the ONE TIMELINE across the
//   years (_timeline.js): the live tabs plus the "Archive <year>" tabs,
//   one entry per calendar date. All-time really means all time, and the
//   current year's numbers include archive days that belong to it (1-3
//   January live in the previous sheet's archive).
// Control Panel: habit slots and the Z1 marker — see _controlPanel.js.

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const DEFAULT_HABITS = ['No alcohol','No social media','No sugar','Exercise','Read','Early to bed'];

const num = v => (typeof v === 'number' && !isNaN(v)) ? v : null;
const weekdayOf = d => ((d.getDay() + 6) % 7) + 1; // 1 = Monday .. 7 = Sunday

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
    ranges.push(CP.HABITS_RANGE);
    ranges.push(CP.ONBOARDED_CELL);

    const [batch, archives] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges,
        valueRenderOption: 'UNFORMATTED_VALUE'
      }),
      readArchives(sheets, sheetId)
    ]);
    const vr = batch.data.valueRanges;
    const monthGrids = vr.slice(0, 12).map(r => r.values || []);
    const cpRows = (vr[12] && vr[12].values) || [];
    const markerCell = (vr[13] && vr[13].values && vr[13].values[0] && vr[13].values[0][0]) || '';

    const today = todayFrom(req); // client's local date (?date=YYYY-MM-DD) or server midnight
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

    // The Progress page is nothing but aggregates, so a finished sheet has
    // nothing honest to show. Over = today after the sheet's last date.
    const year = yearState(sheetEndFromGrids(monthGrids), today);
    if (year.outOfYear) return res.status(200).json(outOfYearPayload());

    // ── habits (position-based, like get-habits) ─────────────
    const slots = CP.readSlots(cpRows);
    const habits = slots.filter(CP.isHabit).map(s => ({
      key: TL.habitKey(s.type, s.name),
      name: s.name, type: s.type, status: s.status, colIndex: s.colIndex
    }));
    const active = habits.filter(h => h.status === 'active');

    // ── the timeline ─────────────────────────────────────────
    const tl = TL.buildTimeline(monthGrids, slots, archives, today);
    const allDays = tl.days;
    const yearDays = TL.daysOfYear(tl, curYear);
    const monthDaysNow = TL.daysOfMonth(tl, curYear, curMonth);

    // ── daily series + all-time tiles ────────────────────────
    // The heatmap shows the current calendar year, archive days included;
    // each day is measured against its own source's active good habits.
    const daily = [];
    let checksYTD = 0;
    yearDays.forEach(day => {
      checksYTD += day.ticks.size;
      const p = TL.dayPercent(day);
      if (p !== null) daily.push({ t: day.iso, p });
    });

    let perfectDays = 0, bestDayEver = 0, comebacks = 0;
    let prevDay = null;
    allDays.forEach(day => {
      const p = TL.dayPercent(day);
      if (p !== null) {
        if (p > bestDayEver) bestDayEver = p;
        if (p >= 0.999) perfectDays++;
      }
      // comebacks: a >=66% day right after a <66% day (consecutive dates)
      if (prevDay) {
        const gap = (day.date - prevDay.date) / 86400000;
        const cur = TL.dayPercent(day) || 0;
        const prev = TL.dayPercent(prevDay) || 0;
        if (gap === 1 && cur >= 0.66 && prev < 0.66) comebacks++;
      }
      prevDay = day;
    });
    const bestWeekEver = TL.bestWeekEver(tl);

    // ── month bars (the sheet's own row-47 counts) ───────────
    const months = [];
    monthGrids.forEach((grid, mi) => {
      const g47 = grid[46] || [];
      months.push({ name: MONTHS[mi].slice(0, 3), good: num(g47[12]), bad: num(g47[7]) });
    });
    const bestMonthIdx = months.reduce((bi, m, i) =>
      (m.good !== null && (bi === -1 || m.good > months[bi].good)) ? i : bi, -1);
    const vsBest = (bestMonthIdx >= 0 && months[curMonth] && months[curMonth].good)
      ? months[curMonth].good / months[bestMonthIdx].good : null;

    // ── current month detail ─────────────────────────────────
    const elapsed = monthDaysNow.length || 1;
    const pOf = day => TL.dayPercent(day) || 0;

    const consistency = monthDaysNow.filter(d => pOf(d) >= 0.66).length / elapsed;

    const wkendDays = monthDaysNow.filter(d => weekdayOf(d.date) > 5);
    const wkdayDays = monthDaysNow.filter(d => weekdayOf(d.date) <= 5);
    const avg = ds => ds.length ? ds.reduce((s, d) => s + pOf(d), 0) / ds.length : null;
    const weekendGap = (wkendDays.length && wkdayDays.length) ? avg(wkendDays) - avg(wkdayDays) : null;

    const weekday = [];
    for (let d = 1; d <= 7; d++) {
      const ds = monthDaysNow.filter(x => weekdayOf(x.date) === d);
      weekday.push(ds.length ? Math.round(avg(ds) * 100) : null);
    }

    const matrix = active.map(h => {
      const days = [];
      for (let d = 1; d <= 7; d++) {
        const ds = monthDaysNow.filter(x => weekdayOf(x.date) === d);
        days.push(ds.length
          ? Math.round(TL.tickedIn(ds, h.key) / ds.length * 100)
          : null);
      }
      return { name: h.name, type: h.type, days };
    });

    // ── habit momentum + all-time ────────────────────────────
    // "vs last month" is the previous CALENDAR month, so in January it is
    // December out of the archive.
    const prevMonthDays = curMonth > 0
      ? TL.daysOfMonth(tl, curYear, curMonth - 1)
      : TL.daysOfMonth(tl, curYear - 1, 11);

    const pctIn = (days, key) => days.length ? TL.tickedIn(days, key) / days.length : null;

    const momentum = active.map(h => {
      const nowP  = pctIn(monthDaysNow, h.key);
      const lastP = pctIn(prevMonthDays, h.key);
      // per-habit monthly series (Jan..current, of the current year)
      const series = [];
      for (let m = 0; m <= curMonth; m++) {
        const p = pctIn(TL.daysOfMonth(tl, curYear, m), h.key);
        series.push(p !== null ? Math.round(p * 100) : 0);
      }
      return {
        name: h.name, type: h.type,
        now: nowP !== null ? Math.round(nowP * 100) : null,
        delta: (nowP !== null && lastP !== null) ? Math.round((nowP - lastP) * 100) : null,
        series,
        bestStreak: TL.longestRun(tl, h.key),
        allTime: allDays.length ? Math.round(TL.tickedIn(allDays, h.key) / allDays.length * 100) : 0
      };
    });

    // leaderboard, all time
    const leaderboard = active.map(h => ({
      name: h.name, type: h.type,
      pct: allDays.length ? Math.round(TL.tickedIn(allDays, h.key) / allDays.length * 100) : 0
    })).sort((a, b) => b.pct - a.pct);

    const conqueredCount = habits.filter(h => h.status === 'conquered').length;

    // ── onboarding state ─────────────────────────────────────
    // Exactly the six defaults (upper/lower case ignored), Z1 not marked and
    // not a single checkmark. The last two are the same rule update-config
    // uses to rename in place during onboarding.
    const lower = list => list.map(n => n.toLowerCase()).sort();
    const names = lower(active.map(h => h.name));
    const defaults = lower(DEFAULT_HABITS);
    const isDefault = names.length === defaults.length && defaults.every((n, i) => n === names[i]);
    const needsOnboarding = isDefault && CP.inOnboarding(markerCell, monthGrids);

    // ── trophy case ───────────────────────────────────────────
    // Current and past years alike are counted per CALENDAR year from the
    // timeline. The current year's roster is the Control Panel; earlier
    // years use the habits the timeline knows (the newest source wins), so
    // a renamed habit's old months stay under its old name.
    const tcBad = habits.filter(h => h.type === 'bad');
    const tcNow = computeTrophiesForYear(yearDays, tcBad, curYear, curMonth).trophies;
    const tcMonths = [];
    tcNow.habits.forEach(h => h.months.forEach(m => {
      if (m.won) tcMonths.push({ name: h.name, m: m.m, when: MON[m.m] });
    }));
    tcMonths.sort((a, b) => a.m - b.m || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const registryBad = Array.from(tl.habits.values()).filter(h => h.type === 'bad');
    const pastYears = archives
      .map(a => a.year)
      .filter(y => Number.isInteger(y) && y !== curYear)
      .sort((a, b) => b - a);
    const past = pastYears.map(y => {
      const t = computeTrophiesForYear(TL.daysOfYear(tl, y), registryBad, y, null).trophies;
      const out = { year: y, months: [], seasons: [], years: [] };
      t.habits.forEach(h => {
        h.months.forEach(m => { if (m.won) out.months.push({ name: h.name, m: m.m, when: MON[m.m] }); });
        h.seasons.forEach(s => { if (s.won) out.seasons.push({ name: h.name, key: s.key, label: s.label }); });
        if (h.year.won) out.years.push({ name: h.name });
      });
      out.months.sort((a, b) => a.m - b.m || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return out;
    });

    const trophyCase = {
      current: { year: curYear, months: tcMonths },
      past
    };

    res.status(200).json({
      trophyCase,
      needsOnboarding,
      habits: active.map(h => ({ name: h.name, type: h.type })),
      months, daily, weekday, matrix, momentum, leaderboard,
      consistency: Math.round(consistency * 100),
      weekendGap: weekendGap !== null ? Math.round(weekendGap * 100) : null,
      perfectDays, comebacks, checksYTD,
      vsBest: vsBest !== null ? Math.round(vsBest * 100) : null,
      bestDayEver: Math.round(bestDayEver * 100),
      bestWeekEver,
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
