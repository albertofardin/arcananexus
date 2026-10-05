import { Prisma, type Action } from "@prisma/client";
import type { PrismaTransactionClient } from "./types";

// Log delle azioni eseguite tramite il registry feature (T-019): ogni
// invocazione di un handler (`src/lib/features/`) crea qui la sua riga di
// tracciamento, a cui `CharacterData.actionId`/`XpTransaction.actionId`
// possono agganciarsi. Ogni azione ha sempre effetto immediato: non esiste
// più un workflow di approvazione/rifiuto.

// `actionData` è `Json?`: un `null` esplicito deve mappare a
// `Prisma.JsonNull`, non alla stringa JSON "null" — stesso pattern di
// `characterData.repository.ts`/`referenceData.repository.ts`.
function toJsonInput(
  value: Prisma.InputJsonValue | null | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
}

export interface CreateActionInput {
  // Opzionale (T-0xx): `null` solo per un'`Action` dichiarata "a nome del
  // master" (`FT_MISSIVE` senza un PG reale come mittente, vedi
  // `handlers/missive.ts` → `createMasterMissiveAction`).
  characterId: number | null;
  featureId: number;
  actionData?: Prisma.InputJsonValue | null;
  // Autore reale (T-0xx, tab "Inviate" per un viewer master): valorizzato
  // SOLO da `createMasterMissiveAction` per una missiva "a nome del
  // master" (mai per una Comunicazione, mai per un'azione con
  // `characterId` reale) — vedi il commento su `Action.authorUserId` in
  // `schema.prisma`. `undefined`/assente equivale a `null` (nessun autore
  // tracciato), stesso principio di `actionData`.
  authorUserId?: string | null;
}

// Accetta `PrismaTransactionClient` (PrismaClient o `Prisma.TransactionClient`,
// stesso contratto di composabilità di `xpTransaction.repository.ts`): gli
// handler feature (T-019) creano l'`Action` nella stessa transazione delle
// mutazioni che ne dipendono (es. `CharacterData` + addebito XP).
export async function createAction(
  prisma: PrismaTransactionClient,
  data: CreateActionInput
): Promise<Action> {
  return prisma.action.create({
    data: {
      characterId: data.characterId,
      featureId: data.featureId,
      actionData: toJsonInput(data.actionData),
      authorUserId: data.authorUserId ?? null,
    },
  });
}
