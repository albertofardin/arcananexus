import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { utapi } from "@/lib/uploadthing";
import { documentUploadInputSchema } from "@/lib/validations/documentUpload";
import {
  authorizeDocumentUpload,
  applyDocumentUpload,
} from "@/lib/documentUpload";
import { avatarUploadInputSchema } from "@/lib/validations/avatarUpload";
import {
  authorizeAvatarUpload,
  applyAvatarUpload,
  convertUploadedAvatarToWebp,
  validateUploadedWebpAvatar,
} from "@/lib/avatarUpload";
import { buildUploadedFileName } from "@/lib/uploadedFileName";
import { type UploadedFile } from "@/lib/uploadFile";
import { campaignPresentationImageUploadInputSchema } from "@/lib/validations/campaignPresentationUpload";
import {
  convertUploadedCampaignImageToWebp,
  validateUploadedWebpCampaignImage,
} from "@/lib/campaignImageUpload";
import {
  authorizeCampaignLogoCoverUpload,
  applyCampaignLogoCoverUpload,
} from "@/lib/campaignLogoCoverUpload";
import {
  authorizeCampaignGalleryUpload,
  applyCampaignGalleryUpload,
} from "@/lib/campaignGalleryUpload";
import { richTextImageUploadInputSchema } from "@/lib/validations/richTextImageUpload";
import { authorizeRichTextImageUpload } from "@/lib/richTextImageUpload";
import { supportAttachmentUploadInputSchema } from "@/lib/validations/supportAttachmentUpload";
import { authorizeSupportAttachmentUpload } from "@/lib/supportAttachmentUpload";

const f = createUploadthing();

// UploadThing non ha un codice errore per 401 (solo BAD_REQUEST/NOT_FOUND/
// FORBIDDEN/INTERNAL_SERVER_ERROR, vedi `@uploadthing/shared`): un utente non
// autenticato è comunque "non autorizzato", quindi mappa a FORBIDDEN.
function toUploadThingErrorCode(status: number) {
  if (status === 404) return "NOT_FOUND" as const;
  if (status === 401 || status === 403) return "FORBIDDEN" as const;
  return "BAD_REQUEST" as const;
}

type AuthResult<TContext> =
  | { ok: true; context: TContext }
  | { ok: false; status: number; message: string };

// Adattatore comune per i due `.middleware()` sotto: entrambi gli
// `authorize*` restituiscono la stessa forma `{ ok, context } | { ok, status,
// message }`, mappata qui una sola volta sull'errore che UploadThing si
// aspetta, invece di due wrapper quasi identici (uno per documento, uno per
// avatar) con solo il nome della funzione `authorize*` a cambiare.
async function resolveContext<TContext>(
  authorize: () => Promise<AuthResult<TContext>>
): Promise<TContext> {
  const result = await authorize();
  if (result.ok === false) {
    throw new UploadThingError({
      code: toUploadThingErrorCode(result.status),
      message: result.message,
    });
  }

  return result.context;
}

// Il client carica il file originale direttamente su UploadThing: qui lo si
// riscarica, converte in WebP (stessa normalizzazione già in uso prima
// della migrazione da disco locale a UploadThing) e ricarica, per poi
// persistere url/pulizia del file precedente via `applyAvatarUpload`.
async function uploadFile(
  buffer: Buffer,
  fileName: string
): Promise<UploadedFile> {
  const uploaded = await utapi.uploadFiles(
    new File([new Uint8Array(buffer)], fileName, { type: "image/webp" })
  );
  if (uploaded.error) {
    throw new Error(uploaded.error.message);
  }
  return { url: uploaded.data.ufsUrl, key: uploaded.data.key };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Impossibile scaricare il file appena caricato");
  }
  return Buffer.from(await response.arrayBuffer());
}

async function renameFile(fileKey: string, newName: string): Promise<void> {
  await utapi.renameFiles({ fileKey, newName });
}

function deleteFile(fileKey: string): Promise<unknown> {
  return utapi.deleteFiles(fileKey);
}

// Scope per il nome file dell'avatar (`buildUploadedFileName`): "profilo"
// per l'avatar utente (non legato a una campagna), lo slug campagna per
// l'avatar di un personaggio. `authorizeAvatarUpload` garantisce
// `campaignSlug` per il ramo "character" (vedi `AvatarUploadContext`), ma il
// tipo lo lascia opzionale su entrambi i rami (workaround di inferenza
// UploadThing) — il controllo esplicito qui evita un'asserzione non-null.
function resolveAvatarScope(metadata: {
  target: "user" | "character";
  campaignSlug?: string;
}): string {
  if (metadata.target === "user") return "profilo";
  if (!metadata.campaignSlug) {
    throw new Error("Contesto avatar personaggio senza campaignSlug");
  }
  return metadata.campaignSlug;
}

// Stesso dispatch di `avatarUploader.onUploadComplete` (T-046): fast-path se
// il client ha già convertito in WebP, altrimenti round-trip di conversione
// server-side. Condiviso dai tre endpoint di presentazione campagna sotto,
// che differiscono solo per autorizzazione/persistenza (`apply*`).
async function normalizeUploadedCampaignImage(
  file: { url: string; key: string; type: string },
  fileName: string
): Promise<UploadedFile> {
  return file.type === "image/webp"
    ? validateUploadedWebpCampaignImage(
        { url: file.url, key: file.key },
        fileName,
        { fetchBuffer, renameFile, deleteFile }
      )
    : convertUploadedCampaignImageToWebp(
        { url: file.url, key: file.key },
        fileName,
        { fetchBuffer, uploadFile, deleteFile }
      );
}

// File router server-side UploadThing (T-021, esteso qui per gli avatar).
// Wrapper sottile: tutta la logica di autorizzazione/persistenza vive in
// `src/lib/documentUpload.ts`/`src/lib/avatarUpload.ts`, testata
// direttamente lì senza passare dal protocollo UploadThing (niente
// account/token reale in questo ambiente, vedi Note/Log del task).
export const ourFileRouter = {
  documentUploader: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 1 },
    text: { maxFileSize: "4MB", maxFileCount: 1 },
    blob: { maxFileSize: "16MB", maxFileCount: 1 },
  })
    .input(documentUploadInputSchema)
    .middleware(async ({ req, input }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      return resolveContext(() =>
        authorizeDocumentUpload(prisma, {
          userId: session?.user?.id ?? null,
          userEmail: session?.user?.email ?? null,
          campaignSlug: input.campaignSlug,
          dataTypeId: input.dataTypeId,
          title: input.title,
          description: input.description,
          visibility: input.visibility,
          referenceDataId: input.referenceDataId,
        })
      );
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Rinomina best-effort al nome neutro `<scope>-documento-<id>.<ext>`
      // (stesso motivo di `renameFile` per gli avatar/le immagini di
      // campagna): un fallimento non deve far fallire un upload altrimenti
      // riuscito. Solo metadata: `file.ufsUrl`/`file.key` restano invariati,
      // quindi non è critico farla prima di `applyDocumentUpload`.
      const extension =
        file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "bin";
      const fileName = buildUploadedFileName(
        metadata.campaignSlug,
        "documento",
        extension
      );
      try {
        await renameFile(file.key, fileName);
      } catch (error) {
        console.error(
          "Error renaming uploaded document to its neutral name:",
          error
        );
      }

      await applyDocumentUpload(
        prisma,
        metadata,
        { url: file.ufsUrl, key: file.key },
        deleteFile
      );

      return { fileUrl: file.ufsUrl };
    }),

  // Whitelist esplicita ai soli tipi supportati dalla vecchia route su disco
  // locale (`image: {...}` accetterebbe anche gif/svg/heic/tiff/bmp...): il
  // file grezzo è pubblico su UploadThing prima ancora che `sharp` lo
  // processi in `onUploadComplete`, quindi la validazione del formato deve
  // avvenire qui, non solo implicitamente via `sharp`.
  avatarUploader: f({
    "image/jpeg": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/png": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/webp": { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .input(avatarUploadInputSchema)
    .middleware(async ({ req, input }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      return resolveContext(() =>
        authorizeAvatarUpload(prisma, {
          userId: session?.user?.id ?? null,
          input,
        })
      );
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const uploaded: UploadedFile = { url: file.ufsUrl, key: file.key };
      const fileName = buildUploadedFileName(
        resolveAvatarScope(metadata),
        "avatar",
        "webp"
      );

      // Dispatch in base al MIME del file arrivato (T-046): il client
      // (`AvatarUpload.tsx`) prova a convertire in WebP prima dell'upload.
      // - Già `image/webp` (caso comune): niente re-upload, solo
      //   validazione via decodifica `sharp` (`validateUploadedWebpAvatar`),
      //   più un rename (sola metadata) al nome neutro `fileName`.
      // - `image/jpeg`/`image/png` (browser non supportato, conversione
      //   fallita, o fallback silenzioso rilevato lato client): round-trip
      //   invariato (`convertUploadedAvatarToWebp`), stesso comportamento
      //   di prima di questo task.
      const result =
        file.type === "image/webp"
          ? await validateUploadedWebpAvatar(uploaded, fileName, {
              fetchBuffer,
              renameFile,
              deleteFile,
            })
          : await convertUploadedAvatarToWebp(uploaded, fileName, {
              fetchBuffer,
              uploadFile,
              deleteFile,
            });

      return await applyAvatarUpload(prisma, metadata, result, deleteFile);
    }),

  // Presentazione campagna (T-045): logo/copertina/galleria, stessa
  // whitelist MIME di `avatarUploader` (jpeg/png/webp).
  campaignLogoUploader: f({
    "image/jpeg": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/png": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/webp": { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .input(campaignPresentationImageUploadInputSchema)
    .middleware(async ({ req, input }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      return resolveContext(() =>
        authorizeCampaignLogoCoverUpload(prisma, {
          userId: session?.user?.id ?? null,
          userEmail: session?.user?.email ?? null,
          campaignSlug: input.campaignSlug,
          field: "logo",
        })
      );
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const fileName = buildUploadedFileName(
        metadata.campaignSlug,
        "logo",
        "webp"
      );
      const result = await normalizeUploadedCampaignImage(
        { url: file.ufsUrl, key: file.key, type: file.type },
        fileName
      );
      const updated = await applyCampaignLogoCoverUpload(
        prisma,
        metadata,
        result,
        deleteFile
      );
      // `{ url }`, non `{ logo }`: stessa forma di risposta di tutti gli
      // endpoint immagine di questo router (`avatarUploader`,
      // `campaignCoverUploader`, `campaignGalleryUploader`), così i widget
      // client possono leggere `res[0].serverData.url` senza sapere quale
      // endpoint hanno chiamato (vedi `useUploadImage`).
      return { url: updated.logo };
    }),

  campaignCoverUploader: f({
    "image/jpeg": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/png": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/webp": { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .input(campaignPresentationImageUploadInputSchema)
    .middleware(async ({ req, input }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      return resolveContext(() =>
        authorizeCampaignLogoCoverUpload(prisma, {
          userId: session?.user?.id ?? null,
          userEmail: session?.user?.email ?? null,
          campaignSlug: input.campaignSlug,
          field: "cover",
        })
      );
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const fileName = buildUploadedFileName(
        metadata.campaignSlug,
        "cover",
        "webp"
      );
      const result = await normalizeUploadedCampaignImage(
        { url: file.ufsUrl, key: file.key, type: file.type },
        fileName
      );
      const updated = await applyCampaignLogoCoverUpload(
        prisma,
        metadata,
        result,
        deleteFile
      );
      return { url: updated.cover };
    }),

  // `maxFileCount: 5` limita quante immagini un singolo batch può
  // contenere: non basta da solo a far rispettare il tetto della galleria
  // (le immagini già presenti in DB non sono note a UploadThing), quindi
  // `authorizeCampaignGalleryUpload` ricontrolla `esistenti + files.length`.
  campaignGalleryUploader: f({
    "image/jpeg": { maxFileSize: "4MB", maxFileCount: 5 },
    "image/png": { maxFileSize: "4MB", maxFileCount: 5 },
    "image/webp": { maxFileSize: "4MB", maxFileCount: 5 },
  })
    .input(campaignPresentationImageUploadInputSchema)
    .middleware(async ({ req, input, files }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      return resolveContext(() =>
        authorizeCampaignGalleryUpload(prisma, {
          userId: session?.user?.id ?? null,
          userEmail: session?.user?.email ?? null,
          campaignSlug: input.campaignSlug,
          newFilesCount: files.length,
        })
      );
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const fileName = buildUploadedFileName(
        metadata.campaignSlug,
        "gallery",
        "webp"
      );
      const result = await normalizeUploadedCampaignImage(
        { url: file.ufsUrl, key: file.key, type: file.type },
        fileName
      );
      const created = await applyCampaignGalleryUpload(
        prisma,
        metadata,
        result
      );
      return { id: created.id, url: created.url };
    }),

  // Immagini inserite inline in un `FieldRichText` (descrizione di
  // un'azione downtime, missiva, contenuto di una pagina dati...): stessa
  // whitelist MIME/size di `avatarUploader`, ma autorizzazione permissiva
  // (vedi `authorizeRichTextImageUpload`) perché usato anche da giocatori
  // senza alcun `Grant` di campagna. A differenza degli altri endpoint di
  // questo router, il risultato non è persistito su Prisma: l'immagine
  // finisce inline nell'HTML del campo rich-text, non in una colonna
  // dedicata (stesso motivo per cui `campaignGalleryUploader` non fa
  // cleanup di file precedenti quando se ne aggiunge uno nuovo — qui non
  // c'è proprio un "precedente" da tracciare).
  richTextImageUploader: f({
    "image/jpeg": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/png": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/webp": { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .input(richTextImageUploadInputSchema)
    .middleware(async ({ req, input }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      return resolveContext(() =>
        authorizeRichTextImageUpload(prisma, {
          userId: session?.user?.id ?? null,
          campaignSlug: input.campaignSlug,
        })
      );
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const fileName = buildUploadedFileName(
        metadata.campaignSlug,
        "richtext",
        "webp"
      );
      const result = await normalizeUploadedCampaignImage(
        { url: file.ufsUrl, key: file.key, type: file.type },
        fileName
      );
      return { url: result.url };
    }),

  // Immagini inserite inline in un messaggio di Supporto (T-0xx): stessa
  // whitelist MIME/size/gestione di `richTextImageUploader`, ma senza alcun
  // `campaignSlug` (il Supporto non è campaign-scoped) — l'autorizzazione
  // richiede solo una sessione valida, vedi `authorizeSupportAttachmentUpload`.
  supportAttachmentUploader: f({
    "image/jpeg": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/png": { maxFileSize: "4MB", maxFileCount: 1 },
    "image/webp": { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .input(supportAttachmentUploadInputSchema)
    .middleware(async ({ req }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      return resolveContext(() =>
        authorizeSupportAttachmentUpload({
          userId: session?.user?.id ?? null,
        })
      );
    })
    .onUploadComplete(async ({ file }) => {
      const fileName = buildUploadedFileName("supporto", "richtext", "webp");
      const result = await normalizeUploadedCampaignImage(
        { url: file.ufsUrl, key: file.key, type: file.type },
        fileName
      );
      return { url: result.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
