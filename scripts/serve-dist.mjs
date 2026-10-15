// Serve the production build (dist/) locally with the same headers Vercel sends (vercel.json),
// to check the Content-Security-Policy and other security headers before deploying.
//   npm run build && node scripts/serve-dist.mjs   →  http://localhost:4175
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const rules = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers || []
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
const port = Number(process.env.PORT) || 4175

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let file = path.normalize(path.join(dist, decodeURIComponent(url.pathname)))
  if (!file.startsWith(dist)) { res.writeHead(404).end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  for (const rule of rules) {
    const re = new RegExp(`^${rule.source.replace(/\(\.\*\)/g, '.*')}$`)
    if (re.test(url.pathname)) for (const h of rule.headers) res.setHeader(h.key, h.value)
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}).listen(port, () => console.log(`dist with vercel.json headers on http://localhost:${port}`))
