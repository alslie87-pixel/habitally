const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom } = require('./_date');
const { serialToDate, isChecked, isoOf, FOCUS_WINDOW_DAYS } = require('./_streak');
const { sheetEndFromGrids, yearState, outOfYearPayload } = require('./_year');
const { computeTrophiesForYear } = require('./_trophies');
const { findCurrentWeek, dayWindow, isoWeek } = require('./_week');
const { readArchives } = require('./_archive');
const TL = require('./_timeline');
const CP = require('./_controlPanel');


// ── v28 SHEET STRUCTURE ──────────────────────────────────────
// Control Panel: slots, focus cells and marker — see _controlPanel.js
// Month tabs:    bad habits C..I (0-based 2..8), good J..P (9..15)
//                Q=BH% (16), R=GH% (17), S=Streak (18),
//                T=Weakest (19), U=Signal (20)
// Reads use UNFORMATTED_VALUE: dates arrive as serial numbers,
// checkboxes as booleans, percents as 0..1 numbers.
//
// Every number below the calendar comes from the ONE TIMELINE across the
// years (_timeline.js): the twelve live tabs plus the "Archive <year>"
// tabs, one entry per calendar date. Streak, focus counters, the weekly
// trend, the 30-day habit percentages and the trophies therefore survive
// new year. Weekly percentages are computed from the raw ticks (Mon-Sun),
// not from the sheet's own summary rows.

const COL_WEAKEST     = 19; // T
const COL_SIGNAL      = 20; // U

function colIndexToLetter(index) {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

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

    // ── 1. READ EVERYTHING ───────────────────────────────────
    // One batchGet for the twelve month tabs + the two Control Panel
    // ranges, and in parallel the year archives (one metadata call for the
    // tab names, one batchGet for their rows — none for a new customer).
    const today = todayFrom(req); // client's local date (?date=YYYY-MM-DD) or server midnight
    const monthNames = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];
    const monthName = monthNames[today.getMonth()];
    const lastColLetter = colIndexToLetter(COL_SIGNAL); // U

    const ranges = monthNames.map(m => `'${m}'!A1:${lastColLetter}46`);
    ranges.push(CP.HABITS_RANGE, CP.FOCUS_SEARCH_RANGE);

    const [batch, archives] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges,
        valueRenderOption: 'UNFORMATTED_VALUE'
      }),
      readArchives(sheets, sheetId)
    ]);
    const vr = batch.data.valueRanges || [];
    const monthGrids = vr.slice(0, 12).map(r => (r && r.values) || []);
    const configRows = (vr[12] && vr[12].values) || [];
    const focusData  = (vr[13] && vr[13].values) || [];

    const slots = CP.readSlots(configRows);
    const badHabits = [];
    const goodHabits = [];

    // Type and column index follow the ROW POSITION, so empty slots in the
    // middle do not shift later habits. The key is what the timeline
    // matches habits on across the years.
    slots.forEach(s => {
      if (!CP.isHabit(s)) return;
      const h = {
        key: TL.habitKey(s.type, s.name),
        name: s.name, status: s.status, note: s.note, colIndex: s.colIndex
      };
      (s.type === 'bad' ? badHabits : goodHabits).push(h);
    });

    const activeBad    = badHabits.filter(h => h.status === 'active');
    const activeGood   = goodHabits.filter(h => h.status === 'active');
    const activeGoodKeys = activeGood.map(h => h.key);

    // ── 2. FOCUS HABITS ──────────────────────────────────────
    // The focus cells are found by their Building:/Eliminating: labels
    // (see _controlPanel.js) and hold a habit NAME as free text.
    // update-focus only validates it when the app writes it, so a hand-edit
    // or a rename in the sheet can
    // leave a name that matches nothing. That is reported as its own state
    // rather than counted as zero days.
    const focus = CP.findFocus(focusData);
    const goodFocus = focus.good.value;
    const badFocus  = focus.bad.value;

    const findHabit = (list, name) => {
      if (!name) return null;
      const want = name.toLowerCase();
      return list.find(h => h.name.toLowerCase() === want) || null;
    };
    const goodFocusHabit = findHabit(goodHabits, goodFocus);
    const badFocusHabit  = findHabit(badHabits, badFocus);

    // ── YEAR GATE ────────────────────────────────────────────
    // The sheet is over only when today is AFTER its last dated day (the
    // 2026 sheet runs through 3 Jan 2027). Then everything below would be
    // derived from a finished sheet, so stop and let the app explain.
    const year = yearState(sheetEndFromGrids(monthGrids), today);
    if (year.outOfYear) return res.status(200).json(outOfYearPayload());

    // ── 3. FIND CURRENT WEEK ─────────────────────────────────
    // The week that contains today is not always in today's tab: the sheet
    // moves a trailing partial week into the NEXT month's tab, and in the
    // first days of January the live week can still be December's week 5
    // (see _week.js). This Monday-Sunday week is what the weekly numbers
    // count and where weakest/signal are read; the strip below rolls.
    const wk = findCurrentWeek(monthGrids, today);
    const weekGrid = monthGrids[wk.monthIdx] || [];
    const weekSheetName = monthNames[wk.monthIdx];

    const weekRow = wk.weekRow;

    // ── 4. BUILD THE WEEK STRIP ──────────────────────────────
    // A rolling window, three days either side of today, so yesterday is
    // always on screen — on a Monday too. The window can reach over a
    // Sunday-Monday boundary into the previous or next month tab, so every
    // day carries its own tab and row (see dayWindow in _week.js). The
    // Monday carries its ISO week number for the divider the app draws
    // before it.
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const strip = dayWindow(monthGrids, today);
    if (!strip.length) {
      // today lies before the sheet's first date, which the rollover never
      // leads to: show the week findCurrentWeek fell back to, so the habit
      // lists the app reads from week[0] are never empty
      for (let d = 0; d < 7; d++) {
        const date = weekGrid[weekRow + d] ? serialToDate(weekGrid[weekRow + d][1]) : null;
        if (date) strip.push({ date, monthIdx: wk.monthIdx, row: weekRow + d });
      }
    }

    const weekData = strip.map(({ date, monthIdx, row }) => {
      const cells = monthGrids[monthIdx][row];
      const chip = h => ({
        name:    h.name,
        checked: isChecked(cells[h.colIndex]),
        col:     h.colIndex + 1
      });
      return {
        day:       dayNames[date.getDay()],
        date:      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        iso:       isoOf(date),
        sheetName: monthNames[monthIdx],
        row:       row + 1,
        isToday:   date.getTime() === today.getTime(),
        isoWeek:   date.getDay() === 1 ? isoWeek(date) : null,
        bad:       activeBad.map(chip),
        good:      activeGood.map(chip)
      };
    });

    // ── 5. THE TIMELINE ──────────────────────────────────────
    const tl = TL.buildTimeline(monthGrids, slots, archives, today);
    const thisMonday = TL.mondayOf(today);

    // ── 6. WEEKLY % + TREND + SIGNAL ─────────────────────────
    // Mon-Sun weeks from the raw ticks of the active good habits: ticked /
    // (habits x days seen). The live week counts its elapsed days only.
    // The window is simply the last calendar weeks, wherever their days
    // live, so the trend rolls over month and year ends.
    const weeklyPercent = TL.weekPercent(tl, activeGoodKeys, thisMonday) || 0;

    const completedWeeks = [];
    for (let k = 4; k >= 1; k--) {
      const p = TL.weekPercent(tl, activeGoodKeys, TL.addDays(thisMonday, -7 * k));
      if (p !== null) completedWeeks.push(p);
    }
    const last4Weeks = completedWeeks.slice(-3).concat([weeklyPercent]);
    const bestWeek = TL.bestWeekEver(tl);

    const recent2    = completedWeeks.slice(-2);
    const older2     = completedWeeks.slice(-4, -2);
    const recent2Avg = recent2.length > 0 ? Math.round(recent2.reduce((a,b) => a+b,0) / recent2.length) : 0;
    const older2Avg  = older2.length  > 0 ? Math.round(older2.reduce((a,b)  => a+b,0) / older2.length)  : 0;
    const trendDiff  = recent2Avg - older2Avg;

    let smartSignal = '';
    if (completedWeeks.length === 0) {
      smartSignal = 'First week. Every habit counts. Start strong.';
    } else if (completedWeeks.length === 1) {
      smartSignal = recent2Avg >= 70
        ? 'Strong start. Keep this energy going into next week.'
        : 'Slow start — but one week means nothing yet. Show up today.';
    } else if (trendDiff >= 15) {
      smartSignal = `Up ${trendDiff}% on your last two weeks. You're building something real.`;
    } else if (trendDiff >= 5) {
      smartSignal = `Trending up. ${recent2Avg}% average — keep the pressure on.`;
    } else if (trendDiff >= -5) {
      smartSignal = `Holding steady at ${recent2Avg}%. Consistency is the game — don't slip.`;
    } else if (trendDiff >= -15) {
      smartSignal = `Dipping slightly. You were at ${older2Avg}% — you know you can get back there.`;
    } else {
      smartSignal = `Down ${Math.abs(trendDiff)}% from your best. This is the week to turn it around.`;
    }

    // ── 7. HABITS ON TRACK + MOST IMPROVED ──────────────────
    // This week and the last, against the two weeks before those — all
    // from the timeline, so the windows roll over month ends. Today is
    // left out, like the streak: the day is not over, and counting it
    // would drop 5-of-7 habits below 70% every morning.
    const inRange = (from, to) => tl.days.filter(d => d.date >= from && d.date <= to);
    const recentDays = inRange(TL.addDays(thisMonday, -7), TL.addDays(today, -1));
    const olderDays  = inRange(TL.addDays(thisMonday, -21), TL.addDays(thisMonday, -8));

    const totalDays2     = recentDays.length;
    const totalOlderDays = olderDays.length;

    let habitsOnTrack = 0;
    let prevHabitsOnTrack = 0;
    let mostImproved    = null;
    let bestImprovement = -999;
    activeGood.forEach(h => {
      const recentCount = TL.tickedIn(recentDays, h.key);
      const olderCount  = TL.tickedIn(olderDays, h.key);
      if (totalDays2 > 0 && recentCount / totalDays2 >= 0.7) habitsOnTrack++;
      if (totalOlderDays > 0 && olderCount / totalOlderDays >= 0.7) prevHabitsOnTrack++;
      const recentPct   = totalDays2 > 0 ? recentCount / totalDays2 : 0;
      const olderPct    = totalOlderDays > 0 ? olderCount / totalOlderDays : 0;
      const improvement = recentPct - olderPct;
      if (improvement > bestImprovement) { bestImprovement = improvement; mostImproved = h.name; }
    });

    // ── 8. STREAK (past days only, today never counts) ───────
    // Derived for the response only; the sheet's own Apps Script owns
    // Dashboard C7. Walks the timeline, so it survives new year.
    const streak = TL.streakOf(tl, activeGoodKeys, today);

    const weakest   = weekGrid[weekRow] && weekGrid[weekRow][COL_WEAKEST]
      ? String(weekGrid[weekRow][COL_WEAKEST]).trim() : 'None';
    const signalMsg = weekGrid[weekRow] && weekGrid[weekRow][COL_SIGNAL]
      ? String(weekGrid[weekRow][COL_SIGNAL]).trim() : 'Keep going!';

    // ── 9. DAYS ELAPSED ─────────────────────────────────────
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysElapsed  = Math.floor((today - firstOfMonth) / 86400000) + 1;

    // ── 10. TROPHIES ────────────────────────────────────────
    // One scan over the current CALENDAR year's timeline days feeds the
    // trophy case and the next-to-fall pick, so they cannot disagree. Days
    // that live in last year's archive (1-3 January) count for this year's
    // months all the same.
    const curYear = today.getFullYear();
    const yearDays = TL.daysOfYear(tl, curYear);

    const trophyScan = computeTrophiesForYear(yearDays, badHabits, curYear, today.getMonth());
    const badTicks = trophyScan.ticksByHabit; // by habit key
    const conqueredThisMonth = trophyScan.conqueredThisMonth;

    // ── 10b. THE LAST 30 DAYS ───────────────────────────────
    // Needs work, Best progress and the habits overview are the share of the
    // last 30 days up to yesterday (_timeline.js), not of the month so far:
    // the 1st of a month does not start from zero, and today never counts.
    // A window too thin to say anything (a new user's first week) gives null.
    const recent = TL.rollingWindows(tl, today).now;
    const pctOf = key => recent ? Math.round((TL.tickedIn(recent, key) / recent.length) * 100) : null;
    const goodHabitStats = activeGood.map(h => ({ name: h.name, percent: pctOf(h.key) }));
    const badHabitStats = activeBad.map(h => ({ name: h.name, percent: pctOf(h.key) }));

    const sortedBad = recent ? badHabitStats.slice().sort((a, b) => a.percent - b.percent) : [];
    const worst = sortedBad.length > 0 ? sortedBad[0] : null;
    const best  = sortedBad.length > 0 ? sortedBad[sortedBad.length - 1] : null;

    // ── 11. NEXT TO FALL ─────────────────────────────────────
    // The spotlight goes to a habit with nothing in the trophy case yet:
    // no month won anywhere this year. One that has already earned a cup
    // does not need the focus, and one conquered THIS month is covered by
    // the same rule, since that month is in the case.
    const monthBar = trophyScan.trophies.thresholds.months[today.getMonth()];
    const hasTrophy = {};
    trophyScan.trophies.habits.forEach(h => {
      if (h.months.some(m => m.won)) hasTrophy[h.name] = true;
    });

    const closestOf = list => {
      let name = null, ticks = 0;
      list.forEach(h => {
        const c = badTicks[h.key] || 0;
        if (name === null || c > ticks) { ticks = c; name = h.name; }
      });
      return { name, ticks };
    };

    // Once every active habit has a cup there is no untrophied one left to
    // point at, so fall back to the overall closest rather than go blank.
    const untrophied = activeBad.filter(h => !hasTrophy[h.name]);
    const pick = closestOf(untrophied.length ? untrophied : activeBad);
    const nextToFall = pick.name;
    const nextToFallDays = pick.ticks;
    const daysToKill = Math.max(0, monthBar - nextToFallDays);

    // ── 12. WEEK START ───────────────────────────────────────
    const weekStartDateObj = weekGrid[weekRow] ? serialToDate(weekGrid[weekRow][1]) : null;
    const weekStartDate = weekStartDateObj
      ? weekStartDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'N/A';


    res.status(200).json({
      month:        monthName,
      weekStart:    weekStartDate,
      streak,
      percent:      weeklyPercent,
      weakest,
      signal:       smartSignal || signalMsg,
      week:         weekData,
      sheetName:    weekSheetName,
      goodFocus:    goodFocus || 'Not set',
      badFocus:     badFocus || 'Not set',
      goodCount:    goodFocusHabit ? TL.focusTicks(tl, goodFocusHabit.key, today, FOCUS_WINDOW_DAYS) : 0,
      badCount:     badFocusHabit ? TL.focusTicks(tl, badFocusHabit.key, today, FOCUS_WINDOW_DAYS) : 0,
      goodFocusFound: !!goodFocusHabit,
      badFocusFound:  !!badFocusHabit,
      focusWindowDays: FOCUS_WINDOW_DAYS,
      daysElapsed,
      goodHabitStats,
      badHabitStats,
      worst,
      best,
      trophies:     trophyScan.trophies,
      conqueredThisMonth,
      monthTrophyBar: monthBar,
      weeklyTrend:  last4Weeks,
      habitsOnTrack,
      prevHabitsOnTrack,
      totalHabits:  activeGood.length,
      mostImproved,
      nextToFall,
      nextToFallDays,
      daysToKill,
      bestWeek
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
