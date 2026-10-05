import type { Prisma, PrismaClient } from "@prisma/client";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

// Logica di autorizzazione dell'upload di immagini inline in un
// `FieldRichText` (es. descrizione di un'azione downtime o di una missiva),
// estratta dal file router (`src/app/api/uploadthing/core.ts`) perché sia
// testabile senza toccare l'SDK/il protocollo UploadThing, stesso pattern di
// `src/lib/campaignLogoCoverUpload.ts`.

export type RichTextImageUploadContext = {
  campaignId: number;
  campaignSlug: string;
};

export type RichTextImageUploadAuthResult =
  | { ok: true; context: RichTextImageUploadContext }
  | { ok: false; status: number; message: string };

export interface AuthorizeRichTextImageUploadParams {
  userId: string | null;
  campaignSlug: string;
}

// Autorizzazione volutamente permissiva: a differenza di logo/copertina/
// galleria (riservate all'head_master), `FieldRichText` è usato anche da
// giocatori semplici senza alcun `Grant` di campagna (descrizione di
// un'azione downtime o di una missiva, vedi `DowntimeWriter.tsx`/
// `MissiveWriter.tsx`, dove l'unico controllo è "sessione autenticata +
// personaggio esistente nella campagna", nessun ruolo richiesto). Basta
// quindi essere autenticati e che la campagna risolta dallo slug esista —
// stessa soglia del ramo "target: user" di `authorizeAvatarUpload`
// (`src/lib/avatarUpload.ts`). Nessun controllo di ruolo.
export async function authorizeRichTextImageUpload(
  prisma: PrismaClient,
  params: AuthorizeRichTextImageUploadParams
): Promise<RichTextImageUploadAuthResult> {
  if (!params.userId) {
    return { ok: false, status: 401, message: "Non autenticato" };
  }

  const campaign = await getCampaignBySlug(
    prisma,
    params.campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    return { ok: false, status: 404, message: "Campagna non trovata" };
  }

  return {
    ok: true,
    context: { campaignId: campaign.id, campaignSlug: campaign.slug },
  };
}

// Un `FieldRichText` (Tiptap) inserisce le immagini caricate come `<img
// src="https://.../f/<key>">` dentro l'HTML serializzato nel campo di
// testo; a differenza dell'avatar (`extractUploadThingKey` in
// `avatarUpload.ts`, che copre l'intera stringa) qui il contenuto può avere
// più immagini, ed è HTML/JSON che le contiene, non l'URL da solo — servono
// quindi un match globale, non uno singolo. Stesso approccio best-effort:
// un URL che non combacia (immagine esterna incollata via
// `UrlPopoverButton`) semplicemente non produce una key, nessun rischio di
// cancellare quella sbagliata.
const UPLOADTHING_URL_KEY_PATTERN = /\/f\/([^\s"'/?#<>]+)/g;

export function extractUploadThingKeysFromRichText(
  text: string | null | undefined
): string[] {
  if (!text) return [];
  return [...text.matchAll(UPLOADTHING_URL_KEY_PATTERN)].map(match => match[1]);
}

// `Action.actionData` (missiva/downtime, T-0xx) è un blob Json libero, il
// cui shape varia per `FeatureType` (`actionSchema`, definito per-feature,
// non staticamente qui): invece di conoscere a priori quale chiave porta il
// contenuto rich-text (`description`, `response`, ...; può anche cambiare
// nel tempo per-feature), si attraversano ricorsivamente TUTTI i valori
// stringa del Json e si applica l'estrazione sopra a ciascuno — generico e
// resistente all'aggiunta di nuovi campi/feature, a costo di processare
// anche stringhe che non sono mai rich-text (es. `subject`): innocuo, non
// contengono `/f/<key>` per costruzione.
function collectJsonStrings(value: Prisma.JsonValue): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectJsonStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectJsonStrings);
  }
  return [];
}

export function extractUploadThingKeysFromActionData(
  actionData: Prisma.JsonValue | null | undefined
): string[] {
  if (actionData == null) return [];
  return collectJsonStrings(actionData).flatMap(
    extractUploadThingKeysFromRichText
  );
}
