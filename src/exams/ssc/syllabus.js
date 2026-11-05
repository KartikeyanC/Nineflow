// SSC CGL (Combined Graduate Level): Tier 1 and Tier 2 subjects and topics, from the SSC CGL 2025
// notification's syllabus as published by coaching sites (sscadda.com, 2025), with closely related
// items merged into one topic each. Topic ids are fixed once shipped ('cgl-quant:percentage'): progress
// and linked tasks point at them. The pattern changes between notifications; the app doesn't state it.
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const QUANT = [
  'Number System and Computation', 'Decimals and Fractions', 'Square Roots, Surds and Indices', 'Percentage', 'Ratio and Proportion',
  'Averages', 'Simple and Compound Interest', 'Profit, Loss and Discount', 'Partnership', 'Mixture and Alligation',
  'Time and Work', 'Time and Distance', 'Algebraic Identities', 'Linear Equations and Graphs', 'Triangles and their Centres',
  'Congruence and Similarity', 'Circles, Chords and Tangents', 'Quadrilaterals and Regular Polygons', 'Mensuration 2D',
  'Mensuration 3D', 'Trigonometric Ratios and Identities', 'Heights and Distances', 'Statistics: Tables and Graphs',
  'Mean, Median, Mode and Standard Deviation', 'Probability',
]
const REASONING = [
  'Analogies (Semantic, Number, Figural)', 'Classification (Semantic, Number, Figural)', 'Series (Number, Letter, Figural)',
  'Coding and Decoding', 'Blood Relations', 'Direction Sense', 'Order and Ranking', 'Venn Diagrams', 'Syllogism',
  'Statement and Conclusion', 'Decision Making and Critical Thinking', 'Mathematical and Symbolic Operations',
  'Missing Numbers and Trends', 'Word Building and Dictionary Order', 'Space Visualisation and Orientation',
  'Paper Folding and Punched Hole', 'Embedded and Hidden Figures', 'Mirror and Water Images',
  'Indexing and Address Matching', 'Emotional and Social Intelligence',
]
const ENGLISH = [
  'Reading Comprehension', 'Cloze Test', 'Spot the Error', 'Sentence Improvement', 'Fill in the Blanks',
  'Synonyms and Antonyms', 'Idioms and Phrases', 'One-Word Substitution', 'Spelling Correction',
  'Active and Passive Voice', 'Direct and Indirect Speech', 'Sentence and Paragraph Rearrangement',
]
const GA = [
  'History and Culture', 'Geography', 'Indian Polity and Governance', 'Economy and Budget', 'Physics', 'Chemistry',
  'Biology', 'Science and Technology Developments', 'India and its Neighbours', 'Current Affairs', 'Government Schemes',
  'Books and Authors', 'Sports', 'Important Days', 'Awards and People in News', 'Portfolios and Appointments',
]
const COMPUTER = [
  'Computer Basics and Organisation', 'Memory, Storage and Devices', 'Windows and Keyboard Shortcuts',
  'MS Word, Excel and PowerPoint', 'Internet, Email and e-Banking', 'Networking Basics', 'Cyber Security',
]
const RECURRING = new Set(['Current Affairs'])

const subjects = (list) => list.map((s) => ({
  ...s,
  topics: s.topics.map((name, i) => ({ id: `${s.id}:${slug(name)}`, subject: s.id, name, order: i, recurring: RECURRING.has(name) })),
}))

export const SSC_CGL = {
  id: 'ssc-cgl', name: 'SSC CGL', short: 'SSC CGL', body: 'SSC',
  store: 'exam-ssc-cgl', revPrefix: 'ssc-cgl-rev', tag: 'ssc-cgl',
  levels: [{ id: 'tier1', label: 'Tier 1' }, { id: 'tier2', label: 'Tier 2' }],
  subjects: subjects([
    { id: 'cgl-quant', name: 'Quantitative Aptitude', short: 'Quant', color: 'sky', topics: QUANT },
    { id: 'cgl-reasoning', name: 'General Intelligence and Reasoning', short: 'Reasoning', color: 'lav', topics: REASONING },
    { id: 'cgl-english', name: 'English Comprehension', short: 'English', color: 'peach', topics: ENGLISH },
    { id: 'cgl-ga', name: 'General Awareness', short: 'General Awareness', color: 'mint', topics: GA },
    { id: 'cgl-computer', name: 'Computer Knowledge (Tier 2)', short: 'Computer', color: 'butter', topics: COMPUTER },
  ]),
  caTopic: 'cgl-ga:current-affairs', caSubject: 'cgl-ga',
}
