import sharp from "sharp";
import { CAMPAIGN_IMAGE_WEBP_QUALITY } from "@/lib/validations/campaignPresentationUpload";
import { deleteFileBestEffort, type UploadedFile } from "@/lib/uploadFile";

// Helper di conversione WebP condivisi dai moduli di upload della
// "Presentazione" campagna (T-045): `campaignLogoCoverUpload.ts`,
// `campaignGalleryUpload.ts`. Stessa identica
// normalizzazione (fast-path client già WebP + round-trip server di
// fallback) di `src/lib/avatarUpload.ts`, estratta qui invece che duplicata
// tre volte perché i tre casi d'uso sono la stessa identica operazione
// ("carica un'immagine di presentazione, normalizzata a WebP"), a differenza
// di avatar/documento che restano moduli indipendenti (domini diversi, T-021
// vs T-046).

export interface ConvertCampaignImageDeps {
  fetchBuffer: (url: string) => Promise<Buffer>;
  uploadFile: (buffer: Buffer, fileName: string) => Promise<UploadedFile>;
  deleteFile: (fileKey: string) => Promise<unknown>;
}

// Percorso di fallback (jpeg/png, o conversione client fallita): il file
// grezzo è già su UploadThing (upload diretto dal client), quindi lo si
// riscarica, converte con sharp e ricarica sotto `fileName`, poi si cancella
// l'upload grezzo. Identico a `convertUploadedAvatarToWebp`.
export async function convertUploadedCampaignImageToWebp(
  file: { url: string; key: string },
  fileName: string,
  deps: ConvertCampaignImageDeps
): Promise<UploadedFile> {
  let converted: UploadedFile;
  try {
    const original = await deps.fetchBuffer(file.url);
    const webpBuffer = await sharp(original)
      .webp({ quality: CAMPAIGN_IMAGE_WEBP_QUALITY })
      .toBuffer();

    converted = await deps.uploadFile(webpBuffer, fileName);
  } catch (error) {
    await deleteFileBestEffort(
      deps.deleteFile,
      file.key,
      "orphaned raw campaign image upload after a failed conversion"
    );
    throw error;
  }

  await deleteFileBestEffort(
    deps.deleteFile,
    file.key,
    "original (pre-conversion) campaign image upload"
  );

  return converted;
}

export interface ValidateWebpCampaignImageDeps {
  fetchBuffer: (url: string) => Promise<Buffer>;
  renameFile: (fileKey: string, newName: string) => Promise<unknown>;
  deleteFile: (fileKey: string) => Promise<unknown>;
}

// Percorso "diretto": il client ha già convertito l'immagine in WebP prima
// dell'upload (`convertImageFileToWebp`, riusato da
// `src/components/AvatarUpload/AvatarUpload.tsx`), quindi qui non
// serve il round-trip sopra — si scarica una sola volta il file appena
// caricato e lo si decodifica con `sharp` per verificare che sia davvero
// WebP (la whitelist MIME dei file router si fida del `Content-Type`
// dichiarato dal client). Se valido, rinominato a `fileName` (solo
// metadata, best-effort). Identico a `validateUploadedWebpAvatar`.
export async function validateUploadedWebpCampaignImage(
  file: UploadedFile,
  fileName: string,
  deps: ValidateWebpCampaignImageDeps
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
      "invalid direct-webp campaign image upload"
    );
    throw error instanceof Error ? error : new Error("File WebP non valido");
  }

  try {
    await deps.renameFile(file.key, fileName);
  } catch (error) {
    console.error(
      "Error renaming direct-webp campaign image upload to its neutral name:",
      error
    );
  }

  return file;
}
