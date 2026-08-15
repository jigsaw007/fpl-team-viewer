# FPL Peek: Supabase cloud sync setup

FPL Peek works without Supabase. Configure this only when you want optional accounts and cross-device Planner sync.

## 1. Create a Supabase project

Create a project in the Supabase dashboard and wait until the database is ready.

## 2. Create the tables and security policies

Open **SQL Editor**, paste the complete contents of `supabase/setup.sql`, and run it.

This creates:

- `profiles` — optional FPL Peek profile / saved Team ID metadata
- `plans` — each user's Planner drafts as JSON
- Row Level Security policies so authenticated users can only access their own rows

## 3. Configure passwordless email authentication

In **Authentication > Providers**, keep Email enabled.

In **Authentication > URL Configuration** set:

- **Site URL:** `https://fplpeek.com/`
- **Redirect URL:** `https://fplpeek.com/`
- For local Netlify testing also add: `http://localhost:8888/`

FPL Peek uses Supabase Magic Links. Users never enter an FPL password and FPL Peek never signs in to the official Fantasy Premier League site.

## 4. Add your public browser configuration

Open **Project Settings > API** and copy the Project URL and browser-safe **Publishable key**.

Edit `js/supabase-config.js`:

```js
window.FPLPeekConfig = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_YOUR_KEY"
};
```

Do not use a `service_role`, secret, or server key in frontend files.

## 5. Deploy and test

Deploy to Netlify, then:

1. Open FPL Peek.
2. The sidebar should show **Cloud sync / Sign in**.
3. Create a Planner draft while signed out; it should save locally.
4. Sign in with an email Magic Link.
5. The local draft should be uploaded to the account automatically.
6. Open FPL Peek in another browser/device, sign in with the same email, and confirm the draft appears.

## Production email note

For public sign-in, configure a custom SMTP provider in Supabase Auth. The built-in Supabase email service is intended for testing, can restrict delivery to project-team addresses, and has strict rate limits.
