import React from 'react'
import { Modal } from './ui'

// The keyboard shortcuts, opened with ? (or from the command palette).
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
const MOD = isMac ? '⌘' : 'Ctrl'

const GROUPS = [
  ['Anywhere', [
    [['N'], 'New task'],
    [[MOD, 'K'], 'Search tasks and notes, go to any screen'],
    [[MOD, 'I'], 'Log an interruption'],
    [[MOD, 'Z'], 'Undo, while the undo message shows'],
    [['?'], 'Show these shortcuts'],
    [['Esc'], 'Close what is open'],
  ]],
  ['Focus mode', [[['Space'], 'Pause or resume the timer']]],
  ['Revise', [[['Space'], 'Show the answer'], [['1'], 'Forgot'], [['2'], 'Knew it']]],
]

export default function Shortcuts({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-md">
      <div className="space-y-5">
        {GROUPS.map(([title, rows]) => (
          <section key={title}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">{title}</h3>
            <dl className="space-y-1.5">
              {rows.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-ink">{what}</dt>
                  <dd className="flex gap-1 shrink-0">
                    {keys.map((k) => <kbd key={k} className="min-w-[1.75rem] h-7 px-2 inline-flex items-center justify-center rounded-lg border border-line bg-page text-xs font-semibold">{k}</kbd>)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
