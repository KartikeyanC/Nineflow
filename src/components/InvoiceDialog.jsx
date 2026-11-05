import React, { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { buildInvoice, invoiceNumber, money } from '../lib/billing'
import { format } from '../lib/dateFormat'
import { isNativeApp } from '../lib/platform'
import { Modal } from './ui'

// An invoice for one client over the Hours by client range (views/Charts.jsx): its billable tasks, each
// task's hours × the client's rate, tax and the total. "Print or save as PDF" uses the system print
// window (choose "Save as PDF" there); the phone app has none, so it downloads the invoice as a page
// to open and share. Either way, and the CSV, uses up the invoice number (Settings → Billing).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const lines = (s) => esc(s).split('\n').join('<br>')
const hrs = (h) => h.toFixed(2)

function invoiceHtml({ inv, number, date, from, billTo, period, currency }) {
  const m = (x) => esc(money(x, currency))
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(number)}</title><style>
  *{box-sizing:border-box}body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:40px}
  h1{font-size:28px;margin:0 0 4px}.muted{color:#666}.row{display:flex;justify-content:space-between;gap:24px;margin:28px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:8px 6px;border-bottom:1px solid #e5e5e5;text-align:left}
  th{font-size:12px;color:#666;font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
  .tot td{border:0;padding:4px 6px}.grand td{font-size:16px;font-weight:700;border-top:2px solid #111;padding-top:8px}
  @page{margin:16mm}@media print{body{padding:0}}</style></head><body>
  <div class="row" style="margin-top:0"><div><h1>Invoice</h1><div class="muted">${esc(number)}</div></div>
  <div style="text-align:right">${lines(from) || '<span class="muted">Add your details in Settings → Billing</span>'}</div></div>
  <div class="row"><div><div class="muted">Bill to</div><b>${esc(inv.client)}</b><br>${lines(billTo)}</div>
  <div style="text-align:right"><div class="muted">Date</div>${esc(date)}<div class="muted" style="margin-top:6px">Period</div>${esc(period)}</div></div>
  <table><thead><tr><th>Work</th><th class="n">Hours</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
  ${inv.lines.map((l) => `<tr><td>${esc(l.title)}</td><td class="n">${hrs(l.hours)}</td><td class="n">${m(l.rate)}</td><td class="n">${m(l.amount)}</td></tr>`).join('')}
  </tbody></table>
  <table style="width:auto;margin-left:auto;margin-top:12px"><tbody>
  <tr class="tot"><td class="muted">Subtotal (${hrs(inv.hours)} h)</td><td class="n">${m(inv.subtotal)}</td></tr>
  ${inv.taxRate ? `<tr class="tot"><td class="muted">${esc(inv.taxLabel)} ${inv.taxRate}%</td><td class="n">${m(inv.tax)}</td></tr>` : ''}
  <tr class="grand"><td>Total</td><td class="n">${m(inv.total)}</td></tr></tbody></table>
  </body></html>`
}

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function InvoiceDialog({ client, rows, win, onClose }) {
  const { settings, updateSettings } = usePlanner()
  const billing = settings.billing
  const inv = useMemo(() => buildInvoice({ client, rows, billing }), [client, rows, billing])
  const [number, setNumber] = useState(() => invoiceNumber(billing.nextNumber))
  const [billTo, setBillTo] = useState(billing.clients[client]?.details || '')
  const date = format(new Date(), 'd MMM yyyy')
  const period = `${format(win.from, 'd MMM yyyy')} – ${format(win.to, 'd MMM yyyy')}`
  const noRate = !inv.rate

  // Keep the client's details, and move the running number on when this one was used.
  const used = () => {
    const old = billing.clients[client] || { rate: 0, details: '' }
    updateSettings({
      billing: {
        ...billing,
        clients: { ...billing.clients, [client]: { ...old, details: billTo.slice(0, 500) } },
        nextNumber: number === invoiceNumber(billing.nextNumber) ? billing.nextNumber + 1 : billing.nextNumber,
      },
    })
  }
  const html = () => invoiceHtml({ inv, number, date, from: billing.from, billTo, period, currency: billing.currency })
  const fileBase = `${number}-${client}`.replace(/[^\w.-]+/g, '-')

  const print = () => {
    if (isNativeApp()) { save(`${fileBase}.html`, html(), 'text/html'); used(); return }
    const frame = Object.assign(document.createElement('iframe'), { title: 'Invoice' })
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(frame)
    frame.contentDocument.open(); frame.contentDocument.write(html()); frame.contentDocument.close()
    setTimeout(() => {
      frame.contentWindow.focus(); frame.contentWindow.print()
      setTimeout(() => frame.remove(), 1000)
    }, 150)
    used()
  }
  const csv = () => {
    const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
    const rowsOut = [
      ['Invoice', number], ['Date', date], ['Client', client], ['Period', period], [],
      ['Work', 'Hours', `Rate (${billing.currency})`, `Amount (${billing.currency})`],
      ...inv.lines.map((l) => [l.title, hrs(l.hours), l.rate.toFixed(2), l.amount.toFixed(2)]),
      [], ['Subtotal', hrs(inv.hours), '', inv.subtotal.toFixed(2)],
      ...(inv.taxRate ? [[`${inv.taxLabel} ${inv.taxRate}%`, '', '', inv.tax.toFixed(2)]] : []),
      ['Total', '', '', inv.total.toFixed(2)],
    ]
    save(`${fileBase}.csv`, `${rowsOut.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`, 'text/csv;charset=utf-8')
    used()
  }

  return (
    <Modal open onClose={onClose} title={`Invoice for ${client}`} width="max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Invoice number</span>
          <input className="input" value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} /></label>
        <div><span className="block text-xs font-semibold text-muted mb-1">Period</span><p className="input bg-page text-muted">{period}</p></div>
        <label className="block sm:col-span-2"><span className="block text-xs font-semibold text-muted mb-1">Bill to: {client}</span>
          <textarea className="input h-20 resize-y" value={billTo} placeholder="Their address, GSTIN, contact (kept for the next invoice)" onChange={(e) => setBillTo(e.target.value)} /></label>
      </div>

      {noRate && <p role="alert" className="mt-4 rounded-xl bg-peach text-peach-fg px-3 py-2 text-sm font-semibold">Set an hourly rate for {client} in the table first: every amount is 0 without one.</p>}

      <div className="mt-4 rounded-2xl border border-line overflow-x-auto">
        <table className="w-full text-sm tnum">
          <thead><tr className="text-left text-xs text-muted border-b border-line">
            <th className="py-2 px-3 font-semibold">Work</th><th className="py-2 px-3 font-semibold text-right">Hours</th>
            <th className="py-2 px-3 font-semibold text-right">Rate</th><th className="py-2 px-3 font-semibold text-right">Amount</th>
          </tr></thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="py-1.5 px-3">{l.title}</td><td className="py-1.5 px-3 text-right">{hrs(l.hours)}</td>
                <td className="py-1.5 px-3 text-right">{money(l.rate, billing.currency)}</td><td className="py-1.5 px-3 text-right">{money(l.amount, billing.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="py-1.5 px-3 text-muted" colSpan={3}>Subtotal ({hrs(inv.hours)} h)</td><td className="py-1.5 px-3 text-right">{money(inv.subtotal, billing.currency)}</td></tr>
            {inv.taxRate > 0 && <tr><td className="py-1.5 px-3 text-muted" colSpan={3}>{inv.taxLabel} {inv.taxRate}%</td><td className="py-1.5 px-3 text-right">{money(inv.tax, billing.currency)}</td></tr>}
            <tr className="border-t border-line"><td className="py-2 px-3 font-bold" colSpan={3}>Total</td><td className="py-2 px-3 text-right font-bold">{money(inv.total, billing.currency)}</td></tr>
          </tfoot>
        </table>
      </div>
      {!billing.from && <p className="text-xs text-faint mt-2">Your name, address and tax details go at the top: add them in Settings → Billing and invoices.</p>}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={csv}><Download size={14} /> CSV</button>
        <button type="button" className="btn-black" onClick={print}><Printer size={14} /> {isNativeApp() ? 'Download invoice' : 'Print or save as PDF'}</button>
      </div>
    </Modal>
  )
}
