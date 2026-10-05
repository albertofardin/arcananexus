import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";

// `start_url: "/dashboard"` è il punto chiave: aprendo l'app installata si
// entra direttamente nel gestionale, non nel sito vetrina. Se manca sessione
// ci pensa `middleware.ts` a rimandare al login.
// Route handler (non la special-file convention `manifest.ts`) apposta: la
// convenzione iniettarebbe <link rel="manifest"> — e quindi il prompt di
// installazione PWA — su tutte le pagine del sito. Così invece il link viene
// aggiunto esplicitamente solo nei metadata di installa-app/page.tsx.
const manifest: MetadataRoute.Manifest = {
  name: "Arcana Domine",
  short_name: "Arcana Domine",
  description: "Gestionale campagne LARP di Arcana Domine",
  start_url: "/dashboard",
  display: "standalone",
  background_color: "#000000",
  theme_color: "#000000",
  icons: [
    {
      src: "/mobile/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/mobile/icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
};

export function GET() {
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
