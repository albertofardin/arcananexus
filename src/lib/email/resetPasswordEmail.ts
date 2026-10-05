import { sendTransactionalEmail } from "./client";
import { EMAIL_RESET_PASSWORD } from "./emailFlags";
import { buildLogoHtml } from "./emailLogo";

export interface SendResetPasswordEmailParams {
  to: string;
  /** Link di reset generato da Better Auth (`emailAndPassword.sendResetPassword`). */
  url: string;
}

const SUBJECT = "Reimposta la tua password — Arcana Domine";

function buildHtmlContent(url: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto;">
      ${buildLogoHtml(url)}
      <p>Ciao,</p>
      <p>
        Abbiamo ricevuto una richiesta di reimpostazione della password per il
        tuo account Arcana Domine. Clicca sul link qui sotto per sceglierne
        una nuova:
      </p>
      <p style="text-align: center; margin: 24px 0;">
        <a
          href="${url}"
          style="background-color: #a4161a; color: #ffffff; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;"
        >
          Reimposta password
        </a>
      </p>
      <p>Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
      <p style="word-break: break-all;"><a href="${url}">${url}</a></p>
      <p>
        Se non hai richiesto tu il reset, ignora pure questa email: la tua
        password resterà invariata.
      </p>
      <p>Il link scade dopo un'ora.</p>
    </div>
  `.trim();
}

function buildTextContent(url: string): string {
  return [
    "Ciao,",
    "",
    "Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account Arcana Domine.",
    "Apri questo link per sceglierne una nuova (scade dopo un'ora):",
    url,
    "",
    "Se non hai richiesto tu il reset, ignora pure questa email: la tua password resterà invariata.",
  ].join("\n");
}

/**
 * Invia l'email di recupero password (T-046). Usata come callback
 * `emailAndPassword.sendResetPassword` in `src/lib/auth.ts`: Better Auth
 * genera già `url` (con token valido incluso), qui costruiamo solo il
 * template in italiano e deleghiamo l'invio al client Brevo.
 */
export async function sendResetPasswordEmail({
  to,
  url,
}: SendResetPasswordEmailParams): Promise<void> {
  if (!EMAIL_RESET_PASSWORD) return;
  await sendTransactionalEmail({
    to: { email: to },
    subject: SUBJECT,
    htmlContent: buildHtmlContent(url),
    textContent: buildTextContent(url),
  });
}
