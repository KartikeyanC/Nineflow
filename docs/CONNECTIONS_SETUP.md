# Connections: what you need to set up

Most connections in **Settings → Connections** need nothing from you. A few need a one-time setup in Google Cloud, in Azure, or on the server. This is the checklist, with the exact clicks.

| Connection | Needs setup? | Where |
|---|---|---|
| Weather (Open-Meteo), public holidays (Nager.Date) | No | – |
| Google Meet links, Google Sheets and Docs export | No (uses the Calendar and Drive access NineFlow already has) | – |
| Chat webhooks (Slack, Discord, Teams, ntfy, Zapier/Make) | Deploy only | server |
| Todoist, Trello, GitHub, Clockify, Notion, Telegram | No: each person pastes their own token | – |
| Toggl Track | Deploy only | server |
| **Calendar link** (subscribe from any calendar app) | Upstash Redis | server |
| **Google Tasks**, **my other Google calendars** | Two scopes | Google Cloud |
| **Attach files from Google Drive** (Picker) | API key and project number | Google Cloud |
| **Microsoft Outlook and To Do** | An app registration | Azure |

"Deploy only" means the new `api/` functions have to be live on your site (a normal Vercel deploy). The desktop app calls them through `VITE_API_BASE`.

---

## A. Google Cloud (the project you already made for sign-in)

Open <https://console.cloud.google.com/> and choose the same project as in `docs/GOOGLE_SETUP.md`.

### A1. Turn on two more APIs
1. **APIs & Services → Library**.
2. Search **Google Tasks API** → **Enable**.
3. Search **Google Picker API** → **Enable**.

(Google Drive API and Google Calendar API are already on.)

### A2. Add two scopes to the consent screen
1. **Google Auth Platform → Data Access** (older consoles: **OAuth consent screen → Edit app → Scopes**).
2. **Add or remove scopes**, and add:
   - `https://www.googleapis.com/auth/tasks`: *Google Tasks*
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: *see the list of calendars* (for "My other calendars")
3. **Update**, then **Save**.

Neither scope is asked for at sign-in. Google's window appears only when someone presses **Connect with Google** next to Google Tasks, or **Choose calendars** under Google Calendar.

Google treats scopes like these (reading and changing a person's tasks and calendars) the same way as `calendar.events`: they need Google's free verification before the app is opened to everyone, and the consent-screen page shows which ones do. While the app is in **Testing**, your test users can use them (with Google's "unverified app" warning). Before you open the app to everyone, submit it: **Google Auth Platform → Verification Center → Prepare for verification**, and say what each scope is for (the one-line reasons in A2 will do). It's the same review the Calendar scope already needs, so do them together.

### A3. Make an API key for the file picker
1. **APIs & Services → Credentials → Create credentials → API key**.
2. Click the key's name to edit it:
   - **Application restrictions → Websites**, then add each address the site runs on, for example `https://planner.example.com/*` and `http://localhost:5173/*`.
   - **API restrictions → Restrict key**, choose **Google Picker API** only.
3. **Save** and copy the key.

### A4. Find the project number
**Dashboard** (or **IAM & Admin → Settings**): copy the **Project number** (digits only, not the project ID).

### A5. Put both in the environment
In `.env.local`, and in **Vercel → Settings → Environment Variables**:

```
VITE_GOOGLE_API_KEY=<the API key from A3>
VITE_GOOGLE_APP_ID=<the project number from A4>
```

Redeploy. Until both are set, the **Attach from Google Drive** button simply doesn't appear. The picker is web only (the desktop app's address can't be allowed on the key).

---

## B. Azure (Microsoft Outlook Calendar and To Do)

1. Go to <https://entra.microsoft.com/> (or portal.azure.com) and sign in. A free Microsoft account is enough.
2. **Identity → Applications → App registrations → New registration**.
3. Fill in:
   - **Name:** NineFlow
   - **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*
   - **Redirect URI:** platform **Single-page application (SPA)**, value `https://<your address>/ms-callback.html`
4. **Register**.
5. On the app's **Overview**, copy the **Application (client) ID**.
6. **Authentication** → under **Single-page application**, add a second redirect `http://localhost:5173/ms-callback.html` for development. Leave "Implicit grant" **off**. There is no client secret: this is a public (SPA) app.
7. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, tick:
   - `User.Read`
   - `Calendars.ReadWrite`
   - `Tasks.ReadWrite`
   - `offline_access`
   then **Add permissions**. These don't need admin consent for personal accounts. A work or school account whose organization blocks user consent will ask its admin.
8. Put the ID in `.env.local` and in Vercel's environment variables:

```
VITE_MS_CLIENT_ID=<the Application (client) ID>
# Optional. Default is 'common'. Use 'organizations' (work/school only) or 'consumers' (personal only) to narrow it.
# VITE_MS_TENANT=common
```

Redeploy. Until `VITE_MS_CLIENT_ID` is set, the Microsoft row doesn't appear in Settings. It is web only.

Microsoft keeps web apps signed in for about a day, so people connect again roughly daily (the app says so when it happens).

---

## C. Server (Vercel)

Nothing to configure for webhooks or Toggl: deploy, and `/api/notify` and `/api/toggl` work.

The **calendar link** stores an encrypted copy of the calendar file in Upstash Redis, the same store the email inbox uses. If you already set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (see `docs/EMAIL.md`), it works. If not:

1. <https://console.upstash.com/> → **Redis → Create database** (free plan; pick the region nearest your site).
2. **REST API** section: copy the URL and token.
3. In Vercel's environment variables:

```
UPSTASH_REDIS_REST_URL=<the REST URL>
UPSTASH_REDIS_REST_TOKEN=<the REST token>
```

Without Redis the calendar link answers "isn't set up on this server yet", and nothing else is affected.

The desktop app has no server of its own. It needs `VITE_API_BASE=https://<your address>` in its build to use the calendar link, chat webhooks and Toggl.

---

## D. Checking it worked

After you deploy with the values above:

- **Google Tasks:** Settings → Connections → Your tools → *Google Tasks* → **Connect with Google**, accept, then **Import**.
- **Other calendars:** Settings → Google Calendar → connect, turn on **Show my calendar events here**, then **My other calendars → Choose calendars**.
- **Picker:** open a task → **Files → Attach from Google Drive**.
- **Microsoft:** Settings → Connections → Your tools → *Microsoft Outlook and To Do* → **Connect with Microsoft**.
- **Calendar link:** Settings → Connections → **Create my calendar link**, copy it, and subscribe in your calendar app. Open the link in a browser tab: it should download a `.ics` file.

## E. If something fails

| You see | Likely cause |
|---|---|
| "Access blocked: NineFlow has not completed the Google verification process" | The person isn't a **test user** yet (A2 note), or the app is public but not verified |
| Google Tasks / calendar list says "not allowed" | The scope isn't on the consent screen (A2), or the box wasn't ticked in Google's window |
| No **Attach from Google Drive** button | `VITE_GOOGLE_API_KEY` or `VITE_GOOGLE_APP_ID` missing, or you're in the desktop app |
| Picker opens then shows an error | The API key's website restriction doesn't include this address, or Picker API isn't enabled |
| No Microsoft row in Settings | `VITE_MS_CLIENT_ID` missing, or you're in the desktop app |
| Microsoft window says "redirect URI does not match" | The redirect in B3/B6 isn't exactly `<site>/ms-callback.html`, or it's registered as *Web* instead of *Single-page application* |
| "The calendar link isn't set up on this server yet" | The Upstash Redis variables (section C) aren't set |
