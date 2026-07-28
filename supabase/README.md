# Supabase schema (version-controlled)

The live Supabase project (`pavjjiiztqxbfnxkqobc`) was originally set up via the
dashboard. This folder is the source of truth for its schema and RLS going forward.

> ⚠️ **Reality check (2026-07-28):** the live `beta_signups` table did NOT match
> migrations 0001–0003. Actual live columns before Stage 3 were: `id (uuid)`,
> `email`, `created_at`, `notified`, `notified_at`, `source`, `metadata (jsonb)`.
> `locale` (0002) and the double-opt-in columns (0003) were never present, and
> `notified`/`notified_at`/`metadata` were never captured in a migration. Two
> live defects were fixed in `0004`: (1) the missing `locale` column that made
> every form INSERT fail with 400/PGRST204, and (2) the missing anon INSERT
> **grant** that made INSERTs fail with 401/42501 even though an INSERT policy
> existed. Treat 0001–0003 as unreliable historical notes; trust the live DB.

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
| `migrations/0004_beta_signups_utm.sql` | Stage 3 (**applied to live 2026-07-28**): adds `locale` + `utm_source`/`utm_medium`/`utm_campaign`, and **grants `anon` INSERT** so the public forms actually work. Fixes the 400 (missing `locale`) and 401 (missing anon grant) that were silently breaking every signup. Additive; anon still has no SELECT. |

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
