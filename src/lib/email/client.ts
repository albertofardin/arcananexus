// Client email transazionale minimale (T-046): nessuna integrazione email
// esisteva a runtime prima di questo task — solo l'MCP Brevo per gli agenti
// (`.mcp.json`), non disponibile lato app. Qui chiamiamo l'API HTTP di Brevo
// (`POST /v3/smtp/email`) direttamente con `fetch`, senza SDK aggiuntivi.
//
// `BREVO_TRANSACTIONAL_API_KEY` è volutamente distinta da `BREVO_API_KEY`
// (quella dell'MCP, usata dagli agenti per le campagne marketing): stesso
// account Brevo, ma chiave applicativa separata, così la si può revocare/
// ruotare senza toccare la config degli agenti (vedi `.template_env`).

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendTransactionalEmailParams {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}

const BREVO_SMTP_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Usata da `notifyEmail` (`notification.repository.ts`) per saltare a costo
 * zero l'intero fan-out email (nessuna query, nessuna chiamata di rete)
 * quando il progetto non ha Brevo configurato — stesso principio di
 * `isPushConfigured` in `src/lib/webpush.ts`.
 */
export function isEmailConfigured(): boolean {
  return !!(
    process.env.BREVO_TRANSACTIONAL_API_KEY && process.env.BREVO_SENDER_EMAIL
  );
}

/**
 * Invia un'email transazionale tramite l'API HTTP di Brevo. Lancia se manca
 * la configurazione (chiave o mittente) o se Brevo risponde con un errore,
 * così chi chiama (es. la callback `sendResetPassword` di Better Auth) può
 * decidere come gestirlo — qui non ingoiamo mai un fallimento di invio.
 */
export async function sendTransactionalEmail(
  params: SendTransactionalEmailParams
): Promise<void> {
  const apiKey = process.env.BREVO_TRANSACTIONAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BREVO_TRANSACTIONAL_API_KEY non configurata: impossibile inviare email transazionali"
    );
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error(
      "BREVO_SENDER_EMAIL non configurata: impossibile inviare email transazionali"
    );
  }
  const senderName = process.env.BREVO_SENDER_NAME || "Arcana Domine";

  const response = await fetch(BREVO_SMTP_EMAIL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      htmlContent: params.htmlContent,
      textContent: params.textContent,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Invio email Brevo fallito (${response.status} ${response.statusText}): ${body}`
    );
  }
}
