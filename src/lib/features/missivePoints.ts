import type { Character } from "@prisma/client";
import { adjustCharacterMissivePoints } from "@/lib/repositories/character.repository";
import type { PrismaTransactionClient } from "@/lib/repositories/types";

// Gate primario dell'handler `missive.ts`: un unico tetto per personaggio
// (`Character.missivePoints`), configurato per campagna via
// `missiveFeatureSchema` (`maxPerEvent`) e ripristinato dalla ricarica
// post-evento — non disattivabile via config, sempre applicato (a meno che
// la missiva sia diretta a un PNG e `pngCountsAsDowntime` sposti il costo su
// `spendDowntimePoint`, vedi `missive.ts`).
export class InsufficientMissivePointsError extends Error {
  readonly available: number;

  constructor(available: number) {
    super(`Missive esaurite: disponibili ${available}, richiesta 1.`);
    this.name = "InsufficientMissivePointsError";
    this.available = available;
  }
}

// Verifica e scala atomicamente 1 missiva dal personaggio, dentro la stessa
// transazione del chiamante — stesso pattern 1:1 di `spendDowntimePoint`
// (`downtimePoints.ts`).
export async function spendMissivePoint(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id" | "missivePoints">
): Promise<void> {
  if (character.missivePoints < 1) {
    throw new InsufficientMissivePointsError(character.missivePoints);
  }
  await adjustCharacterMissivePoints(prisma, character.id, -1);
}
