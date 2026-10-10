// Work OS storage: one key holding settings + the three input tables.
// Everything else in the module is derived from these.
import { uid } from '../lib/storage'
import { storageKey } from '../lib/profiles'

const KEY = () => storageKey('work')

export const AREAS = [
  'Social media content', 'Social media handling', 'UI/UX design', 'Motion design',
  'Video editing', 'Development', 'Logo design', 'Poster design', 'Ad campaigns',
]
export const PRIORITIES = ['High', 'Medium', 'Low']
export const TASK_STATUSES = ['Not started', 'In progress', 'In review', 'Done', 'On hold']
export const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'TikTok', 'X']
export const POST_TYPES = ['Reel', 'Post', 'Carousel', 'Story', 'Video', 'Short']
export const PILLARS = ['Product', 'Education', 'Behind the scenes', 'Promo', 'Testimonial', 'Engagement']
export const POST_STATUSES = ['Idea', 'Drafted', 'Scheduled', 'Published', 'Cancelled']
export const AD_PLATFORMS = ['Meta', 'Google', 'LinkedIn', 'TikTok', 'YouTube']
export const OBJECTIVES = ['Leads', 'Traffic', 'Awareness', 'Sales', 'Engagement']
export const AD_STATUSES = ['Planned', 'Active', 'Paused', 'Ended']
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Which Saturdays are working days (only applies when Saturday is ticked).
export const SATURDAY_RULES = [
  { id: 'all', label: 'Every Saturday', hint: 'All Saturdays are working days' },
  { id: 'first-third', label: '1st, 3rd & 5th Saturdays', hint: '2nd and 4th Saturdays off' },
  { id: 'second-fourth', label: '2nd & 4th Saturdays', hint: '1st, 3rd and 5th Saturdays off' },
  { id: 'alternate-odd', label: 'Alternate Saturdays (odd weeks)', hint: 'Week 1, 3, 5… of the year' },
  { id: 'alternate-even', label: 'Alternate Saturdays (even weeks)', hint: 'Week 2, 4, 6… of the year' },
]

// ---- Assumptions (all editable in the Work settings) --------------------
export const DEFAULT_WORK_SETTINGS = {
  startTime: '09:30',
  workingDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  saturdayRule: 'all', // see SATURDAY_RULES
  dayOffs: [], // extra holidays, yyyy-MM-dd
  currency: '$',
  // The day in order. Fixed slots keep their area; focus blocks take the
  // area from the weekly plan. Minutes add up to 9h (09:30–18:30).
  blocks: [
    { id: 'b1', name: 'Social media handling', area: 'Social media handling', minutes: 45, what: 'Reply to comments and messages, check mentions, publish today’s scheduled post.', output: 'Inbox at zero; today’s post live.', fixed: true },
    { id: 'b2', name: 'Ad campaign check', area: 'Ad campaigns', minutes: 30, what: 'Check spend, clicks, leads and cost per lead; pause or boost; update the tracker.', output: 'Ad tracker updated; no campaign over budget.', fixed: true },
    { id: 'b3', name: 'Focus block 1', area: null, minutes: 180, what: 'Main work of the day (area from the weekly plan). No inbox.', output: 'Planned task moved forward or delivered.', fixed: false, focus: 1 },
    { id: 'b4', name: 'Lunch', area: null, minutes: 60, what: 'Break.', output: '', fixed: true, lunch: true },
    { id: 'b5', name: 'Focus block 2', area: null, minutes: 150, what: 'Second main work block (area from the weekly plan).', output: 'Second task moved forward or delivered.', fixed: false, focus: 2 },
    { id: 'b6', name: 'Prepare tomorrow’s post', area: 'Social media content', minutes: 45, what: 'Write the caption, finish the creative, schedule it.', output: 'Tomorrow’s post marked caption ready + creative ready.', fixed: true },
    { id: 'b7', name: 'Wrap-up and daily report', area: null, minutes: 30, what: 'Log actual hours, update statuses, write the daily report.', output: 'Task log current; report sent.', fixed: true, admin: true },
  ],
  // Which area each focus block gets, per weekday (1 = Monday).
  weeklyPlan: {
    1: ['UI/UX design', 'Development'],
    2: ['Development', 'Motion design'],
    3: ['Video editing', 'Poster design'],
    4: ['Development', 'UI/UX design'],
    5: ['Logo design', 'Ad campaigns'],
    6: ['Social media content', 'Video editing'],
  },
  targets: {
    completionPct: 90,   // done ÷ worked on, at least
    onTimePct: 90,       // delivered by due date, at least
    capacityPct: 85,     // actual ÷ available hours; above 100 = overloaded
    avgRevisions: 1.5,   // at most
    tasksPerDay: 3,      // worked on per working day, at least
    postsPerWeek: 6,     // published, at least
    engagementPct: 3,    // (likes + comments + shares) ÷ reach, at least
    costPerLead: 5,      // at most, in your currency
  },
}

export const DEFAULT_STANDARD_TIMES = [
  ['Social media content', 'Static post (design + caption)', 1.5],
  ['Social media content', 'Carousel (5–7 slides)', 3],
  ['Social media content', 'Reel / short video', 4],
  ['Social media content', 'Story set (3–5 frames)', 1],
  ['Social media handling', 'Daily inbox and comments', 0.75],
  ['UI/UX design', 'Landing page design', 10],
  ['UI/UX design', 'App screen (1 screen)', 3],
  ['UI/UX design', 'Wireframe set (5 screens)', 6],
  ['UI/UX design', 'Design revision round', 2],
  ['Motion design', 'Logo animation', 6],
  ['Motion design', 'Motion graphic (30 s)', 8],
  ['Video editing', 'Short edit (under 1 min)', 3],
  ['Video editing', 'Long edit (3–10 min)', 10],
  ['Development', 'Web page build', 8],
  ['Development', 'Landing page build', 12],
  ['Development', 'Bug fix', 2],
  ['Development', 'Feature (small)', 8],
  ['Logo design', 'New logo (3 concepts)', 12],
  ['Logo design', 'Logo refresh', 5],
  ['Poster design', 'Poster / flyer', 3],
  ['Poster design', 'Banner set (3 sizes)', 2.5],
  ['Ad campaigns', 'Ad campaign set-up', 4],
  ['Ad campaigns', 'Ad creative set (3 variants)', 4],
  ['Ad campaigns', 'Weekly ad optimisation', 1.5],
].map(([area, taskType, hours], i) => ({ id: `st${i + 1}`, area, taskType, hours }))

// Example rows: shown with a badge and kept out of every total.
const EXAMPLES = {
  task: {
    id: 'T-EX', example: true, requestDate: '2026-10-01', area: 'Poster design', taskType: 'Poster / flyer', task: 'Diwali offer poster',
    project: 'Festive campaign', requestedBy: 'Marketing lead', priority: 'High', dueDate: '2026-10-03', standardHours: 3, plannedHours: 3,
    workDate: '2026-10-02', actualHours: 3.5, status: 'Done', revisions: 1, completedDate: '2026-10-03', notes: '',
  },
  post: {
    id: 'P-EX', example: true, date: '2026-10-03', platform: 'Instagram', postType: 'Reel', pillar: 'Promo', topic: 'Diwali offer teaser',
    captionReady: true, creativeReady: true, status: 'Published', link: 'https://instagram.com/p/example', likes: 240, comments: 18, shares: 12, reach: 6200,
  },
  campaign: {
    id: 'C-EX', example: true, campaign: 'Diwali leads', platform: 'Meta', objective: 'Leads', product: 'Festive bundle', startDate: '2026-10-01', endDate: '2026-10-15',
    budget: 300, spend: 180, impressions: 42000, clicks: 910, leads: 38, targetCpl: 5, status: 'Active',
  },
}

export function emptyWork() {
  return {
    settings: structuredClone(DEFAULT_WORK_SETTINGS),
    standardTimes: structuredClone(DEFAULT_STANDARD_TIMES),
    tasks: [structuredClone(EXAMPLES.task)],
    posts: [structuredClone(EXAMPLES.post)],
    campaigns: [structuredClone(EXAMPLES.campaign)],
    dayNotes: {}, // 'yyyy-MM-dd': { target, blockers, tomorrow }
    nextTaskNo: 1,
  }
}

export function loadWork() {
  try {
    const raw = localStorage.getItem(KEY())
    if (!raw) return emptyWork()
    const w = JSON.parse(raw)
    const base = emptyWork()
    return {
      ...base,
      ...w,
      settings: { ...base.settings, ...(w.settings || {}), targets: { ...base.settings.targets, ...(w.settings?.targets || {}) }, weeklyPlan: { ...base.settings.weeklyPlan, ...(w.settings?.weeklyPlan || {}) } },
    }
  } catch {
    return emptyWork()
  }
}

export function saveWork(w) {
  try { localStorage.setItem(KEY(), JSON.stringify(w)) } catch { /* ignore */ }
}

export const newTaskRow = (no, today) => ({
  id: `T-${String(no).padStart(3, '0')}`, example: false, requestDate: today, area: AREAS[0], taskType: '', task: '', project: '', requestedBy: '',
  priority: 'Medium', dueDate: today, standardHours: 0, plannedHours: 0, workDate: null, actualHours: 0, status: 'Not started', revisions: 0, completedDate: null, notes: '',
})
export const newPostRow = (today) => ({
  id: `P-${uid().slice(0, 6)}`, example: false, date: today, platform: 'Instagram', postType: 'Post', pillar: 'Product', topic: '',
  captionReady: false, creativeReady: false, status: 'Idea', link: '', likes: 0, comments: 0, shares: 0, reach: 0,
})
export const newCampaignRow = (today) => ({
  id: `C-${uid().slice(0, 6)}`, example: false, campaign: '', platform: 'Meta', objective: 'Leads', product: '', startDate: today, endDate: today,
  budget: 0, spend: 0, impressions: 0, clicks: 0, leads: 0, targetCpl: 5, status: 'Planned',
})
