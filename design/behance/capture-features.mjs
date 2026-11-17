// Captures the feature screens for the extra Behance pages (guest planner with sample data).
//   node design/behance/capture-features.mjs [baseUrl] [onlyStep]
import { chromium, devices } from '@playwright/test'
import { addNotes, openTask, openView, patchStorage, settle, shot, startGuest } from './helpers.mjs'

const only = process.argv[3]
const failed = []
async function step(page, name, fn) {
  if (only && !name.includes(only)) return
  try { await fn() } catch (e) {
    failed.push(name)
    console.log('FAILED', name, '-', e.message.split('\n').slice(0, 3).join(' | '))
    if (process.env.DEBUG_SHOTS) await page.screenshot({ path: `${process.env.DEBUG_SHOTS}/fail-${name}.png` }).catch(() => {})
  }
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) }
}

const FLASHCARDS = [
  'Polity flashcards #upsc\nWho appoints the Chief Election Commissioner? :: The President\nArticle 21 protects? :: Life and personal liberty\nFundamental Duties were added by? :: The 42nd Amendment',
  'What is 15% of 240? :: 36',
]

// Billable work for two clients, so Charts → Hours by client and the invoice have something to show.
const CLIENTS = `return list.map((t, i) => /work|design|learn/i.test(String(t.category)) ? { ...t, client: i % 3 ? 'Acme Studio' : 'Bright Labs', billable: true } : t)`
const BILLING = { currency: 'USD', from: 'Kartikeyan\nProduct designer', taxLabel: 'GST', taxRate: 18, nextNumber: 12, clients: { 'Acme Studio': { rate: 45, details: 'Acme Studio\n21 Park Road' }, 'Bright Labs': { rate: 60, details: '' } } }

const pickDay = async (page, daysAhead) => {
  const cal = page.getByRole('dialog', { name: 'Choose a date' })
  const d = new Date(); d.setDate(d.getDate() + daysAhead)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  for (let i = 0; i < 3 && !(await cal.locator(`button[data-date="${key}"]`).count()); i++) await cal.getByRole('button', { name: 'Next month' }).click()
  await cal.locator(`button[data-date="${key}"]`).click()
}

async function features(page, prefix, isPhone) {
  await step(page, 'quickadd', async () => {
    await page.getByRole('button', { name: /new task|add task/i }).filter({ visible: true }).first().click()
    await page.getByPlaceholder('What do you want to get done?').fill('Edit trailer tomorrow 2pm 90m #work !high')
    await shot(page, `${prefix}-quickadd`)
  })

  await step(page, 'interrupt', async () => {
    if (isPhone) return
    await page.getByRole('button', { name: 'Interruption' }).filter({ visible: true }).first().click()
    await page.locator('#interrupt-what').fill('Fix the banner for the client')
    await page.locator('#interrupt-by').fill('Manager')
    await shot(page, `${prefix}-interrupt`)
  })

  await step(page, 'goal', async () => {
    // A long working day for this shot only, so no sample-data day counts as full ("Skipped N days").
    await patchStorage(page, { settings: { workHours: { start: '07:00', end: '23:00', breakMinutes: 0 } } })
    if (isPhone) await page.keyboard.press('Control+k').catch(() => {})
    const btn = page.getByRole('button', { name: 'Plan a goal' }).filter({ visible: true })
    if (await btn.count()) await btn.first().click()
    else await page.getByRole('dialog').getByText('Plan a goal', { exact: true }).first().click()
    await page.getByPlaceholder(/Maths exam/).fill('UPSC Prelims')
    await page.locator('button:has-text("Pick a date")').filter({ visible: true }).last().click()
    await pickDay(page, 24)
    await page.getByPlaceholder(/Chapter 1/).fill('Polity\nModern history\nGeography\nIndian economy\nEnvironment\nScience and tech\nCurrent affairs')
    await shot(page, `${prefix}-goal-form`)
    await page.getByPlaceholder(/Maths exam/).press('Enter') // submits the form (the button can sit below the fold)
    await page.getByRole('list', { name: 'Planned tasks' }).waitFor({ timeout: 8000 })
    await shot(page, `${prefix}-goal-plan`)
    await page.keyboard.press('Escape').catch(() => {})
    await patchStorage(page, { settings: { workHours: { start: '09:00', end: '18:00', breakMinutes: 60 } } })
  })

  await step(page, 'palette', async () => {
    if (isPhone) return
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)
    await page.keyboard.type('pla')
    await shot(page, `${prefix}-palette`)
  })

  await step(page, 'voice', async () => {
    if (isPhone) return
    await page.getByRole('button', { name: 'Prompt to list' }).first().click()
    await page.getByLabel('What do you need to do?').fill('call mom at 6 pm next buy milk next delete that next revise polity tomorrow at 7 next mock test on Sunday high priority')
    await shot(page, `${prefix}-voice`)
  })

  await step(page, 'checklist', async () => {
    await openTask(page, /Gym session/)
    const add = page.getByRole('dialog').getByLabel('Add a step').first()
    for (const s of ['Warm up for 10 minutes', 'Legs: squats 4 × 10', 'Core: plank 3 × 1 min', 'Stretch and cool down']) { await add.fill(s); await add.press('Enter') }
    await page.getByRole('dialog').getByRole('checkbox').first().click().catch(() => {})
    await page.getByRole('dialog').locator('section[aria-label="Checklist"]').first().scrollIntoViewIfNeeded().catch(() => {})
    await shot(page, `${prefix}-checklist`)
    await page.getByRole('dialog').getByRole('button', { name: 'Completed', exact: true }).first().click()
    await shot(page, `${prefix}-finishgate`)
  })

  await step(page, 'focus', async () => {
    await openTask(page, /Rust tutorial|Gym session/)
    await page.getByRole('dialog').getByRole('button', { name: /Focus · \d+ min/ }).first().click()
    await page.waitForTimeout(2500)
    await shot(page, `${prefix}-focus`)
    // End the session, so the timer and its pill don't show on later screens.
    await page.getByRole('button', { name: /^End/ }).filter({ visible: true }).first().click()
    const confirm = page.getByRole('button', { name: /End (session|focus)|Yes, end|^End$/ }).filter({ visible: true })
    if (await confirm.count().catch(() => 0)) await confirm.first().click().catch(() => {})
  })

  await step(page, 'ask', async () => {
    if (isPhone) return
    await page.getByRole('button', { name: 'Ask NineFlow' }).filter({ visible: true }).first().click()
    await page.getByLabel('Your question').fill("What's overdue, and how many hours did I log on Design this week?")
    await shot(page, `${prefix}-ask`)
  })

  await step(page, 'revise', async () => {
    await openView(page, 'Revise')
    await settle(page)
    await shot(page, `${prefix}-revise`)
    const show = page.getByRole('button', { name: /Show( the)? answer/i }).filter({ visible: true })
    if (await show.count()) { await show.first().click(); await shot(page, `${prefix}-revise-answer`) }
  })

  await step(page, 'workspaces', async () => {
    if (isPhone) return
    await openView(page, 'Dashboard')
    await page.locator('aside').getByRole('button', { name: /My planner/ }).first().click()
    await shot(page, `${prefix}-workspaces`)
  })

  await step(page, 'history', async () => {
    if (isPhone) return
    await openView(page, 'Settings')
    await settle(page)
    await page.getByText('Version history', { exact: true }).first().scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -80))
    await shot(page, `${prefix}-versions`)
  })

  await step(page, 'invoice', async () => {
    if (isPhone) return
    await patchStorage(page, { tasks: CLIENTS, settings: { billing: BILLING } })
    await openView(page, 'Charts')
    await settle(page)
    const head = page.getByText('Hours by client', { exact: true }).first()
    await head.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -60))
    await shot(page, `${prefix}-clients`)
    await page.getByRole('button', { name: 'Invoice', exact: true }).first().click()
    await shot(page, `${prefix}-invoice`)
  })
}

const browser = await chromium.launch({ channel: 'chrome' })

// Desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })
  const page = await ctx.newPage()
  await startGuest(page)
  await addNotes(page, FLASHCARDS)
  await features(page, 'feat', false)
  // Colour themes: the same Dashboard in each palette.
  for (const id of ['ocean', 'forest', 'berry', 'graphite']) {
    await step(page, `theme-${id}`, async () => {
      await patchStorage(page, { settings: { palette: id } })
      await openView(page, 'Dashboard')
      await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, [class*=overflow-y]').forEach((e) => { e.scrollTop = 0 }) })
      await shot(page, `theme-${id}`)
    })
  }
  await ctx.close()
}

// Phone
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'light' })
  const page = await ctx.newPage()
  await startGuest(page)
  await addNotes(page, FLASHCARDS)
  await features(page, 'phone-feat', true)
  for (const id of ['ocean', 'forest', 'berry']) {
    await step(page, `theme-${id}`, async () => {
      await patchStorage(page, { settings: { palette: id } })
      await openView(page, 'Home')
      await page.evaluate(() => window.scrollTo(0, 0))
      await shot(page, `phone-theme-${id}`)
    })
  }
  await ctx.close()
}

await browser.close()
console.log(failed.length ? `Failed: ${failed.join(', ')}` : 'All steps done')
