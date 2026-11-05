// The exams the Exam prep section knows. Each is a syllabus (subjects and their topics), its levels, where
// its progress is saved, and which topic current-affairs tasks link to. One exam is open at a time
// (settings.exam); each keeps its own progress, so switching never mixes them.
//
// RRB NTPC was the first and keeps everything it had: its storage key ('ntpc'), its topic ids, its
// revision task ids and its hand-written 40-day plan (ntpc/plan40.js). The others get a plan laid out
// from their syllabus (plan.js). Topic ids never change once shipped: progress and tasks point at them.
import * as NTPC from './ntpc/syllabus'
import { SSC_CGL } from './ssc/syllabus'
import { IBPS_PO } from './ibps/syllabus'

export const NTPC_EXAM = {
  id: NTPC.EXAM_ID, name: NTPC.EXAM_NAME, short: 'RRB NTPC', body: 'RRB',
  store: 'ntpc', revPrefix: 'ntpc-rev', tag: 'ntpc',
  levels: NTPC.CATEGORIES, subjects: NTPC.SUBJECTS, caCategories: NTPC.CA_CATEGORIES,
  caTopic: 'ga:national-current-affairs', caSubject: 'ga', plan40: true,
}

// Current-affairs records are filed under the same categories for every exam.
export const EXAMS = [NTPC_EXAM, SSC_CGL, IBPS_PO].map((e) => ({ caCategories: NTPC.CA_CATEGORIES, ...e }))
export const DEFAULT_EXAM = NTPC_EXAM.id
export const examById = (id) => EXAMS.find((e) => e.id === id) || EXAMS[0]
export const subjectOf = (exam, id) => exam.subjects.find((s) => s.id === id)
export const builtInTopics = (exam) => exam.subjects.flatMap((s) => s.topics)
