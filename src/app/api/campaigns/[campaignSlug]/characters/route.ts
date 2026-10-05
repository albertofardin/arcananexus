import { NextRequest, NextResponse } from "next/server";
import {
  CharacterType,
  DataTypeKind,
  DataVisibility,
  NotificationType,
  Role,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  isUserCampaignHelper,
  isUserCampaignMaster,
  requireCampaignAdminBySlug,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import {
  getReferenceDataByIdScoped,
  type ReferenceDataWithDataType,
} from "@/lib/repositories/referenceData.repository";
import {
  createCharacter,
  listCampaignCharacters,
} from "@/lib/repositories/character.repository";
import { listDataTypes } from "@/lib/repositories/dataType.repository";
import { listGrantsForCampaign } from "@/lib/repositories/grant.repository";
import { createNotifications } from "@/lib/repositories/notification.repository";
import {
  CHARACTER_STAFF_ONLY_FIELDS,
  characterSchema,
} from "@/lib/validations/character";
import { createCharacterWithCatalogSchema } from "@/lib/validations/characterCreation";
import { parseReferenceDataFlags } from "@/lib/validations/referenceDataFlags";
import {
  assignReferenceDataToCharacter,
  sortAssignmentsByRequirements,
  CreationOnlyAssignmentError,
  CrossCampaignAssignmentError,
  NonRepeatableAssignmentError,
  NotAssignableDataTypeError,
  PlayerAssignmentNotAllowedError,
  RequirementBatchCycleError,
  RequirementsNotSatisfiedError,
} from "@/lib/services/characterData.service";
import {
  getXpBalance,
  grantInitialXp,
  InsufficientXpError,
  updateXp,
} from "@/lib/services/xp.service";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Elenca tutti i personaggi della campagna (di ogni giocatore), per la vista
// staff "Personaggi" sotto l'Area Master. Riservato a head_master della
// campagna o super-admin, a differenza di GET /api/characters che restituisce
// sempre e solo i personaggi dell'utente autenticato.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignAdminBySlug(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const characters = await listCampaignCharacters(prisma, access.campaign.id);

    const validated = characters.map(c =>
      characterSchema.parse({
        ...c,
        userName: c.user.name,
        userImage: c.user.image,
      })
    );

    return NextResponse.json(validated);
  } catch (error) {
    console.error("Error fetching campaign characters:", error);
    return apiError(500, "Internal server error");
  }
}

// Crea un PG scegliendo le voci di catalogo della campagna (origine,
// categorie di appartenenza, talenti di creazione…): applica
// cardinalità/requisiti/budget XP tramite `characterData.service` (T-017) e
// accredita gli XP iniziali di origine (`xp.service.grantInitialXp`, T-025)
// *prima* di applicare i costi delle
// assegnazioni. Ordine: crea `Character` → grant iniziale → assegnazioni
// (riordinate topologicamente rispetto al grafo `requires`,
// `sortAssignmentsByRequirements`, T-042 — non l'ordine di arrivo dal
// client), il tutto in un'unica transazione Prisma — un fallimento in una
// qualsiasi assegnazione fa rollback dell'intera richiesta (nessun PG
// orfano, nessuna assegnazione parziale). `assignReferenceDataToCharacter` (T-018: reso
// componibile in transazione) scrive direttamente sul `tx` di questa
// funzione invece di aprirne una propria.
//
// Autorizzazione — due assi distinti, non un'unica soglia:
// - `isMasterOrAbove` (ruolo `master`/`head_master`): può creare il PG per
//   conto di un altro utente (`userId` nel body) e ottiene sempre
//   `isMaster: true` verso il servizio di assegnazione (bypassa
//   assignability/creationOnly/requisiti/budget XP), anche creando il
//   proprio PG.
// - `isCampaignStaff` (qualunque `Grant`, anche `supporter`): stessa soglia
//   di `CHARACTER_STAFF_ONLY_FIELDS` già usata da
//   `POST /api/characters` — chi non la soddisfa non può impostare
//   masterNotes/approvalDate/deathDate/parkDate in creazione.
// - il giocatore ordinario (né l'uno né l'altro) crea solo il proprio PG,
//   senza altro requisito: la quota associativa (`checkAssociationQuotaAccess`)
//   NON si applica qui — riguarda l'iscrizione a un evento (booking), non la
//   creazione del personaggio, che resta libera per chiunque acceda alla
//   campagna.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const body = await request.json().catch(() => null);
  const parsed = createCharacterWithCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  const {
    userId: requestedUserId,
    name,
    assignments,
    xpUpdate,
    ...fields
  } = parsed.data;

  try {
    const campaign = await getCampaignBySlug(
      prisma,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (!campaign) {
      return apiError(404, "Campagna non trovata");
    }

    const isMasterOrAbove = await isUserCampaignMaster(
      prisma,
      session.user.id,
      campaign.id
    );
    const isCampaignStaff =
      isMasterOrAbove ||
      (await isUserCampaignHelper(prisma, session.user.id, campaign.id));

    const targetUserId = requestedUserId ?? session.user.id;

    if (targetUserId !== session.user.id) {
      if (!isMasterOrAbove) {
        return apiError(
          403,
          "Permessi insufficienti",
          "Solo lo staff della campagna (master o superiore) può creare un personaggio per conto di un altro utente"
        );
      }
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!targetUser) {
        return apiError(404, "Utente non trovato");
      }
    }

    const staffOnlyFields = CHARACTER_STAFF_ONLY_FIELDS.filter(
      field => field in fields
    );
    if (!isCampaignStaff && staffOnlyFields.length > 0) {
      return apiError(
        403,
        "Permessi insufficienti",
        `Campi riservati allo staff della campagna: ${staffOnlyFields.join(", ")}`
      );
    }

    // Aggiornamento XP (T-0xx, campo master in fase di creazione):
    // riservato al master/head_master, stessa soglia di `isMasterOrAbove`
    // usata per bypassare requisiti/budget XP delle assegnazioni sotto —
    // non la soglia più bassa `isCampaignStaff` (un helper non decide budget
    // XP altrui).
    if (xpUpdate !== undefined && xpUpdate !== 0 && !isMasterOrAbove) {
      return apiError(
        403,
        "Permessi insufficienti",
        "Solo lo staff della campagna (master o superiore) può aggiornare gli XP in creazione"
      );
    }

    // Risolve tutte le voci di catalogo scelte, scopate alla campagna: un id
    // valido ma di un'altra campagna (o inesistente) è 404, senza far
    // trapelare l'esistenza altrove — stesso trattamento delle altre route di
    // catalogo (`getReferenceDataByIdScoped`). `assignments` PUÒ contenere lo
    // stesso `referenceDataId` più volte (talento ripetibile scelto N volte,
    // T-0xx: lo Zod di `createCharacterWithCatalogSchema` blocca solo un
    // duplicato con `value` esplicito, ambiguo) — ogni occorrenza viene
    // comunque risolta indipendentemente, poi applicata una alla volta più
    // sotto da `assignReferenceDataToCharacter`, che impone il tetto reale.
    const resolvedAssignments: {
      referenceDataId: number;
      value?: unknown;
      definition: ReferenceDataWithDataType;
    }[] = [];
    for (const assignment of assignments) {
      const definition = await getReferenceDataByIdScoped(
        prisma,
        assignment.referenceDataId,
        campaign.id
      );
      if (!definition) {
        return apiError(404, "Voce di catalogo non trovata");
      }
      resolvedAssignments.push({ ...assignment, definition });
    }

    // Il grant iniziale (T-025) richiede *una* origine: più di una scelta
    // tra le voci selezionate è ambigua (quale `startingPx` vale?) —
    // rifiutata prima di aprire la transazione.
    const originsDefinitions = resolvedAssignments
      .map(a => a.definition)
      .filter(definition => definition.dataType.kind === DataTypeKind.origins);
    if (originsDefinitions.length > 1) {
      return apiError(422, "È stata selezionata più di un'origine");
    }
    const originsDefinition = originsDefinitions[0];

    // Difensivo contro dati di catalogo importati fuori dal form admin
    // (es. `externalId` da import esterni), che bypassano lo Zod di
    // `referenceDataFlags.ts`: `grantInitialXp` richiede `flags.startingPx`
    // numerico e lancerebbe un `Error` generico (non mappato sotto),
    // finendo come 500 invece di un 422 comprensibile.
    if (
      originsDefinition &&
      !parseReferenceDataFlags(DataTypeKind.origins, originsDefinition.flags)
        .success
    ) {
      return apiError(
        422,
        "L'origine selezionata ha una configurazione non valida (XP iniziali mancanti)"
      );
    }

    // Categorie identitarie `mandatory: true` (assignable/origins) senza
    // nessuna voce selezionata nel batch: validazione di form base (come
    // nome/background), non un gate di gioco bypassabile dal master — a
    // differenza di `RequirementsNotSatisfiedError`/budget XP sotto, che il
    // master può forzare.
    const allDataTypes = await listDataTypes(prisma, campaign.id);
    const mandatoryDataTypes = allDataTypes.filter(
      dt =>
        (dt.kind === DataTypeKind.assignable ||
          dt.kind === DataTypeKind.origins) &&
        dt.mandatory
    );
    const selectedDataTypeIds = new Set(
      resolvedAssignments.map(a => a.definition.dataTypeId)
    );
    const missingMandatory = mandatoryDataTypes.filter(
      dt => !selectedDataTypeIds.has(dt.id)
    );
    if (missingMandatory.length > 0) {
      return apiError(
        422,
        `Campo obbligatorio mancante: ${missingMandatory.map(dt => dt.name).join(", ")}`
      );
    }

    // `timeout: 20000` (default Prisma 5000ms, P2028 osservato in produzione):
    // ogni assegnazione fa diverse query sequenziali (requisiti/XP), quindi il
    // tempo totale scala con il numero di voci scelte — sommato alla latenza
    // di rete verso Neon, un batch con più talenti supera facilmente i 5s di
    // default e la transazione viene chiusa a metà.
    const result = await prisma.$transaction(
      async tx => {
        const character = await createCharacter(tx, {
          ...fields,
          name,
          campaignId: campaign.id,
          userId: targetUserId,
        });

        // Notifica (T-0xx, pannello notifiche): ogni nuovo PG nasce "in
        // review" (`getCharacterStatus`, nessun concetto di transizione di
        // stato) — il trigger è la CREAZIONE stessa, non un cambio di stato
        // successivo. Fan-out SOLO agli head_master della campagna (non i
        // master semplici, scelta prodotto esplicita — un master non deve
        // essere sommerso da ogni nuovo personaggio, quel controllo resta
        // riservato a chi ha il ruolo più alto). `@@unique([userId,
        // campaignId])` su `Grant` garantisce già un solo `Grant` per utente,
        // ma il `Set` resta la stessa difesa esplicita usata altrove per
        // `createNotifications`, che non dedupa da sola.
        // Solo PG: un PNG è creato/gestito direttamente dallo staff, quindi
        // non ha senso notificarlo agli head_master come "nuovo PG in review".
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

        const xpGrant = originsDefinition
          ? await grantInitialXp(tx, character, originsDefinition)
          : null;

        const xpUpdateTransaction =
          xpUpdate !== undefined && xpUpdate !== 0
            ? await updateXp(tx, character, xpUpdate, {
                updatedByUserId: session.user.id,
              })
            : null;

        // Ordinamento topologico (T-042) rispetto al grafo `requires`
        // (AND/OR), non l'ordine di arrivo dal client: `resolvedAssignments`
        // segue l'ordine di selezione/click dell'utente in UI
        // (`Array.from(selectedIds)` in `CharacterCreationForm.tsx`), che può
        // mettere un talento dipendente prima del suo prerequisito nello
        // stesso batch pur essendo la combinazione valida nel suo insieme
        // (`evaluateSelection` lato client la valuta correttamente come un
        // tutt'uno). Senza questo riordino, il loop sotto — che valuta i
        // requisiti leggendo le `CharacterData` già scritte nella stessa `tx`
        // — rifiuterebbe una catena valida solo perché il prerequisito non è
        // ancora stato inserito in un'iterazione precedente.
        const orderedAssignments = await sortAssignmentsByRequirements(
          tx,
          character,
          resolvedAssignments
        );

        const characterDataEntries = [];
        const xpDebits = [];
        for (const { definition, value } of orderedAssignments) {
          const { characterData, xpTransaction } =
            await assignReferenceDataToCharacter(tx, character, definition, {
              isMaster: isMasterOrAbove,
              grantedById: isMasterOrAbove ? session.user.id : undefined,
              isCreation: true,
              value: value as Prisma.InputJsonValue | undefined,
              // Creazione PG (T-018/T-038): sempre `visible`, anche quando è il
              // master a creare il PG per conto di un altro utente
              // (`isMaster: true` sopra) — a differenza della concessione
              // manuale post-creazione, qui non ha senso un'assegnazione
              // "segreta" (il default `hidden` che il servizio applicherebbe
              // altrimenti alle concessioni master, vedi
              // `resolveAssignmentVisibility`).
              visibility: DataVisibility.visible,
            });
          characterDataEntries.push(characterData);
          if (xpTransaction) xpDebits.push(xpTransaction);
        }

        const xpBalance = await getXpBalance(tx, character.id);

        return {
          character,
          xpGrant,
          xpUpdateTransaction,
          characterDataEntries,
          xpDebits,
          xpBalance,
        };
      },
      { timeout: 20000 }
    );

    return NextResponse.json(
      {
        character: result.character,
        xpGrant: result.xpGrant,
        xpUpdate: result.xpUpdateTransaction,
        assignments: result.characterDataEntries,
        xpDebits: result.xpDebits,
        xpBalance: result.xpBalance,
      },
      { status: 201 }
    );
  } catch (error) {
    // Invariante cross-tenant di `characterData.service`: difensivo, la
    // definizione è già stata risolta scopata alla campagna sopra.
    if (error instanceof CrossCampaignAssignmentError) {
      return apiError(404, "Voce di catalogo non trovata");
    }
    if (error instanceof PlayerAssignmentNotAllowedError) {
      return apiError(403, "Permessi insufficienti", error.message);
    }
    // Difensivo: questa route passa sempre `isCreation: true`, quindi il gate
    // `creationOnly` non dovrebbe mai rifiutare qui (rilevante solo per altri
    // chiamanti del servizio, es. T-019 downtime).
    if (error instanceof CreationOnlyAssignmentError) {
      return apiError(403, "Permessi insufficienti", error.message);
    }
    if (error instanceof NonRepeatableAssignmentError) {
      return apiError(409, error.message);
    }
    // Vincolo strutturale (T-035): `cardinality: null`, non bypassabile
    // nemmeno dal master — 422 come `RequirementsNotSatisfiedError` (dato
    // sintatticamente valido, business rule non soddisfabile), non 403
    // (non è un problema di permessi).
    if (error instanceof NotAssignableDataTypeError) {
      return apiError(422, error.message);
    }
    if (error instanceof RequirementsNotSatisfiedError) {
      return apiError(422, error.message, error.evaluation);
    }
    // Ciclo di dipendenze irrisolvibile nel batch selezionato (T-042): 422
    // esplicito, non un 500/loop infinito (vedi
    // `sortAssignmentsByRequirements`).
    if (error instanceof RequirementBatchCycleError) {
      return apiError(422, error.message);
    }
    if (error instanceof InsufficientXpError) {
      return apiError(422, error.message, {
        available: error.available,
        cost: error.cost,
      });
    }
    console.error("Error creating character with catalog:", error);
    return apiError(500, "Internal server error");
  }
}
