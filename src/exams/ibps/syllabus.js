// IBPS PO (Probationary Officer): Prelims and Mains subjects and topics, from the syllabus as published
// by coaching sites (oliveboard.in, 2026, ahead of the next notification), with closely related items
// merged into one topic each. Topic ids are fixed once shipped ('po-quant:percentage'). The pattern
// changes between notifications; the app doesn't state it.
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const QUANT = [
  'Simplification and Approximation', 'Number Series (Missing and Wrong)', 'Quadratic Equations', 'Data Interpretation: Tables and Bar Graphs',
  'Data Interpretation: Pie, Line and Radar Charts', 'Caselets and Mixed DI', 'Data Sufficiency', 'Percentage', 'Ratio and Proportion',
  'Averages', 'Problems on Ages', 'Profit, Loss and Discount', 'Simple and Compound Interest', 'Partnership', 'Mixtures and Alligation',
  'Time and Work', 'Pipes and Cisterns', 'Time, Speed and Distance', 'Boats and Streams', 'Mensuration 2D and 3D',
  'Permutation and Combination', 'Probability', 'LCM, HCF, Surds and Indices',
]
const REASONING = [
  'Puzzles (Floor, Box, Scheduling, Age)', 'Seating Arrangement (Linear, Circular, Square)', 'Syllogism (Basic and Reverse)',
  'Inequality (Direct and Coded)', 'Blood Relations', 'Direction and Distance', 'Order and Ranking', 'Coding and Decoding',
  'Alphanumeric Series', 'Machine Input-Output', 'Data Sufficiency', 'Statement and Assumption', 'Statement and Conclusion',
  'Statement and Argument', 'Cause and Effect', 'Course of Action and Decision Making',
]
const ENGLISH = [
  'Reading Comprehension', 'Cloze Test', 'Para Jumbles and Sentence Rearrangement', 'Error Spotting', 'Sentence Improvement and Phrase Replacement',
  'Fill in the Blanks (Single and Double)', 'Vocabulary: Synonyms and Antonyms', 'Idioms, Phrases and One-Word Substitution', 'Word Usage',
  'Essay Writing (Descriptive)', 'Letter Writing (Descriptive)',
]
const AWARENESS = [
  'Banking Awareness', 'RBI Policies, Reports and Circulars', 'Digital and Financial Awareness', 'Union Budget and Economic Survey',
  'Current Affairs', 'Government Schemes and Policies', 'International Organisations (IMF, World Bank, UN, WTO)',
  'Static GK: Countries, Capitals, Currencies', 'Static GK: National Parks, Dams, Important Days', 'Appointments and Resignations',
  'Awards and Honours', 'Books and Authors', 'Sports', 'Science, Technology and Defence News',
]
const COMPUTER = [
  'Computer Basics and History', 'Hardware, Software and Operating Systems', 'Memory and Storage', 'Internet and Networking',
  'MS Office and Keyboard Shortcuts', 'Number Systems: Binary, Decimal, Hexadecimal', 'Computer Security', 'Computer Abbreviations',
]
const RECURRING = new Set(['Current Affairs'])

const subjects = (list) => list.map((s) => ({
  ...s,
  topics: s.topics.map((name, i) => ({ id: `${s.id}:${slug(name)}`, subject: s.id, name, order: i, recurring: RECURRING.has(name) })),
}))

export const IBPS_PO = {
  id: 'ibps-po', name: 'IBPS PO', short: 'IBPS PO', body: 'IBPS',
  store: 'exam-ibps-po', revPrefix: 'ibps-po-rev', tag: 'ibps-po',
  levels: [{ id: 'prelims', label: 'Prelims' }, { id: 'mains', label: 'Mains' }],
  subjects: subjects([
    { id: 'po-quant', name: 'Quantitative Aptitude and Data Interpretation', short: 'Quant and DI', color: 'sky', topics: QUANT },
    { id: 'po-reasoning', name: 'Reasoning Ability', short: 'Reasoning', color: 'lav', topics: REASONING },
    { id: 'po-english', name: 'English Language', short: 'English', color: 'peach', topics: ENGLISH },
    { id: 'po-awareness', name: 'General, Economy and Banking Awareness (Mains)', short: 'Banking Awareness', color: 'mint', topics: AWARENESS },
    { id: 'po-computer', name: 'Computer Aptitude (Mains)', short: 'Computer', color: 'butter', topics: COMPUTER },
  ]),
  caTopic: 'po-awareness:current-affairs', caSubject: 'po-awareness',
}
