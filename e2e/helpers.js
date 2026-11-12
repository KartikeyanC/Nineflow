// Shared steps for the end-to-end tests.
import { expect } from '@playwright/test'

// A fresh guest planner with the sample data, on the Dashboard.
export async function startGuest(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try it without an account' }).click()
  // Setup: skip the optional steps, give a name, keep "Start with sample data" on.
  for (let i = 0; i < 8; i++) {
    const open = page.getByRole('button', { name: /Open my planner/ })
    if (await open.isVisible().catch(() => false)) break
    const name = page.locator('#setup-name')
    if (await name.isVisible().catch(() => false) && !(await name.inputValue())) await name.fill('Tester')
    const skip = page.getByRole('button', { name: 'Skip', exact: true })
    if (await skip.isVisible().catch(() => false)) await skip.click()
    else await page.getByRole('button', { name: /^Continue/ }).click()
  }
  await expect(page.getByRole('switch', { name: 'Start with sample data' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: /Open my planner/ }).click()
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
}

// Opens a view from the sidebar (desktop) or the bottom bar's More sheet (phone).
export async function openView(page, label) {
  const sidebar = page.locator('aside').getByRole('button', { name: label, exact: true }).filter({ visible: true })
  if (await sidebar.count()) { await sidebar.first().click(); return }
  const bar = page.locator('nav').getByRole('button', { name: label, exact: true }).filter({ visible: true })
  if (await bar.count()) { await bar.first().click(); return }
  // The bar's last tab opens the More sheet (it is named after the view when one from the sheet is open).
  await page.locator('nav button[aria-haspopup="dialog"]').filter({ visible: true }).first().click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: label, exact: true }).click()
}
