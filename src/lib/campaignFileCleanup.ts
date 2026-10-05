import { extractUploadThingKey } from "@/lib/avatarUpload";
import {
  extractUploadThingKeysFromRichText,
  extractUploadThingKeysFromActionData,
} from "@/lib/richTextImageUpload";
import { utapi } from "@/lib/uploadthing";
import type { CampaignUploadThingRefs } from "@/lib/repositories/types";

// Appiattisce i riferimenti raccolti da `getCampaignUploadThingRefs` in un
// elenco di key UploadThing da cancellare. `characterAvatarUrls` va estratto
// con `extractUploadThingKey` (nessuna colonna key dedicata su `Character`,
// stesso limite di `avatarUpload.ts`: un formato URL inatteso semplicemente
// non produce una key, nessun rischio di cancellare quella sbagliata);
// `referenceDataDescriptions`/`actionData` sono contenuto rich-text
// (HTML/Json) che può incorporare zero o più immagini, estratte con
// `extractUploadThingKeysFrom{RichText,ActionData}`. Deduplicato per
// sicurezza, anche se le fonti non si sovrappongono nell'uso normale.
export function collectCampaignFileKeys(
  refs: CampaignUploadThingRefs
): string[] {
  const keys = [
    refs.logoKey,
    refs.coverKey,
    ...refs.galleryKeys,
    ...refs.referenceDataFileKeys,
    ...refs.characterAvatarUrls.map(extractUploadThingKey),
    ...refs.referenceDataDescriptions.flatMap(
      extractUploadThingKeysFromRichText
    ),
    ...refs.actionData.flatMap(extractUploadThingKeysFromActionData),
  ].filter((key): key is string => !!key);

  return Array.from(new Set(keys));
}

// Cancellazione in blocco dei file UploadThing di una campagna già
// eliminata dal DB. Pensata per girare in background (Next `after()`, vedi
// `DELETE` in `app/api/campaigns/[campaignSlug]/route.ts`): un bulk delete
// su molte campaign image / documenti può richiedere tempo e non deve
// ritardare la risposta al client. Best-effort come le altre cleanup
// UploadThing del progetto: a campagna già cancellata non c'è più nulla da
// far fallire, un errore si logga soltanto.
export async function cleanupCampaignFiles(
  refs: CampaignUploadThingRefs,
  campaignSlug: string
): Promise<void> {
  const keys = collectCampaignFileKeys(refs);
  if (keys.length === 0) return;

  try {
    await utapi.deleteFiles(keys);
  } catch (error) {
    console.error(
      `Error deleting ${keys.length} orphaned UploadThing file(s) for deleted campaign "${campaignSlug}":`,
      error
    );
  }
}
