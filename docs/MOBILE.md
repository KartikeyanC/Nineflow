# NineFlow on Android

`release/NineFlow-<version>.apk` is the phone app. It carries the whole planner inside it (no website needed), keeps your planner in your own Google Drive like the website and desktop app do, and sets reminders on the phone so they arrive with NineFlow closed.

It is built with [Capacitor](https://capacitorjs.com/) from the same code as the website. The Android project is in `android/`; the phone-only code is `src/native/`.

## 1. One setup step before sign-in works: an Android sign-in ID

Google doesn't allow its sign-in page inside an app's own window, so the phone app signs in through Chrome and Google sends the person back to the app. For that, Google needs to know this exact app, which is what an **Android OAuth client ID** is.

In the same Google Cloud project you made for the website (see `docs/GOOGLE_SETUP.md`):

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type: Android**.
3. Fill in:
   - **Name:** NineFlow Android
   - **Package name:** `app.nineflow.mobile`
   - **SHA-1 certificate fingerprint:** the fingerprint of the signing key (see "The signing key" below). For the key in `android-signing/` made when the app was first built, print it with:
     ```
     .android-tools\jdk\jdk-21.0.12.1+1\bin\keytool.exe -list -v -keystore android-signing\nineflow-release.keystore -alias nineflow
     ```
     (it asks for the store password: it is the `storePassword=` line in `android-signing/keystore.properties`).
4. Open **Advanced settings** on that client and turn on **Enable custom URI scheme**. Google switches this off by default for new Android clients, and the app needs it to receive the sign-in answer.
5. **Create**, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
6. Put it in `.env.local`:
   ```
   VITE_GOOGLE_ANDROID_CLIENT_ID=<the Android client ID>
   ```
7. Build again (section 3).

The consent screen needs nothing new: the phone asks for the same Drive permission as the website. While the app is in **Testing**, the people who sign in on a phone must be on the **Test users** list, as on the website.

## 2. Installing it on a phone

1. Copy `release/NineFlow-<version>.apk` to the phone (USB cable, Google Drive, e-mail to yourself, anything).
2. Open the file on the phone. Android asks to allow installing apps from this source (Files, Chrome or whichever app you opened it from). Allow it, then **Install**.
3. Open NineFlow and **Sign in with Google**.

Allow notifications when asked, and on Android 12 and later also allow **Alarms & reminders** when it opens that screen, so reminders arrive on the minute.

To update, install a newer APK over the old one. It must be signed with the same key (it is, as long as `android-signing/` is the one you built with). Your planner is in Google Drive, so uninstalling never loses it.

## 3. Building the APK

```
npm run android:build
```

This builds the web app, copies it into the Android project, builds and signs the APK, checks the signature, and writes `release/NineFlow-<version>.apk`. The version is the one in `package.json` (0.1.28 becomes Android version code 128).

Run it again after any change to the app or after setting `VITE_GOOGLE_ANDROID_CLIENT_ID`. To only copy the web app into the Android project (for Android Studio): `npm run android:sync`.

### Tools

The build needs Java 21, the Android SDK and Gradle. They are in `.android-tools/` (not committed; about 1.5 GB) and the build uses them automatically:

| What | Version | Where from |
|---|---|---|
| JDK | Microsoft Build of OpenJDK 21 | <https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip> |
| Android command-line tools | 23.0 | <https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip> |
| SDK parts | `platforms/android-36`, `build-tools/36.0.0`, `platform-tools` | `android sdk install …` (from the command-line tools) |
| Gradle | 8.14.3 | <https://services.gradle.org/distributions/gradle-8.14.3-bin.zip> |

If `.android-tools/` is gone, install them again into the same folders (`jdk/`, `sdk/`, `gradle/`), or install Android Studio and set `JAVA_HOME` and `ANDROID_HOME`; the build script uses those first. Installing the SDK means accepting Google's SDK license.

## 4. The signing key

Every APK is signed with `android-signing/nineflow-release.keystore`, and the passwords are in `android-signing/keystore.properties`. Both are git-ignored.

**Back this folder up somewhere safe (a password manager, an encrypted drive).** Android only accepts an update signed by the same key as the installed app. If the key is lost, people have to uninstall and reinstall (their planner is safe in Drive, but the Android sign-in ID in section 1 has to be made again for the new key's fingerprint). Never commit it or share it.

## 5. What works on the phone, and what doesn't

| | |
|---|---|
| Planner, board, week, month, focus timer, habits, notes, reports | Works, offline too |
| Google sign-in, Drive sync, Calendar, Tasks, other calendars, Meet links, Sheets and Docs export | Works (each asks for its permission when used) |
| Reminders | Phone notifications, with the app closed |
| Todoist, Trello, GitHub, Clockify, Notion, Telegram | Works (token is entered on the phone) |
| AI helpers, calendar link, chat webhooks, Toggl | Need your website's server. They say so until `VITE_API_BASE` is set in the build |
| Attach from Google Drive (Picker), Microsoft Outlook and To Do | Web only for now |
| "Today" widget window, tray | Desktop only |

## 6. If something goes wrong

| You see | Likely cause |
|---|---|
| "Google sign-in is not set up in this app yet" | `VITE_GOOGLE_ANDROID_CLIENT_ID` was not set when the APK was built (section 1, steps 6 and 7) |
| Google shows "Error 400: invalid_request" or "redirect_uri_mismatch" | **Enable custom URI scheme** is off (step 4), or the package name or SHA-1 on the client doesn't match this APK |
| "Access blocked: NineFlow has not completed the Google verification process" | The person isn't a test user yet |
| Chrome opens, you sign in, but the app doesn't come back | The sign-in ID's package name isn't exactly `app.nineflow.mobile` |
| "Google asks you to sign in again" after a week | The Google Cloud app is in Testing mode, where Google ends sign-ins after 7 days. Publishing the app removes that limit |
| Reminders arrive late | Allow **Alarms & reminders** for NineFlow in Android's settings, and don't restrict its battery use |
| The installer says "App not installed" | An older NineFlow signed with a different key is installed: uninstall it first |

## 7. How it works (for developers)

- `src/native/boot.js` runs first in `src/main.jsx`. In the phone app it installs `window.nineflowDesktop` (the same interface the desktop app uses, see `desktop/preload.cjs`), so `src/lib/google.js`, the planner's reminders and the "no website" checks need no phone-specific code.
- `src/native/androidBridge.js` does Google sign-in (Chrome Custom Tab, PKCE, the `app.nineflow.mobile:/oauth2redirect` link, refresh token in the app's private storage) and turns the planner's reminder schedule into notifications.
- `android/app/src/main/AndroidManifest.xml` has the intent filter that receives the sign-in answer. `allowBackup` is off so tokens don't go into Android cloud backups.
- Tests: `npm run android:test` runs the bridge against stand-ins for the Android plugins and Google (sign-in, renewal, cancelling, errors, reminders).
