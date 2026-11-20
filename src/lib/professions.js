// What each profession's day looks like. One object per profession; onboarding asks "What do you do?",
// then the setup question, and lib/professionDay.js turns the answers into a timed list of tasks.
// Offsets are hours after the start of the working day (0.5 = 30 minutes in).
//
// To add a profession: add one object to PROFESSIONS (an icon key from components/Onboarding.jsx
// PROFESSION_ICON, a setup question, base tasks, and extra tasks per setup option).

const t = (offsetHours, title, category) => ({ offsetHours, title, category })

export const PROFESSIONS = [
  {
    id: 'doctor', label: 'Doctor', icon: 'stethoscope',
    setupQuestion: { text: 'Where do you mostly practice?', options: ['Clinic/OPD', 'Hospital wards', 'Both'] },
    baseTasks: [
      t(0, "Review today's appointments and new lab results", 'Prep'),
      t(0.5, 'Patient consultations', 'Care'),
      t(4, 'Sign pending notes and orders', 'Charting'),
      t(5, 'Clear patient messages and inbox', 'Charting'),
      t(7, 'Close every chart before leaving', 'Charting'),
      t(8, '20 min of CME reading', 'Growth'),
    ],
    variantTasks: {
      0: [t(6, 'Call patients with abnormal reports', 'Follow-up')],
      1: [t(0, 'Ward rounds and handover review', 'Rounds'), t(3, 'Write discharge summaries', 'Charting')],
      2: [t(0, 'Ward rounds before clinic', 'Rounds'), t(6, 'Call patients with abnormal reports', 'Follow-up')],
    },
    modules: ['patient-queue', 'pending-notes', 'follow-up-reminders'],
  },
  {
    id: 'nurse', label: 'Nurse', icon: 'heart-pulse',
    setupQuestion: { text: 'What is your shift pattern?', options: ['12h day', '12h night', '8h rotating'] },
    baseTasks: [
      t(0, 'Receive handoff and review assigned patients', 'Handoff'),
      t(0.5, 'Initial assessments and vitals', 'Care'),
      t(1, 'First medication round', 'Meds'),
      t(2, 'Hourly checks and repositioning', 'Care'),
      t(5, 'Second medication round', 'Meds'),
      t(7, 'Catch up on documentation', 'Charting'),
      t(11, 'Prepare handoff report', 'Handoff'),
    ],
    variantTasks: {},
    // The shift pattern also suggests working hours (onboarding fills them in; people can change them).
    suggestedHours: { 0: ['07:00', '19:00'], 1: ['19:00', '07:00'], 2: ['07:00', '15:00'] },
    modules: ['shift-handoff', 'med-schedule', 'hourly-checks'],
  },
  {
    id: 'lawyer', label: 'Advocate / lawyer', icon: 'scale',
    setupQuestion: { text: 'What kind of practice?', options: ['Litigation', 'Advisory/corporate', 'Both'] },
    baseTasks: [
      t(0, "Check today's hearings and filing deadlines", 'Deadlines'),
      t(2, 'Client meetings and calls', 'Clients'),
      t(4, 'Drafting block', 'Drafting'),
      t(6, 'Legal research for upcoming matters', 'Research'),
      t(7, 'Log billable time for each matter', 'Billing'),
      t(8, "Confirm tomorrow's dates and documents", 'Deadlines'),
    ],
    variantTasks: {
      0: [t(0.5, 'Court appearances', 'Court')],
      1: [t(1, 'Review contracts and due diligence', 'Drafting')],
      2: [t(0.5, 'Court appearances', 'Court'), t(1, 'Review contracts and due diligence', 'Drafting')],
    },
    modules: ['hearing-calendar', 'matter-list', 'billable-timer'],
  },
  {
    id: 'chartered-accountant', label: 'Chartered accountant', icon: 'calculator',
    setupQuestion: { text: 'What are your main services?', options: ['Tax filing', 'Audit', 'Bookkeeping and payroll'] },
    baseTasks: [
      t(0, 'Check statutory deadlines due this week', 'Deadlines'),
      t(0.5, 'Chase clients for missing documents', 'Clients'),
      t(1, 'Prepare and review client work', 'Client work'),
      t(4, 'Client calls and queries', 'Clients'),
      t(6, 'Review staff work and sign-offs', 'Review'),
      t(7, 'Update client status tracker', 'Admin'),
    ],
    variantTasks: {
      0: [t(2, 'File returns due in the next 3 days', 'Deadlines')],
      1: [t(2, 'Audit fieldwork and sampling', 'Client work'), t(5, 'Clear open audit queries', 'Review')],
      2: [t(2, 'Reconcile bank and ledgers', 'Client work'), t(5, 'Run payroll checks', 'Review')],
    },
    modules: ['compliance-calendar', 'client-documents', 'review-queue'],
  },
  {
    id: 'startup-founder', label: 'Startup founder', icon: 'rocket',
    setupQuestion: { text: 'What stage is your company?', options: ['Idea/pre-seed', 'Seed to Series A', 'Growth'] },
    baseTasks: [
      t(0, "Set today's top 3 from your personal agenda", 'Agenda'),
      t(0.5, 'Check key metrics and cash', 'Metrics'),
      t(1, 'Team sync and blockers', 'Team'),
      t(2, 'Deep work on the #1 priority', 'Agenda'),
      t(5, 'Talk to at least one customer', 'Customers'),
      t(6, 'Hiring: review candidates or interview', 'Team'),
      t(8, 'Plan tomorrow', 'Agenda'),
    ],
    variantTasks: {
      0: [t(3, 'Ship or test one experiment', 'Product')],
      1: [t(4, 'Investor update or fundraising follow-ups', 'Investors')],
      2: [t(3, '1:1s with direct reports', 'Team'), t(4, 'Board and investor prep', 'Investors')],
    },
    modules: ['top-priorities', 'metrics-glance', 'hiring-pipeline'],
  },
  {
    id: 'teacher', label: 'Teacher', icon: 'school',
    setupQuestion: { text: 'Who do you teach?', options: ['Primary', 'Secondary', 'College'] },
    baseTasks: [
      t(0, "Prep materials for today's lessons", 'Prep'),
      t(0.5, 'Classes', 'Teaching'),
      t(5, 'Grade one batch of work', 'Grading'),
      t(6, 'Reply to parent and student messages', 'Messages'),
      t(7, "Plan tomorrow's lessons", 'Prep'),
      t(7.5, 'Attendance and admin records', 'Admin'),
    ],
    variantTasks: {
      2: [t(4, 'Office hours', 'Teaching'), t(6.5, 'Research or paper writing', 'Research')],
    },
    modules: ['timetable', 'grading-queue', 'parent-messages'],
  },
  {
    id: 'sales', label: 'Sales professional', icon: 'handshake',
    setupQuestion: { text: 'How do you sell?', options: ['Inside/phone', 'Field visits', 'Account manager'] },
    baseTasks: [
      t(0, "Review pipeline and today's meetings", 'Plan'),
      t(0.5, 'Prospecting block', 'Prospecting'),
      t(2, 'Follow-ups on open deals', 'Follow-up'),
      t(3, 'Demos and client meetings', 'Selling'),
      t(6, 'Send proposals and quotes', 'Selling'),
      t(7, 'Update CRM in one batch', 'Admin'),
    ],
    variantTasks: {
      1: [t(3, 'Plan visit route', 'Plan')],
      2: [t(4, 'Check in with key accounts', 'Accounts')],
    },
    modules: ['pipeline', 'follow-up-queue', 'quota-tracker'],
  },
  {
    id: 'real-estate', label: 'Real estate agent', icon: 'house',
    setupQuestion: { text: 'Who do you mostly work with?', options: ['Buyers', 'Sellers/listings', 'Both'] },
    baseTasks: [
      t(0, 'Prospecting: calls and sphere outreach', 'Prospecting'),
      t(2, 'Respond to and follow up leads', 'Follow-up'),
      t(3, 'Showings and appointments', 'Clients'),
      t(6, 'Transaction paperwork and deadlines', 'Admin'),
      t(8, "Plan tomorrow's showings", 'Plan'),
    ],
    variantTasks: {
      1: [t(5, 'Listing marketing and photos', 'Marketing')],
      2: [t(5, 'Listing marketing and photos', 'Marketing')],
    },
    modules: ['lead-follow-ups', 'showings', 'transactions'],
  },
  {
    id: 'freelancer', label: 'Freelancer / creative', icon: 'palette',
    setupQuestion: { text: 'What is your field?', options: ['Design', 'Writing/content', 'Development'] },
    baseTasks: [
      t(0, 'Client deliverables: deep work', 'Client work'),
      t(3, 'Client emails and revisions', 'Clients'),
      t(5, 'Prospecting and proposals', 'Growth'),
      t(6, 'Send invoices and chase payments', 'Money'),
      t(6.5, 'Log hours per client', 'Money'),
      t(7, 'Update portfolio', 'Growth'),
    ],
    variantTasks: {},
    modules: ['client-projects', 'invoices', 'time-log'],
  },
  {
    id: 'it-employee', label: 'IT employee', icon: 'laptop',
    setupQuestion: { text: 'What is your role?', options: ['Developer', 'QA/testing', 'DevOps'] },
    baseTasks: [
      t(0, 'Standup', 'Team'),
      t(0.5, 'Code reviews', 'Review'),
      t(1, 'Focus block on current ticket', 'Tickets'),
      t(5, 'Meetings', 'Team'),
      t(7, 'Update tickets and plan tomorrow', 'Plan'),
    ],
    variantTasks: {
      2: [t(4, 'Check deploys and alerts', 'Ops')],
    },
    modules: ['sprint-board', 'pull-requests', 'on-call'],
  },
  {
    // Turns on NineFlow's Exam prep for the chosen exam (option i = examIds[i], see src/exams/index.js).
    id: 'student', label: 'Student / exam prep', icon: 'graduation-cap',
    setupQuestion: { text: 'Which exam are you preparing for?', options: ['RRB NTPC', 'SSC CGL', 'IBPS PO'] },
    examIds: ['rrb-ntpc', 'ssc-cgl', 'ibps-po'],
    baseTasks: [
      t(0, "Revise yesterday's topics", 'Revision'),
      t(1, "Study block: today's main topic", 'Study'),
      t(3, "Practice questions on today's topic", 'Practice'),
      t(4.5, 'Current affairs reading', 'Current affairs'),
      t(5.5, 'Mock or sectional test', 'Practice'),
      t(7, 'Note mistakes and plan tomorrow', 'Plan'),
    ],
    variantTasks: {},
    modules: ['exam'],
  },
  {
    // A blank planner, or a light starter routine.
    id: 'other', label: 'Something else', icon: 'sparkles',
    setupQuestion: { text: 'How would you like to start?', options: ['A blank planner', 'A simple starter routine'] },
    baseTasks: [],
    variantTasks: {
      1: [
        t(0, "Plan today's top 3", 'Plan'),
        t(1, 'Focus block on the most important task', 'Focus'),
        t(4, 'Messages and admin', 'Admin'),
        t(6, 'Wrap up and plan tomorrow', 'Plan'),
      ],
    },
    modules: [],
  },
]

export const professionById = (id) => PROFESSIONS.find((p) => p.id === id)

// Old profiles chose an occupation; each maps to the nearest profession.
const FROM_OCCUPATION = {
  Developer: 'it-employee', Founder: 'startup-founder', Freelancer: 'freelancer', Designer: 'freelancer',
  'Content creator': 'freelancer', Student: 'student',
}
export const professionFromOccupation = (occupation) => FROM_OCCUPATION[occupation] || 'other'
