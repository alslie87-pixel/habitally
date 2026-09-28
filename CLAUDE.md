# CLAUDE.md — habit-tracker

Guidance for Claude (and humans) working in this repo.

## Stack

- **Frontend:** a single vanilla web app — `index.html` (no framework, no build step).
- **Backend:** serverless functions in `/api`, talking to a **Google Sheet** as the
  data store via the `googleapis` library.
- **Hosting:** deployed on **Vercel** → https://habit-tracker-tau-tan.vercel.app
- **Runtime:** Node `24.x`. Only dependency: `googleapis`.

### API endpoints (`/api`)

| File | Sheet access | Purpose |
|---|---|---|
| `_user.js` | **read** (Customers sheet) | Resolves `?user=` + `?t=` to the customer's spreadsheet ID. |
| `_controlPanel.js` | — | The Control Panel layout in one place: habit slots F7:H20 (row decides type: 7-13 bad, 14-20 good; column E is never read or written), the focus cells found by their "Building:"/"Eliminating:" labels (searched in A-D rows 1-60, focus is the cell right of the label; C19/C20 when unlabeled), Z1 marker, and the onboarding rule (Z1 unmarked + zero checkmarks). The app writes only F/G/H 7-20, the two focus cells and Z1 there. |
| `_date.js` | — | `todayFrom(req)`: the client's `?date=` or server midnight. |
| `_validate.js` | — | Shared input validation for the write endpoints. |
| `_week.js` | — | Finds the week that contains today, in whichever month tab it lives. |
| `_streak.js` | — | The streak rule (66%, backwards from yesterday) and the shared sheet-value helpers; the computation itself walks the timeline. |
| `_year.js` | — | Which dates the sheet covers (its own week formulas); locks the app only when today is past the sheet's last day. |
| `_timeline.js` | — | The one timeline across years: live tabs + archives merged per calendar date (sheet wins), habits matched on type + name. Streak, focus counters, weekly trend and per-habit aggregates live here. |
| `_trophies.js` | — | Month / season / year trophies for bad habits, per calendar year over timeline days. |
| `get-habits.js` | **read** (readonly scope) | One batchGet over the twelve month tabs + Control Panel, plus the archives; returns habits, config, and the timeline-derived streak, trend and focus counters. |
| `get-coaching.js` | **none** | No sheet access — takes stats from the request body, calls OpenAI (`OPENAI_API_KEY`), returns a coaching note. |
| `toggle-habit.js` | **write** | Toggles a habit cell for a day. Dashboard C7 belongs to the sheet’s own Apps Script. |
| `set-onboarded.js` | **write** | Writes the hidden onboarding marker (Control Panel Z1). |
| `update-focus.js` | **write** | Updates the current focus. |
| `update-config.js` | **write** | Updates Control Panel configuration. |
| `_archive.js` | **read** | Reads the hidden "Archive <startyear>" tabs that the sheet's own Start new year menu (rolloverYear) writes: one metadata call for the tab names, one batchGet for the rows. The app never starts a new year itself. |

### The sheet's date rule and the timeline

- **Week placement (the sheet's own formulas).** Week 1 of a month tab starts on
  the Monday on or before the 1st — or the Monday AFTER when the 1st is a
  Friday, Saturday or Sunday (`B2 = DATE(y,m,1) - WEEKDAY(DATE(y,m,1),3) +
  IF(WEEKDAY(...)>3, 7, 0)`). Week 5 (row 38) is used only when its Thursday is
  still in the month (`B38 = IF(MONTH(B35+4)=m, B35+1, "")`). In effect a week
  belongs to the month that holds its Thursday, so **every date lies in exactly
  one tab**: the 2026 sheet covers 29 Dec 2025 – 3 Jan 2027, the 2027 sheet
  starts 4 Jan 2027, the 2029 sheet ends 30 Dec 2029.
- **Year gate.** The app locks only when today is AFTER the sheet's last dated
  day — never on the calendar new year itself (1–3 Jan 2027 belong to the 2026
  sheet). The sheet's own *Start new year* menu is allowed only after that last
  day; it writes every day row into a hidden `Archive <startyear>` tab (dates as
  text `YYYY-MM-DD` + 14 TRUE/FALSE, spillover days included) before clearing.
- **One timeline (`_timeline.js`).** All `Archive <year>` tabs plus the live
  sheet are merged into one day list, one entry per calendar date, the live
  sheet winning over the archive. Habits match on slot type + trimmed,
  case-insensitive name (a renamed habit is a new habit); slot position decides
  the type (1–7 bad, 8–14 good). Streak, focus "X/30", the 4-week trend and
  signal (raw Mon–Sun ticks, not the sheet's summary rows), momentum's "vs last
  month", all-time numbers and trophies are all derived from it, so nothing
  resets at new year. Month trophies, Next to fall and the year heatmap stay
  calendar-scoped but include archive days that belong to the current month or
  year (1–3 January).

### Environment variables (set in Vercel — do not hardcode)

- `GOOGLE_SERVICE_ACCOUNT` — JSON service-account credentials for the Sheets API.
- `GOOGLE_SHEET_ID` — the spreadsheet the app reads/writes.
- `OPENAI_API_KEY` — used by `get-coaching.js`.

## App philosophy

- **In the app: positive feedback.** The day-to-day surface is encouraging and
  supportive — it nudges, celebrates progress, and stays kind.
- **On the Insights view: honest stats.** Insights is where the real, unvarnished
  numbers live — no rounding up, no cheerleading. Keep the two concerns separate:
  don't let the encouraging tone bleed into Insights, and don't let raw stats
  bleed into the everyday feedback.

## Standing rules (for any change in this repo)

1. **Always work on a new branch.** Never commit directly to `main`.
2. **Always open a PR** for the change.
3. **Never merge.** Leave the PR open for the human to review and merge.
4. **Never write to the live Google Sheet.** Don't run the write endpoints
   (`toggle-habit`, `update-focus`, `update-config`, `set-onboarded`) against the
   real sheet, and don't add code that does so as a side effect of testing.
5. **Never touch environment variables** (`GOOGLE_SERVICE_ACCOUNT`, `GOOGLE_SHEET_ID`,
   `OPENAI_API_KEY`) or their values **without asking first.**
6. **If blocked, don't guess.** Write your questions in the PR description and stop —
   wait for answers rather than making an assumption or a workaround.
