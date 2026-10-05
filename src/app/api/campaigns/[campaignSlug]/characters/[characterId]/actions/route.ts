import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  isUserCampaignMaster,
  isUserCampaignHelper,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { executeActionSchema } from "@/lib/validations/action";
import {
  executeFeatureAction,
  ActionDataValidationError,
  UnknownFeatureFunctionError,
  FT_MISSIVE,
  FT_DOWNTIME,
} from "@/lib/features";
import { SubFeatureDisabledError } from "@/lib/features/handlers/progress";
import {
  CreationOnlyAssignmentError,
  CrossCampaignAssignmentError,
  NonRepeatableAssignmentError,
  NotAssignableDataTypeError,
  PlayerAssignmentNotAllowedError,
  RequirementsNotSatisfiedError,
} from "@/lib/services/characterData.service";
import { InsufficientXpError } from "@/lib/services/xp.service";
// Errori di dominio specifici degli handler (T-019): il registry non li
// tipizza in modo generico (`FeatureHandlerResult` non porta un canale
// errori dedicato), quindi questa route — l'unico chiamante HTTP di
// `executeFeatureAction` — li importa direttamente dai moduli handler per
// mapparli su una risposta leggibile. Accettabile qui perché lo scope T-033
// esclude nuovi handler: solo questi due esistono.
import {
  ReferenceDataNotFoundError,
  NotATalentError,
} from "@/lib/features/handlers/talents";
import {
  DeceasedCharacterNotFoundError,
  CharacterNotDeceasedError,
} from "@/lib/features/handlers/deathXpRecovery";
import { InsufficientDowntimePointsError } from "@/lib/features/downtimePoints";
import { InsufficientMissivePointsError } from "@/lib/features/missivePoints";
import {
  MissiveReceiverNotFoundError,
  MissiveReplyNotAllowedError,
} from "@/lib/features/handlers/missive";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; characterId: string }>;
}

// Esegue un'azione del registry feature (T-019 → wiring T-033) sul PG
// indicato dal path: risolve la `Feature` attiva della campagna per
// `functionName`, poi invoca `executeFeatureAction` (che valida `actionData`
// contro l'`actionSchema` dell'handler e lo esegue).
//
// Autorizzazione — due soggetti soli possono dichiarare un'azione su un PG:
// - il giocatore, solo sul proprio PG (`character.userId === session.user.id`);
// - il master/head_master (o super-admin) della campagna, su qualunque PG —
//   stessa soglia "master o superiore" già usata da T-018 per la creazione
//   PG per conto terzi (`isUserCampaignMaster`). Da notare: questo non fa
//   bypassare i gate interni dell'handler (`assignability`/`creationOnly`/
//   requisiti — vedi `characterData.service.ts`), che restano gli stessi
//   applicati al self-assign; `talents`/`deathXpRecovery` non ricevono
//   alcun flag `isMaster` da propagare, a differenza del servizio di
//   assegnazione diretta usato da `POST .../characters`. Fa eccezione
//   `missive` (T-0xx, decisione B): riceve `bypassLimits: isMasterOrAbove`
//   (campo additivo di `FeatureHandlerContext`, ignorato dagli altri
//   handler) per saltare il gate missivePoints/downtimePoints quando chi
//   invia è master/head_master/super-admin, a prescindere dal PG scelto.
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
  const parsed = executeActionSchema.safeParse(body);
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
        "Puoi dichiarare azioni solo sul tuo personaggio"
      );
    }

    const feature = await getFeatureByFunctionName(
      prisma,
      campaign.id,
      parsed.data.functionName
    );
    if (!feature) {
      return apiError(404, "Questa azione non è attiva in questa campagna");
    }

    // Sospensione lato PG (T-0xx, `Feature.paused`): missive e downtime
    // possono essere "messi in pausa" dallo staff senza disattivare la
    // feature — headmaster/master/supporter (`isUserCampaignHelper`, la
    // stessa soglia "staff della campagna" già usata altrove, es.
    // `missive/[id]/page.tsx`) continuano a poter dichiarare azioni, solo i
    // PG vengono bloccati. Un solo `functionName` `FT_DOWNTIME` per
    // qualunque categoria (T-0xx, fix catalogo globale): `feature` risolta
    // sopra è già il contenitore, nessun lookup separato necessario.
    const isMissiveOrDowntimeAction =
      parsed.data.functionName === FT_MISSIVE ||
      parsed.data.functionName === FT_DOWNTIME;
    if (isMissiveOrDowntimeAction) {
      const isStaff = await isUserCampaignHelper(
        prisma,
        session.user.id,
        campaign.id
      );
      if (!isStaff && feature.paused) {
        return apiError(
          403,
          parsed.data.functionName === FT_MISSIVE
            ? "L'invio di missive è stato sospeso dallo staff"
            : "L'invio di downtime è stato sospeso dallo staff"
        );
      }
    }

    const result = await executeFeatureAction(prisma, {
      functionName: parsed.data.functionName,
      character,
      feature,
      actionData: parsed.data.actionData,
      campaign,
      // Bypass del gate missivePoints/downtimePoints per master/head_master/
      // super-admin (decisione B, T-0xx): letto solo dall'handler `missive`,
      // ogni altro handler lo ignora (`FeatureHandlerContext.bypassLimits`).
      bypassLimits: isMasterOrAbove,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ActionDataValidationError) {
      return apiError(400, error.message, error.issues);
    }
    if (error instanceof UnknownFeatureFunctionError) {
      return apiError(
        422,
        "Il tipo di feature non ha una funzione registrata nel codice",
        error.functionName
      );
    }
    if (
      error instanceof CrossCampaignAssignmentError ||
      error instanceof ReferenceDataNotFoundError ||
      error instanceof DeceasedCharacterNotFoundError ||
      error instanceof MissiveReceiverNotFoundError ||
      // Sotto-toggle disattivato (T-0xx, "Progressione PG" Opzione B): stesso
      // esito "non attiva" di una Feature mai configurata.
      error instanceof SubFeatureDisabledError
    ) {
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
    // Vincolo strutturale (T-035): `cardinality: null`, non un problema di
    // permessi — stesso trattamento di `RequirementsNotSatisfiedError`.
    if (error instanceof NotAssignableDataTypeError) {
      return apiError(422, error.message);
    }
    if (error instanceof RequirementsNotSatisfiedError) {
      return apiError(422, error.message, error.evaluation);
    }
    if (
      error instanceof NotATalentError ||
      error instanceof CharacterNotDeceasedError
    ) {
      return apiError(422, error.message);
    }
    if (error instanceof InsufficientXpError) {
      return apiError(422, error.message, {
        available: error.available,
        cost: error.cost,
      });
    }
    if (error instanceof InsufficientDowntimePointsError) {
      return apiError(422, error.message, {
        availableDowntimePoints: error.available,
      });
    }
    if (error instanceof InsufficientMissivePointsError) {
      return apiError(422, error.message, {
        available: error.available,
      });
    }
    if (error instanceof MissiveReplyNotAllowedError) {
      return apiError(403, error.message);
    }
    console.error("Error executing feature action:", error);
    return apiError(500, "Internal server error");
  }
}
