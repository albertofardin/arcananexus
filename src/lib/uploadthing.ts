import { UTApi } from "uploadthing/server";

// Singleton dell'SDK server UploadThing (T-021), stesso pattern del client
// Prisma singleton (`src/lib/db.ts`): legge `UPLOADTHING_TOKEN` da env in modo
// lazy alla prima chiamata effettiva (nessun accesso di rete alla
// costruzione), quindi è sicuro importarlo anche senza un token reale
// configurato (vedi `.template_env`) finché non si esegue un vero upload/
// delete.
const globalForUploadThing = globalThis as unknown as {
  utapi: UTApi | undefined;
};

export const utapi = globalForUploadThing.utapi ?? new UTApi();

if (process.env.NODE_ENV !== "production") {
  globalForUploadThing.utapi = utapi;
}
