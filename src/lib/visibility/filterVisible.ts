import { DataVisibility, RequirementType } from "@prisma/client";
import type {
  VisibilityConditionEdge,
  VisibilityContext,
  VisibilityGated,
  VisibilityViewer,
} from "./types";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus/status";

// Raggruppa per `definitionId` (la voce sottoposta a condizione) gli archi
// `visibleWith` di una lista piatta di `DataRequirement` (es. da
// `listRequirementsForCampaign`): da passare come
// `VisibilityContext.visibilityConditions`. Ogni chiamante che filtra voci di
// catalogo per un non-staff deve passarlo, altrimenti la condizione viene
// ignorata e resta la sola `visibility` di base.
export function buildVisibilityConditions(
  edges: {
    definitionId: number;
    requiredDefinitionId: number;
    type: RequirementType;
    groupId: number | null;
  }[]
): Map<number, VisibilityConditionEdge[]> {
  const conditions = new Map<number, VisibilityConditionEdge[]>();
  for (const edge of edges) {
    if (edge.type !== RequirementType.visibleWith) continue;
    const list = conditions.get(edge.definitionId) ?? [];
    list.push({
      requiredDefinitionId: edge.requiredDefinitionId,
      groupId: edge.groupId,
    });
    conditions.set(edge.definitionId, list);
  }
  return conditions;
}

// Un PG non "Attivo" (deceduto, in pausa, o non ancora approvato — vedi
// `getCharacterStatus`) non deve mai sbloccare voci a condizione: la sua
// `ownedData` (es. appartenenza a fazione/religione) resta storicamente
// vera nel DB anche da morto/parcheggiato, ma non deve più contare ai fini
// della visibilità condizionale. Nessun `character` (viewer senza PG in
// questa campagna) è trattato come non attivo, stesso fail-closed.
function isCharacterActive(character: VisibilityContext["character"]): boolean {
  return character != null && getCharacterStatus(character) === "approved";
}

// Difesa in profondità multi-tenant: `context.ownedData` dovrebbe già arrivare
// scoped alla campagna dal chiamante (repository/route), ma la valutazione
// della condizione non deve mai poter far "risultare vero" un match basato su
// `CharacterData` di un'altra campagna se il chiamante sbaglia lo scoping a
// monte. Filtra quindi sempre per `campaign.id` prima di valutare, invece di
// fidarsi ciecamente dell'input.
function scopeContextToCampaign(context: VisibilityContext): VisibilityContext {
  return {
    ...context,
    ownedData: context.ownedData.filter(
      owned => owned.dataType.campaignId === context.campaign.id
    ),
  };
}

// Stessa semantica AND/OR-group di `evaluateRequirements`
// (`characterData.service.ts`), reimplementata qui in piccolo invece che
// condivisa: le due funzioni ritornano forme diverse (booleano secco qui,
// un report dettagliato di cosa manca là) e il corpo è ~10 righe, non vale
// un'astrazione comune. Righe con `groupId` nullo sono condizioni
// individuali (AND, tutte devono essere possedute); righe che condividono lo
// stesso `groupId` sono alternative (OR, ne basta una posseduta).
function isVisibilityConditionSatisfied(
  edges: VisibilityConditionEdge[],
  ownedReferenceDataIds: Set<number>
): boolean {
  const groups = new Map<number, VisibilityConditionEdge[]>();
  for (const edge of edges) {
    if (edge.groupId == null) {
      if (!ownedReferenceDataIds.has(edge.requiredDefinitionId)) return false;
      continue;
    }
    const group = groups.get(edge.groupId) ?? [];
    group.push(edge);
    groups.set(edge.groupId, group);
  }
  for (const group of groups.values()) {
    if (
      !group.some(edge => ownedReferenceDataIds.has(edge.requiredDefinitionId))
    ) {
      return false;
    }
  }
  return true;
}

// Decide se una singola voce (`ReferenceData` o `CharacterData`) è visibile
// al `viewer`. Regola (CLAUDE.md: "la valutazione deve girare sempre
// server-side" — questa funzione non tocca mai il client):
//
// 1. staff (`isStaff`, già risolto dal chiamante) bypassa sempre, condizione
//    inclusa: vede anche le voci condizionate/nascoste.
// 2. se `context.visibilityConditions` contiene archi `visibleWith` per
//    `entry.id`, la condizione **sostituisce** la visibilità di base per i
//    non-staff: PG non "Attivo" (`context.character` assente o non
//    "approved", `isCharacterActive`) → nascosta senza nemmeno valutare la
//    condizione; altrimenti soddisfatta (AND sulle righe individuali, OR sui
//    `groupId`, vedi `isVisibilityConditionSatisfied`) → visibile; non
//    soddisfatta → nascosta (fail-closed, mai un crash).
// 3. altrimenti (nessun arco per questa voce) si applica la visibilità di
//    base: `visible` → a tutti, `hidden` → solo staff (già escluso al punto
//    1, quindi qui è `false`).
//
// ATTENZIONE (review round 1, finding C, non risolto qui — solo
// documentato): per `CharacterData`, `visibility: visible` è semanticamente
// "visibile al proprietario" (PG/utente owner), non "a chiunque" — a
// differenza di `ReferenceData`, dove `visible` è globale alla campagna.
// Questa funzione non conosce `userId`/`characterId` e non fa owner-scoping:
// il chiamante DEVE già passare in `entries` solo `CharacterData` di
// proprietà del `viewer` (o, per lo staff, filtrate a monte per il PG che sta
// guardando), altrimenti un `viewer` non-staff potrebbe vedere `CharacterData`
// `visible` di un altro utente/personaggio. Nessun consumer wired ancora
// (T-020/scheda PG arriveranno con questa responsabilità): da chiarire/
// irrobustire quando quei consumer verranno collegati.
export function isEntryVisible<T extends VisibilityGated>(
  viewer: VisibilityViewer,
  entry: T,
  context: VisibilityContext
): boolean {
  if (viewer.isStaff) return true;

  const conditionEdges = context.visibilityConditions?.get(entry.id);
  if (conditionEdges && conditionEdges.length > 0) {
    const scoped = scopeContextToCampaign(context);
    const ownedReferenceDataIds = new Set(
      scoped.ownedData.map(owned => owned.referenceDataId)
    );
    // Una voce già posseduta (es. concessa dal master) resta sempre visibile
    // al proprietario, anche se la condizione non è (più) soddisfatta.
    if (ownedReferenceDataIds.has(entry.id)) return true;

    if (!isCharacterActive(context.character)) return false; // PG non attivo: fail-closed, la condizione non è mai valutata

    return isVisibilityConditionSatisfied(
      conditionEdges,
      ownedReferenceDataIds
    );
  }

  return entry.visibility === DataVisibility.visible;
}

// Filtra un array di voci (`ReferenceData[]`/`CharacterData[]`, o qualunque
// shape con `id`/`visibility`) tenendo solo quelle visibili al `viewer`.
// Riusabile da sidebar/sezioni (T-020), catalogo
// (T-016) e scheda PG: chiama SEMPRE questa funzione prima di serializzare
// entries verso il client, mai dopo.
export function filterVisible<T extends VisibilityGated>(
  entries: T[],
  viewer: VisibilityViewer,
  context: VisibilityContext
): T[] {
  return entries.filter(entry => isEntryVisible(viewer, entry, context));
}
