import z from "zod";
import { dataVisibilityEnum } from "./referenceData";

// `kind` e `cardinality` sono discriminanti fissi lato backend (T-015/T-016):
// questi enum Zod devono restare sincronizzati con `DataTypeKind`/
// `DataCardinality` in prisma/schema.prisma.
//
// T-047: `race`/`religion`/`faction` sono stati sostituiti da `origins`
// (razza/estrazione: determina l'XP iniziale, non più modificabile dal
// giocatore dopo la creazione) e `assignable` (categoria generica di
// appartenenza — ex religion/faction, indistinguibili a livello di codice —
// con permesso di assegnazione configurabile via `assignability`).
export const dataTypeKindEnum = z.enum([
  "generic",
  "origins",
  "assignable",
  "talent",
]);

// `talent` è un caso speciale (T-046): sempre presente, esattamente una
// volta per campagna, creato automaticamente da `createCampaign`/backfill —
// mai selezionabile come `kind` di un nuovo `DataType` creato da UI/API.
// `updateDataTypeSchema`/`dataTypeAdminSchema` restano sull'enum completo
// (vedi commento sotto su `kind` non modificabile in update, e la lettura di
// righe esistenti di kind talent nell'admin).
export const creatableDataTypeKindEnum = dataTypeKindEnum.exclude(["talent"]);

export const dataCardinalityEnum = z.enum(["single", "multi"]);

export const dataTypeRenderEnum = z.enum(["catalog", "files", "pages"]);

// Permesso di assegnazione (T-047/T-048): unifica gli ex `playerAssignable`
// (boolean) + `kindAssignable` (nullable, solo per `kind: "assignable"`) in
// un unico campo NOT NULL, significativo per ogni `kind` (vedi
// `dataTypeShapeInvariantSchema` sotto per il valore/vincolo per-`kind`):
// `none` = mai assegnabile, nemmeno dal master (`NotAssignableDataTypeError`,
// solo `generic`); `always` = il giocatore può auto-assegnarsela in
// qualunque momento (anche dopo la creazione PG); `creationOnly` = solo in
// creazione, poi solo il master (fisso per `origins`); `masterOnly` = mai
// dal giocatore, solo il master (in qualunque momento) — il master bypassa
// comunque sempre questo campo, `assignReferenceDataToCharacter` lo legge
// solo per il self-assign.
export const dataTypeAssignabilityEnum = z.enum([
  "none",
  "always",
  "creationOnly",
  "masterOnly",
]);

// `kind` è modificabile in update (tranne per `kind: "talent"`, sempre
// bloccato — vedi guard applicativo nella route PATCH), ma solo su una
// `DataType` che non ha ancora `ReferenceData` figlie: cambiarlo lascerebbe
// le voci già esistenti con `flags` shape-ati per il vecchio `kind` (stesso
// motivo per cui `dataTypeId` resta immutabile su `ReferenceData`, vedi
// `reference-data/[referenceDataId]/route.ts`). Il guard sul conteggio è
// applicativo (route PATCH), non esprimibile qui: `updateDataTypeSchema` non
// ha visibilità sullo stato esistente della riga.
//
// `cardinality` è nullable (T-035): significativo quando `assignability !==
// "none"` — per `kind: "generic"` è sempre `null` (mai assegnabile), per
// `kind: "origins"` è sempre `"single"` (fisso), per `kind: "assignable"`/
// `"talent"` è una scelta libera dell'admin (vedi
// `dataTypeShapeInvariantSchema` sotto).
const dataTypeEditableFields = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  description: z.string().trim().max(2000).nullable(),
  kind: creatableDataTypeKindEnum,
  cardinality: dataCardinalityEnum.nullable(),
  assignability: dataTypeAssignabilityEnum,
  mandatory: z.boolean(),
  sidebarShow: z.boolean(),
  sidebarOrder: z.number().int().nullable(),
  icon: z.string().trim().max(100).nullable(),
  renderAs: dataTypeRenderEnum,
  // Visibilità di default delle nuove assegnazioni master di questo tipo
  // (T-0xx): un dato non nasce mai "nascosto" per decisione implicita del
  // codice — è questo campo, configurabile per categoria, a deciderlo (vedi
  // `resolveAssignmentVisibility` in `characterData.service.ts`). Il
  // self-assign del giocatore resta sempre `visible`, non negoziabile
  // (invariante T-038 preesistente, non toccata da questo campo).
  visibility: dataVisibilityEnum,
});

const SHAPE_INVARIANT_MESSAGE =
  "assignability/cardinality non sono coerenti con kind";

// Invariante unificata "a valori effettivi" (T-035, estesa T-047/T-048,
// T-0xx `mandatory`): lega `kind` a `assignability`/`cardinality`/
// `mandatory`. `mandatory` (T-0xx) è configurabile solo per `origins` e
// `assignable` (l'unico momento in cui il giocatore sceglie tra alternative
// in creazione PG, `CharacterCreation.tsx`): sempre `false` per `generic`
// (mai assegnabile) e `talent` (mai scelto in creazione, gestito post-
// approvazione). `assignable`/`talent` non condividono più esattamente lo
// stesso vincolo (solo `assignable` ha `mandatory` libero) — restano due
// `case` separati perché concettualmente distinti, non perché la regola
// differisca sugli altri campi. Usata da:
// - `createDataTypeSchema`/`updateDataTypeSchema` sotto, sui soli campi
//   presenti nella singola richiesta (create: con i default impliciti
//   quando omessi; update: solo quando `kind` è noto — per update `kind` non
//   è nel body, quindi lì si applica solo il check "a valori effettivi" via
//   la route, che ha lo stato corrente);
// - la route PATCH (`data-types/[dataTypeId]/route.ts`), sui valori
//   effettivi ottenuti facendo il merge tra il body e il `DataType`
//   esistente (incluso il suo `kind`, immutabile).
export const dataTypeShapeInvariantSchema = z
  .object({
    kind: dataTypeKindEnum,
    assignability: dataTypeAssignabilityEnum,
    cardinality: dataCardinalityEnum.nullable(),
    mandatory: z.boolean(),
  })
  .refine(
    ({ kind, assignability, cardinality, mandatory }) => {
      switch (kind) {
        case "generic":
          return assignability === "none" && cardinality === null && !mandatory;
        case "origins":
          return assignability === "creationOnly" && cardinality === "single";
        case "assignable":
          return assignability !== "none" && cardinality !== null;
        case "talent":
          return assignability !== "none" && cardinality !== null && !mandatory;
      }
    },
    { message: SHAPE_INVARIANT_MESSAGE, path: ["kind"] }
  );

export const createDataTypeSchema = dataTypeEditableFields
  .partial()
  .extend({
    name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  })
  .strict()
  .refine(
    data =>
      dataTypeShapeInvariantSchema.safeParse({
        kind: data.kind ?? "generic",
        assignability: data.assignability ?? "none",
        cardinality: data.cardinality ?? null,
        mandatory: data.mandatory ?? false,
      }).success,
    { message: SHAPE_INVARIANT_MESSAGE, path: ["cardinality"] }
  );

export type CreateDataTypeBody = z.infer<typeof createDataTypeSchema>;

export const updateDataTypeSchema = dataTypeEditableFields
  .partial()
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: "Nessun campo da aggiornare",
  });
// L'invariante `dataTypeShapeInvariantSchema` non è verificabile qui da
// sola: un update parziale può toccare solo uno tra `kind`/`assignability`/
// `cardinality` (es. solo `cardinality`, lasciando `kind`/`assignability`
// impliciti). La route PATCH la applica sui valori effettivi post-merge con
// lo stato esistente — stesso motivo per cui qui `kind: "talent"` non è
// nemmeno un valore rifiutabile a monte: `creatableDataTypeKindEnum` lo
// esclude già dall'enum, ma il guard "talent non cambia mai kind" (in
// nessuna delle due direzioni) resta comunque applicativo, perché deve
// valere anche quando la riga esistente è già `talent` e il body prova a
// portarla a un kind valido come `generic`.

export type UpdateDataTypeBody = z.infer<typeof updateDataTypeSchema>;

// Shape di un `DataType` così come restituito dalla API di gestione
// (`GET /api/campaigns/[campaignSlug]/data-types`, con `?includeCount=true`
// per il conteggio delle `ReferenceData` figlie): usata lato client dalla UI
// admin (T-029) per validare la risposta prima di renderizzarla. Non
// `.strict()`: le route includono anche `campaign` sulle risposte di
// create/update (T-016), qui irrilevante e ignorato.
export const dataTypeAdminSchema = z.object({
  id: z.number(),
  campaignId: z.number(),
  name: z.string(),
  kind: dataTypeKindEnum,
  description: z.string().nullable(),
  cardinality: dataCardinalityEnum.nullable(),
  assignability: dataTypeAssignabilityEnum,
  mandatory: z.boolean(),
  sidebarShow: z.boolean(),
  sidebarOrder: z.number().int().nullable(),
  icon: z.string().nullable(),
  renderAs: dataTypeRenderEnum,
  visibility: dataVisibilityEnum,
  _count: z
    .object({ referenceData: z.number().int().nonnegative() })
    .optional(),
});

export type DataTypeAdmin = z.infer<typeof dataTypeAdminSchema>;

export const dataTypeAdminListSchema = z.array(dataTypeAdminSchema);
