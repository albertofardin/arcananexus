import z from "zod";

// Corpo di `POST /api/campaigns/[campaignSlug]/characters/[characterId]/
// talents/unlocks` (T-0xx): sblocca un singolo talento-catalogo altrimenti
// `hidden` per un personaggio specifico (occhio master in `ModalTalents`).
export const createCharacterTalentUnlockSchema = z
  .object({
    referenceDataId: z.number().int().positive(),
  })
  .strict();

export type CreateCharacterTalentUnlockBody = z.infer<
  typeof createCharacterTalentUnlockSchema
>;
