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
  SUPABASE_URL: "https://prilfnfijgxzohbynogc.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_eIGtwV3_Ql8NPXtw3Yy3jw_I4ykeQYt"
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

## 6. Brand the authentication email

The app includes ready-to-paste templates in `supabase/email-templates/`:

- `confirmation.html` — first-time email confirmation
- `magic-link.html` — returning-user sign-in link

In **Authentication > Email Templates** set the recommended subjects:

- Confirm signup: `Confirm your FPL Peek account`
- Magic Link: `Sign in to FPL Peek`

Then paste the matching HTML templates.

## 7. Send from an @fplpeek.com address

This cannot be changed by frontend JavaScript. Configure **Authentication > SMTP Settings** in Supabase with an SMTP provider or an existing mailbox provider that supports authenticated SMTP.

Recommended identity:

- Sender name: `FPL Peek`
- Sender email: `account@fplpeek.com`

Enter the SMTP host, port, username and password supplied by your email provider. Supabase Auth supports custom SMTP and will use this sender for Auth messages.

For production deliverability, configure the SPF, DKIM and DMARC DNS records requested by your mail provider. Because `fplpeek.com` already has mail-related DNS records, do **not** blindly replace an existing SPF record; merge/adjust it according to your provider's instructions.

Supabase's built-in mail service is suitable for development/testing, not public production delivery.

## 8. Test the complete sign-in flow

1. Deploy to `https://fplpeek.com/`.
2. Request a sign-in link.
3. Confirm the UI switches to the **Check your email** state and prevents repeated sends for 60 seconds.
4. Open the email and confirm the sender name/address are branded as FPL Peek.
5. Follow the email button back to FPL Peek.
6. Confirm the sidebar reports Planner sync enabled.
7. Test the same account in a second browser/device.
