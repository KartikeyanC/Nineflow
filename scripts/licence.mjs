// Makes licence keys for the NineFlow apps (the Windows app and the phone app open only for a
// Google account that has one). See docs/LICENCE-KEYS.md.
//
//   npm run licence -- someone@gmail.com     prints that account's key
//
// The first run makes the signing key pair: the private half stays in licence-signing/private.pem
// (git-ignored: back it up, without it no new keys can be made), the public half is written to
// src/lib/licencePublicKey.js, which the apps use to check keys.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dir = path.join(root, 'licence-signing')
const privFile = path.join(dir, 'private.pem')
const pubFile = path.join(root, 'src', 'lib', 'licencePublicKey.js')
export const message = (email) => `nineflow-licence-v1:${email.trim().toLowerCase()}`

if (!fs.existsSync(privFile)) {
  if (fs.existsSync(pubFile)) {
    console.error('\nlicence-signing/private.pem is missing, but the apps already have a public key.\nRestore private.pem from your backup; making a new pair would stop every existing key working.\n')
    process.exit(1)
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(privFile, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  const raw = publicKey.export({ format: 'jwk' }).x // the 32-byte public key, base64url
  fs.writeFileSync(pubFile, `// Made by scripts/licence.mjs. Checks licence keys; it can't make them.\nexport const LICENCE_PUBLIC_KEY = '${raw}'\n`)
  console.log('\nMade a new signing key pair. Back up licence-signing/private.pem somewhere safe.')
}

const emails = process.argv.slice(2).filter((a) => a.includes('@'))
if (!emails.length) { console.log('\nUsage: npm run licence -- someone@gmail.com\n'); process.exit(0) }
const key = crypto.createPrivateKey(fs.readFileSync(privFile))
for (const email of emails) {
  const sig = crypto.sign(null, Buffer.from(message(email)), key).toString('base64url')
  console.log(`\n${email.trim().toLowerCase()}\nNF1-${sig}`)
}
console.log('')
