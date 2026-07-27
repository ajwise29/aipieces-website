-- 0002_beta_signups_locale_source.sql
-- Stage 1: add locale + source tracking to beta_signups.
--
-- Run this in the Supabase dashboard SQL editor against the live project.
-- It is additive and safe: it adds two nullable columns with defaults and does
-- NOT touch RLS. Existing rows get the defaults; new inserts populate them.

alter table public.beta_signups
    add column if not exists locale text not null default 'en',
    add column if not exists source text not null default 'direct';

-- Constrain locale to the four supported languages. Existing rows already
-- satisfy this via the 'en' default. Drop-if-exists keeps this re-runnable.
alter table public.beta_signups
    drop constraint if exists beta_signups_locale_check;
alter table public.beta_signups
    add constraint beta_signups_locale_check
    check (locale in ('en', 'de', 'fr', 'es'));

-- RLS: NO CHANGE REQUIRED.
--
-- The existing INSERT policy uses `with check (true)`, which authorises the row
-- regardless of which columns are supplied. Adding columns does not widen anon
-- access: anon still cannot SELECT (no select policy exists), so locale/source
-- are write-only from the client's perspective — they can be inserted but never
-- read back by the anon key. No policy edit is needed to accept these columns,
-- and none is needed to keep SELECT closed.
