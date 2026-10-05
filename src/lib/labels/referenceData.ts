import type { DataVisibility, RequirementType } from "@prisma/client";

export const DATA_VISIBILITY_LABELS: Record<DataVisibility, string> = {
  visible: "Visibile",
  hidden: "Nascosta",
};

export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  requires: "Richiede",
  blocks: "Blocca",
  visibleWith: "Visibile con",
  grants: "Aggiunge",
};

// Etichette dei singoli `flags` dichiarativi (cosmetiche): la lista dei campi
// da mostrare per un `kind` resta sempre determinata dallo schema Zod di
// `referenceDataFlags.ts` (vedi `flagsShape` in ReferenceDataManager), non da
// questa mappa — un campo senza etichetta qui ricade sulla sua chiave grezza,
// quindi un nuovo `kind`/flag aggiunto lato schema resta renderizzabile senza
// modifiche qui.
export const REFERENCE_DATA_FLAG_LABELS: Record<string, string> = {
  cost: "Costo",
  repeatable: "Ripetibile",
  maxRepetitions: "Max ripetizioni",
  creationOnly: "Acquistabile solo in creazione",
  startingPx: "PX iniziali",
  category: "Listato",
  isDowntimeUsable: "Usabile come downtime",
  isMissivePointBonus: "+1pt Missiva",
  isDowntimePointBonus: "+1pt Downtime",
};
