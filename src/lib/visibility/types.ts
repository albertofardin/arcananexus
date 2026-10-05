import type {
  Campaign,
  Character,
  CharacterData,
  DataType,
  DataVisibility,
} from "@prisma/client";

// Chi guarda: `isStaff` è già risolto dal chiamante (tipicamente
// `isUserCampaignHelper`, come in `characters/[id]/route.ts`) — questo
// modulo non fa query, valuta soltanto un booleano già noto.
export interface VisibilityViewer {
  userId: string;
  isStaff: boolean;
}

// `CharacterData` posseduta dal viewer, con la `DataType` della sua
// `ReferenceData` già inclusa (denormalizzata su `CharacterData.dataTypeId`):
// serve a `isEntryVisible` per risalire alla voce di catalogo posseduta senza
// un join aggiuntivo quando valuta un arco `visibleWith`.
export type OwnedCharacterData = CharacterData & { dataType: DataType };

// Una riga dell'arco `visibleWith` uscente da una voce (vedi
// `DataRequirement`): stessa forma AND/OR-group di `requires` — righe con
// `groupId` nullo sono condizioni individuali (AND), righe che condividono lo
// stesso `groupId` sono alternative (OR), un singolo gruppo soddisfatto
// dall'`ownedData` del PG.
export interface VisibilityConditionEdge {
  requiredDefinitionId: number;
  groupId: number | null;
}

// Contesto di valutazione passato a `isEntryVisible`: la campagna
// (isolamento multi-tenant), il personaggio del viewer se presente (un
// `User` può non averne uno, es. staff), le sue `CharacterData` possedute, e
// (opzionale) gli archi `visibleWith` della campagna già caricati dal
// chiamante, raggruppati per l'id della voce sottoposta a condizione. Nessun
// arco per una voce → fallback alla sola `visibility` di base (vedi
// `isEntryVisible`).
export interface VisibilityContext {
  campaign: Campaign;
  character: Character | null;
  ownedData: OwnedCharacterData[];
  visibilityConditions?: Map<number, VisibilityConditionEdge[]>;
}

// Voce su cui `filterVisible` decide: sia `ReferenceData` che `CharacterData`
// hanno questa shape (solo `visibility` di base — la condizione ora vive come
// arco `visibleWith` nel grafo `DataRequirement`, risolto tramite
// `context.visibilityConditions`, non più come campo diretto della voce).
//
// ATTENZIONE (review round 1, finding C): per `CharacterData`, `visibility:
// visible` significa "visibile al proprietario" (owner-scoped), non "a
// chiunque" come per `ReferenceData` (campaign-wide). Questo tipo/il modulo
// `filterVisible` non portano `userId`/`characterId` e non fanno owner-scoping
// da soli: il chiamante DEVE passare come `entries` solo `CharacterData` già
// filtrate all'owner pertinente (o, per lo staff, al PG che sta guardando).
export interface VisibilityGated {
  id: number;
  visibility: DataVisibility;
}
