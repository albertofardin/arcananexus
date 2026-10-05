import { DataVisibility } from "@prisma/client";
import { DATA_VISIBILITY_LABELS } from "@/lib/labels";

export interface ContentEntry {
  id: number;
  name: string;
  description: string | null;
  visibility: DataVisibility;
  // Popolato solo quando la voce viene caricata per la gestione avanzata
  // (`advanced`, T-030 admin): flags dichiarativi per-`kind`. Assente/
  // `undefined` nel flusso semplificato della pagina dati (master-gated,
  // niente flags — resta dominio esclusivo admin).
  flags?: unknown;
}

export interface DocumentEntry extends ContentEntry {
  fileUrl: string | null;
}

export const VISIBILITY_ITEMS = (
  Object.keys(DATA_VISIBILITY_LABELS) as DataVisibility[]
).map(visibility => ({
  id: visibility,
  label: DATA_VISIBILITY_LABELS[visibility],
}));
