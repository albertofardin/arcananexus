// Unico punto di calcolo per l'apprendimento ripetuto di un talento
// (`flags.repeatable` + `flags.maxRepetitions`, min 2 — vedi
// `referenceDataFlags.ts`): riusato sia da `CharacterEditor` (bozza talenti
// sulla scheda PG) sia da `CharacterCreation` (selezione in creazione), oltre
// che da `TalentList` stesso per il badge/i controlli +/- sulla riga.
// `TalentFlags`/`readTalentFlags` vivono qui (non in `TalentList.tsx`) così
// da restare l'unica sorgente, senza dipendenze circolari fra i due file.

export interface TalentFlags {
  cost?: number;
  repeatable?: boolean;
  // Tetto di apprendimenti quando `repeatable` è true; assente = ripetibile
  // senza limite (comportamento pre-esistente).
  maxRepetitions?: number;
  creationOnly?: boolean;
}

export function readTalentFlags(flags: unknown): TalentFlags {
  if (!flags || typeof flags !== "object") return {};
  const record = flags as Record<string, unknown>;
  return {
    cost: typeof record.cost === "number" ? record.cost : undefined,
    repeatable:
      typeof record.repeatable === "boolean" ? record.repeatable : undefined,
    maxRepetitions:
      typeof record.maxRepetitions === "number"
        ? record.maxRepetitions
        : undefined,
    creationOnly:
      typeof record.creationOnly === "boolean"
        ? record.creationOnly
        : undefined,
  };
}

export interface TalentRepetitionStatus {
  // Volte già apprese/selezionate (possedute + in bozza, a seconda di cosa
  // passa il chiamante) contro cui `max` è valutato.
  count: number;
  // `undefined` = nessun tetto (non ripetibile → 1, ripetibile senza
  // `maxRepetitions` → `undefined`, ripetibile con `maxRepetitions` → quel
  // valore).
  max?: number;
  atLimit: boolean;
  canAcquireMore: boolean;
  // "count/max", solo per un ripetibile con tetto — l'unico caso in cui il
  // numero massimo ha senso da mostrare.
  badgeLabel?: string;
}

export function getTalentRepetitionStatus(
  flags: Pick<TalentFlags, "repeatable" | "maxRepetitions">,
  count: number
): TalentRepetitionStatus {
  const max = flags.repeatable ? flags.maxRepetitions : 1;
  const atLimit = max !== undefined && count >= max;
  return {
    count,
    max,
    atLimit,
    canAcquireMore: !atLimit,
    badgeLabel:
      flags.repeatable && max !== undefined ? `${count}/${max}` : undefined,
  };
}

export type TalentCounts = ReadonlyMap<number, number>;

export function incrementTalentCount(
  counts: TalentCounts,
  id: number
): Map<number, number> {
  const next = new Map(counts);
  next.set(id, (next.get(id) ?? 0) + 1);
  return next;
}

export function decrementTalentCount(
  counts: TalentCounts,
  id: number
): Map<number, number> {
  const next = new Map(counts);
  const current = next.get(id) ?? 0;
  if (current <= 1) next.delete(id);
  else next.set(id, current - 1);
  return next;
}

export function totalTalentCount(counts: TalentCounts): number {
  let total = 0;
  for (const n of counts.values()) total += n;
  return total;
}

// Un id per ogni unità del conteggio (`{5: 3}` → `[5, 5, 5]`): usata per
// tradurre la bozza in N richieste/assegnazioni ripetute allo stesso
// `referenceDataId`, dopo aver ordinato gli id distinti rispetto ai requisiti
// (`sortTalentDraftIds`, che deduplica per costruzione).
export function expandTalentCounts(counts: TalentCounts): number[] {
  const ids: number[] = [];
  for (const [id, n] of counts) {
    for (let i = 0; i < n; i++) ids.push(id);
  }
  return ids;
}

export function sumTalentCost(
  entries: readonly { id: number; flags?: unknown }[],
  counts: TalentCounts
): number {
  let total = 0;
  for (const entry of entries) {
    const n = counts.get(entry.id) ?? 0;
    if (n === 0) continue;
    const { cost } = readTalentFlags(entry.flags);
    if (typeof cost === "number") total += cost * n;
  }
  return total;
}
