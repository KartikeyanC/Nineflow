# Reminders while NineFlow is closed

Reminders (Settings → Reminders, and each task's own reminders and *Keep reminding*) normally come from the open planner. Two things let them arrive with NineFlow closed.

## Desktop app: works out of the box

The Windows and Mac app fires reminders itself, from the tray, with the window closed. See [DESKTOP.md](DESKTOP.md#reminders-while-the-window-is-closed). Nothing to set up. To get reminders after a restart, right-click the tray icon and tick *Start NineFlow when I sign in (for reminders)*.

## Website and installed web app: needs a one-time setup

Browsers can show a notification with every NineFlow tab closed through **Web Push**, but something has to send it at the right minute. NineFlow keeps no data on a server, so it uses two services:

| What | Why | Cost |
|---|---|---|
| The site hosted on **Vercel** (HTTPS) | Push only works on a real HTTPS address; `api/` runs there | Free (Hobby) |
| **Upstash QStash** | Holds each reminder until its minute, then calls `/api/push` (Vercel's own scheduled jobs run at most once a day on the free plan) | Free tier |

### How it works

1. In **Settings → When NineFlow is closed → On**, the browser asks for notification permission and subscribes this device to Web Push.
2. Whenever tasks or settings change (and every 30 minutes), the planner sends the next 24 hours of reminders (at most 50) to `/api/reminders`. Only changes are sent; a changed or finished task's waiting reminders are cancelled.
3. `/api/reminders` encrypts each reminder with `REMINDER_SECRET` and hands it to QStash, timed for its minute. QStash only ever sees ciphertext.
4. At that minute QStash calls `/api/push`, which checks QStash's signature, decrypts the reminder and sends it to the device with Web Push. The push service (Google, Apple, Mozilla, Microsoft) receives it end-to-end encrypted.
5. Clicking the notification opens NineFlow on that task.

It is per device: turn it on on each phone or computer that should get reminders. While it is on, the open tab doesn't also show its own copies.

### Setup

1. **Deploy the site to Vercel** (if it isn't yet) and note its address, e.g. `https://nineflow.vercel.app`.
2. **Create a QStash project** at [console.upstash.com](https://console.upstash.com) → QStash. Copy the **QSTASH_TOKEN**, **QSTASH_CURRENT_SIGNING_KEY** and **QSTASH_NEXT_SIGNING_KEY**. If the console shows a regional **QSTASH_URL**, copy that too.
3. **Keys for Web Push and the encryption secret** are already generated in `.env.local` (`VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `REMINDER_SECRET`). Set `VAPID_SUBJECT` to a contact address of yours (`mailto:you@example.com`); push services may use it if something goes wrong. To make new keys instead: `npx web-push generate-vapid-keys`.
4. In **Vercel → Project → Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `VITE_VAPID_PUBLIC_KEY` | from `.env.local` (public; built into the page) |
   | `VAPID_PRIVATE_KEY` | from `.env.local` (secret) |
   | `VAPID_SUBJECT` | `mailto:` + your address |
   | `REMINDER_SECRET` | from `.env.local` (secret) |
   | `QSTASH_TOKEN` | from Upstash (secret) |
   | `QSTASH_CURRENT_SIGNING_KEY` | from Upstash (secret) |
   | `QSTASH_NEXT_SIGNING_KEY` | from Upstash (secret) |
   | `QSTASH_URL` | only if Upstash shows a regional URL |
   | `APP_URL` | optional: the site address; defaults to Vercel's production address |

5. **Redeploy** (the public key is built into the page, so a new build is needed).
6. Open the site, sign in, **Settings → When NineFlow is closed → On**. Add a task starting in a few minutes with a reminder, close the tab, and wait.

If the server isn't set up, turning it on says so and stays off; reminders still work with the tab open.

### Phones

- **Android** (Chrome, Edge, Firefox, Samsung Internet): works in the browser or the installed app.
- **iPhone and iPad** (iOS/iPadOS 16.4 or later): only from the installed app. In Safari: Share → **Add to Home Screen**, open NineFlow from the Home Screen, then turn it on in Settings.

### Limits

- Reminders are handed over 24 hours ahead, and refreshed while NineFlow is open in some tab or app at least once in that time. A device that hasn't opened NineFlow for more than a day gets only what was already scheduled.
- QStash's free tier caps messages per day; each reminder is one message (plus one if it is cancelled). *Keep reminding every 5 min* uses up to 36 per task, so prefer longer intervals.
- If the device is offline at that minute, the push service keeps it for up to 30 minutes.

## Files

- `api/reminders.js`: schedules and cancels a device's reminders with QStash.
- `api/push.js`: called by QStash; verifies, decrypts and sends the push.
- `api/_push.js`: encryption, QStash signature check and calls, allowed push services.
- `src/lib/webPush.js`: subscribing this device, sending only changes, opening a task from a click.
- `public/sw.js`: shows pushed reminders and handles the click.
- `src/lib/taskMeta.js` (`reminderSchedule`): the upcoming reminders, shared with the desktop app.
