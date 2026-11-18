// Shared steps for the Behance capture scripts (capture.mjs, capture-features.mjs).
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const out = process.env.SHOTS_DIR || path.join(here, 'shots') // SHOTS_DIR: capture somewhere else (e.g. a 4K set)
mkdirSync(out, { recursive: true })
export const BASE = process.argv[2] || 'http://localhost:5174'

// FIX_TIME: make the app believe it is that moment (only Date moves; timers stay real).
export async function fixClock(ctx) {
  if (!process.env.FIX_TIME) return
  const off = new Date(process.env.FIX_TIME).getTime() - Date.now()
  await ctx.addInitScript((off) => {
    const D = Date
    window.Date = new Proxy(D, {
      construct: (t, a, n) => Reflect.construct(t, a.length ? a : [D.now() + off], n),
      apply: () => new D(D.now() + off).toString(),
      get: (t, k) => (k === 'now' ? () => D.now() + off : Reflect.get(t, k)),
    })
  }, off)
}

const greeting = (page) => page.getByText(/Good (morning|afternoon|evening)/).first().waitFor()

// A fresh guest planner with the sample data.
export async function startGuest(page) {
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
  await greeting(page)
  await page.addStyleTag({ content: '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none}' })
  if (process.env.APP_CLOCK) await patchStorage(page, { settings: { clock: process.env.APP_CLOCK } }) // '12' or '24'
}

// Sidebar on desktop; the bottom bar or its More sheet on a phone.
export async function openView(page, label) {
  // A badge can follow the name ("Revise 1"), so match the start of it.
  const name = new RegExp(`^${label}\\b`)
  const sidebar = page.locator('aside').getByRole('button', { name }).filter({ visible: true })
  if (await sidebar.count()) { await sidebar.first().click(); return }
  // The bar's More tab takes the name of the view open from it, so skip that one here.
  const bar = page.locator('nav button:not([aria-haspopup])').filter({ visible: true }).filter({ hasText: name })
  if (await bar.count()) { await bar.first().click(); return }
  await page.locator('nav button[aria-haspopup="dialog"]').filter({ visible: true }).first().click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: label, exact: true }).click()
}

// Changes saved settings (e.g. { theme: 'dark' } or { palette: 'ocean' }) and/or tasks, then reloads.
export async function patchStorage(page, { settings, tasks } = {}) {
  await page.evaluate(({ settings, tasks }) => {
    for (const k of Object.keys(localStorage)) {
      try {
        if (settings && k.endsWith('settings')) {
          const s = JSON.parse(localStorage.getItem(k))
          if (s && 'theme' in s) localStorage.setItem(k, JSON.stringify({ ...s, ...settings }))
        }
        if (tasks && k.endsWith('tasks')) {
          const list = JSON.parse(localStorage.getItem(k))
          if (Array.isArray(list)) localStorage.setItem(k, JSON.stringify(new Function('list', tasks)(list)))
        }
      } catch { /* skip */ }
    }
  }, { settings, tasks })
  await page.reload()
  await greeting(page)
  await page.addStyleTag({ content: '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none}' })
}
export const setTheme = (page, theme) => patchStorage(page, { settings: { theme } })

export const settle = (page, ms = 900) => page.waitForTimeout(ms)

// Hide the guest banner and passing toasts, so each screen shows the planner itself.
export const clean = (page) => page.evaluate(() => {
  const hideUp = (el) => {
    let top = el
    while (top.parentElement && top.parentElement.innerText.length < 220 && !top.parentElement.matches('nav, aside, main') && !top.parentElement.querySelector('nav, aside, main') && top.parentElement !== document.body) top = top.parentElement
    top.style.setProperty('display', 'none', 'important')
  }
  for (const el of document.querySelectorAll('p, span, div')) {
    if (el.children.length > 3) continue
    const t = (el.innerText || '').trim()
    if (t.length > 220) continue
    if (/^Guest planner\./.test(t) || /^Carried \d+ unfinished/.test(t)) hideUp(el)
  }
})

export async function shot(page, name) {
  await settle(page)
  await clean(page)
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log('saved', name)
}

export async function openTask(page, title = /Typography audit|Sprint planning|Customer call|Gym session|Polish dashboard/) {
  await openView(page, 'Agenda')
  await settle(page)
  await page.locator('main').getByText(title).filter({ visible: true }).first().click()
  await page.getByRole('dialog').filter({ has: page.getByRole('region', { name: 'Change history' }) }).first().waitFor({ timeout: 5000 }).catch(() => {})
}

export async function addNotes(page, notes) {
  await openView(page, 'Notes')
  for (const text of notes) {
    await page.getByRole('button', { name: /New note/ }).filter({ visible: true }).first().click()
    await page.waitForTimeout(400)
    await page.keyboard.type(text) // the new note takes the focus
    await page.locator('h1, h2').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(300)
  }
}
