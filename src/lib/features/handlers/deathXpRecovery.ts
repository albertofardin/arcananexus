import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { FeatureHandlerContext, FeatureHandlerResult } from "../types";
// Da `progress.schema.ts`, MAI da `progress.ts` (T-0xx): quel
// modulo importa questo stesso file per l'handler orchestratore — un
// import in questa direzione chiuderebbe un ciclo reale
// `deathXpRecovery.ts -> progress.ts -> deathXpRecovery.ts`.
import { progressFeatureSchema } from "./progress.schema";
import { createAction } from "@/lib/repositories/action.repository";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import { getXpBalance, recordDeathRecovery } from "@/lib/services/xp.service";

// Handler d'esempio (T-019): recupero XP alla morte. `actionData` indica il
// PG defunto (`character` nel contesto è invece il successore, il PG a cui
// viene accreditato il recupero — coerente con `Action.characterId` e con la
// firma `recordDeathRecovery(prisma, sourceCharacter, targetCharacter,
// amount)` di `xp.service.ts`, T-025).
export const deathXpRecoveryActionSchema = z
  .object({ deceasedCharacterId: z.number().int().positive() })
  .strict();

export type DeathXpRecoveryActionData = z.infer<
  typeof deathXpRecoveryActionSchema
>;

export class DeceasedCharacterNotFoundError extends Error {
  constructor() {
    super("Il personaggio defunto indicato non esiste in questa campagna.");
    this.name = "DeceasedCharacterNotFoundError";
  }
}

export class CharacterNotDeceasedError extends Error {
  constructor() {
    super("Il personaggio indicato non risulta deceduto.");
    this.name = "CharacterNotDeceasedError";
  }
}

// La morte è già un fatto registrato (`Character.deathDate`): l'`Action`
// viene loggata con effetto immediato. Se la quota calcolata è 0 (nessun XP
// disponibile da recuperare) l'azione viene comunque loggata, ma senza
// `XpTransaction` (`recordDeathRecovery` rifiuta importi non positivi).
//
// Esportato (T-0xx, Opzione B): non chiama più `registerFeatureHandler` da
// solo — vedi il commento equivalente in `talents.ts`.
export async function handler(
  prisma: PrismaClient,
  context: FeatureHandlerContext<DeathXpRecoveryActionData>
): Promise<FeatureHandlerResult> {
  const { character: successor, feature, actionData, campaign } = context;

  const deceased = await getCharacterInCampaign(
    prisma,
    actionData.deceasedCharacterId,
    campaign.id
  );
  if (!deceased) {
    throw new DeceasedCharacterNotFoundError();
  }
  if (!deceased.deathDate) {
    throw new CharacterNotDeceasedError();
  }

  // `feature` è la `Feature` "progress" (T-0xx, fusione con talenti —
  // vedi `progress.ts`), mai una propria per questo `functionName`:
  // `feature.featureData` è `Json` non tipizzato a schema, già validato in
  // fase di configurazione (API di configurazione `Feature`, T-019), ma
  // ri-validato qui difensivamente prima di usarlo per calcolare l'importo.
  const { deathXpRecoveryPercentage } = progressFeatureSchema.parse(
    feature.featureData
  );

  const deceasedBalance = await getXpBalance(prisma, deceased.id);
  const amount = Math.floor(
    (deceasedBalance.available * deathXpRecoveryPercentage) / 100
  );

  return prisma.$transaction(async tx => {
    const action = await createAction(tx, {
      characterId: successor.id,
      featureId: feature.id,
      actionData,
    });

    if (amount <= 0) {
      return { action, xpTransaction: null };
    }

    const xpTransaction = await recordDeathRecovery(
      tx,
      deceased,
      successor,
      amount
    );

    return { action, xpTransaction };
  });
}
