import type { CharacterType } from "@prisma/client";

// Valore assegnato a un personaggio per una categoria "a torta" (un
// `DataType` con `kind` in origins/assignable e `cardinality: single`,
// scoperto dinamicamente — vedi `page.tsx`).
export interface ReportCharacterCategoryValue {
  dataTypeId: number;
  dataTypeName: string;
  referenceDataName: string;
}

// Riga serializzabile passata dal server component al client component
// (date convertite in stringa ISO, come `characterEditor.service.ts`: un
// `Date` non attraversa il confine RSC nel formato atteso dai consumer).
export interface ReportCharacterRow {
  id: number;
  name: string;
  type: CharacterType;
  userName: string;
  avatar: string | null;
  lastUpdateDate: string;
  approvalDate: string | null;
  parkDate: string | null;
  deathDate: string | null;
  data: ReportCharacterCategoryValue[];
  /** Nomi dei talenti acquisiti (`DataType.kind === "talent"`, cardinalità
   * multi: un personaggio può averne più di uno, per questo sono tenuti
   * separati da `data` invece che infilati lì, dove la UI a torta assume
   * al più un valore per categoria per personaggio). */
  talents: string[];
}
