// Standard process per work area: steps from brief to delivery, what
// "finished" means, and what must be clear before starting.
export const PRE_START_CHECKLIST = [
  'Who asked for it and who approves it',
  'Due date and why that date',
  'Purpose: what should the viewer/user do after seeing it',
  'Sizes, formats and platform (e.g. 1080×1350 for Instagram feed)',
  'Brand assets available: logo, colours, fonts, photos',
  'Text/copy final, or who writes it',
  'Reference or example of the style wanted',
  'How many revision rounds are included (default: 2)',
]

export const PROCESS = {
  'Social media content': {
    steps: ['Read the content calendar for the week', 'Pick topic and pillar', 'Write the caption (hook, value, call to action)', 'Design or edit the creative', 'Self-check: spelling, brand colours, size', 'Mark caption ready + creative ready', 'Schedule or publish'],
    done: 'Post is scheduled/published, link added to the calendar, caption and creative marked ready.',
  },
  'Social media handling': {
    steps: ['Open each platform inbox', 'Reply to comments and messages (within 24 h)', 'Note leads or complaints and pass them on', 'Check mentions and tags', 'Publish today’s scheduled post if not automated', 'Record likes/comments/shares/reach for yesterday’s post'],
    done: 'Inbox at zero, today’s post live, yesterday’s numbers entered.',
  },
  'UI/UX design': {
    steps: ['Brief and goal of the page/screen', 'User flow in 5 lines', 'Low-fi wireframe', 'Review with requester', 'High-fi design with real text', 'Prototype the key interaction', 'Hand-off: export, spacing, states, assets'],
    done: 'All screens and states designed, requester approved, assets exported for development.',
  },
  'Motion design': {
    steps: ['Brief: length, platform, message', 'Storyboard (6–8 frames)', 'Style frames approved', 'Animate', 'Sound and timing', 'Export in required sizes'],
    done: 'Final video exported in every required size, approved, saved to the shared folder.',
  },
  'Video editing': {
    steps: ['Collect footage and brief', 'Rough cut', 'Review with requester', 'Fine cut: colour, sound, captions', 'Export for each platform', 'Add to the content calendar if it is a post'],
    done: 'Final export approved and delivered; captions burned in or attached.',
  },
  'Development': {
    steps: ['Read the design and requirements', 'List the pages/features and estimate', 'Build on a staging link', 'Test on phone and desktop', 'Requester review', 'Fix and go live', 'Note what changed'],
    done: 'Live on the real site, tested on phone and desktop, requester confirmed.',
  },
  'Logo design': {
    steps: ['Brief: company, audience, feeling, uses', 'Research and 3 directions on paper', 'Present 3 concepts', 'Refine the chosen one (2 rounds)', 'Colour and black/white versions', 'Export: SVG, PNG, favicon; mini guideline'],
    done: 'Final files in all formats plus a one-page usage guide delivered.',
  },
  'Poster design': {
    steps: ['Brief: message, text, size, print or digital', 'Layout sketch', 'Design', 'Proof-read with requester', 'Export: print PDF (bleed) and/or web JPG/PNG'],
    done: 'Files exported in the right size and format, text proof-read, approved.',
  },
  'Ad campaigns': {
    steps: ['Objective, audience, budget, dates, target cost per lead', 'Creative set (3 variants) and copy', 'Set up campaign, tracking and lead form', 'Launch and check after 24 h', 'Daily check: spend, clicks, leads, CPL', 'Weekly: pause weak ads, scale good ones', 'End: fill final numbers in the tracker'],
    done: 'Campaign ended with final spend, leads and CPL recorded, and a 3-line learning note.',
  },
}
