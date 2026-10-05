import type { CampaignColor } from "@prisma/client";
import { sendTransactionalEmail } from "./client";
import { buildLogoHtml } from "./emailLogo";
import { getAppBaseUrl } from "@/lib/appUrl";
import { routes } from "@/app/routes";
import { themeColors } from "@/app/themes";

const CAMPAIGN_COLOR_HEX: Record<string, string> = Object.fromEntries(
  themeColors.map(c => [c.id, c.swatch])
);
const DEFAULT_COLOR_HEX = "#a4161a"; // stesso rosso dei template login (resetPasswordEmail/verificationEmail)

export function campaignColorHex(color: CampaignColor): string {
  return CAMPAIGN_COLOR_HEX[color] ?? DEFAULT_COLOR_HEX;
}

export interface SendNotificationEmailParams {
  to: string;
  subject: string;
  /** Frase principale, già completa (es. "In Nuova Frontiera è arrivata una nuova missiva per Mario Rossi"). */
  heading: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Assenti per le notifiche di Supporto (T-0xx), che non hanno una campagna — vedi `getNotificationSourceLabel` in `BtnNotifications.tsx`. */
  campaignName?: string | null;
  campaignLogo?: string | null;
  colorHex?: string;
}

// Fascia colorata con logo/nome campagna (richiesta esplicita del brief,
// "header alla email con background e logo della campagna"): assente per le
// notifiche senza campagna (Supporto), che mostrano solo il logo Arcana
// Domine di `buildLogoHtml`.
function buildCampaignHeaderHtml(params: SendNotificationEmailParams): string {
  if (!params.campaignName) return "";
  const color = params.colorHex ?? DEFAULT_COLOR_HEX;
  const logoImg = params.campaignLogo
    ? `<img src="${params.campaignLogo}" alt="${params.campaignName}" width="56" height="56" style="width: 56px; height: 56px; border-radius: 3px; object-fit: cover; display: block; margin: 0 auto 8px;" />`
    : "";
  return `
    <div style="background-color: ${color}; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
      ${logoImg}
      <p style="color: #ffffff; font-weight: bold; font-size: 16px; margin: 0;">${params.campaignName}</p>
    </div>
  `;
}

function buildHtmlContent(params: SendNotificationEmailParams): string {
  const origin = getAppBaseUrl();
  const color = params.colorHex ?? DEFAULT_COLOR_HEX;
  const unsubscribeUrl = `${origin}${routes.profile()}`;
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto;">
      ${buildLogoHtml(origin)}
      ${buildCampaignHeaderHtml(params)}
      <p>${params.heading}</p>
      <p style="text-align: center; margin: 24px 0;">
        <a
          href="${params.ctaUrl}"
          style="background-color: ${color}; color: #ffffff; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;"
        >
          ${params.ctaLabel}
        </a>
      </p>
      <p style="font-size: 12px; color: #666666;">
        Non vuoi più ricevere queste email? <a href="${unsubscribeUrl}">Disattivale dal tuo profilo</a>.
      </p>
    </div>
  `.trim();
}

function buildTextContent(params: SendNotificationEmailParams): string {
  const origin = getAppBaseUrl();
  const lines = [
    params.campaignName ?? null,
    params.heading,
    "",
    params.ctaUrl,
    "",
    `Non vuoi più ricevere queste email? Disattivale dal tuo profilo: ${origin}${routes.profile()}`,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

/**
 * Invia l'email di notifica (T-0xx): stesso client/logo Arcana Domine dei
 * template login (`resetPasswordEmail`/`verificationEmail`), con in più una
 * fascia colorata per la campagna d'origine e un CTA verso la notifica
 * stessa. Chiamata da `notifyEmail` in `notification.repository.ts`, che
 * decide destinatario/testo/link — questo modulo si occupa solo del
 * template.
 */
export async function sendNotificationEmail(
  params: SendNotificationEmailParams
): Promise<void> {
  await sendTransactionalEmail({
    to: { email: params.to },
    subject: params.subject,
    htmlContent: buildHtmlContent(params),
    textContent: buildTextContent(params),
  });
}
