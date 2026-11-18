// Captures the main NineFlow screens (guest planner with sample data) for the Behance pages.
//   node design/behance/capture.mjs [baseUrl]
import { chromium, devices } from '@playwright/test'
import { addNotes, fixClock, openTask, openView, setTheme, shot, startGuest } from './helpers.mjs'

const NOTES = [
  'Ideas for the portfolio site\n- case study for NineFlow\n- dark mode screens\n#design',
  'Exam plan: polity on Mon/Wed, CSAT mock every Sunday. #upsc',
  'What is the capital of Australia? :: Canberra',
  'https://www.behance.net\nCollect references for the cover',
]

// Optional: ONLY=phone skips desktop; PHONE_W/PHONE_H set the phone viewport; FIX_TIME starts the clock at that moment.
const PHONE = { width: Number(process.env.PHONE_W || 390), height: Number(process.env.PHONE_H || 844) }
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' })

// Desktop
for (const theme of process.env.ONLY === 'phone' ? [] : ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DESK_SCALE || 2), colorScheme: theme })
  const page = await ctx.newPage()
  await startGuest(page)
  if (theme === 'dark') await setTheme(page, 'dark')
  if (theme === 'light') await addNotes(page, NOTES)
  const views = theme === 'light' ? ['Dashboard', 'Board', 'Week', 'Month', 'Charts', 'Matrix', 'Notes', 'Table'] : ['Dashboard', 'Week', 'Board']
  for (const v of views) { await openView(page, v); await shot(page, `desk-${theme}-${v.toLowerCase()}`) }
  if (theme === 'light') {
    await openTask(page); await shot(page, 'desk-light-task')
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
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: PHONE, bypassCSP: true, ...(process.env.PW_LOCALE ? { locale: process.env.PW_LOCALE } : {}), deviceScaleFactor: 3, colorScheme: theme })
  await fixClock(ctx)
  const page = await ctx.newPage()
  await startGuest(page)
  if (theme === 'dark') await setTheme(page, 'dark')
  if (theme === 'light') await addNotes(page, NOTES)
  const views = theme === 'light' ? ['Home', 'Board', 'Week', 'Month', 'Agenda', 'Charts', 'Notes', 'Matrix'] : ['Home', 'Week', 'Board', 'Month', 'Charts']
  for (const v of views) {
    await openView(page, v)
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot(page, `phone-${theme}-${v.toLowerCase()}`)
  }
  if (theme === 'light') { await openTask(page); await shot(page, 'phone-light-task') }
  await ctx.close()
}

await browser.close()
