import { NextRequest, NextResponse } from "next/server";
import { CharacterType, NotificationType, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  characterSchema,
  createCharacterSchema,
  CHARACTER_STAFF_ONLY_FIELDS,
} from "@/lib/validations/character";
import { auth } from "@/lib/auth";
import {
  createCharacter,
  listUserCharacters,
} from "@/lib/repositories/character.repository";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listGrantsForCampaign } from "@/lib/repositories/grant.repository";
import { createNotifications } from "@/lib/repositories/notification.repository";
import { isUserCampaignHelper } from "@/lib/authorization";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

// T-3: sempre filtrata su `userId: session.user.id` (vedi
// listUserCharacters) — restituisce solo i personaggi dell'utente
// autenticato, mai quelli di terzi. Non serve alcun controllo di ruolo di
// campagna (Grant): un ruolo head_master/master/supporter è un privilegio di
// staff, non un prerequisito per vedere i propri personaggi.
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Not authenticated");
  }

  const campaignSlug =
    request.nextUrl.searchParams.get("campaignSlug") ?? undefined;

  try {
    const characters = await listUserCharacters(prisma, {
      userId: session.user.id,
      campaignSlug,
    });

    // characterSchema coerces dates from raw Prisma payload.
    const validated = characters.map(c =>
      characterSchema.parse({
        ...c,
        campaignName: c.campaign.name,
        campaignSlug: c.campaign.slug,
        orgSlug: c.campaign.organization.slug,
        userName: c.user.name,
      })
    );

    return NextResponse.json(validated);
  } catch (error) {
    console.error("Error fetching characters:", error);
    return apiError(500, "Internal server error");
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Not authenticated");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Dati non validi");
  }

  const validation = createCharacterSchema.safeParse(body);
  if (!validation.success) {
    return apiError(400, "Dati non validi", validation.error);
  }

  const { campaignSlug, ...fields } = validation.data;

  try {
    const campaign = await getCampaignBySlug(
      prisma,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (!campaign) {
      return apiError(404, "Campagna non trovata");
    }

    const staffOnlyFields = CHARACTER_STAFF_ONLY_FIELDS.filter(
      field => field in fields
    );
    if (staffOnlyFields.length > 0) {
      const isStaff = await isUserCampaignHelper(
        prisma,
        session.user.id,
        campaign.id
      );
      if (!isStaff) {
        return apiError(
          403,
          "Permessi insufficienti",
          `Campi riservati allo staff della campagna: ${staffOnlyFields.join(", ")}`
        );
      }
    }

    // Notifica (T-0xx, pannello notifiche) "nuovo PG in review": creazione
    // del personaggio + fan-out ai master/head_master della campagna nella
    // stessa transazione, stesso principio del percorso di creazione con
    // catalogo (`POST .../campaigns/[campaignSlug]/characters`) — un
    // fallimento nel fan-out non deve lasciare un personaggio "orfano" di
    // notifica silenziosamente, ma nemmeno riuscire a metà.
    const created = await prisma.$transaction(async tx => {
      const character = await createCharacter(tx, {
        ...fields,
        campaignId: campaign.id,
        userId: session.user.id,
      });

      // Solo head_master (non i master semplici) e solo PG (non i PNG,
      // gestiti direttamente dallo staff): stessa scelta prodotto di
      // `campaigns/[campaignSlug]/characters/route.ts`.
      const grants =
        character.type === CharacterType.pg
          ? await listGrantsForCampaign(tx, campaign.id)
          : [];
      const headMasterUserIds = new Set(
        grants
          .filter(grant => grant.role === Role.head_master)
          .map(grant => grant.userId)
      );
      await createNotifications(
        tx,
        Array.from(headMasterUserIds).map(userId => ({
          userId,
          campaignId: campaign.id,
          type: NotificationType.character_status,
          entityId: character.id,
        }))
      );

      return character;
    });

    const response = characterSchema.parse({
      ...created,
      background: created.background ?? "",
      campaignName: created.campaign.name,
      campaignSlug: created.campaign.slug,
      orgSlug: created.campaign.organization.slug,
      userName: created.user.name,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating character:", error);
    return apiError(500, "Internal server error");
  }
}
