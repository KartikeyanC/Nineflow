# Email + password accounts (Supabase): setup

NineFlow can let people sign up with an email address and a password, next to (or instead of) Google sign-in. Those accounts are hosted on [Supabase](https://supabase.com):

- **Supabase Auth** holds the accounts and sends the confirmation and password-reset emails.
- One row per person in a **`planner_data`** table holds their planner (the same JSON bundle Google accounts keep in Drive).
- **Row-level security** means a signed-in person can only ever read or write their own row.

There's still no server of your own: the browser talks to Supabase directly. Setup takes about 10 minutes, and the free plan is enough to start.

## 1. Create a Supabase project

1. Go to <https://supabase.com/dashboard>, sign in, and click **New project**.
2. Name it, for example *NineFlow*, choose a region close to your users, and set a database password (you won't need it in the app).

## 2. Create the tables

Open **SQL Editor → New query**, paste this, and click **Run**:

```sql
-- One row per person: their whole planner.
create table public.planner_data (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- If two devices save at the same moment, the losing device's copy is kept here.
create table public.planner_conflicts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- The server sets the time of every save, so devices with wrong clocks can't confuse sync.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger planner_data_touch before insert or update on public.planner_data
  for each row execute function public.touch_updated_at();

-- Each person reaches only their own rows.
alter table public.planner_data enable row level security;
alter table public.planner_conflicts enable row level security;

create policy "Own planner" on public.planner_data for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own conflict copies" on public.planner_conflicts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add own conflict copies" on public.planner_conflicts for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.planner_data to authenticated;
grant select, insert on public.planner_conflicts to authenticated;
```

Deleting a user under **Authentication → Users** also deletes their planner (`on delete cascade`).

## 3. Set up sign-in

Under **Authentication**:

1. **Sign In / Providers → Email**: keep it enabled. Leave **Confirm email** on, so people prove they own the address. Set the **minimum password length** to **8** to match the app. Set **Email OTP Length** to **6** (the app shows six boxes) and **Email OTP Expiration** to **3600** seconds (the screen says the code works for one hour).
2. **URL Configuration**:
   - **Site URL**: your real address, for example `https://planner.example.com`.
   - **Redirect URLs**: add every address the app runs on, for example `http://localhost:5173` and `https://planner.example.com`. The confirmation and password-reset links return here.
3. **Emails → Templates → Confirm signup**: new accounts confirm with a **6-digit code** typed into the app, not a link. Supabase only puts a code in the email if the template uses `{{ .Token }}`, so replace the template body with something like:

   ```html
   <h2>Your NineFlow code</h2>
   <p>Enter this code in NineFlow to confirm your email:</p>
   <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>It works for one hour. If you didn't sign up, you can ignore this email.</p>
   ```

   Subject: `Your NineFlow code: {{ .Token }}`. Leave the **Reset password** email as a link.
4. **Emails / SMTP**: Supabase's built-in email service only sends a few emails an hour, and only to your project's team members. That's fine for testing; before real people sign up, add your own SMTP provider under **SMTP Settings**.

## 4. Give the app the project's address and key

1. Open **Project Settings → API Keys** (and **Data API** for the URL).
2. In the project folder, copy `.env.example` to `.env.local` if you haven't yet, and fill in:

   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_KEY=<publishable key, sb_publishable_…, or the legacy anon key>
   ```

   Both are meant to be public; row-level security is what protects the data. **Never** put the `service_role` / secret key in the app.
3. Remove `VITE_SUPABASE_MOCK=1` if it's there, and restart `npm run dev`.

The sign-in screen now shows an email form. If `VITE_GOOGLE_CLIENT_ID` is also set, it shows **Sign up with Google** above it; leave that out to offer email accounts only.

## Trying it without a Supabase project

Put `VITE_SUPABASE_MOCK=1` in `.env.local` and restart the dev server. A stand-in keeps accounts and planners in the browser's localStorage and sends no email. New sign-ups get a 6-digit code, shown on the code screen and printed in the browser console; password-reset links are printed in the console. It never runs in a production build.

To change its behaviour, set these in localStorage (DevTools → Application → Local Storage):

| Key | Effect |
| --- | --- |
| `mock-supabase-confirm` = `0` | Skip the code: new sign-ups go straight in |
| `mock-supabase-offline` = `1` | Every call fails as if there were no connection |
| `mock-supabase-expired` = `1` | Saving fails as if the session had ended, which shows the "log in again" banner |

Any email and password work. The account used when this feature was tested is `tester@example.test` with the password `planner-test-2026c`. It only exists in that browser's stand-in, never in a real project.

## How it fits together

- `src/lib/supabase.js`: sign-up, log-in, password reset, and the `planner_data` row.
- `src/lib/supabaseMock.js`: the development stand-in.
- `src/lib/cloud.js`: the sync loop. It saves Google accounts (profile ids `g_…`) to Drive and email accounts (`e_…`) to Supabase, with the same offline cache and conflict handling.
- Sessions stay signed in and renew themselves. If one ends (for example, it was revoked in the Supabase dashboard), a banner asks for the password again. Nothing is lost meanwhile: changes wait on the device.
