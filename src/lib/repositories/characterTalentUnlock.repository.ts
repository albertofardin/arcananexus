import type { PrismaClient, CharacterTalentUnlock } from "@prisma/client";
import type { CreateCharacterTalentUnlockInput } from "./types";

// Id delle `ReferenceData` sbloccate per QUESTO personaggio (T-0xx, occhio
// master in ModalTalents): eccezione per-personaggio a
// `ReferenceData.visibility: hidden`, letta da `characterTalents.service.ts`
// prima di `filterVisible` per far comparire nel catalogo apprendibile un
// talento altrimenti nascosto a tutta la campagna — senza assegnarlo (il
// giocatore deve comunque "Aggiungere" e pagare XP).
export async function listUnlockedReferenceDataIdsForCharacter(
  prisma: PrismaClient,
  characterId: number
): Promise<number[]> {
  const rows = await prisma.characterTalentUnlock.findMany({
    where: { characterId },
    select: { referenceDataId: true },
  });
  return rows.map(row => row.referenceDataId);
}

// Idempotente (`@@unique([characterId, referenceDataId])`): il master può
// cliccare "sblocca" più volte (es. doppio submit) senza errore 500 da
// vincolo unique violato.
export async function upsertCharacterTalentUnlock(
  prisma: PrismaClient,
  data: CreateCharacterTalentUnlockInput
): Promise<CharacterTalentUnlock> {
  return prisma.characterTalentUnlock.upsert({
    where: {
      characterId_referenceDataId: {
        characterId: data.characterId,
        referenceDataId: data.referenceDataId,
      },
    },
    create: data,
    // Nessun campo da aggiornare al re-click su un'eccezione già esistente:
    // `unlockedById`/`createdAt` restano quelli del primo sblocco, coerente
    // con l'idea che l'eccezione è già attiva, non "ri-attivata".
    update: {},
  });
}

// Idempotente anche in cancellazione (`deleteMany`, non `delete`): un
// secondo click su "blocca di nuovo" dopo che la riga è già sparita (es.
// doppio submit, o l'eccezione non è mai esistita) non deve fallire con
// `RecordNotFound`.
export async function deleteCharacterTalentUnlock(
  prisma: PrismaClient,
  characterId: number,
  referenceDataId: number
): Promise<void> {
  await prisma.characterTalentUnlock.deleteMany({
    where: { characterId, referenceDataId },
  });
}
