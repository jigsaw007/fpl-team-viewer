# FPL Peek Auth email templates

Paste these into **Supabase > Authentication > Email Templates**.

Recommended subjects:

- Confirm signup: `Confirm your FPL Peek account`
- Magic Link: `Sign in to FPL Peek`

Use:

- `confirmation.html` for **Confirm signup**
- `magic-link.html` for **Magic Link**

Both templates use Supabase's `{{ .ConfirmationURL }}` variable.

To make the sender appear as an FPL Peek domain address, configure **Custom SMTP** in Supabase. A suggested sender is:

- Sender name: `FPL Peek`
- Sender email: `account@fplpeek.com`

The sender address must exist or be authorized by the SMTP/email provider you choose. The frontend cannot change the From address by itself.
