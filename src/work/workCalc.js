// All derived numbers for the Work OS. Pure functions; example rows are
// filtered out by `real()` so they never enter a total.
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, getDay, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { AREAS } from './workStore'

export const key = (d) => format(d, 'yyyy-MM-dd')
export const real = (rows) => rows.filter((r) => !r.example)
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const toHHMM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export const h1 = (n) => (Math.round(n * 10) / 10).toString()
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null)

// ---- calendar -----------------------------------------------------------
export const isWorkingDay = (settings, d) => settings.workingDays.includes(getDay(d)) && !settings.dayOffs.includes(key(d))
export const workMinutesPerDay = (settings) => settings.blocks.filter((b) => !b.lunch).reduce((s, b) => s + (b.minutes || 0), 0)
export const dayLength = (settings) => settings.blocks.reduce((s, b) => s + (b.minutes || 0), 0)
export const endTime = (settings) => toHHMM(toMin(settings.startTime) + dayLength(settings))

// The day's time plan with clock times; focus blocks take the weekly-plan area.
export function timePlan(settings, d) {
  const plan = settings.weeklyPlan[getDay(d)] || [null, null]
  let t = toMin(settings.startTime)
  return settings.blocks.map((b) => {
    const start = t
    t += b.minutes || 0
    const area = b.focus ? plan[b.focus - 1] || null : b.area
    return { ...b, start: toHHMM(start), end: toHHMM(t), area }
  })
}

// Hours per area across one working week from the weekly plan + fixed slots.
export function weeklyAreaHours(settings) {
  const hours = Object.fromEntries(AREAS.map((a) => [a, 0]))
  for (const wd of settings.workingDays) {
    const plan = settings.weeklyPlan[wd] || []
    for (const b of settings.blocks) {
      if (b.lunch || b.admin) continue
      const area = b.focus ? plan[b.focus - 1] : b.area
      if (area && area in hours) hours[area] += (b.minutes || 0) / 60
    }
  }
  return hours
}

export function workingDaysBetween(settings, from, to) {
  if (to < from) return 0
  return eachDayOfInterval({ start: from, end: to }).filter((d) => isWorkingDay(settings, d)).length
}

// ---- task rows ----------------------------------------------------------
export function taskDerived(t, today = new Date()) {
  const variance = (Number(t.actualHours) || 0) - (Number(t.plannedHours) || 0)
  let delivery = 'Open', daysLate = 0
  if (t.status === 'Done') {
    if (t.completedDate && t.dueDate) {
      daysLate = Math.max(0, differenceInCalendarDays(parseISO(t.completedDate), parseISO(t.dueDate)))
      delivery = daysLate > 0 ? 'Late' : 'On time'
    } else delivery = 'On time'
  } else if (t.dueDate && t.dueDate < key(today)) {
    delivery = 'Overdue'
    daysLate = differenceInCalendarDays(today, parseISO(t.dueDate))
  }
  return { variance, delivery, daysLate }
}

export const postEngagement = (p) => {
  const e = (Number(p.likes) || 0) + (Number(p.comments) || 0) + (Number(p.shares) || 0)
  return { engagements: e, rate: p.reach > 0 ? (e / Number(p.reach)) * 100 : null }
}

export function campaignDerived(c, today = new Date()) {
  const spend = Number(c.spend) || 0, budget = Number(c.budget) || 0, clicks = Number(c.clicks) || 0, imp = Number(c.impressions) || 0, leads = Number(c.leads) || 0
  const cpl = leads > 0 ? spend / leads : null
  const daysLeft = c.endDate ? differenceInCalendarDays(parseISO(c.endDate), today) : null
  return {
    budgetUsedPct: pct(spend, budget), ctr: imp > 0 ? (clicks / imp) * 100 : null, cpc: clicks > 0 ? spend / clicks : null, cpl,
    cplVsTarget: cpl != null && c.targetCpl > 0 ? Math.round(((cpl - c.targetCpl) / c.targetCpl) * 100) : null,
    daysLeft, overBudget: budget > 0 && spend > budget,
    live: c.status === 'Active' && c.startDate <= key(today) && (!c.endDate || c.endDate >= key(today)),
  }
}

// ---- dashboard for a date range -----------------------------------------
export function rangeStats(work, from, to, today = new Date()) {
  const { settings } = work
  const f = key(from), t = key(to)
  const inRange = (d) => d && d >= f && d <= t
  const tasks = real(work.tasks)
  const worked = tasks.filter((x) => inRange(x.workDate))
  const done = tasks.filter((x) => x.status === 'Done' && inRange(x.completedDate))
  const onTime = done.filter((x) => taskDerived(x, today).delivery === 'On time')
  const overdue = tasks.filter((x) => x.status !== 'Done' && x.dueDate && x.dueDate < key(today))
  const planned = worked.reduce((s, x) => s + (Number(x.plannedHours) || 0), 0)
  const actual = worked.reduce((s, x) => s + (Number(x.actualHours) || 0), 0)
  const days = workingDaysBetween(settings, from, to)
  const available = (days * workMinutesPerDay(settings)) / 60
  const revisions = done.length ? done.reduce((s, x) => s + (Number(x.revisions) || 0), 0) / done.length : null

  const posts = real(work.posts).filter((p) => p.status === 'Published' && inRange(p.date))
  const eng = posts.reduce((s, p) => s + postEngagement(p).engagements, 0)
  const reach = posts.reduce((s, p) => s + (Number(p.reach) || 0), 0)

  const camps = real(work.campaigns).filter((c) => c.startDate <= t && (!c.endDate || c.endDate >= f))
  const spend = camps.reduce((s, c) => s + (Number(c.spend) || 0), 0)
  const leads = camps.reduce((s, c) => s + (Number(c.leads) || 0), 0)

  const weeks = Math.max(1, days / settings.workingDays.length)
  const T = settings.targets
  const kpi = (label, value, target, kind, fmt, extra = {}) => ({ label, value, target, kind, fmt, ...extra })
  const kpis = [
    kpi('Tasks worked on', worked.length, Math.round(T.tasksPerDay * days), 'min', 'n'),
    kpi('Tasks done', done.length, null, null, 'n'),
    kpi('Completion', pct(done.length, worked.length), T.completionPct, 'min', '%'),
    kpi('On-time delivery', pct(onTime.length, done.length), T.onTimePct, 'min', '%'),
    kpi('Overdue tasks', overdue.length, 0, 'max', 'n'),
    kpi('Planned hours', planned, null, null, 'h'),
    kpi('Actual hours', actual, null, null, 'h'),
    kpi('Available hours', available, null, null, 'h'),
    kpi('Capacity used', pct(actual, available), T.capacityPct, 'capacity', '%'),
    kpi('Avg revision rounds', revisions, T.avgRevisions, 'max', 'x'),
    kpi('Posts published', posts.length, Math.round(T.postsPerWeek * weeks), 'min', 'n'),
    kpi('Engagement rate', reach > 0 ? (eng / reach) * 100 : null, T.engagementPct, 'min', '%'),
    kpi('Ad spend', spend, null, null, 'money'),
    kpi('Leads', leads, null, null, 'n'),
    kpi('Cost per lead', leads > 0 ? spend / leads : null, T.costPerLead, 'max', 'money'),
  ].map((k) => ({ ...k, status: kpiStatus(k) }))

  // Breakdowns
  const byArea = AREAS.map((a) => {
    const rows = worked.filter((x) => x.area === a)
    return { area: a, tasks: rows.length, done: rows.filter((x) => x.status === 'Done').length, planned: rows.reduce((s, x) => s + (Number(x.plannedHours) || 0), 0), actual: rows.reduce((s, x) => s + (Number(x.actualHours) || 0), 0) }
  })
  const byStatus = ['Not started', 'In progress', 'In review', 'Done', 'On hold'].map((s) => ({ status: s, count: tasks.filter((x) => (inRange(x.workDate) || inRange(x.dueDate)) && x.status === s).length }))
  const byDay = eachDayOfInterval({ start: from, end: to }).map((d) => {
    const k = key(d)
    const rows = worked.filter((x) => x.workDate === k)
    return { date: d, key: k, label: format(d, days > 14 ? 'd' : 'EEE d'), actual: rows.reduce((s, x) => s + (Number(x.actualHours) || 0), 0), planned: rows.reduce((s, x) => s + (Number(x.plannedHours) || 0), 0), working: isWorkingDay(settings, d) }
  })

  return { kpis, byArea, byStatus, byDay, worked, done, overdue, posts, camps, days, available }
}

export function kpiStatus(k) {
  if (k.value == null || k.target == null) return 'n/a'
  if (k.kind === 'min') return k.value >= k.target ? 'On track' : 'Below target'
  if (k.kind === 'max') return k.value <= k.target ? 'On track' : 'Below target'
  if (k.kind === 'capacity') return k.value > 100 ? 'Overloaded' : k.value >= k.target ? 'On track' : 'Below target'
  return 'n/a'
}

export function fmtKpi(k, currency = '$') {
  if (k.value == null) return '—'
  if (k.fmt === '%') return `${Math.round(k.value)}%`
  if (k.fmt === 'h') return `${h1(k.value)} h`
  if (k.fmt === 'x') return `${h1(k.value)}×`
  if (k.fmt === 'money') return `${currency}${h1(k.value)}`
  return String(k.value)
}
export function fmtTarget(k, currency = '$') {
  if (k.target == null) return ''
  const sign = k.kind === 'max' ? '≤' : k.kind === 'capacity' ? `${k.target}–100%` : '≥'
  if (k.kind === 'capacity') return sign
  return `${sign} ${fmtKpi({ ...k, value: k.target }, currency)}`
}

// ---- monthly summary ----------------------------------------------------
export function monthlySummary(work, today = new Date()) {
  const months = new Map()
  const bucket = (k) => { const m = k.slice(0, 7); if (!months.has(m)) months.set(m, { month: m, hours: Object.fromEntries(AREAS.map((a) => [a, 0])), done: 0, onTime: 0, posts: 0 }); return months.get(m) }
  for (const t of real(work.tasks)) {
    if (t.workDate) bucket(t.workDate).hours[t.area] += Number(t.actualHours) || 0
    if (t.status === 'Done' && t.completedDate) { const b = bucket(t.completedDate); b.done += 1; if (taskDerived(t, today).delivery === 'On time') b.onTime += 1 }
  }
  for (const p of real(work.posts)) if (p.status === 'Published' && p.date) bucket(p.date).posts += 1
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month))
}

// ---- week strip for the date view ---------------------------------------
export function weekStrip(work, d, weekStartsOn = 1, today = new Date()) {
  const start = startOfWeek(d, { weekStartsOn })
  return eachDayOfInterval({ start, end: endOfWeek(d, { weekStartsOn }) }).map((day) => {
    const k = key(day)
    const tasks = real(work.tasks)
    return {
      date: day, key: k, working: isWorkingDay(work.settings, day),
      due: tasks.filter((t) => t.dueDate === k && t.status !== 'Done').length,
      worked: tasks.filter((t) => t.workDate === k).length,
      hours: tasks.filter((t) => t.workDate === k).reduce((s, t) => s + (Number(t.actualHours) || 0), 0),
      posts: real(work.posts).filter((p) => p.date === k && p.status !== 'Cancelled').length,
    }
  })
}

export const presets = (today = new Date(), weekStartsOn = 1) => ({
  'This week': [startOfWeek(today, { weekStartsOn }), endOfWeek(today, { weekStartsOn })],
  'This month': [startOfMonth(today), endOfMonth(today)],
  'Last 30 days': [addDays(today, -29), today],
})
