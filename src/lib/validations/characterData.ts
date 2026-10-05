import z from "zod";
import { dataVisibilityEnum } from "./referenceData";

// Corpo di `PATCH /api/campaigns/[campaignSlug]/characters/[characterId]/
// data/[characterDataId]` (T-038): la sola "azione di reveal" del master,
// cambia `CharacterData.visibility` tra `visible`/`hidden`. Nessun altro
// campo è modificabile da questa route (non è un update generico della
// riga). Riusa `dataVisibilityEnum` (già definito per il catalogo
// `ReferenceData`, stesso enum Prisma `DataVisibility`).
export const updateCharacterDataVisibilitySchema = z
  .object({
    visibility: dataVisibilityEnum,
  })
  .strict();

export type UpdateCharacterDataVisibilityBody = z.infer<
  typeof updateCharacterDataVisibilitySchema
>;
