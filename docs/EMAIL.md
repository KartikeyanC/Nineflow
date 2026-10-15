# Email to NineFlow

Forward or send an email to your planner's private address and it becomes a task.

- The **subject** is the title, read like quick add: `Call the bank tomorrow 3pm !high #personal @admin` gives tomorrow at 15:00, high priority, the Personal category and the `admin` tag. "Re:" and "Fwd:" are dropped.
- Without a day in the subject the task goes to **Someday**.
- The **notes** get the sender, the email's text and how many attachments it had (attachments themselves aren't kept).
- Every emailed task gets the `email` tag. An "Added N tasks from email" toast (with Undo) appears when they arrive.

Turn it on in **Settings → Email to NineFlow → Get my address**. The address belongs to the workspace, so every device signed in to it collects the same mail. **New address** stops the old one working; **Only from** limits it to your own addresses.

## How it works

```
your email ──► Postmark (inbound) ──► /api/inbound ──► Upstash Redis (encrypted, ≤30 days)
                                                              │
NineFlow (any device, every 5 min while open) ◄── /api/inbox ◄┘ ── confirms ──► deleted
```

1. The address is `<Postmark inbound address>+<key>@inbound.postmarkapp.com`. The key (26 random letters and digits) is in the workspace's settings.
2. Postmark receives the mail and calls `/api/inbound` (protected by a webhook password).
3. The mail is encrypted with a key derived from the address's key and queued under a name also derived from it. Without the address, the stored mail can't be found or read.
4. The planner asks `/api/inbox` for its mail when it opens, every 5 minutes while on screen, and when it comes back into view. It adds the tasks, then confirms them, and only then are they deleted. Each task's id comes from its email, so nothing is added twice.
5. Mail nobody collects is deleted after 30 days; at most 200 wait per address.

No domain of your own is needed: Postmark's inbound address does the receiving.

## Setup (once)

1. **Deploy the site to Vercel** (if it isn't yet).
2. **Postmark** ([postmarkapp.com](https://postmarkapp.com), free developer plan): create a server, open its **Inbound** stream and copy the **inbound address** (like `abc123@inbound.postmarkapp.com`).
3. Make up a long random **webhook password**. In Postmark's inbound settings set the **webhook URL** to:

   ```
   https://postmark:<webhook password>@<your-site>/api/inbound
   ```

   Leave **Include raw email content in JSON payload** off; it isn't needed.
4. **Upstash Redis** ([console.upstash.com](https://console.upstash.com), free): create a database and copy the **REST URL** and **REST token**. (The same Upstash account as reminders' QStash.)
5. In **Vercel → Settings → Environment Variables** add:

   | Name | Value |
   |---|---|
   | `VITE_INBOX_ADDRESS` | the Postmark inbound address (built into the page) |
   | `INBOUND_WEBHOOK_PASSWORD` | the webhook password (secret) |
   | `UPSTASH_REDIS_REST_URL` | from Upstash |
   | `UPSTASH_REDIS_REST_TOKEN` | from Upstash (secret) |

6. **Redeploy**, then Settings → Email to NineFlow → Get my address, and send yourself a test email.

The desktop app collects mail too when `VITE_API_BASE` points at the deployed site.

## Limits

- Postmark's free developer plan includes a limited number of emails a month; check its current plan.
- Very large emails (over Vercel's 4.5 MB request limit, usually because of attachments) can't be received.
- Anyone who learns the address can add tasks. Use **Only from**, or **New address** if it leaks.

## Files

- `api/inbound.js`: Postmark's webhook; queues each mail, encrypted.
- `api/inbox.js`: the planner's fetch and confirm.
- `api/_inbox.js`: key derivation, encryption, Redis calls, body clean-up, webhook password check.
- `src/lib/emailInbox.js`: the address, fetching, turning emails into tasks.
- `src/store/PlannerContext.jsx`: collecting mail while the planner is open.
- `src/views/Settings.jsx` (`EmailInbox`): the settings row.
