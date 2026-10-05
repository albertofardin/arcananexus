import z from "zod";

// Shape della risposta di `GET .../characters/[characterId]/talents`
// (T-0xx): validata lato client (`useQueryCharacterTalents`) prima di
// entrare nelle due modali talenti — stesso trattamento già applicato al
// grafo requisiti (`dataRequirementsGraphSchema`).
export const acquirableTalentSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(["hidden", "visible"]),
  flags: z.unknown().optional(),
});

// Solo `requires`/`blocks` (T-050): `getCharacterAcquirableTalents`
// (`characterTalents.service.ts`) filtra esplicitamente `visibleWith`/
// `grants` prima di popolare `talentRequirements` — l'albero talenti è un
// display di gioco, non l'editor admin dei 4 tipi. Non riusa il
// `requirementTypeEnum` (4 valori) di `dataRequirement.ts` apposta.
export const talentRequirementEdgeSchema = z.object({
  definitionId: z.number(),
  requiredDefinitionId: z.number(),
  requiredDefinitionName: z.string(),
  type: z.enum(["requires", "blocks"]),
  groupId: z.number().nullable().optional(),
});

export const characterAcquirableTalentsSchema = z.object({
  acquirableTalents: z.array(acquirableTalentSchema),
  talentRequirements: z.array(talentRequirementEdgeSchema),
  unlockedReferenceDataIds: z.array(z.number()),
});

export type CharacterAcquirableTalentsResponse = z.infer<
  typeof characterAcquirableTalentsSchema
>;
