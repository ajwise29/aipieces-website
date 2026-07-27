// send-confirm-email
//
// Triggered by a Supabase Database Webhook on INSERT into public.beta_signups.
// Sends a locale-specific "confirm your email" message via Resend, containing a
// link to the confirm-signup function with the row's confirm_token.
//
// Env vars (set with `supabase secrets set`):
//   RESEND_API_KEY   - Resend API key
//   CONFIRM_BASE_URL - e.g. https://pavjjiiztqxbfnxkqobc.supabase.co/functions/v1/confirm-signup
//   FROM_EMAIL       - e.g. "AI Pieces <noreply@aipieces.org>"
//   REPLY_TO         - e.g. "alina@aipieces.org" (replies land here)
//
// Webhook config (dashboard → Database → Webhooks):
//   Table: beta_signups, Events: INSERT, Type: Supabase Edge Function → send-confirm-email

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CONFIRM_BASE_URL = Deno.env.get("CONFIRM_BASE_URL")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "AI Pieces <noreply@aipieces.org>";
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "alina@aipieces.org";

type Locale = "en" | "de" | "fr" | "es";

// Subjects + HTML bodies per locale. {{URL}} is replaced with the confirm link.
const TEMPLATES: Record<Locale, { subject: string; html: string }> = {
  en: {
    subject: "Confirm your email — FamilyCompass early access 🧭",
    html: `
      <p>Thanks for signing up for FamilyCompass early access. Please confirm your email to secure your place on the list.</p>
      <p><a href="{{URL}}" style="display:inline-block;padding:14px 28px;background:#8b6914;color:#fff;text-decoration:none;border-radius:50px;font-weight:600;">Confirm your email</a></p>
      <p style="color:#5a4a3a;">FamilyCompass helps families coordinate care, calendars and messaging — privately and end-to-end encrypted. We'll email you the moment early access opens (later this year).</p>
      <p style="color:#8a7a6a;font-size:0.9em;">If you didn't sign up, you can ignore this email — nothing further will happen.</p>
      <p style="color:#5a4a3a;">— Alina, AI Pieces</p>`,
  },
  de: {
    subject: "Bestätigen Sie Ihre E-Mail — FamilyCompass Early Access 🧭",
    html: `
      <p>Vielen Dank für Ihre Anmeldung zum FamilyCompass Early Access. Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihren Platz auf der Liste zu sichern.</p>
      <p><a href="{{URL}}" style="display:inline-block;padding:14px 28px;background:#8b6914;color:#fff;text-decoration:none;border-radius:50px;font-weight:600;">E-Mail bestätigen</a></p>
      <p style="color:#5a4a3a;">FamilyCompass hilft Familien, Pflege, Kalender und Nachrichten zu koordinieren — privat und Ende-zu-Ende-verschlüsselt. Wir benachrichtigen Sie, sobald der Early Access öffnet (noch dieses Jahr).</p>
      <p style="color:#8a7a6a;font-size:0.9em;">Falls Sie sich nicht angemeldet haben, können Sie diese E-Mail ignorieren — es passiert nichts weiter.</p>
      <p style="color:#5a4a3a;">— Alina, AI Pieces</p>`,
  },
  fr: {
    subject: "Confirmez votre e-mail — accès anticipé FamilyCompass 🧭",
    html: `
      <p>Merci de vous être inscrit·e à l'accès anticipé de FamilyCompass. Veuillez confirmer votre adresse e-mail pour réserver votre place sur la liste.</p>
      <p><a href="{{URL}}" style="display:inline-block;padding:14px 28px;background:#8b6914;color:#fff;text-decoration:none;border-radius:50px;font-weight:600;">Confirmer votre e-mail</a></p>
      <p style="color:#5a4a3a;">FamilyCompass aide les familles à coordonner soins, agendas et messages — en toute confidentialité et avec un chiffrement de bout en bout. Nous vous préviendrons dès l'ouverture de l'accès anticipé (plus tard cette année, automne 2026).</p>
      <p style="color:#8a7a6a;font-size:0.9em;">Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail — rien d'autre ne se passera.</p>
      <p style="color:#5a4a3a;">— Alina, AI Pieces</p>`,
  },
  es: {
    subject: "Confirma tu correo — acceso anticipado a FamilyCompass 🧭",
    html: `
      <p>Gracias por registrarte para el acceso anticipado a FamilyCompass. Confirma tu correo electrónico para asegurar tu lugar en la lista.</p>
      <p><a href="{{URL}}" style="display:inline-block;padding:14px 28px;background:#8b6914;color:#fff;text-decoration:none;border-radius:50px;font-weight:600;">Confirmar tu correo</a></p>
      <p style="color:#5a4a3a;">FamilyCompass ayuda a las familias a coordinar cuidados, calendarios y mensajes — de forma privada y con cifrado de extremo a extremo. Te avisaremos en cuanto se abra el acceso anticipado (más adelante este año, otoño de 2026).</p>
      <p style="color:#8a7a6a;font-size:0.9em;">Si no te registraste, puedes ignorar este correo — no ocurrirá nada más.</p>
      <p style="color:#5a4a3a;">— Alina, AI Pieces</p>`,
  },
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Database Webhook payload shape: { type, table, record, ... }
    const record = payload.record ?? payload;
    const email: string | undefined = record?.email;
    const token: string | undefined = record?.confirm_token;
    const localeRaw: string = record?.locale ?? "en";
    const locale: Locale = (["en", "de", "fr", "es"].includes(localeRaw) ? localeRaw : "en") as Locale;

    if (!email || !token) {
      return new Response(JSON.stringify({ error: "missing email or confirm_token" }), { status: 400 });
    }

    const url = `${CONFIRM_BASE_URL}?token=${encodeURIComponent(token)}&locale=${locale}`;
    const tpl = TEMPLATES[locale];
    const html = tpl.html.replace("{{URL}}", url);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        reply_to: REPLY_TO,
        to: [email],
        subject: tpl.subject,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Resend error", res.status, detail);
      return new Response(JSON.stringify({ error: "send failed", detail }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
