# CLAUDE.md — habit-tracker

Guidance for Claude (and humans) working in this repo.

## Stack

- **Frontend:** a single vanilla web app — `index.html` (no framework, no build step).
  `stats.js` is Insights and onboarding; `platform.js` (which phone and browser,
  pure functions) and `homescreen.js` (the home screen step, the reminder banner,
  Android's install prompt) are the "Put HabiTally on your home screen" guide;
  `sw.js` is a pass-through service worker that caches nothing; `vendor/qrcode.min.js`
  is qrcodejs 1.0.0 for the desktop QR code.
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
| `_week.js` | — | Finds the week that contains today, in whichever month tab it lives. For single days: the tab (`tabOf`, the month of the week's Thursday), the row (`dayRowIn`), the ISO week number, and the week strip's rolling window (`dayWindow`). |
| `_streak.js` | — | The streak rule (66%, backwards from yesterday) and the shared sheet-value helpers; the computation itself walks the timeline. |
| `_year.js` | — | Which dates the sheet covers (its own week formulas); locks the app only when today is past the sheet's last day. |
| `_timeline.js` | — | The one timeline across years: live tabs + archives merged per calendar date (sheet wins), habits matched on type + name. Streak, focus counters, weekly trend, the rolling 30-day windows and per-habit aggregates live here. |
| `_trophies.js` | — | Month / season / year trophies for bad habits, per calendar year over timeline days. |
| `get-habits.js` | **read** (readonly scope) | One batchGet over the twelve month tabs + Control Panel, plus the archives; returns habits, config, the week strip (`week`, a rolling window with each day's own tab and row), and the timeline-derived streak, trend and focus counters. |
| `get-coaching.js` | **none** | No sheet access — takes stats from the request body, calls OpenAI (`OPENAI_API_KEY`), returns a coaching note. |
| `toggle-habit.js` | **write** | Toggles a habit cell for a day. The app sends the card's `date`; the tab and row are found from it, and a date the live sheet no longer holds is refused (409). The older `sheetName` + `row` shape still works. Dashboard C7 belongs to the sheet’s own Apps Script. |
| `set-onboarded.js` | **write** | Writes the hidden onboarding marker (Control Panel Z1). |
| `manifest.js` | **none** | The web app manifest per customer: `start_url` is `/?user=…&t=…` (format-checked, URL-encoded), so the home screen icon opens the personal link. The page links it with its own params. |
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
  signal (raw Mon–Sun ticks, not the sheet's summary rows), the 30-day trend
  numbers, all-time numbers and trophies are all derived from it, so nothing
  resets at new year. Month trophies, Next to fall and the year heatmap stay
  calendar-scoped but include archive days that belong to the current month or
  year (1–3 January).
- **The week strip (`dayWindow`).** The Home strip is a rolling window: today
  and three days either side, so yesterday is always on screen. Its days come
  from whichever tab holds them, so the window can span two month tabs (Sat
  26 – Sun 27 Sep 2026 are in the September tab, Mon 28 Sep in October). Days
  the live sheet does not hold get no card: before its first date, after its
  last, and archive days, which are read-only. A purple divider labelled with
  the ISO week number ("W43") sits before the Monday. Only what is shown rolls:
  This week %, best week and the trend still count Monday–Sunday.
- **The home screen step.** Onboarding is Welcome, Habits, Focus, Done and, unless
  the app already runs from the home screen, a fifth step with the guide for the
  detected phone and browser. The setup is saved when Done is left, before the
  guide: on an iPhone the new icon is opened before anyone returns to Safari.
  The personal link must stay in the address bar (nothing strips `?user=&t=`),
  since an iPhone home screen app does not share storage with Safari. A phone
  browser tab gets one reminder banner 3 days after onboarding (right away when
  onboarding predates the guide). Only the banner's own "Show me" and × end it
  (`hbt-a2hs-done` in localStorage); "I've added it" in the guide does not.
  The guide follows the app theme outside its illustration, which stays dark.
- **Trend numbers: the last 30 days (`rollingWindows`).** Momentum, consistency,
  power days, where habits break, vs best month and the Home habit percentages
  compare the last 30 days up to yesterday (today never counts, like the
  streak) with the 30 before. Days count from the first tick in the timeline
  on; a window with fewer than 7 such days is null, and so is its delta. The
  Consistency card and the AVG lines show the same window's mean daily good-%
  (`rolling.good`, `weekdayAvg`, `weekendAvg`); the year heatmap keeps the
  whole year.
- **The Momentum curve (`curveMonths`, `monthGood`).** The last 12 calendar
  months, archive tabs included, oldest first. Each point is the mean daily
  good-% of its month's days up to yesterday, by the same rule, so months
  before the first tick are not drawn and the running month only from its
  8th day; until then the window ends on the month before. The habit
  sparklines (`series`) use the same 12 months and rule, and vs best month
  compares against the curve's completed months. The sheet's own row-47 month
  counts feed only `bestMonthEver`, which the page does not show.

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
