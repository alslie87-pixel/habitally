const { google } = require('googleapis');
const { resolveSheetId } = require('./_user');
const { todayFrom } = require('./_date');
const { serialToDate, isChecked, computeStreakAcrossYear, countFocusTicks,
        FOCUS_WINDOW_DAYS } = require('./_streak');
const { sheetYearFromGrids, yearState, outOfYearPayload } = require('./_year');


// ── v28 SHEET STRUCTURE ──────────────────────────────────────
// Control Panel: E=Type, F=Habit name, G=Status, H=Note (rows 7-20)
//                Focus: C20 (Building/good), C21 (Eliminating/bad)
//                Start Year: C23
// Month tabs:    bad habits C..I (0-based 2..8), good J..P (9..15)
//                Q=BH% (16), R=GH% (17), S=Streak (18),
//                T=Weakest (19), U=Signal (20)
// Reads use UNFORMATTED_VALUE: dates arrive as serial numbers,
// checkboxes as booleans, percents as 0..1 numbers.

const CP_HABITS_RANGE = "'⚙️ Control Panel'!E6:H20"; // header + 14 slots
const CP_FOCUS_RANGE  = "'⚙️ Control Panel'!C20:C21";
const BAD_FIRST_COL   = 2;  // C
const GOOD_FIRST_COL  = 9;  // J
const COL_GH_WEEKLY   = 17; // R
const COL_WEAKEST     = 19; // T
const COL_SIGNAL      = 20; // U

// serialToDate / isChecked / computeStreak come from _streak.js so that
// toggle-habit derives the streak from exactly the same rule.

function toPercent(raw) {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (isNaN(n)) return 0;
  return n > 1 ? Math.round(n) : Math.round(n * 100);
}

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

    // ── 1. READ EVERYTHING IN ONE CALL ───────────────────────
    // Twelve month tabs + the two Control Panel ranges. The streak and the
    // focus counters span the whole year, so the whole year has to be here;
    // one batchGet is also one API call instead of the three separate
    // values.get calls this used to make.
    const today = todayFrom(req); // client's local date (?date=YYYY-MM-DD) or server midnight
    const monthNames = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];
    const monthName = monthNames[today.getMonth()];
    const lastColLetter = colIndexToLetter(COL_SIGNAL); // U

    const ranges = monthNames.map(m => `'${m}'!A1:${lastColLetter}46`);
    ranges.push(CP_HABITS_RANGE, CP_FOCUS_RANGE);

    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const vr = batch.data.valueRanges || [];
    const monthGrids = vr.slice(0, 12).map(r => (r && r.values) || []);
    const configRows = (vr[12] && vr[12].values) || [];
    const focusData  = (vr[13] && vr[13].values) || [];
    const monthData  = monthGrids[today.getMonth()];

    const badHabits = [];
    const goodHabits = [];

    // rows[1] = CP row 7. Column index follows the ROW POSITION,
    // so empty slots in the middle no longer shift later habits.
    configRows.slice(1).forEach((row, idx) => {
      const type   = (row[0] || '').toString().trim().toLowerCase();
      const name   = (row[1] || '').toString().trim();
      const status = (row[2] || '').toString().trim().toLowerCase();
      const note   = (row[3] || '').toString().trim();
      if (!type || !name || status === 'empty') return;

      if (type === 'bad' && idx <= 6) {
        badHabits.push({ name, status, note, colIndex: BAD_FIRST_COL + idx });
      } else if (type === 'good' && idx >= 7) {
        goodHabits.push({ name, status, note, colIndex: GOOD_FIRST_COL + (idx - 7) });
      }
    });

    const activeBad    = badHabits.filter(h => h.status === 'active');
    const activeGood   = goodHabits.filter(h => h.status === 'active');
    const conqueredBad = badHabits.filter(h => h.status === 'conquered');

    // ── 2. FOCUS HABITS ──────────────────────────────────────
    // C20/C21 hold a habit NAME as free text. update-focus only validates it
    // when the app writes it, so a hand-edit or a rename in the sheet can
    // leave a name that matches nothing. That is reported as its own state
    // rather than counted as zero days.
    const goodFocus = focusData[0] && focusData[0][0] ? String(focusData[0][0]).trim() : '';
    const badFocus  = focusData[1] && focusData[1][0] ? String(focusData[1][0]).trim() : '';

    const findHabit = (list, name) => {
      if (!name) return null;
      const want = name.toLowerCase();
      return list.find(h => h.name.toLowerCase() === want) || null;
    };
    const goodFocusHabit = findHabit(goodHabits, goodFocus);
    const badFocusHabit  = findHabit(badHabits, badFocus);

    // ── YEAR GATE ────────────────────────────────────────────
    // On 1 January the month tabs still hold last year's dates. Every
    // number below (week selection, streak, percentages, graveyard) would
    // be derived from a year that is over, so stop here and let the app
    // explain instead.
    const year = yearState(sheetYearFromGrids(monthGrids), today);
    if (year.outOfYear) return res.status(200).json(outOfYearPayload(year));

    // ── 3. FIND CURRENT WEEK ─────────────────────────────────
    const weekStartRows = [1, 10, 19, 28, 37]; // 0-based array rows (sheet rows 2,11,20,29,38)
    let currentWeekIdx = 0;

    for (let i = 0; i < weekStartRows.length; i++) {
      const row = weekStartRows[i];
      const dateVal = monthData[row] ? serialToDate(monthData[row][1]) : null;
      if (dateVal) {
        const endDate = new Date(dateVal);
        endDate.setDate(endDate.getDate() + 6);
        if (today >= dateVal && today <= endDate) {
          currentWeekIdx = i;
          break;
        }
      }
    }

    const weekRow    = weekStartRows[currentWeekIdx];
    const summaryRow = weekRow + 8;

    // ── 4. BUILD CALENDAR WEEK ───────────────────────────────
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const weekData = [];

    for (let d = 0; d < 7; d++) {
      const row = weekRow + d;
      if (!monthData[row]) continue;
      const dateVal = serialToDate(monthData[row][1]);

      const dayData = {
        day:     days[d],
        date:    dateVal ? dateVal.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
        row:     row + 1,
        isToday: dateVal ? dateVal.getTime() === today.getTime() : false,
        bad:     [],
        good:    []
      };

      activeBad.forEach(h => {
        dayData.bad.push({
          name:    h.name,
          checked: isChecked(monthData[row][h.colIndex]),
          col:     h.colIndex + 1
        });
      });
      activeGood.forEach(h => {
        dayData.good.push({
          name:    h.name,
          checked: isChecked(monthData[row][h.colIndex]),
          col:     h.colIndex + 1
        });
      });

      weekData.push(dayData);
    }

    // ── 5. WEEKLY % + TREND ──────────────────────────────────
    let weeklyPercent = 0;
    if (monthData[summaryRow] && monthData[summaryRow][COL_GH_WEEKLY] !== undefined &&
        monthData[summaryRow][COL_GH_WEEKLY] !== '') {
      weeklyPercent = toPercent(monthData[summaryRow][COL_GH_WEEKLY]);
    }

    const weeklyTrend = [];
    for (let i = 0; i < weekStartRows.length; i++) {
      const sr = weekStartRows[i] + 8;
      if (monthData[sr] && monthData[sr][COL_GH_WEEKLY] !== undefined && monthData[sr][COL_GH_WEEKLY] !== '') {
        weeklyTrend.push(toPercent(monthData[sr][COL_GH_WEEKLY]));
      } else {
        weeklyTrend.push(0);
      }
    }
    const last4Weeks = weeklyTrend.slice(Math.max(0, currentWeekIdx - 3), currentWeekIdx + 1);
    const positive   = weeklyTrend.filter(w => w > 0);
    const bestWeek   = positive.length > 0 ? Math.max(...positive) : 0;

    // ── 6. SMART SIGNAL ──────────────────────────────────────
    const completedWeeks = weeklyTrend.slice(0, currentWeekIdx);
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
    const prev2WeeksRows = [];
    for (let i = Math.max(0, currentWeekIdx - 1); i <= currentWeekIdx; i++)
      for (let d = 0; d < 7; d++) prev2WeeksRows.push(weekStartRows[i] + d);

    const isPastRow = r => {
      const dt = monthData[r] ? serialToDate(monthData[r][1]) : null;
      return dt !== null && dt <= today;
    };

    const totalDays2 = prev2WeeksRows.filter(isPastRow).length;

    let habitsOnTrack = 0;
    activeGood.forEach(h => {
      let count = 0;
      prev2WeeksRows.forEach(r => {
        if (monthData[r] && isChecked(monthData[r][h.colIndex])) count++;
      });
      if (totalDays2 > 0 && count / totalDays2 >= 0.7) habitsOnTrack++;
    });

    const olderWeeksRows = [];
    for (let i = Math.max(0, currentWeekIdx - 3); i < Math.max(0, currentWeekIdx - 1); i++)
      for (let d = 0; d < 7; d++) olderWeeksRows.push(weekStartRows[i] + d);

    const totalOlderDays = olderWeeksRows.filter(isPastRow).length;

    let prevHabitsOnTrack = 0;
    activeGood.forEach(h => {
      let count = 0;
      olderWeeksRows.forEach(r => {
        if (monthData[r] && isChecked(monthData[r][h.colIndex])) count++;
      });
      if (totalOlderDays > 0 && count / totalOlderDays >= 0.7) prevHabitsOnTrack++;
    });

    let mostImproved    = null;
    let bestImprovement = -999;
    activeGood.forEach(h => {
      let recentCount = 0, olderCount = 0;
      prev2WeeksRows.forEach(r  => { if (monthData[r] && isChecked(monthData[r][h.colIndex])) recentCount++; });
      olderWeeksRows.forEach(r => { if (monthData[r] && isChecked(monthData[r][h.colIndex])) olderCount++;  });
      const recentPct   = prev2WeeksRows.length  > 0 ? recentCount / prev2WeeksRows.length  : 0;
      const olderPct    = olderWeeksRows.length > 0 ? olderCount  / olderWeeksRows.length : 0;
      const improvement = recentPct - olderPct;
      if (improvement > bestImprovement) { bestImprovement = improvement; mostImproved = h.name; }
    });

    // ── 8. STREAK (past days only, today never counts) ───────
    // Derived for the response only; the sheet's own Apps Script owns
    // Dashboard C7. Spans every tab of the year, so it no longer resets on
    // the 1st of a month.
    const streak = computeStreakAcrossYear(monthGrids, activeGood, today);

    const weakest   = monthData[weekRow] && monthData[weekRow][COL_WEAKEST]
      ? String(monthData[weekRow][COL_WEAKEST]).trim() : 'None';
    const signalMsg = monthData[weekRow] && monthData[weekRow][COL_SIGNAL]
      ? String(monthData[weekRow][COL_SIGNAL]).trim() : 'Keep going!';

    // ── 9. DAYS ELAPSED + TOTAL TRACKABLE ───────────────────
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysElapsed  = Math.floor((today - firstOfMonth) / 86400000) + 1;

    let totalDays = 0;
    for (let i = 0; i < weekStartRows.length; i++) {
      const dv = monthData[weekStartRows[i]] ? serialToDate(monthData[weekStartRows[i]][1]) : null;
      if (dv && dv.getFullYear() >= 2026 && dv <= today) {
        for (let dd = 0; dd < 7; dd++) {
          const cd = new Date(dv);
          cd.setDate(cd.getDate() + dd);
          if (cd <= today) totalDays++;
        }
      }
    }

    // ── 10. ROW 46 STATS (monthly counts per habit) ─────────
    const row46 = monthData[45] || [];
    const countOf = h => {
      const v = row46[h.colIndex];
      const n = typeof v === 'number' ? v : parseInt(v);
      return isNaN(n) ? 0 : n;
    };

    const goodHabitStats = activeGood.map(h => ({
      name: h.name,
      percent: totalDays > 0 ? Math.round((countOf(h) / totalDays) * 100) : 0
    }));
    const badHabitStats = activeBad.map(h => ({
      name: h.name,
      percent: totalDays > 0 ? Math.round((countOf(h) / totalDays) * 100) : 0
    }));

    const sortedBad = badHabitStats.slice().sort((a, b) => a.percent - b.percent);
    const worst = sortedBad.length > 0 ? sortedBad[0] : null;
    const best  = sortedBad.length > 0 ? sortedBad[sortedBad.length - 1] : null;

    // ── 11. CONQUERED + GHOST RELAPSE CHECK ─────────────────
    const graveyard = [];

    conqueredBad.forEach(h => {
      const pct = totalDays > 0 ? Math.round((countOf(h) / totalDays) * 100) : 0;

      let relapseCount = 0;
      if (h.note && h.note.includes('conquered:')) {
        const conquestDate = new Date(h.note.replace('conquered:', '').trim());
        conquestDate.setHours(0, 0, 0, 0);
        for (let i = 0; i < weekStartRows.length; i++) {
          for (let d = 0; d < 7; d++) {
            const r = weekStartRows[i] + d;
            const rowDate = monthData[r] ? serialToDate(monthData[r][1]) : null;
            if (!rowDate) continue;
            if (rowDate > conquestDate && isChecked(monthData[r][h.colIndex])) relapseCount++;
          }
        }
      }

      graveyard.push({
        name: h.name,
        percent: pct,
        relapseCount,
        warning: relapseCount > 0
          ? `⚠ Slipped ${relapseCount} time${relapseCount > 1 ? 's' : ''} since conquest`
          : null
      });
    });

    activeBad.forEach(h => {
      const pct = totalDays > 0 ? Math.round((countOf(h) / totalDays) * 100) : 0;
      if (pct >= 90) graveyard.push({ name: h.name, percent: pct, relapseCount: 0, warning: null });
    });

    // ── 12. NEXT TO FALL ─────────────────────────────────────
    let nextToFall = null, nextToFallDays = 0;
    activeBad.forEach(h => {
      const c = countOf(h);
      if (c > nextToFallDays && c < 30) { nextToFallDays = c; nextToFall = h.name; }
    });
    const daysToKill = 30 - nextToFallDays;

    // ── 13. WEEK START + STREAK WRITE ────────────────────────
    const weekStartDateObj = monthData[weekRow] ? serialToDate(monthData[weekRow][1]) : null;
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
      sheetName:    monthName,
      goodFocus:    goodFocus || 'Not set',
      badFocus:     badFocus || 'Not set',
      goodCount:    goodFocusHabit ? countFocusTicks(monthGrids, goodFocusHabit.colIndex, today) : 0,
      badCount:     badFocusHabit ? countFocusTicks(monthGrids, badFocusHabit.colIndex, today) : 0,
      goodFocusFound: !!goodFocusHabit,
      badFocusFound:  !!badFocusHabit,
      focusWindowDays: FOCUS_WINDOW_DAYS,
      daysElapsed,
      goodHabitStats,
      badHabitStats,
      worst,
      best,
      graveyard,
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
