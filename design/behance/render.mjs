// Renders each <section class="page"> of presentation.html to a 4K JPG (3840 px wide) for Behance.
// The cover (808 x 632) is rendered at 4x: 3232 x 2528.
//   node design/behance/render.mjs   then   python design/behance/to_jpg.py
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'export', 'png')
mkdirSync(out, { recursive: true })
const only = process.argv[2]

const browser = await chromium.launch({ channel: 'chrome' })
for (const scale of [2, 4]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: scale })
  const page = await ctx.newPage()
  await page.goto(pathToFileURL(path.join(here, 'presentation.html')).href)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  const ids = await page.$$eval('section.page', (s) => s.map((e) => e.id))
  for (const id of ids) {
    const isCover = id.includes('cover')
    if ((scale === 4) !== isCover) continue
    if (only && !id.includes(only)) continue
    await page.locator(`#${id}`).screenshot({ path: path.join(out, `${id}.png`) })
    console.log('rendered', id)
  }
  await ctx.close()
}
await browser.close()
