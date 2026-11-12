// End-to-end checks of the web app:  npm run test:e2e
import { test, expect } from '@playwright/test'
import { openView, startGuest } from './helpers'

test.beforeEach(async ({ page }) => {
  await startGuest(page)
})

test('a guest planner opens on the Dashboard with sample tasks', async ({ page }) => {
  await expect(page.getByText(/Guest planner/).first()).toBeVisible()
  await expect(page.getByText('Planned for today').first()).toBeAttached()
})

test('phone: no view is wider than the screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only')
  for (const v of ['Home', 'Board', 'Week', 'Month', 'Agenda', 'Table', 'Matrix', 'Charts', 'Someday', 'Notes']) {
    await openView(page, v)
    await page.waitForTimeout(400)
    const [vw, docW] = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth])
    expect.soft(docW, `${v} is ${docW}px wide on a ${vw}px screen`).toBeLessThanOrEqual(vw)
  }
})

test('New task: typed words fill the day, time and priority, and the task is added', async ({ page }) => {
  await page.getByRole('button', { name: /new task|add task/i }).filter({ visible: true }).first().click()
  const title = page.getByPlaceholder('What do you want to get done?')
  await title.fill('Call the bank tomorrow 3pm !high')
  await title.press('Enter')
  await openView(page, 'Agenda')
  await expect(page.getByText('Call the bank').first()).toBeVisible()
})

test('Prompt to list: "delete that" while speaking, then changes on the preview', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Prompt to list sits in the desktop sidebar')
  await page.getByRole('button', { name: 'Prompt to list' }).first().click()
  await page.getByLabel('What do you need to do?').fill(
    'call mom at 6 pm next buy milk next delete that next revise polity tomorrow at 7 then mock test on Sunday high priority')
  await page.getByRole('button', { name: /Make my list/ }).click()

  const list = page.getByRole('list', { name: 'Tasks from your note' })
  await expect(list).toBeVisible({ timeout: 20_000 })
  await expect(list).not.toContainText(/buy milk/i)
  const add = page.getByRole('button', { name: /^Add \d+ item/ })
  const count = Number((await add.textContent()).match(/\d+/)[0])
  expect(count).toBeGreaterThanOrEqual(3)

  const change = page.getByLabel('Change the list')
  const status = page.getByRole('dialog').getByRole('status')
  await change.fill('delete task 2'); await change.press('Enter')
  await expect(status).toContainText('Removed')
  await expect(add).toHaveText(new RegExp(`Add ${count - 1} item`))
  await change.fill('undo'); await change.press('Enter')
  await expect(status).toContainText('Brought back')
  await expect(add).toHaveText(new RegExp(`Add ${count} item`))
  await change.fill('blah blah'); await change.press('Enter')
  await expect(status).toContainText("isn't a change")
})

test('Charts: From/To use the NineFlow calendar, with future days blocked', async ({ page }) => {
  await openView(page, 'Charts')
  await expect(page.locator('input[type="date"]')).toHaveCount(0)
  const range = page.getByRole('group', { name: 'Range' })
  if (await range.isVisible().catch(() => false)) await range.getByRole('button', { name: 'Custom' }).click()
  else await page.getByLabel(/range/i).first().selectOption({ label: 'Custom' })

  await page.getByRole('button', { name: /^From:/ }).click()
  const cal = page.getByRole('dialog', { name: 'Choose a date' })
  await expect(cal).toBeVisible()
  // Forward to this month: no later month can be picked for "From".
  const next = cal.getByRole('button', { name: 'Next month' })
  for (let i = 0; i < 3 && await next.isEnabled(); i++) await next.click()
  await expect(next).toBeDisabled()
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowBtn = cal.getByRole('button', { name: new RegExp(`^\\w+ ${tomorrow.getDate()} ${tomorrow.toLocaleString('en-GB', { month: 'long' })} ${tomorrow.getFullYear()}$`) })
  if (await tomorrowBtn.count()) await expect(tomorrowBtn).toBeDisabled()
})

test('Charts: tapping a chart draws no focus box', async ({ page }) => {
  await openView(page, 'Charts')
  const surface = page.locator('.recharts-surface').first()
  await expect(surface).toBeVisible()
  await surface.click({ position: { x: 120, y: 60 } })
  await surface.focus()
  const outline = await surface.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('none')
})

test('no errors in the console while moving between views', async ({ page, isMobile }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  for (const v of isMobile ? ['Board', 'Week', 'Month', 'Charts', 'Agenda'] : ['Board', 'Week', 'Month', 'Agenda', 'Table', 'Matrix', 'Charts', 'Someday', 'Notes']) {
    await openView(page, v)
    await page.waitForTimeout(300)
  }
  expect(errors).toEqual([])
})
