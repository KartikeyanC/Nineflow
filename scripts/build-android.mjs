// Builds the phone app: release/NineFlow-<version>.apk, signed with android-signing/ (see docs/MOBILE.md).
//
//   npm run android:build
//
// 1. vite build              the web app (reads .env.local, e.g. VITE_GOOGLE_ANDROID_CLIENT_ID)
// 2. cap sync android        copies it into the Android project
// 3. gradle assembleRelease  makes and signs the APK
// 4. checks the signature and copies the APK to release/
//
// The Java and Android tools it uses are in .android-tools/ (JDK 21, Android SDK, Gradle). If you
// installed Android Studio instead, set JAVA_HOME and ANDROID_HOME and those are used.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const tools = path.join(root, '.android-tools')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const isWin = process.platform === 'win32'

const firstDir = (dir, prefix) => {
  try { const n = fs.readdirSync(dir).filter((x) => x.startsWith(prefix)).sort().pop(); return n ? path.join(dir, n) : null } catch { return null }
}
const javaHome = process.env.JAVA_HOME || firstDir(path.join(tools, 'jdk'), 'jdk-')
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (fs.existsSync(path.join(tools, 'sdk')) ? path.join(tools, 'sdk') : null)
const gradleDir = firstDir(path.join(tools, 'gradle'), 'gradle-')
const gradle = gradleDir ? path.join(gradleDir, 'bin', isWin ? 'gradle.bat' : 'gradle') : path.join(root, 'android', isWin ? 'gradlew.bat' : 'gradlew')

const die = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!javaHome || !fs.existsSync(javaHome)) die('Java 21 was not found. See docs/MOBILE.md ("Tools").')
if (!sdk || !fs.existsSync(sdk)) die('The Android SDK was not found. See docs/MOBILE.md ("Tools").')
if (!fs.existsSync(path.join(root, 'android-signing', 'keystore.properties'))) die('The signing key is missing (android-signing/keystore.properties). See docs/MOBILE.md ("The signing key").')

const env = {
  ...process.env,
  JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
  PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH}`,
}
const run = (label, cmd, args, cwd = root) => {
  console.log(`\n> ${label}`)
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: isWin })
  if (r.status !== 0) die(`${label} failed.`)
}

if (!process.argv.includes('--skip-web')) {
  run('vite build', 'npx', ['vite', 'build'])
  run('cap sync android', 'npx', ['cap', 'sync', 'android'])
}
// Gradle finds the SDK through this file (it is git-ignored).
fs.writeFileSync(path.join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`)
run('gradle assembleRelease', `"${gradle}"`, ['assembleRelease', '--no-daemon', '-q'], path.join(root, 'android'))

const built = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!fs.existsSync(built)) die('Gradle finished but no signed APK was found (is the signing key set up? see docs/MOBILE.md).')

// Confirm it is signed, and show whose key signed it.
const buildTools = firstDir(path.join(sdk, 'build-tools'), '')
const apksigner = buildTools && path.join(buildTools, isWin ? 'apksigner.bat' : 'apksigner')
if (apksigner && fs.existsSync(apksigner)) {
  console.log('\n> apksigner verify')
  const v = spawnSync(`"${apksigner}"`, ['verify', '--print-certs', `"${built}"`], { env, shell: isWin, encoding: 'utf8' })
  process.stdout.write(v.stdout || '')
  if (v.status !== 0) die(`The APK's signature did not verify:\n${v.stderr || ''}`)
}

fs.mkdirSync(path.join(root, 'release'), { recursive: true })
const out = path.join(root, 'release', `NineFlow-${pkg.version}.apk`)
fs.copyFileSync(built, out)
console.log(`\nDone: ${path.relative(root, out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`)
