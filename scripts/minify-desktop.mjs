// Scrambles the desktop app's own files (desktop/*.cjs) before packaging, so the exe ships code
// that's hard to read, not the commented source. Comments and names are stripped and the code is
// squeezed onto a few lines; what it does doesn't change. Writes into release/desktop-min/ and
// leaves desktop/ untouched, so the dev app and git history keep the readable source.
//
//   node scripts/minify-desktop.mjs
//
// Run by npm run desktop:win / desktop:mac before electron-builder packages the app.
import { minify } from 'terser'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(root, 'desktop')
const out = path.join(root, 'release', 'desktop-min')

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

const files = fs.readdirSync(src).filter((f) => f.endsWith('.cjs'))
for (const f of files) {
  const code = fs.readFileSync(path.join(src, f), 'utf8')
  const result = await minify(code, { compress: true, mangle: true, format: { comments: false } })
  if (!result.code) throw new Error(`terser produced no output for ${f}`)
  fs.writeFileSync(path.join(out, f), result.code)
}
// Everything else in desktop/ that isn't JS or the dev-only oauth example ships as-is (oauth.json,
// the real Google Desktop client; it's as sensitive packaged as it was unpackaged).
for (const f of fs.readdirSync(src)) {
  if (!f.endsWith('.cjs') && f !== 'oauth.example.json') fs.copyFileSync(path.join(src, f), path.join(out, f))
}
console.log(`\nScrambled ${files.length} file(s) from desktop/ into release/desktop-min/`)
