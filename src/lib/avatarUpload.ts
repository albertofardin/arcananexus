import sharp from "sharp";
import type { PrismaClient } from "@prisma/client";
import {
  getCharacterOwnership,
  updateCharacter,
} from "@/lib/repositories/character.repository";
import { isUserCampaignHelper } from "@/lib/authorization";
import {
  AVATAR_WEBP_QUALITY,
  type AvatarUploadInput,
} from "@/lib/validations/avatarUpload";
import { deleteFileBestEffort, type UploadedFile } from "@/lib/uploadFile";

// Logica di autorizzazione/persistenza dell'upload avatar (utente di
// profilo o personaggio) tramite UploadThing, estratta dal file router
// (`src/app/api/uploadthing/core.ts`) perché sia testabile senza toccare
// l'SDK/il protocollo UploadThing, stesso pattern di
// `src/lib/documentUpload.ts` (T-021).

// Campi non condivisi opzionali invece di un'unione discriminata: stesso
// workaround di inferenza UploadThing di `DocumentUploadContext`, vedi lì per
// il perché. Invariante ("i campi del ramo `target` sono valorizzati
// insieme") garantito da `authorizeAvatarUpload`, non dal type-checker.
export type AvatarUploadContext = {
  target: "user" | "character";
  userId?: string;
  previousImage?: string | null;
  characterId?: number;
  previousAvatar?: string | null;
  // Solo per `target: "character"`: slug della campagna del personaggio,
  // usato in `core.ts` per lo scope del nome file (`buildUploadedFileName`).
  // Per `target: "user"` lo scope è il fisso `"profilo"`, calcolato
  // direttamente lì — non serve valorizzarlo qui.
  campaignSlug?: string;
};

export type AvatarUploadAuthResult =
  | { ok: true; context: AvatarUploadContext }
  | { ok: false; status: number; message: string };

export interface AuthorizeAvatarUploadParams {
  userId: string | null;
  input: AvatarUploadInput;
}

// Autorizza un upload avatar: per il proprio profilo basta essere
// autenticati; per un personaggio serve esserne il proprietario o avere un
// ruolo di staff sulla campagna (stesso criterio già applicato da
// `characters/[id]/avatar/route.ts`).
export async function authorizeAvatarUpload(
  prisma: PrismaClient,
  params: AuthorizeAvatarUploadParams
): Promise<AvatarUploadAuthResult> {
  if (!params.userId) {
    return { ok: false, status: 401, message: "Non autenticato" };
  }

  if (params.input.target === "user") {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { image: true },
    });
    if (!user) {
      return { ok: false, status: 404, message: "Utente non trovato" };
    }
    return {
      ok: true,
      context: {
        target: "user",
        userId: params.userId,
        previousImage: user.image ?? null,
      },
    };
  }

  const character = await getCharacterOwnership(
    prisma,
    params.input.characterId
  );
  if (!character) {
    return { ok: false, status: 404, message: "Personaggio non trovato" };
  }

  const isOwner = character.userId === params.userId;
  const isStaff = await isUserCampaignHelper(
    prisma,
    params.userId,
    character.campaignId
  );
  if (!isOwner && !isStaff) {
    return { ok: false, status: 403, message: "Permessi insufficienti" };
  }

  return {
    ok: true,
    context: {
      target: "character",
      characterId: character.id,
      previousAvatar: character.avatar ?? null,
      campaignSlug: character.campaign.slug,
    },
  };
}

// UploadThing serve i file su un URL nel formato `.../f/<fileKey>`: senza
// una colonna dedicata per la key (a differenza di `ReferenceData.fileKey`
// per i documenti, T-021), la ricaviamo dall'URL già salvato per ripulire il
// file precedente. Best-effort per costruzione: se il formato non combacia
// (avatar esterno/OAuth, vecchio path locale pre-migrazione) semplicemente
// non si tenta la cancellazione, nessun rischio di cancellare la key sbagliata.
export function extractUploadThingKey(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const match = url.match(/\/f\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export interface ConvertAvatarDeps {
  fetchBuffer: (url: string) => Promise<Buffer>;
  uploadFile: (buffer: Buffer, fileName: string) => Promise<UploadedFile>;
  deleteFile: (fileKey: string) => Promise<unknown>;
}

// Percorso di fallback (jpeg/png, o conversione client fallita): il file
// grezzo è già su UploadThing (upload diretto dal client), quindi lo si
// riscarica, converte con sharp e ricarica sotto `fileName` — mai dal nome
// originale, che può contenere dati personali (nome reale, modello del
// telefono, data), sotto lo schema neutro passato dal chiamante (vedi
// `buildUploadedFileName` in `src/lib/uploadedFileName.ts`) — infine si
// cancella l'upload grezzo.
export async function convertUploadedAvatarToWebp(
  file: { url: string; key: string },
  fileName: string,
  deps: ConvertAvatarDeps
): Promise<UploadedFile> {
  let converted: UploadedFile;
  try {
    const original = await deps.fetchBuffer(file.url);
    const webpBuffer = await sharp(original)
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer();

    converted = await deps.uploadFile(webpBuffer, fileName);
  } catch (error) {
    // Se download/conversione/re-upload falliscono da qui in poi il file
    // grezzo resterebbe orfano (la cancellazione sotto avviene solo dopo un
    // re-upload riuscito): cleanup best-effort, poi si rilancia l'errore
    // originale (non lo si maschera con un eventuale fallimento della
    // cleanup).
    await deleteFileBestEffort(
      deps.deleteFile,
      file.key,
      "orphaned raw avatar upload after a failed conversion"
    );
    throw error;
  }

  await deleteFileBestEffort(
    deps.deleteFile,
    file.key,
    "original (pre-conversion) avatar upload"
  );

  return converted;
}

export interface ValidateWebpAvatarDeps {
  fetchBuffer: (url: string) => Promise<Buffer>;
  renameFile: (fileKey: string, newName: string) => Promise<unknown>;
  deleteFile: (fileKey: string) => Promise<unknown>;
}

// Percorso "diretto" (T-046): il client ha già convertito l'immagine in WebP
// prima dell'upload (`convertImageFileToWebp` in `AvatarUpload.tsx`), quindi
// qui non serve il round-trip di `convertUploadedAvatarToWebp` — si scarica
// una sola volta il file appena caricato e lo si decodifica con `sharp`
// (sola lettura dei metadati, nessun re-encode) per verificare che sia
// davvero WebP: la whitelist MIME di `avatarUploader` si fida del
// `Content-Type` dichiarato dal client, che chi bypassa il componente React
// può falsificare. Se valido, viene rinominato a `fileName` (stesso schema
// neutro passato dal chiamante usato dal fallback, vedi
// `buildUploadedFileName`) perché il nome scelto
// dal client (`toWebpFileName`) tiene la base del nome originale, che può
// contenere dati personali — il rename è solo metadata (nessun
// re-download/re-upload) quindi best-effort, un suo fallimento non deve far
// fallire un upload altrimenti valido.
export async function validateUploadedWebpAvatar(
  file: UploadedFile,
  fileName: string,
  deps: ValidateWebpAvatarDeps
): Promise<UploadedFile> {
  try {
    const buffer = await deps.fetchBuffer(file.url);
    const meta = await sharp(buffer).metadata();
    if (meta.format !== "webp") {
      throw new Error(
        `File dichiarato WebP ma il contenuto decodificato è "${meta.format ?? "sconosciuto"}"`
      );
    }
  } catch (error) {
    await deleteFileBestEffort(
      deps.deleteFile,
      file.key,
      "invalid direct-webp avatar upload"
    );
    throw error instanceof Error ? error : new Error("File WebP non valido");
  }

  try {
    await deps.renameFile(file.key, fileName);
  } catch (error) {
    console.error(
      "Error renaming direct-webp avatar upload to its neutral name:",
      error
    );
  }

  return file;
}

// Persiste l'avatar convertito (User.image o Character.avatar) dopo un
// upload riuscito, poi ripulisce il file precedente su UploadThing se ce
// n'era uno (best-effort, stesso approccio di `applyDocumentUpload`).
export async function applyAvatarUpload(
  prisma: PrismaClient,
  context: AvatarUploadContext,
  file: UploadedFile,
  deleteFile: (fileKey: string) => Promise<unknown>
): Promise<{ url: string }> {
  const previousUrl =
    context.target === "user" ? context.previousImage : context.previousAvatar;

  if (context.target === "user") {
    // A differenza del DELETE (`profile/avatar/route.ts`), che passa da
    // `auth.api.updateUser({ headers })`, qui si scrive `User.image` via
    // Prisma diretto: `onUploadComplete` è un callback server-to-server di
    // UploadThing, non una request dell'utente, quindi non ha gli header di
    // sessione richiesti da `auth.api.updateUser`. Nessun comportamento
    // osservabile diverso per l'utente: stessa colonna, stesso risultato.
    await prisma.user.update({
      where: { id: context.userId },
      data: { image: file.url },
    });
  } else {
    await updateCharacter(prisma, context.characterId, {
      avatar: file.url,
    });
  }

  const previousKey = extractUploadThingKey(previousUrl);
  if (previousKey && previousKey !== file.key) {
    await deleteFileBestEffort(deleteFile, previousKey, "previous avatar file");
  }

  return { url: file.url };
}
