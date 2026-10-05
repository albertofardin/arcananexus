import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

// Route handler standard di UploadThing (T-021): riceve le richieste generate
// dal client (`useUploadThing`, `src/lib/uploadthing-client.ts`) e le
// smista al file router (`core.ts`). Nessuna logica applicativa qui: vedi
// `src/lib/documentUpload.ts` per autorizzazione/persistenza, testate
// separatamente.
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});
