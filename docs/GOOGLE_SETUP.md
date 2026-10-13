# Google sign-in and Drive storage: setup

NineFlow needs everyone to sign in with Google. Each person's planner is saved in their own Google Drive, in `My Drive / Daily Planner / planner-data.json`.

There's no server. The browser talks to Google directly, so you only need an **OAuth client ID** from a Google Cloud project. Setup takes about 10 minutes.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in.
2. Use the project picker in the top bar and choose **New project**. Name it, for example *NineFlow*, and create it.

## 2. Turn on the Google Drive API

1. Go to **APIs & Services → Library**.
2. Search for **Google Drive API** and click **Enable**.

## 3. Set up the consent screen

1. Go to **APIs & Services → OAuth consent screen**. In newer consoles this is **Google Auth Platform → Branding / Audience**.
2. Choose user type **External**.
3. Fill in the app name (*NineFlow*), a support email and a developer contact email. Leave the logo empty for now: adding one makes Google require brand verification first. Upload `public/icons/icon-512.png` later, once you go through verification (see step 6).
   Under **App domain**, the privacy policy link is `https://<your address>/privacy.html` (the page ships with the app in `public/privacy.html`; put your contact email in it first). Google asks for it before you can publish.
4. Add these **scopes**:
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - `.../auth/drive.file`: the app can only see the files it creates
   - `.../auth/calendar.events`: only for the optional **Connect Google Calendar** button in Settings, which sends tasks to the person's primary calendar. It is requested separately, only when someone presses that button. You also need to enable the **Google Calendar API** (**APIs & Services → Library → Google Calendar API → Enable**).
5. While the app is in **Testing**, add each person who will sign in under **Test users**. Only test users can sign in until you publish the app.

## 4. Create the OAuth client ID

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorised JavaScript origins**, add every address the app runs on, for example:
   - `http://localhost:5173` (development)
   - your real address once it's hosted, for example `https://planner.example.com`
4. You don't need redirect URIs.
5. Click **Create** and copy the **Client ID**. It ends in `.apps.googleusercontent.com`.

## 5. Give the app the client ID

1. In the project folder, copy `.env.example` to `.env.local`.
2. Paste the ID:

   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   ```

3. Restart the dev server (`npm run dev`). Vite only reads `.env.local` at startup.

`.env.local` is ignored by git. A client ID isn't a secret, because it ships in the web page anyway, but keeping it out of the repo lets each environment use its own.

## 6. Let any Google account sign in (publish the app)

The app itself accepts any Google account. Google is what limits it: while the consent screen is in **Testing**, only the accounts listed under **Test users** can sign in. Everyone else sees "Access blocked".

To open it to everyone:

1. Go to **APIs & Services → OAuth consent screen**. In newer consoles: **Google Auth Platform → Audience**.
2. Under **Publishing status**, click **Publish app** and confirm. The status changes from *Testing* to *In production*.

The planner's sign-in only asks for basic scopes (`openid`, `email`, `profile`) and `drive.file`, which Google classes as non-sensitive. **The optional Calendar button asks for `calendar.events`, which Google classes as sensitive.** Once published, Google's verification review applies to that scope: a short demo video of the Connect Google Calendar flow, the privacy page, and a verified domain. Until it passes, people who press that button see the "Google hasn't verified this app" screen, and the 100-user cap applies to the calendar permission. Sign-in and Drive saving aren't affected. Two things are still worth knowing:

- **Other people can't reach `localhost`.** For anyone else to use the planner, host it at a public address (for example on Vercel or Netlify). Then add that address under **Authorised JavaScript origins** on the client ID.
- **Showing your app name and logo** on Google's consent screen may require **brand verification** (**Google Auth Platform → Branding**). That needs a homepage and the privacy page (`/privacy.html`) on a domain you've verified in Google Search Console. Sign-in works while verification is pending.

## Try it without Google (development only)

To try sign-in and syncing before you have a client ID, add this to `.env.local` and restart `npm run dev`:

```
VITE_GOOGLE_MOCK=1
```

"Sign up with Google" then signs in a fake account, `you@example.com`, and "Drive" is stored in that browser's localStorage under `mock-drive`. To see how each Google failure looks, set `localStorage['mock-signin-error']` in the browser console to `popup_closed`, `popup_failed_to_open`, `access_denied`, `invalid_client` or `drive_not_granted`, and remove it to sign in normally. This stand-in only works in the dev server and is never part of a production build. Remove the line once your real client ID is in place.

## How it behaves

- **Signing in.** The first visit shows "Continue with Google". Planner data that already exists in that account's Drive loads straight away, on any device.
- **Existing local data.** If this browser has planner data from before sign-in existed, you're offered to move it into the account. Profiles with a PIN ask for it first.
- **Saving.** Changes save to Drive a couple of seconds after you make them. The status shows in the sidebar: *Saved to Drive*, *Saving…*, *Offline* or *Reconnect*.
- **Offline.** The app keeps working from this device's copy, and changes upload when the connection returns.
- **Reconnecting.** Google's browser tokens last about an hour. When one runs out, the sidebar says *Reconnect Google Drive*, and a banner appears if there are unsaved changes. One click renews it.
- **Two devices at once.** The newest save wins. If both devices changed things at the same time, this device's version is also saved as `planner-data (conflict …).json` in the same folder, so nothing is lost.
- **Signing out.** Settings → Your account → Sign out saves everything to Drive first, then removes the planner from that browser.
- **Deleting data.** Use Settings → Clear all data, which clears it on this device and in Drive. Or delete the *Daily Planner* folder in Google Drive.
