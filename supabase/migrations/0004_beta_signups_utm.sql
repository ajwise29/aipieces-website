-- 0004_beta_signups_utm.sql
-- Stage 3: make the public signup forms work and add UTM attribution.
--
-- Applied to the live project (pavjjiiztqxbfnxkqobc) on 2026-07-28 via the
-- Supabase Management API (database/query endpoint).
--
-- IMPORTANT — the live table did NOT match migrations 0001-0003. The real
-- columns observed on the live `beta_signups` were:
--   id (uuid), email, created_at, notified (bool), notified_at, source (text),
--   metadata (jsonb)
-- i.e. `locale` (claimed added in 0002) and the double-opt-in columns (0003)
-- were NOT present, and `notified`/`notified_at`/`metadata` exist but were never
-- captured in a migration. Treat 0001-0003 as unreliable historical docs; this
-- file reflects what was actually run against the live database.
--
-- TWO real problems were fixed here:
--
--   1. Missing `locale` column. All the signup forms (homepage, /join, and the
--      new /early-access.html) INSERT a `locale` field. Because the column did
--      not exist, every anonymous submission failed with HTTP 400 / PGRST204
--      ("Could not find the 'locale' column ... in the schema cache"). This is
--      why no signups had landed since Feb 2026.
--
--   2. Missing anon INSERT grant. RLS had an INSERT policy ("Anyone can sign up
--      for beta", with check true), but the `anon` role had NO table-level
--      privileges on beta_signups at all — so even a schema-valid INSERT failed
--      with HTTP 401 / 42501 ("permission denied for table beta_signups").
--      A policy permits a row; the role still needs the GRANT to touch the table.
--
-- Everything below is additive and safe. It does not alter existing data and
-- does not widen read access (anon gets INSERT only; still no SELECT).

-- Columns the forms reference. Additive, nullable-with-defaults.
alter table public.beta_signups
    add column if not exists locale       text default 'en',
    add column if not exists utm_source   text default 'direct',
    add column if not exists utm_medium   text default '',
    add column if not exists utm_campaign text default '';

-- Grant the anonymous PostgREST role INSERT (and only INSERT) on the table, so
-- the public signup forms can write. No SELECT/UPDATE/DELETE grant: the signup
-- list stays non-enumerable by the anon key (verified: anon SELECT -> 401).
grant insert on table public.beta_signups to anon;

-- RLS: unchanged. The existing INSERT policy is `with check (true)`, which
-- authorises the row regardless of which columns are supplied, so the new
-- columns need no policy edit. There is no column allowlist to update — the
-- anon key inserts through PostgREST against the table directly, so any column
-- the table exposes is insertable under the existing policy. The utm_* columns
-- (and locale) are write-only from the client's perspective: insertable, never
-- readable back with the anon key.
