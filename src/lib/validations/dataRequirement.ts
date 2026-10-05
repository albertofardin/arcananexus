import z from "zod";

export const requirementTypeEnum = z.enum([
  "requires",
  "blocks",
  "visibleWith",
  "grants",
]);

// `groupId` identifica un OR-group tra più archi della stessa voce di
// origine e dello stesso tipo ("posseduta almeno una del gruppo" invece di
// "tutte"); vedi il commento su `DataRequirement.groupId` in schema.prisma.
// Ammesso per `requires` e `visibleWith` (stessa semantica AND/OR per
// entrambi), rifiutato per `blocks`/`grants` (dove non ha un significato
// dichiarato: un bloccante posseduto blocca già da solo, e una cascata
// `grants` assegna sempre tutti i suoi bersagli, non "uno tra") tramite
// `.refine()`, non solo per convenzione — un client che lo manda per errore
// riceve un 400 esplicito invece di un campo silenziosamente ignorato.
export const createDataRequirementSchema = z
  .object({
    requiredDefinitionId: z.number().int().positive(),
    type: requirementTypeEnum,
    groupId: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    data =>
      data.type === "requires" ||
      data.type === "visibleWith" ||
      data.groupId === undefined,
    {
      message:
        'groupId è consentito solo per requisiti di tipo "requires" o "visibleWith"',
      path: ["groupId"],
    }
  );

export type CreateDataRequirementBody = z.infer<
  typeof createDataRequirementSchema
>;

// Shape della risposta di `GET .../reference-data/[referenceDataId]/requirements`
// (T-016/T-027): usata lato client dalla UI admin (T-030) per validare il
// grafo prima di renderizzarlo. Non `.strict()`: `requiredDefinition`/
// `definition` sono `ReferenceData` intere lato API, qui serve solo `id`/
// `name` (più la Categoria, `dataType.name`, per etichettare gli archi in
// lista senza dover incrociare l'intero catalogo lato client).
const dataRequirementEndpointSchema = z.object({
  id: z.number(),
  name: z.string(),
  dataType: z.object({ id: z.number(), name: z.string() }),
});

export const outgoingDataRequirementSchema = z.object({
  id: z.number(),
  definitionId: z.number(),
  requiredDefinitionId: z.number(),
  type: requirementTypeEnum,
  groupId: z.number().nullable(),
  requiredDefinition: dataRequirementEndpointSchema,
});

export const incomingDataRequirementSchema = z.object({
  id: z.number(),
  definitionId: z.number(),
  requiredDefinitionId: z.number(),
  type: requirementTypeEnum,
  groupId: z.number().nullable(),
  definition: dataRequirementEndpointSchema,
});

export const dataRequirementsGraphSchema = z.object({
  requires: z.array(outgoingDataRequirementSchema),
  requiredBy: z.array(incomingDataRequirementSchema),
});

export type OutgoingDataRequirement = z.infer<
  typeof outgoingDataRequirementSchema
>;
export type IncomingDataRequirement = z.infer<
  typeof incomingDataRequirementSchema
>;
export type DataRequirementsGraph = z.infer<typeof dataRequirementsGraphSchema>;
