# NineFlow: 20 user types — what gets in their way, and the fix

Written 4 Nov 2026 against version 0.1.29 (commit 38894f9). Every finding is from the code or from a run of the
app in the browser (mock Google sign-in, desktop and 375 px phone width). Paths are relative to `src/`.

Each user type lists the difficulties in the order they'd hit them, then the fix. The fixes that help the most
people are collected at the end in a single priority list.

---

## 1. First-time visitor ("just trying it out")
- Has to create an account before seeing anything: there is no guest or demo mode (`App.jsx:134`, `features/AuthGate.jsx`).
- "Start with sample data" is **off** by default (`components/Onboarding.jsx:715`), so the first screen is a dashboard of zeros: 0m, 0%, 0 done, "No tasks planned", "Nothing here yet" — about ten empty widgets.
- **Fix:** add "Try without an account" that opens the planner on sample data stored only on the device, and offers to save it to an account later. Turn sample data on by default, or collapse empty widgets into one "Add your first task" card.

## 2. School / college student
- Picking "Student" in setup changes nothing that's specific to students. The goals step has no "Study / prepare for exams" choice, and Revise (flashcards) sits in the sidebar with no hint that it reads `question :: answer` lines from Notes.
- The rhythm step only talks about "work" (9–5 presets, "8 h of work a day, with an hour for lunch").
- **Fix:** add a "Study for exams" goal. When it's picked, use "study hours" in the wording, show Revise first and add a sample note with two flashcards in it.

## 3. Competitive-exam aspirant (RRB NTPC, SSC, banking)
- The NTPC module is off by default, can only be turned on in Settings → Preferences, and setup never mentions it.
- Its 40-day plan is fixed to **26 Oct – 4 Dec 2026, CEN 06/2026** and to one person's timetable (`exams/ntpc/plan40.js:1-12`). Anyone starting on another date, or sitting another exam, gets a plan that doesn't fit.
- **NTPC progress is not in "Export data"** (`views/Settings.jsx:496` exports tasks, settings, habits and work only), so a backup misses it.
- **Fix:** have the plan ask for an exam date and build the 40 days back from it. Rename the module "Exam prep" and make the syllabus a choice (NTPC first). Add the NTPC key to export and import.

## 4. Office worker (9–5, meetings)
- Google sign-in tokens last about an hour, so the banner "Google asks you to reconnect about once an hour" keeps coming back while there are unsaved changes (`features/CloudStatus.jsx:139`, `lib/google.js`). Across a working day that's the most repeated interruption in the app.
- Microsoft users can't sign in with Microsoft. Outlook/To Do is a web-only connection (`lib/microsoft.js:10`).
- **Fix:** refresh the Google token silently before it runs out, and only show the banner after a silent retry fails. Longer term: offer "Sign in with Microsoft".

## 5. Night-shift / rotating-shift worker (nurses, call centres, security)
- **A workday that crosses midnight counts as 0 hours.** Setup takes `end − start − 60 min` and floors it at 0 (`components/Onboarding.jsx:731`), so 22:00–06:00 shows "0 h/day" and the timeline bar is empty.
- The lunch hour is fixed at 60 minutes for everyone (`Onboarding.jsx:747`, `breakMinutes: 60`).
- **Fix:** when end is earlier than start, add 24 h, and draw the bar in two parts. Make the break length a field (0 / 30 / 45 / 60).

## 6. Freelancer with several clients
- Workspaces (up to 6) keep clients apart, but switching reloads the whole page (`features/Workspaces.jsx`). There's no view of all workspaces together and no client or billable report.
- Clockify and Toggl are paste-a-token connections, with no guide shown inside the app.
- **Fix:** switch workspaces without a reload. Add a "Billable" flag to tasks, and an hours-by-category CSV in Charts.

## 7. Small-team manager
- NineFlow is single-user only: there is no sharing, no assigning and no shared board. "Report to my manager" works for the person reporting, not for the manager reading the reports.
- **Fix:** say plainly on the sign-up screen that it's a personal planner. If teams matter later, start with a read-only share link for one board or day.

## 8. Marketer / content creator
- This is who Work OS was built for ("a solo creative/dev employee", `work/Work.jsx:19`), and setup turns it on for them. But it adds 12 more tabs on top of 14 sidebar items, and the Guide tab is hidden under "More tools".
- **Fix:** put Guide first the first time Work OS opens. Let people hide the Work OS tabs they don't use (social, ads, process).

## 9. Senior citizen / low-confidence user
- Text is small almost everywhere: `text-[10px]` is used 80 times and `text-[11px]` 149 times, and the phone tab labels are 10 px (`components/MobileNav.jsx:46`). There is no text-size setting.
- Sign-up walks through a Google consent screen where the "Google Drive" box may start unticked (`Onboarding.jsx:211`). Missing it causes sync errors later.
- **Fix:** add Settings → Text size (Normal / Large / Larger) using one root font-size variable, and make 12 px the smallest size. If Drive permission is missing after sign-in, show one clear "Allow Drive" step, not an error later.

## 10. Low-vision user (zoom, high contrast)
- The Month workload heatmap shows load **only** through lavender opacity levels 0–4 (`views/Month.jsx:13-17`). Low-contrast greys (`text-faint`, `text-muted`) carry real information, such as the licence-screen help and the copyright line.
- The theme doesn't follow the system light/dark setting: no `prefers-color-scheme` anywhere outside v2.
- **Fix:** add the hour count, or 1–4 dots, to each heatmap cell. Check `text-faint` against WCAG 4.5:1. Add "Theme: match system".

## 11. Screen-reader user (blind)
- 218 aria-labels and a proper focus trap in the main dialogs (`components/ui.jsx:96-118`) are a good base. But:
  - the phone "More" sheet is `role="dialog"` with no `aria-modal` and no focus trap (`MobileNav.jsx:64`); the same goes for the DatePicker, TimePicker and Workspaces popovers
  - the active page isn't announced: no `aria-current` in the sidebar or the bottom tabs
  - the licence check shows a blank screen (`AuthGate.jsx:41` renders `null`), so nothing is announced while it runs
- **Fix:** reuse `useDialogFocus` in those four popovers. Add `aria-current="page"` to the active nav item. Show a "Checking your licence…" status in place of `null`.

## 12. Keyboard-only / power user
- The shortcuts are Ctrl+K, Ctrl+I, Ctrl+Z (only while the undo toast is up), Space and 1/2 in Revise. There is no help screen for them and no key for "New task".
- The empty-day insight says **"press ⌘K to add a task"** (`lib/insights.js:21`). That's a Mac symbol shown on Windows, and Ctrl+K opens search, not quick add.
- Board drag works from the keyboard; Matrix drag doesn't (no KeyboardSensor, `views/Matrix.jsx:3`).
- **Fix:** make `N` (or Ctrl+Enter) new task, add `?` for a shortcuts sheet, fix the insight to say "press N or the + button", and add KeyboardSensor to Matrix.

## 13. Person with motion sensitivity / vestibular disorder
- Reduced-motion is respected only in `select.css:177` and the tooltips. The view-in, modal-in and pop animations play on every view change (`App.jsx:80` remounts with `key={view}`).
- **Fix:** one global `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: .01ms !important; transition-duration: .01ms !important } }` in `index.css`.

## 14. Phone-only user (no laptop)
- Only 4 bottom tabs plus "More". The search button floats above the + button on every screen and covers content as you scroll (`App.jsx:103`).
- On Home, 9 controls are under the 44 px touch guideline (measured at 375 px): Add task, Add habit and Add countdown are 28×28; the all/today/upcoming filters are 24 px tall.
- **Fix:** grow icon buttons to 40–44 px on phones (`max-sm:h-10 max-sm:w-10`). Move search into the top bar on phones.

## 15. Low-bandwidth / often offline (rural, travelling)
- Works offline once set up: the service worker plus the local store, with an "Offline · saved on this device" status. But **first sign-in needs the network**, and the AI features (Plan a goal, Prompt to list, Ask) have no offline fallback.
- On the desktop and phone apps the AI features fail unless `VITE_API_BASE` is set at build time (`lib/aiTasks.js:14-24`).
- **Fix:** hide or grey out the AI buttons with "Needs internet" when offline. Check that the release builds set `VITE_API_BASE`.

## 16. Privacy-conscious user
- Setup offers the reason **"Works offline and keeps my data private"**, yet sign-in is required and Ask NineFlow sends up to 400 task lines to an AI service (`components/AskPlanner.jsx`). Nothing tells the user before it sends.
- There is no "Delete my account". "Clear all data" **does not clear Notes or NTPC progress**, although the confirmation text implies everything goes (`store/PlannerContext.jsx:293-300`).
- **Fix:** add a one-time "This sends your tasks to Claude to answer — OK?" before the first AI call. Make Clear all data also clear `settings.notes` and the NTPC key. Add Account → Delete account (clear local data, delete the Drive folder, sign out).

## 17. Non-English speaker (Hindi, Tamil, Spanish…)
- Everything is English: no i18n library, `<html lang="en">` fixed, and the quick-add parser understands only English ("tomorrow 3pm", `lib/nlp.js`).
- **Fix (staged):** move strings into one `en.js` dictionary first (a mechanical change), then add Hindi. The parser can stay English while the menus and labels are translated.

## 18. Indian user (any type)
- **No Indian public holidays**: India isn't in the holiday country list, because Nager.Date has no data for it (`lib/holidays.js:10-18`).
- Dates mix US and UK order: "Wednesday, November 4, 2026" on the dashboard and `MMM d` in pickers and cards, but `d MMM` elsewhere. Times show am/pm, but the time picker lists 24-hour slots.
- Voice input defaults differ: `en-IN` in `lib/speech.js:18`, `en-US` in `components/QuickAddModal.jsx:45`.
- **Fix:** ship a built-in India holiday list (national holidays plus the main gazetted ones), refreshed each year. Add Settings → Date format (4 Nov / Nov 4) and Clock (12 h / 24 h), applied through one `formatDate` helper. Use one speech-language default.

## 19. Someone given the Windows / Android app by the owner
- After sign-up they hit **"Enter your licence key"**. The only help is "Ask the person who gave you NineFlow", with no contact link, no trial and no way to request a key (`features/LicenceLock.jsx:41-56`).
- They also sit through a blank screen while the key is checked (`AuthGate.jsx:41`).
- **Fix:** add a "Request a key" button that opens an email to the owner with the account email filled in, plus a "Use the web version" link (the website needs no key). Show a spinner while checking.

## 20. Long-time user with years of data (and backups)
- Exports are named `daily-planner-*.json` and the Drive folder is "Daily Planner" (`lib/drive.js:8`), not NineFlow, so they're hard to find later.
- The export misses NTPC (see 3). If two devices save at once, the sync creates a "conflict" file, and the user has to sort it out by hand (`lib/cloud.js:109-111`).
- **Fix:** name new exports `nineflow-*.json`, keeping the old Drive folder name so existing data still loads. Include every synced key in the export. Show conflicts as "Keep this device / Keep the other / Keep both".

---

## Fix list, by how many of the 20 it helps

| # | Fix | Helps types | Size |
|---|-----|-------------|------|
| 1 | Global reduced-motion rule + minimum 12 px text + Text size setting | 9, 10, 11, 13, 14 | Small |
| 2 | Silent Google token refresh; banner only after it fails | 4, 6, 8, 9, 14, all Google users | Medium |
| 3 | Night shifts: end before start = next day; adjustable break | 5 | Small |
| 4 | Export + Clear all data cover Notes and NTPC; add Delete account | 3, 16, 20 | Small |
| 5 | Fix "⌘K to add a task"; add `N` for new task and `?` for shortcuts | 1, 12 | Small |
| 6 | Licence screen: "Request a key" mail link, web-version link, spinner | 19, 11 | Small |
| 7 | Sample data on by default, or one "Add your first task" card when empty | 1, 2, 3 | Small |
| 8 | "Study for exams" goal: shows Revise, sample flashcards, exam plan from a chosen date | 2, 3 | Medium |
| 9 | Date-format and 12/24 h settings through one helper; India holiday list | 17, 18 | Medium |
| 10 | 44 px touch targets on phones; search moved into the top bar | 9, 14 | Small |
| 11 | aria-current, focus traps in popovers, heatmap numbers, match-system theme | 10, 11 | Small |
| 12 | AI consent note + "Needs internet" when offline | 15, 16 | Small |
| 13 | Guest / try-without-account mode | 1, 15, 16 | Large |
| 14 | Strings into a dictionary, then Hindi | 17, 18 | Large |

Items 1, 3, 4, 5, 6, 7, 10, 11 and 12 are each a small change.

## Status (4 Nov 2026)

Done: 1 (reduced motion, Text size setting, Match system theme), 3, 4 (except Delete account),
5, 6 (Copy key request; the email button appears once `VITE_LICENCE_CONTACT` is set), 7, 10
(the Home buttons and filters, and every small segmented control), 11 (except the date, time and
workspace popovers) and 12. Also fixed: the export file is now `nineflow-*.json`, and the Focus
screen is announced as a dialog.

Done on 5 Nov 2026:
- Item 8: the NTPC plan is built from the exam date, and setup has a "Prepare for an exam" goal.
- Item 9: Dates and Clock settings, and Indian central government holidays for 2026 and 2027.
- The date, time and workspace pickers now take focus and return it.
- Matrix can be used from the keyboard (Space, arrow keys, Space).
- One default language for voice input.
- The phone search button steps aside while you scroll down.
- The smallest text is one step larger: 10 px is now 11 px and 11 px is now 12 px.
- The Drive folder is renamed from "Daily Planner" to NineFlow.
- A sync conflict offers "Use this device's version".

Still open: Delete account (an email account needs a server call to delete), and items 2, 13 and
14. Item 2 (silent Google reconnect) needs a server. The installed apps also need `VITE_API_BASE`
set before building, or the AI features can't work there.
