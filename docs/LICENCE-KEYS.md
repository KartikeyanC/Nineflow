# Licence keys

The installed apps (the Windows app and the phone app — not the website) open only for a Google
or email account that has a licence key. The website is unlocked for everyone; it isn't an
installed file someone can pass around, so there's nothing to gate there.

## How it works

- A key is a signature of the account's email, made with a private key that only you hold
  (`licence-signing/private.pem`, never committed — see below). `src/lib/licencePublicKey.js`
  carries the matching public half, so the app can **check** a key but can't make new ones.
- A key works for that one email, on every device that account signs into. There's no per-device
  limit and no server call: `src/lib/licence.js` checks the key entirely on the device.
- Your own two accounts (kartikeyan4878@gmail.com, kartikeyan510@gmail.com) are built into the
  app, so your installs keep opening without typing anything.
- Signing in with a different, unlicensed account shows the lock screen
  (`src/features/LicenceLock.jsx`) instead of the planner. "Use a different account" there signs
  that account out of the device; it doesn't touch that account's data in Drive.

## Giving someone a key

```bash
npm run licence -- someone@gmail.com
```

Prints a key starting `NF1-…`. Send it to them along with the installer or APK; they type it into
the lock screen once (it's remembered on that device after that).

## The signing key

The first time `npm run licence` runs, it makes the key pair:

- `licence-signing/private.pem` — makes keys. Git-ignored. **Back this up somewhere safe** (not in
  the repo). If it's lost, you can't issue new keys, but every key already given out keeps working.
- `src/lib/licencePublicKey.js` — checks keys. Committed; every build of the app needs it.

Never regenerate the pair once keys are out: a new pair makes every key issued under the old one
stop working.

## Trying it without installing

The website and the dev server aren't locked. To see the lock screen without building the real
app, open the browser console and run:

```js
localStorage.setItem('nineflow:licence-test', '1')
```

then reload. `localStorage.removeItem('nineflow:licence-test')` turns it back off.
