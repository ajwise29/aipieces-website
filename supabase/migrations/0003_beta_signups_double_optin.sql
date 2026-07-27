-- 0003_beta_signups_double_optin.sql
-- Stage 2: double opt-in support for beta_signups.
--
-- Run in the Supabase dashboard SQL editor against the live project.
-- Additive and safe. Does NOT open up anon SELECT.

alter table public.beta_signups
    add column if not exists confirmed     boolean not null default false,
    add column if not exists confirm_token uuid    not null default gen_random_uuid(),
    add column if not exists confirmed_at   timestamptz;

-- Fast lookup by token for the confirmation endpoint (runs as service_role,
-- but the index helps regardless).
create index if not exists beta_signups_confirm_token_idx
    on public.beta_signups (confirm_token);

-- RLS: NO CHANGE.
--   * Anon INSERT policy stays `with check (true)`.
--   * The anon client never sends confirmed/confirm_token — DB defaults apply
--     (confirmed=false, a fresh random token). Anon still cannot SELECT, so it
--     can never read the token back. Good: the token is only ever exposed to
--     the user via the email we send from the Edge Function (service_role).
--   * Confirmation flips confirmed=true. That UPDATE is performed ONLY by the
--     confirm-signup Edge Function using the service_role key, which bypasses
--     RLS. Anon has no UPDATE policy, so no client can self-confirm or tamper.
