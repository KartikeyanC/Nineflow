// Captures real NineFlow screens (guest planner with sample data) for the Behance pages.
//   node design/behance/capture.mjs [baseUrl]
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'shots')
mkdirSync(out, { recursive: true })
const BASE = process.argv[2] || 'http://localhost:5174'

async function startGuest(page) {
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Try it without an account' }).click()
  for (let i = 0; i < 8; i++) {
    const open = page.getByRole('button', { name: /Open my planner/ })
    if (await open.isVisible().catch(() => false)) break
    const name = page.locator('#setup-name')
    if (await name.isVisible().catch(() => false) && !(await name.inputValue())) await name.fill('Kartikeyan')
    const skip = page.getByRole('button', { name: 'Skip', exact: true })
    if (await skip.isVisible().catch(() => false)) await skip.click()
    else await page.getByRole('button', { name: /^Continue/ }).click()
  }
  await page.getByRole('button', { name: /Open my planner/ }).click()
  await page.getByText(/Good (morning|afternoon|evening)/).first().waitFor()
}

async function openView(page, label) {
  const sidebar = page.locator('aside').getByRole('button', { name: label, exact: true }).filter({ visible: true })
  if (await sidebar.count()) { await sidebar.first().click(); return }
  const bar = page.locator('nav').getByRole('button', { name: label, exact: true }).filter({ visible: true })
  if (await bar.count()) { await bar.first().click(); return }
  await page.locator('nav button[aria-haspopup="dialog"]').filter({ visible: true }).first().click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: label, exact: true }).click()
}

async function setTheme(page, theme) {
  await page.evaluate((theme) => {
    for (const k of Object.keys(localStorage)) {
      if (!k.endsWith('settings')) continue
      try { const s = JSON.parse(localStorage.getItem(k)); if (s && 'theme' in s) { s.theme = theme; localStorage.setItem(k, JSON.stringify(s)) } } catch { /* skip */ }
    }
  }, theme)
  await page.reload()
  await page.getByText(/Good (morning|afternoon|evening)/).first().waitFor()
}

const settle = (page) => page.waitForTimeout(900)
// Hide the guest banner and passing toasts, so each screen shows the planner itself.
const clean = (page) => page.evaluate(() => {
  const hideUp = (el) => {
    let top = el
    while (top.parentElement && top.parentElement.innerText.length < 220 && !top.parentElement.matches('nav, aside, main') && !top.parentElement.querySelector('nav, aside, main') &&top.parentElement !== document.body) top = top.parentElement
    top.style.setProperty('display', 'none', 'important')
  }
  for (const el of document.querySelectorAll('p, span, div')) {
    if (el.children.length > 3) continue
    const t = el.innerText || ''
    if (t.length > 220) continue
    if (/^Guest planner\./.test(t.trim())) hideUp(el)
    if (/^Carried \d+ unfinished/.test(t.trim())) hideUp(el)
  }
})
const shot = async (page, name) => { await settle(page); await clean(page); await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('saved', name) }
const hideBanner = (page) => page.addStyleTag({ content: '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none}' })

async function openFirstTask(page) {
  await openView(page, 'Agenda')
  await settle(page)
  await page.locator('main').getByText(/Typography audit|Sprint planning|Customer call|Gym session|Polish dashboard/).filter({ visible: true }).first().click()
  await page.getByRole('dialog').filter({ has: page.getByRole('region', { name: 'Change history' }) }).first().waitFor({ timeout: 5000 }).catch(() => {})
}

async function addNotes(page) {
  await openView(page, 'Notes')
  const notes = [
    'Ideas for the portfolio site\n- case study for NineFlow\n- dark mode screens\n#design',
    'Exam plan: polity on Mon/Wed, maths mock every Sunday. #ntpc',
    'What is the capital of Australia? :: Canberra',
    'https://www.behance.net\nCollect references for the cover',
  ]
  for (const text of notes) {
    await page.getByRole('button', { name: /New note/ }).filter({ visible: true }).first().click()
    await page.waitForTimeout(400)
    await page.keyboard.type(text) // the new note takes the focus
    await page.locator('h1, h2').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(300)
  }
}

const browser = await chromium.launch({ channel: 'chrome' })

// Desktop
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme })
  const page = await ctx.newPage()
  await startGuest(page)
  if (theme === 'dark') await setTheme(page, 'dark')
  await hideBanner(page)
  if (theme === 'light') await addNotes(page)
  const views = theme === 'light' ? ['Dashboard', 'Board', 'Week', 'Month', 'Charts', 'Matrix', 'Notes', 'Table'] : ['Dashboard', 'Week', 'Board']
  for (const v of views) { await openView(page, v); await shot(page, `desk-${theme}-${v.toLowerCase()}`) }
  if (theme === 'light') {
    await openFirstTask(page); await shot(page, 'desk-light-task')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Prompt to list' }).first().click()
    await page.getByLabel('What do you need to do?').fill('call mom at 6 pm next revise polity tomorrow at 7 next mock test on Sunday high priority next pay electricity bill friday')
    await page.getByRole('button', { name: /Make my list/ }).click()
    await page.getByRole('list', { name: 'Tasks from your note' }).waitFor({ timeout: 20000 })
    await page.waitForTimeout(1200)
    await shot(page, 'desk-light-prompt')
    await page.keyboard.press('Escape')
  }
  await ctx.close()
}

// Phone
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: theme })
  const page = await ctx.newPage()
  await startGuest(page)
  if (theme === 'dark') await setTheme(page, 'dark')
  await hideBanner(page)
  if (theme === 'light') await addNotes(page)
  const views = theme === 'light' ? ['Home', 'Board', 'Week', 'Month', 'Agenda', 'Charts', 'Notes', 'Matrix'] : ['Home', 'Week', 'Board', 'Month']
  for (const v of views) {
    try { await openView(page, v) } catch (e) {
      await page.screenshot({ path: path.join(here, 'debug.png') })
      console.log(await page.evaluate(() => [...document.querySelectorAll('nav')].map((n) => [getComputedStyle(n).display, n.closest('[style*="none"]')?.outerHTML.slice(0, 200)])))
      throw e
    }
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, `phone-${theme}-${v.toLowerCase()}`)
  }
  if (theme === 'light') { await openFirstTask(page); await shot(page, 'phone-light-task') }
  await ctx.close()
}

await browser.close()
