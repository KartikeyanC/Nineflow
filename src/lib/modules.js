// Every module NineFlow knows, in one place.
//
// SECTIONS are whole screens a person can switch off in Settings (settings.modules[id]): the sidebar,
// the phone's More sheet, search and import all ask sectionOn() instead of checking ids themselves.
//
// TOOLS are a profession's modules (lib/professions.js `modules`), shown as chips on Home
// (components/ModuleChips.jsx). Each is either
//   kind 'view'      — opens a screen NineFlow already has (Charts, Board, Week, Month, the exam), or
//   kind 'checklist' — a short list kept as real tasks tagged with the tool's id, so ticking one off
//                      counts as done everywhere (charts, reminders, history).
// Pure data and functions: tested by scripts/modules-test.mjs (npm run test:modules).

export const SECTIONS = {
  work: { id: 'work', label: 'Work OS', defaultOn: true },
  ntpc: { id: 'ntpc', label: 'Exam prep', defaultOn: false }, // its label is the exam's (src/exams)
}

/** Is this screen shown? Screens that aren't sections are always on. */
export const sectionOn = (settings, viewId) => !SECTIONS[viewId] || !!settings?.modules?.[viewId]

const view = (label, hint, viewId) => ({ label, hint, kind: 'view', view: viewId })
const list = (label, hint, extra = {}) => ({ label, hint, kind: 'checklist', ...extra })

export const TOOLS = {
  // Doctor
  'patient-queue': list('Patient queue', "Who's waiting to be seen today."),
  'pending-notes': list('Pending notes', 'Notes and orders still to sign.'),
  'follow-up-reminders': list('Follow-up reminders', 'Patients to call back or recheck.'),
  // Nurse
  'shift-handoff': list('Shift handoff', 'Points to pass on at handoff.'),
  'med-schedule': list('Med schedule', 'Medications due this shift.'),
  'hourly-checks': list('Hourly checks', 'Patients on hourly checks.'),
  // Lawyer
  'hearing-calendar': view('Hearing calendar', "Today's and upcoming hearings, by date.", 'month'),
  'matter-list': list('Matter list', 'Open matters you are working on.'),
  'billable-timer': view('Billable time', 'Hours per client from your timed tasks; set rates and make invoices.', 'charts'),
  // Chartered accountant
  'compliance-calendar': view('Compliance calendar', 'Statutory due dates, by date.', 'month'),
  'client-documents': list('Client documents', 'Documents still to collect from clients.'),
  'review-queue': list('Review queue', 'Work waiting for your review and sign-off.'),
  // Founder
  'top-priorities': list('Top 3 priorities', 'The three things that make today a win.', { limit: 3 }),
  'metrics-glance': list('Metrics to check', 'Numbers to look at today: revenue, burn, users.'),
  'hiring-pipeline': list('Hiring pipeline', 'Candidates to review or interview.'),
  // Teacher
  timetable: view('Timetable', 'Your week of classes.', 'week'),
  'grading-queue': list('Grading queue', 'Batches of work waiting to be marked.'),
  'parent-messages': list('Parent messages', 'Messages to reply to.'),
  // Sales
  pipeline: list('Pipeline', 'Deals in play.'),
  'follow-up-queue': list('Follow-up queue', 'Who to chase today.'),
  'quota-tracker': view('Quota tracker', 'Your finished work over time.', 'charts'),
  // Real estate
  'lead-follow-ups': list('Lead follow-ups', 'Leads to call back.'),
  showings: view('Showings', 'Your week of showings and appointments.', 'week'),
  transactions: list('Transactions', 'Deals in progress and their next deadline.'),
  // Freelancer
  'client-projects': list('Client projects', 'Projects and their next deliverable.'),
  invoices: view('Invoices', 'Hours by client, ready to invoice.', 'charts'),
  'time-log': view('Time log', 'Hours worked per client.', 'charts'),
  // IT employee
  'sprint-board': view('Sprint board', 'Your tasks by status.', 'board'),
  'pull-requests': list('Pull requests', 'PRs to review or merge.'),
  'on-call': list('On-call', 'Alerts and incidents to watch.'),
  // Student
  exam: view('Syllabus', 'Your exam syllabus, plan and progress.', 'ntpc'),
}

/** A profession's tools, in its own order; unknown ids are skipped. */
export const toolsFor = (profession) =>
  (profession?.modules || []).filter((id) => TOOLS[id]).map((id) => ({ id, ...TOOLS[id] }))

/**
 * A checklist's items: tasks tagged with the tool's id, not paused or dropped, that are still open
 * (any day) or were done today. Open first, oldest first; done after.
 */
export function checklistItems(tasks, toolId, todayKey) {
  const mine = (tasks || []).filter((t) => Array.isArray(t.tags) && t.tags.includes(toolId) && !t.hold && !t.dropped)
  const open = mine.filter((t) => t.status !== 'completed')
  const doneToday = mine.filter((t) => t.status === 'completed' && (t.completedAt || '').slice(0, 10) === todayKey)
  const byCreated = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  return [...open.sort(byCreated), ...doneToday.sort(byCreated)]
}

/** Room left in a checklist with a limit (Top 3): Infinity when it has none. */
export const roomLeft = (tool, items) => (tool.limit ? Math.max(0, tool.limit - items.filter((t) => t.status !== 'completed').length) : Infinity)
