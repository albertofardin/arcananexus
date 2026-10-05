// Logica di autorizzazione dell'upload di immagini inline in un messaggio
// di Supporto (T-0xx), estratta dal file router
// (`src/app/api/uploadthing/core.ts`) perché sia testabile senza toccare
// l'SDK/il protocollo UploadThing, stesso pattern di
// `src/lib/richTextImageUpload.ts`.

export type SupportAttachmentUploadContext = Record<string, never>;

export type SupportAttachmentUploadAuthResult =
  | { ok: true; context: SupportAttachmentUploadContext }
  | { ok: false; status: number; message: string };

export interface AuthorizeSupportAttachmentUploadParams {
  userId: string | null;
}

// Autorizzazione minima: basta essere autenticati, nessun ruolo/campagna da
// verificare — il Supporto è aperto a QUALUNQUE utente registrato (vedi
// `POST /api/support/tickets`), stessa soglia del ramo "target: user" di
// `authorizeAvatarUpload`. `async` (nessun vero `await` dentro) solo per
// uniformità di firma con gli altri `authorize*` di questo router
// (`resolveContext` in `core.ts` si aspetta una funzione che ritorna una
// Promise).
export async function authorizeSupportAttachmentUpload(
  params: AuthorizeSupportAttachmentUploadParams
): Promise<SupportAttachmentUploadAuthResult> {
  if (!params.userId) {
    return { ok: false, status: 401, message: "Non autenticato" };
  }
  return { ok: true, context: {} };
}
