// Opens each portfolio page at desktop and phone widths and reports broken images, console errors
// and sideways scrolling; saves full-page screenshots to the folder given (default: ./check-shots).
//   node design/portfolio/check.mjs [outDir]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] || path.join(here, 'check-shots')
mkdirSync(outDir, { recursive: true })
const pages = ['logo', 'dashboard', 'mobile', 'website']
const sizes = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } }

const browser = await chromium.launch({ channel: 'chrome' })
let problems = 0
for (const [label, viewport] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  for (const name of pages) {
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(pathToFileURL(path.join(here, `${name}.html`)).href)
    // Scroll through so lazy images load and reveals run.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(800)
    const report = await page.evaluate(() => ({
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
    }))
    const bad = report.broken.length || report.wide > 0 || errors.length
    if (bad) problems++
    console.log(`${bad ? 'PROBLEM' : 'ok     '} ${label.padEnd(7)} ${name.padEnd(9)} height ${report.height}px` +
      (report.wide > 0 ? `  ${report.wide}px too wide` : '') +
      (report.broken.length ? `  broken: ${report.broken.join(', ')}` : '') +
      (errors.length ? `  errors: ${errors.join(' | ')}` : ''))
    await page.screenshot({ path: path.join(outDir, `${name}-${label}.png`), fullPage: true })
    await page.close()
  }
  await ctx.close()
}
await browser.close()
console.log(problems ? `${problems} page(s) with problems` : 'All pages look fine')
