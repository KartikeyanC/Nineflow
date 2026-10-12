import React, { useState } from 'react'
import { Download, CheckCircle2, Share, PlusSquare, MoreVertical, Smartphone, Monitor } from 'lucide-react'
import { promptInstall, useInstall } from '../lib/pwa'

// Settings → install the planner as an app on this phone, tablet or computer.
export default function InstallApp() {
  const state = useInstall()
  const [busy, setBusy] = useState(false)

  const install = async () => {
    setBusy(true)
    try { await promptInstall() } finally { setBusy(false) }
  }

  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl shrink-0 ring-1 ring-line" />
        <div className="flex-1 min-w-0">
          <h2 className="h-display text-base mb-1">Install the app</h2>
          <p className="text-sm text-muted">
            Put NineFlow on your home screen, dock or Start menu. It opens in its own window, works offline, and stays in sync through your Google Drive.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {state === 'installed' && (
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-mint-fg"><CheckCircle2 size={16} /> Installed — you're using the app.</p>
        )}

        {state === 'prompt' && (
          <button type="button" className="btn-black" onClick={install} disabled={busy}><Download size={14} /> Install NineFlow</button>
        )}

        {state === 'ios' && (
          <ol className="space-y-2 text-sm">
            <Step n={1}>Tap <Share size={14} className="inline -mt-0.5" /> <b>Share</b> in Safari's toolbar.</Step>
            <Step n={2}>Choose <PlusSquare size={14} className="inline -mt-0.5" /> <b>Add to Home Screen</b>, then <b>Add</b>.</Step>
          </ol>
        )}

        {state === 'manual' && (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-page p-3.5">
              <p className="font-semibold inline-flex items-center gap-1.5"><Smartphone size={14} /> Phone or tablet</p>
              <p className="text-muted mt-1">Android: browser menu <MoreVertical size={13} className="inline -mt-0.5" /> → <b className="text-ink">Install app</b> or <b className="text-ink">Add to Home screen</b>. iPhone and iPad: Safari → Share → <b className="text-ink">Add to Home Screen</b>.</p>
            </div>
            <div className="rounded-2xl bg-page p-3.5">
              <p className="font-semibold inline-flex items-center gap-1.5"><Monitor size={14} /> Computer</p>
              <p className="text-muted mt-1">Open the planner in Chrome or Edge and click the install icon at the right of the address bar, or menu → <b className="text-ink">Install NineFlow</b>.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Step({ n, children }) {
  return (
    <li className="flex items-center gap-3">
      <span className="h-6 w-6 rounded-full bg-page border border-line text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <span>{children}</span>
    </li>
  )
}
