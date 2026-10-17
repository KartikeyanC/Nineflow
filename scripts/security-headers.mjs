// The site's security headers, in one place: vercel.json is checked against this after
// every build (npm run build → postbuild), and the desktop app uses the same policy
// (desktop/main.cjs). See docs/SECURITY.md.
//
//   node scripts/security-headers.mjs          check: dist/*.html inline scripts vs. the policy
//   node scripts/security-headers.mjs --write  update vercel.json's script hashes from dist/

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAGES = ['index.html', 'widget.html', 'index-v2.html']

// The hashes of the pages' small inline scripts (the theme applied before first paint).
export function inlineHashes(dir = path.join(root, 'dist')) {
  const out = new Set()
  for (const p of PAGES) {
    const file = path.join(dir, p)
    if (!fs.existsSync(file)) continue
    const html = fs.readFileSync(file, 'utf8')
    // Browsers hash the script text with line endings normalised to \n, so a Windows
    // checkout (CRLF) and Vercel's Linux build give the same hash.
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) out.add(`'sha256-${crypto.createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64')}'`)
  }
  return [...out].sort()
}

// The Content-Security-Policy. `connect` adds where the page may send requests.
export function csp(hashes, { connect = [], frameAncestors = "'none'" } = {}) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')} https://accounts.google.com/gsi/client`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com/gsi/ https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://geocoding-api.open-meteo.com https://date.nager.at ${connect.join(' ')}`.trim(),
    'frame-src https://accounts.google.com/gsi/',
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ')
}

export const OTHER_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Microphone only for this site (voice input in quick add); nothing else.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)' },
  // Google sign-in opens a pop-up that must be able to answer this page.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

function expectedRule(hashes) {
  return { source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: csp(hashes) }, ...OTHER_HEADERS] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hashes = inlineHashes()
  if (!hashes.length) { console.error('security-headers: no dist/ pages found. Run vite build first.'); process.exit(1) }
  const file = path.join(root, 'vercel.json')
  const vercel = JSON.parse(fs.readFileSync(file, 'utf8'))
  const want = expectedRule(hashes)
  const i = (vercel.headers || []).findIndex((h) => h.source === '/(.*)')
  if (process.argv.includes('--write')) {
    vercel.headers = vercel.headers || []
    if (i >= 0) vercel.headers[i] = want; else vercel.headers.unshift(want)
    fs.writeFileSync(file, `${JSON.stringify(vercel, null, 2)}\n`)
    console.log(`security-headers: vercel.json updated (${hashes.length} inline script hash${hashes.length === 1 ? '' : 'es'}).`)
  } else if (i < 0 || JSON.stringify(vercel.headers[i]) !== JSON.stringify(want)) {
    console.error('security-headers: vercel.json does not match the pages (an inline script changed?).\nRun: node scripts/security-headers.mjs --write')
    process.exit(1)
  } else {
    console.log('security-headers: vercel.json matches the pages.')
  }
}
