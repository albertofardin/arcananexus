import {
  DataTypeAssignability,
  DataTypeKind,
  type DataVisibility,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";
import type { FeatureHandlerContext, FeatureHandlerResult } from "../types";
import { createAction } from "@/lib/repositories/action.repository";
import { getReferenceDataByIdScoped } from "@/lib/repositories/referenceData.repository";
import { assignReferenceDataToCharacter } from "@/lib/services/characterData.service";

// Handler d'esempio (T-019): downtime "apprendi talento". Il giocatore sceglie
// una `ReferenceData` di kind `talent` della propria campagna.
export const talentsActionSchema = z
  .object({ referenceDataId: z.number().int().positive() })
  .strict();

export type TalentsActionData = z.infer<typeof talentsActionSchema>;

export class ReferenceDataNotFoundError extends Error {
  constructor() {
    super("La voce di catalogo scelta non esiste in questa campagna.");
    this.name = "ReferenceDataNotFoundError";
  }
}

export class NotATalentError extends Error {
  constructor() {
    super(
      "Questa funzione può assegnare solo voci di catalogo di tipo talento."
    );
    this.name = "NotATalentError";
  }
}

// Crea l'assegnazione (`CharacterData`) e l'eventuale addebito XP
// (`XpTransaction`, via `characterData.service`/T-017) agganciandoli
// all'`Action` creata: l'assegnazione e l'eventuale addebito XP sono sempre
// immediati ed effettivi. Nessun costo aggiuntivo in punti downtime (T-0xx,
// fusione in `progress`: `requiresDowntimePoint` è stato rimosso — mai
// esistito un motivo per farlo costare downtime oltre al suo costo XP).
//
// Esportato (T-0xx, Opzione B): non chiama più `registerFeatureHandler` da
// solo — è `progress.ts` l'unico modulo che registra un `functionName`
// eseguibile, delegando qui in base al campo `kind` di
// `progressActionSchema`. `context.feature`/`context.actionData` sono
// comunque quelli della `Feature`/azione "progress" (il gate
// `talentsEnabled` è già stato verificato dall'orchestratore prima di
// arrivare qui).
export async function handler(
  prisma: PrismaClient,
  context: FeatureHandlerContext<TalentsActionData>
): Promise<FeatureHandlerResult> {
  const { character, feature, actionData, campaign } = context;

  const definition = await getReferenceDataByIdScoped(
    prisma,
    actionData.referenceDataId,
    campaign.id
  );
  if (!definition) {
    throw new ReferenceDataNotFoundError();
  }
  if (definition.dataType.kind !== DataTypeKind.talent) {
    throw new NotATalentError();
  }

  return prisma.$transaction(async tx => {
    const action = await createAction(tx, {
      characterId: character.id,
      featureId: feature.id,
      actionData,
    });

    const { characterData, xpTransaction } =
      await assignReferenceDataToCharacter(tx, character, definition, {
        actionId: action.id,
      });

    return { action, characterData, xpTransaction };
  });
}

export interface AcquirableTalentDataType {
  id: number;
  kind: DataTypeKind;
  assignability: DataTypeAssignability;
}

export interface AcquirableTalentSource {
  id: number;
  dataTypeId: number;
  name: string;
  description: string | null;
  visibility: DataVisibility;
  flags: Prisma.JsonValue;
}

// Talenti ancora acquisibili dal personaggio (T-0xx, sostituisce il link
// dedicato in `CharacterEditor.tsx`): `DataType` di kind `talent`
// assegnabili (il giocatore vede solo `assignability: "always"`, il master
// tutti — stessa regola già applicata in `[actionType]/page.tsx`), esclusi i
// talenti già posseduti salvo `flags.repeatable` — e, se ripetibile con un
// `flags.maxRepetitions`, esclusi anche una volta raggiunto il tetto
// (`ownedCounts`, T-0xx).
export function selectAcquirableTalents(
  dataTypes: AcquirableTalentDataType[],
  referenceData: AcquirableTalentSource[],
  options: {
    isMaster: boolean;
    ownedReferenceDataIds: ReadonlySet<number>;
    ownedCounts: ReadonlyMap<number, number>;
  }
): AcquirableTalentSource[] {
  const talentDataTypeIds = new Set(
    dataTypes
      .filter(
        dt =>
          dt.kind === DataTypeKind.talent &&
          (options.isMaster ||
            dt.assignability === DataTypeAssignability.always)
      )
      .map(dt => dt.id)
  );

  return referenceData.filter(rd => {
    if (!talentDataTypeIds.has(rd.dataTypeId)) return false;
    if (!options.ownedReferenceDataIds.has(rd.id)) return true;
    const { flags } = rd;
    if (
      !flags ||
      typeof flags !== "object" ||
      Array.isArray(flags) ||
      (flags as Record<string, unknown>).repeatable !== true
    ) {
      return false;
    }
    const maxRepetitions = (flags as Record<string, unknown>).maxRepetitions;
    if (typeof maxRepetitions !== "number") return true;
    return (options.ownedCounts.get(rd.id) ?? 0) < maxRepetitions;
  });
}
