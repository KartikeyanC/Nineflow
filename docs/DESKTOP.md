# NineFlow desktop app (Windows and Mac)

The desktop app is the same NineFlow, packaged with [Electron](https://www.electronjs.org/) so it installs like any program: a Start menu / Dock icon, its own window, and it works offline. The planner files ship inside the app, so it doesn't need the website to open.

## How Google sign-in works on desktop

Google doesn't allow its sign-in page inside an app's own window, so the desktop app uses Google's flow for installed apps:

1. **Sign up with Google** opens the person's normal web browser on Google's sign-in page.
2. Google sends the answer to a one-off address on the same computer (`http://127.0.0.1:<random port>`), and the browser tab says *"You're signed in"*.
3. The app keeps a refresh token, encrypted with the computer's keychain (Windows DPAPI / macOS Keychain), so people **stay signed in** and the one-hour Drive access renews in the background, with no "Reconnect" banners.

This uses a separate OAuth client of type **Desktop app** in the same Google Cloud project as the website (`nineflow-511409`): **NineFlow desktop**. Its ID and secret live in `desktop/oauth.json`, which is not committed; `desktop/oauth.example.json` shows the format. Google treats a desktop client's secret as not confidential, but keeping it out of git avoids secret-scanning alerts.

> **While the Google app is in Testing**, only the listed test users can sign in, and Google expires desktop sign-ins after **7 days**, so testers sign in again weekly. Publishing the app (see GOOGLE_SETUP.md, step 6) removes both limits.

Email + password accounts work in the desktop app when Supabase is configured for the build, the same as on the website. Password-reset links open the website, not the app.

## Run it

```bash
npm run desktop
```

This builds the web app into `dist/` and opens it in a desktop window. **View → Toggle Developer Tools** is available in this mode only.

## Build the installers

**Windows**, on a Windows PC:

```bash
npm run desktop:win
```

Creates `release/NineFlow-Setup-<version>.exe` (about 100 MB). The installer asks where to install and adds Start menu and desktop shortcuts; NineFlow uninstalls from **Settings → Apps**.

**Mac** needs a Mac (Apple's tools only run there):

```bash
npm run desktop:mac
```

Creates `release/NineFlow-<version>-arm64.dmg` (Apple silicon) and `-x64.dmg` (Intel).

**Both, without a Mac:** push the project to GitHub, add a repository secret **DESKTOP_OAUTH_JSON** with the contents of `desktop/oauth.json` and a repository variable **VITE_GOOGLE_CLIENT_ID**, then run **Actions → Desktop installers → Run workflow**. The `.exe` and `.dmg` files appear under the run's **Artifacts**.

The version number comes from `package.json`; raise it before building a new release.

**If the Windows build fails with** `EPERM: operation not permitted, rename '…\release\win-unpacked.tmp'`: Windows Defender is scanning the new files while electron-builder moves them, which happens on some drives. Build into a folder on the C: drive instead, then copy the `.exe` back:

```bash
npx electron-builder --win -c.directories.output=C:/Temp/nineflow-release
```

## Unsigned installers

Until the installers are code-signed, people see a warning the first time:

- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**.
- **Mac:** "NineFlow can't be opened because Apple cannot check it" → **System Settings → Privacy & Security** → **Open Anyway** (or right-click the app → **Open**).

Signing removes these: a Windows code-signing certificate (from about $100–300/year, or Azure Trusted Signing) and an Apple Developer account ($99/year) for signing and notarising the Mac app. electron-builder picks up the certificates through environment variables; see its [code signing guide](https://www.electron.build/code-signing).

## Files

- `desktop/main.cjs`: the app window, the `app://nineflow` scheme that serves `dist/`, link handling, menus.
- `desktop/google-auth.cjs`: Google sign-in through the system browser, token renewal, sign-out.
- `desktop/preload.cjs`: the bridge the web app sees as `window.nineflowDesktop` (used by `src/lib/google.js`).
- `electron-builder.yml`: installer settings. `build/icon.png`: the app icon (1024 px).
- `.github/workflows/desktop.yml`: builds Windows and Mac installers on GitHub.
