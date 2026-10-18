// The RRB NTPC syllabus: three subjects and their topics, as given by the person who asked for this
// module. Topic ids are fixed ('maths:percentage'), so a person's progress (store.js) and tasks
// linked to a topic (task.exam.topic) always find it again. Nothing is seeded into storage: the list
// lives here, so opening the module twice can never duplicate a topic.
//
// The exam's pattern and stages change between notifications and differ for the Graduate and
// Undergraduate levels. The app does not state them; people check the official RRB notice.
export const EXAM_ID = 'rrb-ntpc'
export const EXAM_NAME = 'RRB NTPC'

export const CATEGORIES = [
  { id: 'graduate', label: 'NTPC Graduate' },
  { id: 'undergraduate', label: 'NTPC Undergraduate' },
]

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const MATHS = [
  'Number System', 'Decimals', 'Fractions', 'LCM and HCF', 'Ratio and Proportions', 'Percentage', 'Mensuration',
  'Time and Work', 'Time and Distance', 'Simple Interest', 'Compound Interest', 'Profit and Loss',
  'Elementary Algebra', 'Geometry', 'Trigonometry', 'Elementary Statistics',
]
const REASONING = [
  'Analogies', 'Mathematical Operations', 'Similarities and Differences', 'Relationships', 'Completion of Number Series',
  'Completion of Alphabetical Series', 'Coding and Decoding', 'Analytical Reasoning', 'Syllogism', 'Jumbling',
  'Venn Diagrams', 'Puzzles', 'Data Sufficiency', 'Statement and Conclusion', 'Statement and Courses of Action',
  'Decision Making', 'Maps', 'Interpretation of Graphs',
]
const GA = [
  'General Science and Life Science (up to Class 10 CBSE level)', 'History of India and the Freedom Struggle',
  'Physical Geography of India and the World', 'Social Geography of India and the World', 'Economic Geography of India and the World',
  'Indian Polity and Governance', 'Constitution and Political System', 'General Scientific and Technological Developments',
  'Space Programme of India', 'Nuclear Programme of India', 'National Current Affairs', 'International Current Affairs',
  'Games and Sports', 'Art and Culture of India', 'Indian Literature', 'Monuments and Places of India',
  'United Nations and Other Important World Organizations', 'Environmental Issues in India and the World', 'Basics of Computers',
  'Computer Applications', 'Common Abbreviations', 'Transport Systems in India', 'Indian Economy',
  'Famous Personalities of India and the World', 'Flagship Government Programmes', 'Flora and Fauna of India',
  'Important Government Organizations of India', 'Important Public Sector Organizations of India', 'General Knowledge and Static GK',
]
// Studied all the time rather than finished once: never "Completed", left out of completion figures.
const RECURRING = new Set(['National Current Affairs', 'International Current Affairs'])

export const SUBJECTS = [
  { id: 'maths', name: 'Mathematics', short: 'Maths', color: 'sky', topics: MATHS },
  { id: 'reasoning', name: 'General Intelligence and Reasoning', short: 'Reasoning', color: 'lav', topics: REASONING },
  { id: 'ga', name: 'General Awareness', short: 'General Awareness', color: 'mint', topics: GA },
].map((s) => ({
  ...s,
  topics: s.topics.map((name, i) => ({ id: `${s.id}:${slug(name)}`, subject: s.id, name, order: i, recurring: RECURRING.has(name) })),
}))

export const BUILT_IN_TOPICS = SUBJECTS.flatMap((s) => s.topics)
export const subjectById = (id) => SUBJECTS.find((s) => s.id === id)

// Current affairs records are filed under one of these.
export const CA_CATEGORIES = [
  'National News', 'International News', 'Government Policies', 'Economy and Banking', 'Science and Technology', 'Defence',
  'Sports', 'Awards', 'Appointments', 'Summits', 'Reports and Indexes', 'Important Days', 'Books and Authors',
]
