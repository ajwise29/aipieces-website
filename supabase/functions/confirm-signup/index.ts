// confirm-signup
//
// Handles the click on the "Confirm your email" link. Looks up the row by
// confirm_token, sets confirmed=true + confirmed_at=now(), and returns a
// locale-specific HTML success page. Uses the service_role key (bypasses RLS);
// the anon client can never call this path to self-confirm.
//
// Env vars:
//   SUPABASE_URL              - auto-injected in Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY - auto-injected in Edge Functions
//
// URL: /functions/v1/confirm-signup?token=<uuid>&locale=<en|de|fr|es>
//
// NOTE: This function must be deployed with JWT verification DISABLED so the
// public link works without an auth header:
//   supabase functions deploy confirm-signup --no-verify-jwt

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Locale = "en" | "de" | "fr" | "es";

const HOME: Record<Locale, string> = {
  en: "https://aipieces.org/",
  de: "https://aipieces.org/de/",
  fr: "https://aipieces.org/fr/",
  es: "https://aipieces.org/es/",
};

const COPY: Record<Locale, { ok_h: string; ok_p: string; already_h: string; already_p: string; bad_h: string; bad_p: string; back: string }> = {
  en: {
    ok_h: "You're confirmed 🧭",
    ok_p: "Thanks — your email is confirmed and your place on the FamilyCompass early-access list is secured. We'll be in touch when early access opens later this year.",
    already_h: "Already confirmed 🧭",
    already_p: "Your email was already confirmed. You're on the list — nothing more to do.",
    bad_h: "Link not valid",
    bad_p: "This confirmation link is invalid or has expired. Please sign up again from the homepage.",
    back: "Back to aipieces.org",
  },
  de: {
    ok_h: "Bestätigt 🧭",
    ok_p: "Vielen Dank — Ihre E-Mail ist bestätigt und Ihr Platz auf der FamilyCompass-Early-Access-Liste ist gesichert. Wir melden uns, sobald der Early Access noch dieses Jahr öffnet.",
    already_h: "Bereits bestätigt 🧭",
    already_p: "Ihre E-Mail wurde bereits bestätigt. Sie stehen auf der Liste — nichts weiter zu tun.",
    bad_h: "Link ungültig",
    bad_p: "Dieser Bestätigungslink ist ungültig oder abgelaufen. Bitte melden Sie sich erneut über die Startseite an.",
    back: "Zurück zu aipieces.org",
  },
  fr: {
    ok_h: "Confirmé 🧭",
    ok_p: "Merci — votre e-mail est confirmé et votre place sur la liste d'accès anticipé FamilyCompass est réservée. Nous vous contacterons à l'ouverture de l'accès anticipé, plus tard cette année.",
    already_h: "Déjà confirmé 🧭",
    already_p: "Votre e-mail a déjà été confirmé. Vous êtes sur la liste — rien de plus à faire.",
    bad_h: "Lien non valide",
    bad_p: "Ce lien de confirmation est invalide ou a expiré. Veuillez vous réinscrire depuis la page d'accueil.",
    back: "Retour à aipieces.org",
  },
  es: {
    ok_h: "Confirmado 🧭",
    ok_p: "Gracias — tu correo está confirmado y tu lugar en la lista de acceso anticipado de FamilyCompass está asegurado. Te contactaremos cuando se abra el acceso anticipado, más adelante este año.",
    already_h: "Ya confirmado 🧭",
    already_p: "Tu correo ya estaba confirmado. Estás en la lista — no hay nada más que hacer.",
    bad_h: "Enlace no válido",
    bad_p: "Este enlace de confirmación no es válido o ha caducado. Vuelve a registrarte desde la página de inicio.",
    back: "Volver a aipieces.org",
  },
};

function page(locale: Locale, heading: string, body: string): Response {
  const html = `<!doctype html><html lang="${locale}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${heading}</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       background:#faf6ef;color:#3a2f24;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:520px;text-align:center;background:#fff;border:1px solid rgba(139,105,20,0.2);
        border-radius:20px;padding:48px 36px;box-shadow:0 10px 40px rgba(139,105,20,0.08);}
  h1{color:#8b6914;font-size:1.6rem;margin:0 0 16px;}
  p{color:#5a4a3a;line-height:1.6;font-size:1.05rem;margin:0 0 28px;}
  a{display:inline-block;padding:12px 26px;background:#8b6914;color:#fff;text-decoration:none;
    border-radius:50px;font-weight:600;}
</style></head><body>
  <div class="card"><h1>${heading}</h1><p>${body}</p><a href="${HOME[locale]}">${COPY[locale].back}</a></div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const token = u.searchParams.get("token") ?? "";
  const localeRaw = u.searchParams.get("locale") ?? "en";
  const locale: Locale = (["en", "de", "fr", "es"].includes(localeRaw) ? localeRaw : "en") as Locale;
  const c = COPY[locale];

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(token)) {
    return page(locale, c.bad_h, c.bad_p);
  }

  const headers = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  // Only flip rows that are not yet confirmed; return the affected row(s).
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/beta_signups?confirm_token=eq.${token}&confirmed=eq.false`,
    { method: "PATCH", headers, body: JSON.stringify({ confirmed: true, confirmed_at: new Date().toISOString() }) },
  );
  const patched = await patchRes.json().catch(() => []);

  if (Array.isArray(patched) && patched.length > 0) {
    return page(locale, c.ok_h, c.ok_p);
  }

  // No row flipped: either token doesn't exist, or it was already confirmed.
  // Distinguish by checking existence.
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/beta_signups?confirm_token=eq.${token}&select=confirmed`,
    { method: "GET", headers },
  );
  const rows = await checkRes.json().catch(() => []);
  if (Array.isArray(rows) && rows.length > 0) {
    return page(locale, c.already_h, c.already_p);
  }
  return page(locale, c.bad_h, c.bad_p);
});
