import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { listFeatureTypes } from "@/lib/repositories/featureType.repository";
import { ensureFeatureTypesRegistered } from "@/lib/features";
import { apiError } from "@/lib/api-helpers";

// Catalogo dei `FeatureType` (T-019): platform-wide, sola lettura — mappa
// `functionName` → handler del registry (`src/lib/features/`). Non esisteva
// ancora alcuna API di lettura prima di questo task (T-031, scope minimo
// aggiuntivo annotato nel task file): basta la sessione (nessun ruolo di
// campagna da verificare, non essendoci una campagna coinvolta) — l'unico
// consumer reale, la pagina admin/features, resta comunque dietro il gate
// head_master di T-028.
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return apiError(401, "Non autenticato");
    }

    // Auto-provisioning (non più seed-dipendente): allinea il catalogo DB al
    // registry di codice prima di leggerlo, così il catalogo esiste in ogni
    // ambiente/DB senza richiedere un `prisma db seed` manuale.
    await ensureFeatureTypesRegistered(prisma);
    const featureTypes = await listFeatureTypes(prisma);

    return NextResponse.json(featureTypes);
  } catch (error) {
    console.error("Error fetching feature types:", error);
    return apiError(500, "Internal server error");
  }
}
