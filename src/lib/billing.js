// Hourly rates and invoices. Settings keep one currency for the planner, your details for the invoice,
// an optional tax, the next invoice number, and per client a rate and the lines for "Bill to":
//   settings.billing = { currency, from, taxLabel, taxRate, nextNumber,
//                        clients: { [client name]: { rate, details } } }
// Money is worked out in the smallest unit (paise, cents) so totals never drift.

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED']

const localeCurrency = () => {
  try {
    const region = (navigator.language || '').split('-')[1]?.toUpperCase()
    return { IN: 'INR', US: 'USD', GB: 'GBP', AU: 'AUD', CA: 'CAD', SG: 'SGD', AE: 'AED' }[region]
      || (['DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'PT', 'AT', 'BE', 'FI'].includes(region) ? 'EUR' : 'INR')
  } catch { return 'INR' }
}

const num = (v, max) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(max, Number(v)) : 0)
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')

export function cleanBilling(raw) {
  const b = raw && typeof raw === 'object' ? raw : {}
  const clients = {}
  for (const [name, c] of Object.entries(b.clients || {}).slice(0, 200)) {
    if (typeof name !== 'string' || !name.trim() || name.length > 60) continue
    clients[name] = { rate: num(c?.rate, 1e7), details: str(c?.details, 500) }
  }
  return {
    currency: CURRENCIES.includes(b.currency) ? b.currency : localeCurrency(),
    from: str(b.from, 600),
    taxLabel: str(b.taxLabel, 20) || 'GST',
    taxRate: num(b.taxRate, 100),
    nextNumber: Math.max(1, Math.round(num(b.nextNumber, 1e6)) || 1),
    clients,
  }
}

export const rateOf = (billing, client) => billing?.clients?.[client]?.rate || 0

// 1234.5 → "₹1,234.50" in the device's way of writing numbers (Indian grouping on an Indian device).
export function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) } catch { return `${currency} ${amount.toFixed(2)}` }
}

const cents = (x) => Math.round(x * 100)
// Hours on an invoice are rounded to two places, and each line's amount is worked out from those hours,
// so the printed hours × rate always matches the printed amount.
export const invoiceHours = (minutes) => Math.round((minutes / 60) * 100) / 100

// The invoice for one client: its billable tasks with time in the range (rows from clientHours), the rate,
// tax and totals. Lines are [{ title, hours, rate, amount }], biggest first.
export function buildInvoice({ client, rows, billing }) {
  const rate = rateOf(billing, client)
  const lines = rows.filter((r) => r.client === client && r.billable && r.minutes > 0)
    .map((r) => { const hours = invoiceHours(r.minutes); return { title: r.title, hours, rate, amount: cents(hours * rate) / 100 } })
    .sort((a, b) => b.amount - a.amount || b.hours - a.hours)
  const subtotalC = lines.reduce((s, l) => s + cents(l.amount), 0)
  const taxRate = billing?.taxRate || 0
  const taxC = Math.round((subtotalC * taxRate) / 100)
  return {
    client, rate, lines,
    hours: Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100,
    subtotal: subtotalC / 100,
    taxLabel: billing?.taxLabel || 'Tax', taxRate, tax: taxC / 100,
    total: (subtotalC + taxC) / 100,
  }
}

// "INV-2026-0007": the year and the running number.
export const invoiceNumber = (n, date = new Date()) => `INV-${date.getFullYear()}-${String(n).padStart(4, '0')}`
