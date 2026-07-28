# Supabase DB work — runbook (how to actually run SQL against the live project)

Project ref: `pavjjiiztqxbfnxkqobc` ("AI pieces", West Europe / London).

## TL;DR
This website repo **shares one Postgres database with the FamilyCompass
mobile-app repo**, which owns most of the migration history (`101_*`, `102_*`,
`103_*`, `104_*`, …). Because of that, `supabase db push` from THIS repo does
**not** work — it demands a local file for every remote history version and we
can't/shouldn't reproduce the app's migrations here.

**Use the Supabase Management API `/database/query` endpoint to run SQL.** It
ignores migration history entirely and was the only clean path (verified
2026-07-28).

## Auth (primary path: .env service_role)
- A gitignored **`.env`** in the repo root holds `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`
  (same DB as the FamilyCompass app). This is the same setup that gives the
  FamilyCompass workspace frictionless access. Source it: `set -a; . ./.env; set +a`.
- **service_role key** = full DB access via PostgREST, bypassing RLS. Use it for
  reads/writes/exports on tables (SELECT/INSERT/UPDATE/DELETE). It is a MASTER
  key — never commit `.env`, never expose it client-side.
- **DDL (ALTER TABLE / GRANT / CREATE POLICY):** PostgREST won't run raw DDL.
  Two options: (a) Management API `/database/query` with a fresh `sbp_` account
  token (get from https://supabase.com/dashboard/account/tokens, use, revoke);
  (b) the Supabase dashboard SQL editor. `SUPABASE_DB_PASSWORD` in .env may be
  rotated/stale (direct `postgres` login failed 2026-07-28) — don't rely on it.
- The CLI is also logged in via keychain, but `db push` from this repo does NOT
  work (see TL;DR).

### Data ops with service_role (works today)
```bash
set -a; . ./.env; set +a
# read (bypasses RLS — anon can't do this):
curl -s "$SUPABASE_URL/rest/v1/beta_signups?select=email,utm_source,created_at&order=created_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

## Run SQL (Management API)
```bash
SBP='sbp_...'                       # fresh per-task token, revoke after
REF='pavjjiiztqxbfnxkqobc'
# put the SQL in a file to avoid shell-quoting bugs with single quotes:
printf '%s' '{"query":"select 1;"}' > /tmp/q.json
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SBP" -H "Content-Type: application/json" \
  --data-binary @/tmp/q.json
```
Success returns `[]` (or the rows). `201`/`200` = ok.

## Hard-won facts about `beta_signups` (the signup table)
Live columns (after 2026-07-28 fix): `id uuid`, `email`, `created_at`,
`notified bool`, `notified_at`, `source text` (default 'website'),
`metadata jsonb` (default '{}'), `locale text`, `utm_source`, `utm_medium`,
`utm_campaign`.

Two gotchas that had silently broken ALL public signups since ~Feb 2026:
1. **Every form INSERTs `locale`** — the column was missing → `400 PGRST204`.
   (Fixed: column added.)
2. **`anon` had NO table GRANT** — an INSERT RLS policy existed, but the anon
   role lacked `INSERT` privilege → `401 42501 permission denied`. A policy
   permits a row; the role still needs `grant insert ... to anon`.
   (Fixed: `grant insert on table public.beta_signups to anon;`)

RLS/grant design to preserve: anon may **INSERT only**. No SELECT grant/policy →
the signup list is not enumerable by the anon key (verify: anon SELECT → 401).
New columns are additive and write-only to anon; no policy edit needed.

## Verifying a signup works (end to end)
```bash
ANON='<anon key from index.html>'; URL='https://pavjjiiztqxbfnxkqobc.supabase.co'
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL/rest/v1/beta_signups" \
  -H "Content-Type: application/json" -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" -H "Prefer: return=minimal" \
  -d '{"email":"test@example.com","locale":"en","source":"instagram","utm_source":"instagram","utm_medium":"bio","utm_campaign":""}'
# expect 201. Then delete the test row via the Management API before finishing.
```

## Do NOT
- Do NOT run `supabase migration repair --status reverted 101 102 103 104` (the
  CLI suggests it). That would mark the APP's live migrations as un-applied and
  could corrupt the shared history / trigger re-runs from the app repo.
- Do NOT `db push` from this repo (see TL;DR).
- Do NOT grant anon SELECT/UPDATE/DELETE on beta_signups.
