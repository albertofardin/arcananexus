export interface UploadedFile {
  url: string;
  key: string;
}

// Cancellazione best-effort di un file UploadThing dopo un upload riuscito
// (sostituzione avatar/logo/copertina/documento/immagine di presentazione):
// un fallimento nel cleanup del file precedente non deve mai far fallire la
// richiesta che l'ha invocato, quindi logga soltanto. Condivisa da tutti i
// moduli di upload, che restano altrimenti indipendenti (domini diversi).
export async function deleteFileBestEffort(
  deleteFile: (fileKey: string) => Promise<unknown>,
  fileKey: string,
  description: string
): Promise<void> {
  try {
    await deleteFile(fileKey);
  } catch (error) {
    console.error(`Error deleting ${description}:`, error);
  }
}
