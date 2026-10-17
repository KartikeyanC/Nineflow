# Security & Access (NineFlow)

NineFlow's answer to the security & access spec ("02 — Security & Access"). That spec is written for a
multi-tenant commerce backend (tenants, Postgres RLS, staff roles, OTP logins, payments). NineFlow is
different: **each person's planner lives in their own Google Drive** (or, for email accounts, in their own
Supabase row), and the server is a handful of stateless Vercel functions. So this document keeps the spec's
principles and applies them to what NineFlow actually has.

## Where data lives, and who can reach it

| Data | Where | Who can reach it |
|---|---|---|
| The planner (tasks, settings, habits, notes…) | The person's Google Drive: `Daily Planner/planner-data.json` | Only that Google account. NineFlow asks for `drive.file`: it sees only files it created, nothing else in the Drive |
| The same, for email accounts | Supabase `planner_data`, one row per user | Row-level security, **enabled and forced**: `auth.uid() = user_id` (docs/SUPABASE_SETUP.md) |
| A working copy | The browser / desktop app on that device | That device |
| Reminders handed over for the closed app (opt-in) | Upstash QStash, until due | Encrypted (AES-256-GCM) by `/api/reminders`; QStash holds only ciphertext |
| Emailed tasks (opt-in) | Upstash Redis, ≤ 30 days | Encrypted with a key derived from the private address; unreadable without it |
| The calendar subscription link's file (opt-in) | Upstash Redis, ≤ 90 days (the clock restarts on every read or update) | Encrypted (AES-256-GCM) with a key derived from the link's secret, under a name also derived from it: unreadable without the link. The file passes through `/api/feed` in the clear while it is stored and served, so treat the link as a password |
| Microsoft sign-in (Outlook, To Do; opt-in) | Tokens on this device only (same place as the tool tokens below) | Whoever uses this browser profile. PKCE sign-in, no client secret anywhere; "Delete everything" removes them |
| Google sign-in on the phone app | The refresh token in the app's private storage (`allowBackup` is off, so it isn't in Android cloud backups) | Only that app. Sign-in runs in Chrome with PKCE and an Android client (no secret in the app); the signing key in `android-signing/` is git-ignored and must be backed up (docs/MOBILE.md) |
| Tool tokens (Todoist, Trello, GitHub, Clockify, Toggl, Notion, Telegram; opt-in) | This device only: `localStorage` under `nineflow:conn:<account>`, outside the `daily-planner:<account>:` namespace that `lib/cloud.js` syncs | Whoever uses this browser profile. Each token goes only to its own service (the browser calls them directly; Toggl, which blocks browsers, passes through `/api/toggl`, which neither stores nor logs it). "Delete everything" removes them |
| Chat webhook links (Slack, Discord, Teams, ntfy, Zapier/Make; opt-in) | In the planner settings, so in the same Drive file / Supabase row as the planner | Only that account. A webhook link works like a password for its channel; `/api/notify` uses it for one request and does not store or log it |

There is no NineFlow user database, no shared table of everyone's tasks, and no admin who can read them.
The spec's tenant isolation (§1) is therefore provided by **one store per person** rather than RLS on a shared
table; where a shared table does exist (Supabase), RLS is enabled and forced, as §1.2 asks.

## Authentication (spec §2)

| Spec | NineFlow |
|---|---|
| Per-portal JWT + refresh tokens | Sign-in is Google's (OAuth, `drive.file`) or Supabase's (email). NineFlow issues no tokens of its own |
| Access token in memory | Web: the Google access token is in `sessionStorage` (gone when the browser closes), about 1 hour |
| Refresh token stored safely | Desktop: Google refresh token encrypted with the OS keychain (Electron `safeStorage`). MCP server: `~/.nineflow/mcp-google.json`, in the user's own profile (mode 600 on Mac/Linux) |
| PKCE | Desktop and MCP sign-in use the loopback flow with PKCE (S256) |
| No account enumeration | NineFlow has no login form of its own to enumerate |

## Authorization (spec §3)

No roles or permission screens: everyone acts only on their own planner, and the stores above enforce it.
Server functions never take an account from the request; each one works only with what the request proves
(a QStash signature, a webhook password, an inbox key, a push subscription).

## Backend as source of truth (spec §4)

The API trusts nothing about the person from the client. Limits (lengths, counts, dates) are re-checked on the
server; the AI helpers bound every field they forward; `/api/reminders` refuses times more than 7 days ahead or
in the past, and push subscriptions for anything but the browsers' push services. `/api/notify` posts only to the
chat services' own hosts (`hooks.slack.com`, `discord.com`, `*.webhook.office.com` / `*.logic.azure.com` /
`*.powerplatform.com`, `ntfy.sh`, `hooks.zapier.com`, `hook*.make.com`, `maker.ifttt.com`), over https, on the
default port, with no credentials in the address and no redirects followed, so it cannot be used to reach
anything else (an open relay / SSRF); nothing from the remote reply is passed back. `/api/toggl` is not a relay at
all: the host (`api.track.toggl.com`) and both paths are fixed, and each entry is rebuilt from validated fields
(a real start and stop, at most a day long, not in the future, at most 40 per request).

## Abuse protection (spec §5)

| Surface | Protection |
|---|---|
| AI helpers (`/api/ask`, `autofill`, `meeting-notes`, `prompt-to-tasks`) | Per IP per minute and per day, **plus a daily total for everyone** (`AI_DAILY_LIMIT`, default 2 000): a cost ceiling, like the spec's per-business limit |
| `/api/reminders` | 20 / min per IP; at most 60 reminders added and 120 cancelled per request |
| `/api/feed` | Reads 60 / min per IP; writes 20 / min and 600 / day per IP; file ≤ 400 KB and must start with `BEGIN:VCALENDAR`; the secret must be 32–48 lowercase letters and digits, otherwise 404 |
| `/api/toggl` | 10 / min and 120 / day per IP; body ≤ 40 KB; a token that isn't 16–80 plain characters is refused before any request is made |
| `/api/notify` | 12 / min and 300 / day per IP; body ≤ 30 KB, message ≤ 3 500 characters; an address outside the allowed hosts is refused (400) without any request being made |
| `/api/inbox` | 30 / min per IP; a malformed inbox key is refused and security-logged |
| `/api/push` (QStash) | HMAC-SHA256 signature over the raw body (current or next key), expiry checked, timing-safe; 401 + security log otherwise |
| `/api/inbound` (Postmark) | Basic-auth webhook password, compared in constant time; 401 + security log otherwise; unknown addresses are accepted and dropped so keys can't be probed |
| Counters | **Shared by every instance through Upstash Redis** when `UPSTASH_REDIS_REST_URL` is set, otherwise per instance. If Redis is down they **fail open** (security-logged), as in the spec |
| Client IP | `x-vercel-forwarded-for` / `x-real-ip` (set by Vercel), never a client-typed `X-Forwarded-For` value |
| Body sizes | 20–120 KB on the JSON endpoints, 3 MB on inbound mail |

## Security checklist (spec §6)

- [x] **Security headers** on every response (`vercel.json`): Content-Security-Policy, HSTS (2 years), `nosniff`,
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (camera, location, payment, USB off; microphone only for this site, for voice input),
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` (Google's sign-in pop-up)
- [x] **CSP:** scripts only from this site, the pages' own inline theme scripts **by hash**, and Google's sign-in
  script; requests only to this site, Google APIs and Supabase; no plugins, no framing, no `<base>` tricks.
  The hashes are checked after every build (`npm run build` → `scripts/security-headers.mjs`): a changed inline
  script fails the build until `node scripts/security-headers.mjs --write` updates `vercel.json`. Hashes are
  computed with `\n` line endings, as browsers do, so Windows and Linux builds agree
- [x] **CORS allowlist** on the API: the site itself, the desktop app (`app://nineflow`) and `ALLOWED_ORIGINS`.
  Pages on other sites get `403` (security-logged); no `*`
- [x] **API responses** are `Cache-Control: no-store`
- [x] **Generic errors:** only deliberate messages reach the user; anything unexpected is a generic message
- [x] **Development stand-ins never ship:** the Google and Supabase mocks run only on the dev server
  (`import.meta.env.DEV`); the production build contains neither (checked)
- [x] **Secrets** only in environment variables; `.env.local` is git-ignored; config is checked per request
  (missing → `503` "not set up", never a half-working state)
- [x] **No `dangerouslySetInnerHTML`, `eval` or `innerHTML`** in the app; React escapes everything; emailed text is
  stored and shown as plain text
- [x] **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities (app and `mcp/`); the MCP SDK is pinned to
  a fixed release (1.31.0, the first without GHSA-6qxp-vccf-f47h); lockfiles committed
- [x] **Desktop app (Electron):** `contextIsolation`, `sandbox`, no `nodeIntegration`; the same CSP on its pages
  (requests to any `https:` address, since the API address is set per build); permission requests refused except
  notifications and the clipboard; `<webview>` blocked; navigation to other sites opens the system browser;
  one narrow `preload` bridge
- [x] **Personal data to third parties** is opt-in and described in `public/privacy.html` (reminders via
  Upstash + push services, email via Postmark + Upstash, AI helpers via Anthropic)
- [ ] **Your side, before going live:** set `VAPID_SUBJECT`, `INBOUND_WEBHOOK_PASSWORD` and the Upstash/Postmark
  secrets in Vercel only; restrict the Google OAuth clients to your real origins; fill in the privacy page's
  contact email

## Logging (spec §8)

- **Security events** are one JSON line each on stdout, `category: "security"`: `origin_refused`,
  `rate_limited` (with the rule), `rate_limit_store_down`, `push_bad_signature`, `inbound_bad_auth`,
  `inbox_bad_key`. They carry the route and a **12-character hash of the IP** (salted with `LOG_SALT`), never
  the IP itself, a body, an email, a task or a key.
- **Request and response bodies are never logged.** The API functions log nothing else.

## Not applicable to NineFlow

Tenants and tenant resolution; Postgres RLS on shared tables (beyond Supabase above); staff roles, permission
screens and store scope; OTP and password logins of our own; refresh-token rotation (Google and Supabase do it);
payments and payment webhooks; file uploads; exports with spreadsheet-formula neutralising. If NineFlow ever
adds teams or shared workspaces on a server, those sections of the spec apply in full.

## Files

- `api/_security.js`: CORS allowlist, client IP, shared rate limits, security log
- `scripts/security-headers.mjs`: the CSP and headers; build-time check of `vercel.json`
- `scripts/serve-dist.mjs`: serve the production build locally **with** those headers (`npm run build`, then
  `node scripts/serve-dist.mjs`, http://localhost:4175)
- `desktop/main.cjs`: `pageCsp()`, `lockDownSession()`
- `docs/SUPABASE_SETUP.md`: the RLS policies (enabled and forced)
