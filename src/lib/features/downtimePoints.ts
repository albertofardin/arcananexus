import type { Character } from "@prisma/client";
import { adjustCharacterDowntimePoints } from "@/lib/repositories/character.repository";
import type { PrismaTransactionClient } from "@/lib/repositories/types";

// Errore condiviso da ogni handler che scala punti downtime: l'handler
// `talents` (config opt-in `requiresDowntimePoint`) e l'handler condiviso
// delle 10 categorie downtime (`downtimeAction.ts`, sempre a costo 1 — vedi
// `spendDowntimePoint`).
export class InsufficientDowntimePointsError extends Error {
  readonly available: number;

  constructor(available: number) {
    super(
      `Punti downtime insufficienti: disponibili ${available}, richiesto 1.`
    );
    this.name = "InsufficientDowntimePointsError";
    this.available = available;
  }
}

// Verifica e scala atomicamente 1 punto downtime dal personaggio, dentro la
// stessa transazione del chiamante (coerente con `debitTalent`/`xp.service`):
// se il saldo è insufficiente, non scrive nulla e lancia
// `InsufficientDowntimePointsError` — il chiamante deve invocarla PRIMA di
// creare l'`Action`, così un fallimento qui non lascia scritture parziali.
export async function spendDowntimePoint(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id" | "downtimePoints">
): Promise<void> {
  if (character.downtimePoints < 1) {
    throw new InsufficientDowntimePointsError(character.downtimePoints);
  }
  await adjustCharacterDowntimePoints(prisma, character.id, -1);
}
