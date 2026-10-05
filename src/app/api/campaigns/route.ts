import { NextRequest, NextResponse } from "next/server";
import { DataTypeKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  campaignSchema,
  createCampaignSchema,
} from "@/lib/validations/campaign";
import {
  listCampaignsByOrgSlug,
  createCampaign,
} from "@/lib/repositories/campaign.repository";
import { getOrganizationBySlug } from "@/lib/repositories/organization.repository";
import {
  isOrganizationHeadMaster,
  getUserGroupFlags,
} from "@/lib/authorization";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { FT_PROGRESS } from "@/lib/features/featuresName";
import { progressFeatureSchema } from "@/lib/features/handlers/progress";

export async function GET(request: NextRequest) {
  // La piattaforma ha una sola organizzazione: lo slug è cablato e il
  // parametro `orgSlug` resta accettato solo per retrocompatibilità.
  const orgSlug =
    request.nextUrl.searchParams.get("orgSlug") ?? ARCANA_DOMINE_SLUG;

  // Le campagne con `visibility: false` sono un "god view" di Sviluppo Web
  // (create ma non ancora pubbliche, vedi createCampaign): un utente senza
  // sessione valida non deve mai vederle, quindi il default resta sempre
  // "solo visibili" finché non risulta effettivamente isSviluppo.
  const session = await auth.api.getSession({ headers: request.headers });
  let includeHidden = false;
  let userId: string | undefined;
  if (session?.user) {
    userId = session.user.id;
    const flags = await getUserGroupFlags(prisma, userId);
    includeHidden = flags?.isSviluppo === true;
  }

  try {
    const campaigns = await listCampaignsByOrgSlug(prisma, orgSlug, {
      userId,
      includeHidden,
    });
    const validated = campaigns.map(c => {
      const activeFeatures = c.feature.map(f => f.featureType.functionName);
      // `talents` (T-0xx, fusione in "Progressione PG"): non ha più una
      // propria `Feature` — l'abilitazione vive su `FT_PROGRESS`.
      const progressFeature = c.feature.find(
        f => f.featureType.functionName === FT_PROGRESS
      );
      const talentsActive =
        !!progressFeature &&
        progressFeatureSchema.parse(progressFeature.featureData).talentsEnabled;
      // Il `DataType` "Talenti" (kind: talent) è sempre `sidebarShow: true`
      // (vedi `TALENTI_DATA_TYPE_DEFAULTS`), ma la sua voce di navigazione va
      // nascosta quando talenti non è abilitato — a differenza di ogni
      // altro `DataType`, che non dipende da alcuna Feature.
      const dataTypes = c.dataTypes
        .filter(dt => dt.kind !== DataTypeKind.talent || talentsActive)
        .map(({ name, icon }) => ({ name, icon }));

      return campaignSchema.parse({
        ...c,
        dataTypes,
        activeFeatures,
      });
    });
    return NextResponse.json(validated);
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return apiError(500, "Internal server error");
  }
}

// Creare una campagna precede l'esistenza di qualunque Grant su di essa: può
// farlo solo chi è già head_master di un'altra campagna della stessa
// organizzazione (vedi isOrganizationHeadMaster).
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const body = await request.json().catch(() => null);
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  const { orgSlug, ...data } = parsed.data;

  try {
    const organization = await getOrganizationBySlug(
      prisma,
      orgSlug ?? ARCANA_DOMINE_SLUG
    );
    if (!organization) {
      return apiError(404, "Organizzazione non trovata");
    }

    // Bypass SOLO per questa route: Sviluppo Web deve poter creare campagne
    // dalla vista "god view" di Amministrazione > Ruoli anche senza essere
    // già head_master di nessuna campagna dell'organizzazione — non
    // reintrodurre questo bypass su altre route di business (vedi il
    // refactoring T-049 che lo ha rimosso ovunque tranne qui).
    const flags = await getUserGroupFlags(prisma, session.user.id);
    const canCreate =
      flags?.isSviluppo === true ||
      (await isOrganizationHeadMaster(
        prisma,
        session.user.id,
        organization.id
      ));
    if (!canCreate) {
      return apiError(403, "Permessi insufficienti");
    }

    const campaign = await createCampaign(prisma, {
      ...data,
      organizationId: organization.id,
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError(
        409,
        "Esiste già una campagna con questo slug in questa organizzazione"
      );
    }
    console.error("Error creating campaign:", error);
    return apiError(500, "Internal server error");
  }
}
