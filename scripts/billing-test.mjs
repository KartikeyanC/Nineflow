// Tests for hourly rates and invoices (src/lib/billing.js):  npm run test:billing
import { buildInvoice, cleanBilling, invoiceHours, invoiceNumber, money, rateOf } from '../src/lib/billing.js'

let pass = 0, fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }

const billing = cleanBilling({ currency: 'INR', taxLabel: 'GST', taxRate: 18, nextNumber: 7, clients: { Acme: { rate: 1500, details: 'Pune' }, Bright: { rate: 999.99 } } })
ok(billing.currency === 'INR' && billing.taxRate === 18 && billing.nextNumber === 7, 'settings are kept')
ok(rateOf(billing, 'Acme') === 1500 && rateOf(billing, 'Nobody') === 0, 'a client without a rate has 0')

const clean = cleanBilling({ currency: 'XYZ', taxRate: -5, nextNumber: 0, clients: { '': { rate: 5 }, Ok: { rate: 'abc' } } })
ok(clean.currency !== 'XYZ' && clean.taxRate === 0 && clean.nextNumber === 1, 'bad values are cleaned', JSON.stringify(clean))
ok(!('' in clean.clients) && clean.clients.Ok.rate === 0, 'an empty client name is dropped; a bad rate becomes 0')

ok(invoiceHours(100) === 1.67 && invoiceHours(45) === 0.75, 'hours round to two places (100 min = 1.67 h)')

const rows = [
  { client: 'Acme', title: 'Logo', minutes: 100, billable: true },
  { client: 'Acme', title: 'Call', minutes: 45, billable: true },
  { client: 'Acme', title: 'Internal notes', minutes: 60, billable: false },
  { client: 'Bright', title: 'Site', minutes: 60, billable: true },
]
const inv = buildInvoice({ client: 'Acme', rows, billing })
ok(inv.lines.length === 2 && inv.lines.every((l) => l.title !== 'Internal notes'), 'only billable tasks of that client are on it')
ok(inv.lines[0].title === 'Logo' && inv.lines[0].amount === 2505, 'each line is its rounded hours × rate (1.67 × 1500 = 2505)', JSON.stringify(inv.lines[0]))
ok(inv.subtotal === 3630 && inv.hours === 2.42, 'subtotal is the sum of the lines (2505 + 1125)', `${inv.subtotal} ${inv.hours}`)
ok(inv.tax === 653.4 && inv.total === 4283.4, 'GST 18% and the total', `${inv.tax} ${inv.total}`)

const odd = buildInvoice({ client: 'Bright', rows, billing })
ok(odd.subtotal === 999.99 && odd.tax === 180 && odd.total === 1179.99, 'totals stay exact in paise (999.99 + 18%)', `${odd.subtotal} ${odd.tax} ${odd.total}`)

const none = buildInvoice({ client: 'Acme', rows, billing: { ...billing, taxRate: 0 } })
ok(none.tax === 0 && none.total === none.subtotal, 'no tax: the total is the subtotal')

ok(invoiceNumber(7, new Date(2026, 10, 5)) === 'INV-2026-0007', 'invoice numbers carry the year and four digits')
ok(/1,?500\.00/.test(money(1500, 'INR')) && /₹|INR/.test(money(1500, 'INR')), 'money is written with its currency', money(1500, 'INR'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
