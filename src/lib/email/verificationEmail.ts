import { sendTransactionalEmail } from "./client";
import { EMAIL_VERIFICATION } from "./emailFlags";
import { buildLogoHtml } from "./emailLogo";

export interface SendVerificationEmailParams {
  to: string;
  /** Link di verifica generato da Better Auth (`emailVerification.sendVerificationEmail`). */
  url: string;
  /** Token JWT generato da Better Auth per lo stesso link, usato solo per distinguere un cambio email da una verifica in registrazione (vedi `isChangeEmailToken`). */
  token: string;
}

const SUBJECT_SIGNUP = "Conferma il tuo indirizzo email — Arcana Domine";
const SUBJECT_CHANGE_EMAIL =
  "Conferma il nuovo indirizzo email — Arcana Domine";

/**
 * Better Auth non passa alla callback `sendVerificationEmail` un flag che
 * distingua "verifica in registrazione" da "conferma cambio email": la
 * stessa callback serve entrambi i flussi (vedi `emailVerification` in
 * `src/lib/auth.ts`). L'unico segnale disponibile è il token stesso: per un
 * cambio email il suo payload JWT contiene `updateTo` (il nuovo indirizzo),
 * per una verifica normale no (vedi `createEmailVerificationToken` in
 * `better-auth/dist/api/routes/email-verification.mjs`). Decodifica il
 * payload senza verificarne la firma: qui serve solo a scegliere il testo,
 * non a validare l'autenticità del token (che resta compito di Better Auth
 * quando il link viene aperto).
 */
function isChangeEmailToken(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    return Boolean(decoded.updateTo);
  } catch {
    return false;
  }
}

function buildHtmlContent(url: string, isChangeEmail: boolean): string {
  const intro = isChangeEmail
    ? "Hai richiesto di cambiare l'indirizzo email del tuo account Arcana Domine. Per confermare il nuovo indirizzo clicca sul pulsante qui sotto:"
    : "Per completare la registrazione ad Arcana Domine conferma il tuo indirizzo email cliccando sul link qui sotto:";
  const disclaimer = isChangeEmail
    ? "Se non hai richiesto tu questo cambio email, ignora pure questa email: il tuo indirizzo attuale resterà invariato."
    : "Se non hai richiesto tu la registrazione, ignora pure questa email.";
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto;">
      ${buildLogoHtml(url)}
      <p>Ciao,</p>
      <p>${intro}</p>
      <p style="text-align: center; margin: 24px 0;">
        <a
          href="${url}"
          style="background-color: #a4161a; color: #ffffff; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;"
        >
          Conferma email
        </a>
      </p>
      <p>Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
      <p style="word-break: break-all;"><a href="${url}">${url}</a></p>
      <p>${disclaimer}</p>
    </div>
  `.trim();
}

function buildTextContent(url: string, isChangeEmail: boolean): string {
  const intro = isChangeEmail
    ? "Hai richiesto di cambiare l'indirizzo email del tuo account Arcana Domine. Per confermare il nuovo indirizzo apri questo link:"
    : "Per completare la registrazione ad Arcana Domine conferma il tuo indirizzo email aprendo questo link:";
  const disclaimer = isChangeEmail
    ? "Se non hai richiesto tu questo cambio email, ignora pure questa email: il tuo indirizzo attuale resterà invariato."
    : "Se non hai richiesto tu la registrazione, ignora pure questa email.";
  return ["Ciao,", "", intro, url, "", disclaimer].join("\n");
}

/**
 * Invia l'email di conferma indirizzo, sia in registrazione (T-047) sia per
 * un cambio email da profilo (T-6). Usata come callback
 * `emailVerification.sendVerificationEmail` in `src/lib/auth.ts`: Better
 * Auth genera già `url`/`token`, qui scegliamo solo il template in italiano
 * (via `isChangeEmailToken`) e deleghiamo l'invio al client Brevo condiviso
 * con il reset password (T-046).
 */
export async function sendVerificationEmail({
  to,
  url,
  token,
}: SendVerificationEmailParams): Promise<void> {
  if (!EMAIL_VERIFICATION) return;
  const isChangeEmail = isChangeEmailToken(token);
  await sendTransactionalEmail({
    to: { email: to },
    subject: isChangeEmail ? SUBJECT_CHANGE_EMAIL : SUBJECT_SIGNUP,
    htmlContent: buildHtmlContent(url, isChangeEmail),
    textContent: buildTextContent(url, isChangeEmail),
  });
}
