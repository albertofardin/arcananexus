import type { TalentRequirementEdge } from "@/components/TalentList";

// Ordina i talenti selezionati in bozza (T-0xx, "Apprendi talento" via
// `SaveBar` in `CharacterEditor.tsx`) rispetto al grafo `requires` (AND
// individuali + OR-group, stessa semantica di `sortAssignmentsByRequirements`
// in `characterData.service.ts`): un talento che nella bozza richiede un
// altro talento anch'esso in bozza deve essere sottomesso DOPO, altrimenti
// la singola action POST verso `.../actions` (che non è transazionale
// sull'intero batch, a differenza della creazione PG) fallirebbe lato
// server sul requisito ancora mancante.
//
// Best-effort: un ciclo *interno alla bozza* (non risolvibile in nessun
// ordine) non blocca qui — a differenza del server, che in un contesto del
// genere lancerebbe `RequirementBatchCycleError` — i talenti coinvolti
// restano nell'ordine originale e sarà il server a rifiutarli singolarmente
// al salvataggio, con un errore chiaro per ciascuno (stesso trattamento di
// un requisito genuinamente mancante).
export function sortTalentDraftIds(
  draftIds: readonly number[],
  requirements: readonly TalentRequirementEdge[],
  ownedReferenceDataIds: ReadonlySet<number>
): number[] {
  if (draftIds.length <= 1) return [...draftIds];

  const draftSet = new Set(draftIds);

  // Requisiti individuali (AND, `groupId` nullo) per `definitionId`.
  const individualRequires = new Map<number, number[]>();
  // OR-group per `definitionId`: un array di gruppi, ciascuno le sue
  // alternative (`requiredDefinitionId` che condividono lo stesso `groupId`
  // sulla stessa voce).
  const orGroupsByDefinition = new Map<number, number[][]>();
  const orGroupAlternativesByKey = new Map<string, number[]>();

  for (const edge of requirements) {
    if (edge.type !== "requires" || !draftSet.has(edge.definitionId)) {
      continue;
    }
    if (edge.groupId == null) {
      const list = individualRequires.get(edge.definitionId) ?? [];
      list.push(edge.requiredDefinitionId);
      individualRequires.set(edge.definitionId, list);
    } else {
      const key = `${edge.definitionId}:${edge.groupId}`;
      const list = orGroupAlternativesByKey.get(key) ?? [];
      list.push(edge.requiredDefinitionId);
      orGroupAlternativesByKey.set(key, list);
    }
  }
  for (const [key, alternatives] of orGroupAlternativesByKey) {
    const definitionId = Number(key.slice(0, key.indexOf(":")));
    const groups = orGroupsByDefinition.get(definitionId) ?? [];
    groups.push(alternatives);
    orGroupsByDefinition.set(definitionId, groups);
  }

  const remaining = new Set(draftIds);
  const placedIds = new Set<number>();
  const sorted: number[] = [];

  const isReady = (definitionId: number): boolean => {
    for (const requiredId of individualRequires.get(definitionId) ?? []) {
      if (ownedReferenceDataIds.has(requiredId) || placedIds.has(requiredId)) {
        continue;
      }
      // Ancora nella bozza e non ancora piazzato: blocca finché non lo è.
      if (draftSet.has(requiredId)) return false;
      // Fuori dalla bozza e non posseduto: nessun riordino lo risolve, non
      // è un motivo per bloccare l'ordinamento — sarà il server a
      // rifiutare questa voce con l'errore "requisiti non soddisfatti".
    }
    for (const alternatives of orGroupsByDefinition.get(definitionId) ?? []) {
      const groupSatisfied = alternatives.some(
        id => ownedReferenceDataIds.has(id) || placedIds.has(id)
      );
      if (groupSatisfied) continue;
      const hasPendingDraftAlternative = alternatives.some(id =>
        draftSet.has(id)
      );
      if (hasPendingDraftAlternative) return false;
    }
    return true;
  };

  while (remaining.size > 0) {
    let progressed = false;
    for (const definitionId of remaining) {
      if (!isReady(definitionId)) continue;
      sorted.push(definitionId);
      placedIds.add(definitionId);
      remaining.delete(definitionId);
      progressed = true;
    }
    if (!progressed) {
      sorted.push(...remaining);
      break;
    }
  }

  return sorted;
}
