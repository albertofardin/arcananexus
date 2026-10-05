import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { DataVisibility, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignMaster } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import { getReferenceDataByIdScoped } from "@/lib/repositories/referenceData.repository";
import { characterAssignmentInputSchema } from "@/lib/validations/characterCreation";
import { dataVisibilityEnum } from "@/lib/validations/referenceData";
import {
  assignReferenceDataToCharacter,
  CreationOnlyAssignmentError,
  CrossCampaignAssignmentError,
  NonRepeatableAssignmentError,
  NotAssignableDataTypeError,
  PlayerAssignmentNotAllowedError,
  RequirementsNotSatisfiedError,
} from "@/lib/services/characterData.service";
import { InsufficientXpError } from "@/lib/services/xp.service";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; characterId: string }>;
}

// `freeOfCharge` (T-0xx, "Concedi come master"): concessione immediata di
// un talento a costo zero, indipendente dalla bozza standard del
// giocatore/`CharacterEditor.tsx` — onorato solo se `isMasterOrAbove` (vedi
// sotto), ignorato silenziosamente altrimenti (un giocatore che lo invia
// paga comunque il costo reale). `visibility` (T-0xx, icona occhio mostrata
// dal master anche prima di salvare, `CharacterEditorAnagraphic`): scelta
// esplicita che sovrascrive il default `DataType.visibility` per QUESTA
// assegnazione — vedi `resolveAssignmentVisibility`, ignorata per il
// self-assign giocatore (sempre `visible`, non negoziabile). Entrambi estesi
// localmente invece che sullo schema condiviso `characterAssignmentInputSchema`
// (riusato anche dall'array `assignments` della creazione PG, dove questi
// concetti non hanno senso: il self-assign in creazione è sempre `visible`).
const masterFreeGrantInputSchema = characterAssignmentInputSchema.extend({
  freeOfCharge: z.boolean().optional(),
  visibility: dataVisibilityEnum.optional(),
});

// Assegna una `ReferenceData` a un PG già esistente (T-047), fuori dalla
// creazione: due casi d'uso condividono questa route, distinti solo da chi
// chiama e quindi da `isMaster` passato al servizio (`assignReferenceDataToCharacter`
// applica gli stessi gate già usati dalla creazione PG, T-018) —
// - il giocatore, solo sul proprio PG: auto-assegnazione immediata, senza
//   coda di approvazione (a differenza del downtime "Impara talento",
//   T-019), permessa solo per `assignability: "always"` (ogni altro caso è
//   respinto dal gate: `"none"`/`"masterOnly"`, o `CreationOnlyAssignmentError`
//   per `"creationOnly"` fuori creazione);
// - il master/head_master (o super-admin) della campagna, su qualunque PG:
//   bypassa tutti i gate lato giocatore (stessa soglia già usata da T-018
//   per la creazione PG per conto terzi) — è il percorso con cui il master
//   corregge un `origins` scelto per errore in creazione, o assegna/revoca
//   una categoria `assignability: "masterOnly"`. Nessun ricalcolo
//   automatico dell'XP iniziale in questo percorso: `grantInitialXp` è
//   invocato solo dalla creazione PG (`characters/route.ts`).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, characterId: characterIdParam } = await params;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const characterId = Number(characterIdParam);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return apiError(400, "Id personaggio non valido");
  }

  const body = await request.json().catch(() => null);
  const parsed = masterFreeGrantInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  try {
    const campaign = await getCampaignBySlug(
      prisma,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (!campaign) {
      return apiError(404, "Campagna non trovata");
    }

    const character = await getCharacterInCampaign(
      prisma,
      characterId,
      campaign.id
    );
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    const isMasterOrAbove = await isUserCampaignMaster(
      prisma,
      session.user.id,
      campaign.id
    );

    if (character.userId !== session.user.id && !isMasterOrAbove) {
      return apiError(
        403,
        "Permessi insufficienti",
        "Puoi assegnare voci di catalogo solo al tuo personaggio"
      );
    }

    const definition = await getReferenceDataByIdScoped(
      prisma,
      parsed.data.referenceDataId,
      campaign.id
    );
    if (!definition) {
      return apiError(404, "Voce di catalogo non trovata");
    }

    // Onorato solo per master/head_master/super-admin: un giocatore che lo
    // invia sul proprio PG paga comunque il costo reale (vedi commento su
    // `masterFreeGrantInputSchema` sopra).
    const freeOfCharge = isMasterOrAbove && parsed.data.freeOfCharge === true;

    const result = await assignReferenceDataToCharacter(
      prisma,
      character,
      definition,
      {
        isMaster: isMasterOrAbove,
        grantedById: isMasterOrAbove ? session.user.id : undefined,
        value: parsed.data.value as Prisma.InputJsonValue | undefined,
        freeOfCharge,
        // Una concessione "a costo zero" è un regalo immediato, non un
        // elemento segreto da rivelare più avanti: deve comparire subito
        // sulla scheda del giocatore, a prescindere da quanto inviato in
        // `parsed.data.visibility`. Altrimenti la scelta esplicita del
        // master (se presente) vince sul default `DataType.visibility`
        // (`resolveAssignmentVisibility`); ignorata comunque per il
        // self-assign giocatore, sempre `visible`.
        visibility: freeOfCharge
          ? DataVisibility.visible
          : parsed.data.visibility,
      }
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CrossCampaignAssignmentError) {
      return apiError(404, error.message);
    }
    if (
      error instanceof PlayerAssignmentNotAllowedError ||
      error instanceof CreationOnlyAssignmentError
    ) {
      return apiError(403, error.message);
    }
    if (error instanceof NonRepeatableAssignmentError) {
      return apiError(409, error.message);
    }
    if (error instanceof NotAssignableDataTypeError) {
      return apiError(422, error.message);
    }
    if (error instanceof RequirementsNotSatisfiedError) {
      return apiError(422, error.message, error.evaluation);
    }
    if (error instanceof InsufficientXpError) {
      return apiError(422, error.message, {
        available: error.available,
        cost: error.cost,
      });
    }
    console.error("Error assigning reference data to character:", error);
    return apiError(500, "Internal server error");
  }
}
