-- 0004_beta_signups_utm.sql
-- Stage 3: add UTM attribution columns to beta_signups.
--
-- Run this in the Supabase dashboard SQL editor against the live project
-- (pavjjiiztqxbfnxkqobc). Recommended, but NOT a hard prerequisite for deploy:
-- the /early-access.html form is resilient — it first tries to insert the
-- dedicated utm_source / utm_medium / utm_campaign columns, and if PostgREST
-- rejects that because the columns don't exist yet (HTTP 400 / PGRST204), it
-- transparently retries with the UTM data JSON-encoded into the existing
-- `source` column, so no signup is ever lost. Applying this migration promotes
-- that UTM data into clean, queryable dedicated columns going forward.
--
-- Additive and safe: three nullable text columns with defaults. Does NOT touch RLS.

alter table public.beta_signups
    add column if not exists utm_source   text default 'direct',
    add column if not exists utm_medium   text default '',
    add column if not exists utm_campaign text default '';

-- RLS: NO CHANGE REQUIRED.
--
-- The existing anon INSERT policy is `with check (true)`, which authorises the
-- row regardless of which columns are supplied — adding columns does not widen
-- anon access. Anon still has no SELECT policy, so utm_source/utm_medium/
-- utm_campaign are write-only from the client: they can be inserted but never
-- read back with the anon key. No policy edit is needed to accept these columns.
--
-- There is no column allowlist to update: the anon key inserts through PostgREST
-- against the table directly (not a restricted view or an RPC with a fixed
-- signature), so any column the table exposes is insertable under the existing
-- policy. Once these three columns exist, the early-access form's INSERT
-- succeeds unchanged. (The pre-existing `source` column is retained and still
-- populated for backward compatibility with the older homepage/join forms.)
