# Supabase schema (version-controlled)

The live Supabase project (`pavjjiiztqxbfnxkqobc`) was originally set up via the
dashboard. This folder is the source of truth for its schema and RLS going forward.

## Tables in use by the website
- `beta_signups` — homepage + `/join` + `/early-access.html` early-access signup form (EN/DE/FR/ES).
- `blog_comments` — comments on `research-blog-post01.html` (not managed here yet).

## Migrations
Apply in order, in the dashboard SQL editor, unless using the Supabase CLI.

| File | Purpose |
|------|---------|
| `migrations/0001_beta_signups_baseline.sql` | Reverse-engineered baseline of the existing table + RLS. Do **not** run wholesale against the live DB (table already exists); it documents current state. |
| `migrations/0002_beta_signups_locale_source.sql` | Stage 1: adds `locale` + `source` columns. **Run this one** against the live project. Additive, no RLS change. |
| `migrations/0003_beta_signups_double_optin.sql` | Stage 2: adds `confirmed`, `confirm_token`, `confirmed_at` for double opt-in. Additive, no RLS change. |
| `migrations/0004_beta_signups_utm.sql` | Stage 3: adds `utm_source`, `utm_medium`, `utm_campaign` for the `/early-access.html` landing page. **Run this before deploying `/early-access.html`** — the form inserts these columns and PostgREST 400s if they don't exist. Additive, no RLS change. |

## Edge Functions (Stage 2 — double opt-in via Resend)
- `functions/send-confirm-email/` — triggered by a DB webhook on INSERT; sends the locale-specific "confirm your email" via Resend from `noreply@aipieces.org` (reply-to `alina@aipieces.org`).
- `functions/confirm-signup/` — handles the confirm-link click, flips `confirmed=true` (service_role, bypasses RLS), returns a locale success page. Deploy with `--no-verify-jwt`.
- See `functions/DEPLOY.md` for the full runbook + Namecheap DNS (DKIM/SPF/DMARC).

## RLS summary
- RLS is ON for `beta_signups`.
- Anon may **INSERT** only (`with check (true)`).
- Anon has **no SELECT/UPDATE/DELETE** policy → those are denied (verified: 401, code 42501).
- Adding columns does not change this — new columns are write-only to the anon client.
- Confirmation is an UPDATE done only by the `confirm-signup` function via service_role; anon cannot self-confirm or read the token.
