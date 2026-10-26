// A 40-day RRB NTPC (Graduate, CEN 06/2026) plan, written to the person's brief:
//   26 Oct 2026 (day 1, evening only) to 4 Dec 2026 (day 40)
//   morning 05:00-07:30 and evening 20:00-21:30, every day ending with 5 minutes on the error notebook
//   days 1-14 basics, days 15-28 the next topics + two mocks a week, days 29-40 a mock every second day
//   with 2 hours of review; every 7th day is a test day with a weekly revision.
// Maths is the weakest subject, so it gets the long morning block; General Awareness comes next.
// No imports, so scripts/ntpc-plan-csv.mjs can turn the same list into the CSV.
// Each task has a fixed id, so adding the plan twice never duplicates anything.

export const PLAN_ID = 'ntpc-40'
export const PLAN_NAME = '40-day plan · Graduate, CEN 06/2026'
export const PLAN_START = '2026-10-26'
export const PLAN_DAYS = 40

const S = {
  maths: 'Rakesh Yadav Sir (YouTube) for the concept; practise from R.S. Aggarwal',
  mathsPractice: 'Rajesh Verma Fast Track Arithmetic; Kiran RRB NTPC PYQs',
  mathsPyq: 'Kiran RRB NTPC Maths previous year papers',
  reasoning: 'Reasoning by Piyush Varshney (YouTube); practise from Kiran Reasoning',
  reasoningPyq: 'Kiran RRB NTPC Reasoning previous year papers',
  ncert: 'NCERT Class 9 and 10 science; quick notes from Lucent',
  history: 'NCERT history; Lucent; Parmar SSC (YouTube)',
  static: 'Lucent General Knowledge; Parmar SSC (YouTube)',
  railway: 'Railway Adda247 (YouTube); Lucent',
  ca: 'AffairsCloud monthly PDF',
  mock: 'Full-length mock from Railway Adda247; sit it in one go, timed',
  review: 'Go through every wrong and skipped question; add each to the error notebook',
  errors: 'Write today\'s mistakes and the correct method',
}

// [title, subject, topic id or null, kind, priority, notes]
const MATHS_1 = {
  1: ['Number System basics', 'maths:number-system', 'learn', S.maths],
  2: ['Number System: divisibility, remainders', 'maths:number-system', 'practice', S.mathsPractice],
  3: ['Simplification and BODMAS', 'maths:fractions', 'learn', S.maths],
  4: ['Percentage', 'maths:percentage', 'learn', S.maths],
  5: ['Ratio and Proportion', 'maths:ratio-and-proportions', 'learn', S.maths],
  6: ['Profit and Loss', 'maths:profit-and-loss', 'learn', S.maths],
  8: ['Averages', 'maths:elementary-statistics', 'learn', S.maths],
  9: ['Simple and Compound Interest', 'maths:simple-interest', 'learn', S.maths],
  10: ['Time and Work', 'maths:time-and-work', 'learn', S.maths],
  11: ['Practice: Percentage, Profit and Loss', 'maths:percentage', 'practice', S.mathsPractice],
  12: ['Practice: Ratio, Averages, Interest', 'maths:ratio-and-proportions', 'practice', S.mathsPractice],
  13: ['Practice: Time and Work + PYQs', 'maths:time-and-work', 'pyq', S.mathsPyq],
}
const GA_1 = {
  2: ['NCERT Science: Physics', 'ga:general-science-and-life-science-up-to-class-10-cbse-level', 'learn', S.ncert],
  3: ['NCERT Science: Chemistry', 'ga:general-science-and-life-science-up-to-class-10-cbse-level', 'learn', S.ncert],
  4: ['NCERT Science: Biology', 'ga:general-science-and-life-science-up-to-class-10-cbse-level', 'learn', S.ncert],
  5: ['Ancient Indian history', 'ga:history-of-india-and-the-freedom-struggle', 'learn', S.history],
  6: ['Medieval Indian history', 'ga:history-of-india-and-the-freedom-struggle', 'learn', S.history],
  8: ['Modern Indian history', 'ga:history-of-india-and-the-freedom-struggle', 'learn', S.history],
  9: ['Freedom struggle', 'ga:history-of-india-and-the-freedom-struggle', 'learn', S.history],
  10: ['Revise Physics and Chemistry', 'ga:general-science-and-life-science-up-to-class-10-cbse-level', 'revision', 'Lucent science chapters'],
  11: ['Revise Biology', 'ga:general-science-and-life-science-up-to-class-10-cbse-level', 'revision', 'Lucent science chapters'],
  12: ['Revise history', 'ga:history-of-india-and-the-freedom-struggle', 'revision', 'Lucent history chapters'],
  13: ['Science and history PYQs', 'ga:general-science-and-life-science-up-to-class-10-cbse-level', 'pyq', 'Kiran RRB NTPC General Awareness previous year papers'],
}
const REASON_1 = {
  2: ['Analogy', 'reasoning:analogies', 'learn'], 3: ['Coding-Decoding', 'reasoning:coding-and-decoding', 'learn'],
  4: ['Number series', 'reasoning:completion-of-number-series', 'learn'], 5: ['Alphabet series', 'reasoning:completion-of-alphabetical-series', 'learn'],
  6: ['Blood relations', 'reasoning:relationships', 'learn'], 8: ['Mathematical operations', 'reasoning:mathematical-operations', 'learn'],
  9: ['Practice: Analogy and Coding', 'reasoning:analogies', 'practice'], 10: ['Practice: Series', 'reasoning:completion-of-number-series', 'practice'],
  11: ['Practice: Blood relations', 'reasoning:relationships', 'practice'], 12: ['Practice: Mathematical operations', 'reasoning:mathematical-operations', 'practice'],
  13: ['Mixed reasoning set', 'reasoning:analogies', 'practice'],
}
const CA_1 = { 1: 'Nov 2025', 2: 'Dec 2025', 3: 'Jan 2026', 4: 'Feb 2026', 5: 'Mar 2026', 6: 'Apr 2026', 8: 'May 2026', 9: 'Jun 2026', 10: 'Jul 2026', 11: 'Aug 2026', 12: 'Sep 2026', 13: 'Oct 2026' }

const MATHS_2 = {
  15: ['Time and Distance', 'maths:time-and-distance', 'learn', S.maths],
  16: ['Trains, boats and streams', 'maths:time-and-distance', 'practice', S.mathsPractice],
  17: ['Mensuration: 2D shapes', 'maths:mensuration', 'learn', S.maths],
  19: ['Mensuration: 3D shapes', 'maths:mensuration', 'learn', S.maths],
  20: ['Algebra basics', 'maths:elementary-algebra', 'learn', S.maths],
  22: ['Practice: Algebra', 'maths:elementary-algebra', 'practice', S.mathsPractice],
  23: ['Data Interpretation', 'maths:elementary-statistics', 'learn', 'R.S. Aggarwal DI chapter; Rakesh Yadav Sir (YouTube)'],
  24: ['Practice: Data Interpretation', 'maths:elementary-statistics', 'practice', S.mathsPractice],
  26: ['Maths PYQs: arithmetic', 'maths:percentage', 'pyq', S.mathsPyq],
  27: ['Maths PYQs: advanced maths', 'maths:mensuration', 'pyq', S.mathsPyq],
}
const GA_2 = {
  15: ['Polity: Constitution basics', 'ga:constitution-and-political-system', 'learn', S.static],
  16: ['Polity: Parliament and judiciary', 'ga:indian-polity-and-governance', 'learn', S.static],
  17: ['Geography: India', 'ga:physical-geography-of-india-and-the-world', 'learn', 'NCERT geography; Lucent'],
  19: ['Geography: world, rivers, soils', 'ga:physical-geography-of-india-and-the-world', 'learn', 'NCERT geography; Lucent'],
  20: ['Economy basics', 'ga:indian-economy', 'learn', 'NCERT economics; Lucent'],
  22: ['Economy: budget and banking', 'ga:indian-economy', 'learn', S.static],
  23: ['Railway GK', 'ga:transport-systems-in-india', 'learn', S.railway],
  24: ['Government schemes', 'ga:flagship-government-programmes', 'learn', 'AffairsCloud schemes PDF; Railway Adda247'],
  26: ['Revise Polity and Geography', 'ga:indian-polity-and-governance', 'revision', 'Lucent'],
  27: ['Revise Economy, Railway, Schemes', 'ga:indian-economy', 'revision', 'Lucent; AffairsCloud'],
}
const REASON_2 = {
  15: ['Syllogism', 'reasoning:syllogism', 'learn'], 16: ['Practice: Syllogism', 'reasoning:syllogism', 'practice'],
  17: ['Venn diagrams', 'reasoning:venn-diagrams', 'learn'], 18: ['Practice: Venn diagrams', 'reasoning:venn-diagrams', 'practice'],
  19: ['Puzzles: seating', 'reasoning:puzzles', 'learn'], 20: ['Puzzles: scheduling', 'reasoning:puzzles', 'learn'],
  22: ['Statement and conclusion', 'reasoning:statement-and-conclusion', 'learn'], 23: ['Practice: Statement and conclusion', 'reasoning:statement-and-conclusion', 'practice'],
  24: ['Practice: Puzzles', 'reasoning:puzzles', 'practice'], 25: ['Mixed reasoning set', 'reasoning:puzzles', 'practice'],
  26: ['Reasoning PYQs: set 1', 'reasoning:syllogism', 'pyq'], 27: ['Reasoning PYQs: set 2', 'reasoning:puzzles', 'pyq'],
}
const CA_2 = { 15: 'Revise CA: Nov-Dec 2025', 17: 'Revise CA: Jan-Feb 2026', 19: 'Revise CA: Mar-Apr 2026', 22: 'Revise CA: May-Jun 2026', 24: 'Revise CA: Jul-Aug 2026', 26: 'Revise CA: Sep-Oct 2026' }

const WEAK_3 = { 30: 'Weak topic: Percentage, Profit and Loss', 32: 'Weak topic: Time and Distance', 34: 'Weak topic: Mensuration', 36: 'Weak topic: Algebra', 38: 'Weak topic: Data Interpretation', 40: 'Final formula revision' }
const WEAK_3_TOPIC = { 30: 'maths:percentage', 32: 'maths:time-and-distance', 34: 'maths:mensuration', 36: 'maths:elementary-algebra', 38: 'maths:elementary-statistics', 40: 'maths:number-system' }
const GAREV_3 = {
  30: ['GA revision: Polity', 'ga:indian-polity-and-governance'], 32: ['GA revision: Geography', 'ga:physical-geography-of-india-and-the-world'],
  34: ['GA revision: Economy and Railway', 'ga:indian-economy'], 36: ['GA revision: Science', 'ga:general-science-and-life-science-up-to-class-10-cbse-level'],
  38: ['GA revision: History', 'ga:history-of-india-and-the-freedom-struggle'], 40: ['GA revision: static GK one-liners', 'ga:general-knowledge-and-static-gk'],
}
const GATOPIC_3 = {
  30: ['Art and culture', 'ga:art-and-culture-of-india', S.static], 32: ['Sports', 'ga:games-and-sports', `${S.static}; ${S.ca}`],
  34: ['Computers', 'ga:basics-of-computers', 'Lucent computer chapter; Railway Adda247 (YouTube)'], 36: ['Abbreviations', 'ga:common-abbreviations', S.static],
  38: ['Awards, books and authors', 'ga:general-knowledge-and-static-gk', `${S.ca}; Lucent`], 40: ['CA: last 3 months, quick revision', 'ga:national-current-affairs', S.ca],
}

const TEST_DAYS = new Set([7, 14, 21, 28, 35])
const MOCK_DAYS = new Set([7, 14, 18, 21, 25, 28, 29, 31, 33, 35, 37, 39])

function dateOf(day) {
  const d = new Date(`${PLAN_START}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + day - 1)
  return d.toISOString().slice(0, 10)
}

// One row: { day, date, time, minutes, title, subject, priority, notes, topic, kind }
function rowsFor(day) {
  const rows = []
  const add = (time, minutes, title, subject, priority, notes, topic, kind) => rows.push({ day, date: dateOf(day), time, minutes, title, subject, priority, notes, topic, kind })
  const mockNo = [...MOCK_DAYS].filter((d) => d <= day).length
  const mathsRow = (time, minutes, [title, topic, kind, notes]) => add(time, minutes, title, 'Maths', 'high', notes, topic, kind)
  const gaRow = (time, minutes, [title, topic, kind, notes]) => add(time, minutes, title, 'General Awareness', 'high', notes, topic, kind)
  const reasonRow = (time, minutes, [title, topic, kind]) => add(time, minutes, title, 'Reasoning', 'medium', kind === 'pyq' ? S.reasoningPyq : S.reasoning, topic, kind)

  if (day === 1) {
    mathsRow('20:00', 50, MATHS_1[1])
    add('20:50', 35, `Current affairs: ${CA_1[1]}`, 'General Awareness', 'medium', S.ca, 'ga:national-current-affairs', 'reading')
    add('21:25', 5, 'Start the error notebook', 'All subjects', 'medium', 'A notebook only for mistakes: question, your error, the right method', null, 'revision')
    return rows
  }

  // Morning
  if (MOCK_DAYS.has(day)) {
    add('05:00', 90, day === 7 ? 'Diagnostic mock test' : `Mock test ${mockNo}`, 'All subjects', 'high', S.mock, null, 'test')
    add('06:30', 60, day === 7 ? 'Diagnostic mock: analysis' : `Mock ${mockNo}: review`, 'All subjects', 'high', S.review, null, 'test')
  } else if (day <= 14) {
    mathsRow('05:00', 90, MATHS_1[day]); gaRow('06:30', 60, GA_1[day])
  } else if (day <= 28) {
    mathsRow('05:00', 90, MATHS_2[day]); gaRow('06:30', 60, GA_2[day])
  } else {
    add('05:00', 60, 'Timed mixed maths set', 'Maths', 'high', S.mathsPyq, null, 'practice')
    add('06:00', 45, WEAK_3[day], 'Maths', 'high', S.mathsPractice, WEAK_3_TOPIC[day], day === 40 ? 'revision' : 'practice')
    add('06:45', 45, GAREV_3[day][0], 'General Awareness', 'high', 'Lucent; your own notes', GAREV_3[day][1], 'revision')
  }

  // Evening
  if (TEST_DAYS.has(day) && day !== 35) {
    add('20:00', 45, 'Weekly revision: Maths and Reasoning', 'All subjects', 'high', 'Formula sheet, error notebook, the week\'s wrong questions', null, 'revision')
    add('20:45', 40, 'Weekly revision: General Awareness', 'General Awareness', 'high', 'This week\'s GA notes and current affairs', 'ga:national-current-affairs', 'revision')
  } else if (day >= 29 && MOCK_DAYS.has(day)) {
    add('20:00', 60, `Mock ${mockNo}: review part 2`, 'All subjects', 'high', `${S.review}; redo the wrong ones without looking`, null, 'test')
    if (day === 35) add('21:00', 25, 'Weekly revision', 'All subjects', 'high', 'Error notebook and formula sheet', null, 'revision')
    else add('21:00', 25, 'Current affairs quick revision', 'General Awareness', 'medium', S.ca, 'ga:national-current-affairs', 'revision')
  } else if (day >= 29) {
    add('20:00', 40, 'Timed reasoning set', 'Reasoning', 'medium', S.reasoningPyq, null, 'practice')
    add('20:40', 45, GATOPIC_3[day][0], 'General Awareness', 'high', GATOPIC_3[day][2], GATOPIC_3[day][1], day === 40 ? 'revision' : 'learn')
  } else {
    reasonRow('20:00', 50, day <= 14 ? REASON_1[day] : REASON_2[day])
    const ca = day <= 14 ? `Current affairs: ${CA_1[day]}` : CA_2[day] || 'Daily news + CA quiz'
    add('20:50', 35, ca, 'General Awareness', 'medium', S.ca, 'ga:national-current-affairs', day <= 14 ? 'reading' : 'revision')
  }
  add('21:25', 5, 'Error notebook', 'All subjects', 'medium', S.errors, null, 'revision')
  return rows
}

// Every row of the plan, in date and time order, each with a fixed id.
export const PLAN_ROWS = Array.from({ length: PLAN_DAYS }, (_, i) => rowsFor(i + 1)).flatMap((rows) =>
  rows.map((r, j) => ({ ...r, id: `${PLAN_ID}-d${String(r.day).padStart(2, '0')}-${j + 1}` })))

// As planner tasks (createTask fields). Days before `fromDate` are left out, so adding the plan
// late doesn't fill today with overdue work.
const SUBJECT_ID = { Maths: 'maths', Reasoning: 'reasoning', 'General Awareness': 'ga' }
export function planTasks({ category, fromDate }) {
  return PLAN_ROWS.filter((r) => !fromDate || r.date >= fromDate).map((r) => ({
    id: r.id,
    title: r.title,
    description: `${r.notes}\n\nDay ${r.day} of 40 · ${PLAN_NAME}`,
    date: r.date,
    startTime: r.time,
    durationMinutes: r.minutes,
    priority: r.priority,
    category,
    tags: ['ntpc', 'plan-40'],
    exam: { id: 'rrb-ntpc', subject: SUBJECT_ID[r.subject] || null, topic: r.topic || 'plan:general', kind: r.kind, deadline: null },
  }))
}
