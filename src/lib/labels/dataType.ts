import type {
  DataTypeKind,
  DataTypeAssignability,
  DataCardinality,
  DataTypeRender,
} from "@prisma/client";

export const DATA_TYPE_KIND_LABELS: Record<DataTypeKind, string> = {
  generic: "Generico",
  origins: "Origine",
  assignable: "Assegnabile",
  talent: "Talento",
};

export const DATA_TYPE_KIND_SUBLABELS: Record<DataTypeKind, string> = {
  generic:
    "Lista di dati liberi (es. Dicerie, Racconti, Regolamenti, Mappe, Loghi, Oggetti, Risorse)",
  origins:
    "Assegnabile ai PG e determina gli XP di partenza (es. Razze, Pianeta, Segno di nascita)",
  assignable:
    "Assegnabile ai PG con regole configurabili (es. Divinità, Fazioni, Professione, Benedizione)",
  talent: "Talenti: gestiti automaticamente, non creabile da qui",
};

export const DATA_TYPE_KIND_ICONS: Record<DataTypeKind, string> = {
  generic: "category",
  origins: "stars",
  assignable: "webhook",
  talent: "talent",
};

export const DATA_TYPE_ASSIGNABILITY_LABELS: Record<
  DataTypeAssignability,
  string
> = {
  none: "Mai",
  always: "Sempre",
  creationOnly: "Solo alla creazione",
  masterOnly: "Solo master",
};

export const DATA_CARDINALITY_LABELS: Record<DataCardinality, string> = {
  single: "Singola (una per PG)",
  multi: "Multipla (più per PG)",
};

export const DATA_TYPE_RENDER_LABELS: Record<DataTypeRender, string> = {
  catalog: "Lista semplice (default)",
  files: "Archivio documenti e media",
  pages: "Archivio pagine complesse",
};

export const DATA_TYPE_RENDER_ICONS: Record<DataTypeRender, string> = {
  catalog: "list_view",
  files: "insert_drive_file",
  pages: "article",
};
