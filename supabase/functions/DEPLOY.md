# Stage 2 deploy runbook (double opt-in + Resend)

Do NOT run any of this until the email drafts + success page are approved.

## 0. Prereqs
- Supabase CLI installed and `supabase link`ed to project `pavjjiiztqxbfnxkqobc`.
- A Resend account with `aipieces.org` added as a domain (DNS records below).
- From address: `AI Pieces <noreply@aipieces.org>` (no mailbox needed — domain verified in Resend).
  Replies go to `alina@aipieces.org` via the reply_to header.

## 1. Migration
Run `supabase/migrations/0003_beta_signups_double_optin.sql` in the dashboard SQL editor
(or `supabase db push` if managing migrations via CLI).

## 2. Secrets
```
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set CONFIRM_BASE_URL=https://pavjjiiztqxbfnxkqobc.supabase.co/functions/v1/confirm-signup
supabase secrets set FROM_EMAIL="AI Pieces <noreply@aipieces.org>"
supabase secrets set REPLY_TO=alina@aipieces.org
```
(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

## 3. Deploy functions
```
supabase functions deploy send-confirm-email
supabase functions deploy confirm-signup --no-verify-jwt
```
`--no-verify-jwt` on confirm-signup so the public email link works without an auth header.
send-confirm-email keeps JWT verification (it's called by the DB webhook, which sends the key).

## 4. Wire the trigger (Database Webhook)
Dashboard → Database → Webhooks → Create:
- Table: `public.beta_signups`
- Events: `INSERT` only
- Type: Supabase Edge Function → `send-confirm-email`
- Method POST (default). The webhook auto-includes the service key.

## 5. Test
- Submit a signup from each locale homepage (?utm_source=test).
- Confirm you receive the confirm email in the right language, from noreply@aipieces.org,
  and that replying to it goes to alina@aipieces.org.
- Click the button → success page in the right language → row shows confirmed=true, confirmed_at set.
- Click again → "already confirmed" page.
- Hit the confirm URL with a bogus token → "link not valid" page.

## DNS records — add in Namecheap (Advanced DNS for aipieces.org)
GitHub Pages hosts the site; these records are email-auth only and don't affect hosting.
Resend will show you the EXACT values in its dashboard when you add the domain — use those;
the below is the shape/what each is for. Namecheap: enter Host WITHOUT the domain suffix
(Namecheap appends aipieces.org automatically — so host `resend._domainkey`, not the FQDN).

1. DKIM (Resend gives you the exact key; type is usually TXT or CNAME):
   - Type: TXT (or CNAME, per Resend)
   - Host: `resend._domainkey`   (Resend may use a different selector — copy theirs)
   - Value: (the long p=... key Resend provides)

2. SPF — authorises Resend to send for the domain. You likely ALREADY have an SPF record
   for Zoho. DO NOT create a second SPF TXT record — merge into the existing one.
   - Existing (Zoho) looks like:  `v=spf1 include:zoho.eu ~all`
   - Merged:                      `v=spf1 include:zoho.eu include:amazonses.com ~all`
     (Resend sends via Amazon SES; use the include value Resend shows you — often
      `include:amazonses.com` or a resend-specific one. Only ONE SPF record total.)

3. DMARC — reporting/policy. If you don't have one yet, add:
   - Type: TXT
   - Host: `_dmarc`
   - Value: `v=DMARC1; p=none; rua=mailto:alina@aipieces.org`
     (Start with p=none to monitor; tighten to quarantine/reject once DKIM+SPF verify clean.)

4. (Optional, Resend may request) a MX/return-path/tracking CNAME like `send.aipieces.org`
   — add exactly what Resend lists. It won't conflict with GitHub Pages.

After adding, click "Verify" in Resend. Propagation is usually minutes, up to a few hours.
```
