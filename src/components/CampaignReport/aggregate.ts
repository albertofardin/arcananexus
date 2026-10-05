import type { ReportCharacterRow } from "./types";
import {
  getCharacterStatus,
  type CharacterStatus,
} from "@/components/BadgeCharacterStatus";
import { CHARACTER_STATUS } from "@/lib/constants";

export interface CountEntry {
  id: string;
  label: string;
  count: number;
}

export interface DiscoveredCategory {
  dataTypeId: number;
  name: string;
}

// Ordine di visualizzazione della card "Giocatori" — non l'ordine di
// `CHARACTER_STATUSES` (dead/parked/approved/review, pensato per la
// priorità di sort altrove): qui si segue l'ordine del filtro stato
// (`FilterCharacterStatus`), più naturale da leggere in una tabella.
const STATUS_DISPLAY_ORDER: CharacterStatus[] = [
  "approved",
  "review",
  "parked",
  "dead",
];

const UNASSIGNED_LABEL = "Non assegnato";

// Le categorie "a torta" sono scoperte dai dati realmente assegnati (righe
// già filtrate a monte a origins/assignable + cardinality single, vedi
// `page.tsx`) — non dall'elenco `DataType` della campagna, che il report
// non fetcha: un tipo di dato configurato ma senza alcuna assegnazione non
// genera una card.
export function discoverCategories(
  rows: ReportCharacterRow[]
): DiscoveredCategory[] {
  const byId = new Map<number, string>();
  for (const row of rows) {
    for (const entry of row.data) {
      if (!byId.has(entry.dataTypeId)) {
        byId.set(entry.dataTypeId, entry.dataTypeName);
      }
    }
  }
  return [...byId.entries()]
    .map(([dataTypeId, name]) => ({ dataTypeId, name }))
    .sort((a, b) => a.dataTypeId - b.dataTypeId);
}

// Conteggio per una categoria: un personaggio senza assegnazione per quel
// `DataType` finisce nel bucket "Non assegnato" (mostrato solo se non
// vuoto) invece di sparire silenziosamente dal totale della card.
export function countByCategory(
  rows: ReportCharacterRow[],
  dataTypeId: number
): CountEntry[] {
  const counts = new Map<string, number>();
  let unassigned = 0;

  for (const row of rows) {
    const value = row.data.find(entry => entry.dataTypeId === dataTypeId);
    if (!value) {
      unassigned += 1;
      continue;
    }
    counts.set(
      value.referenceDataName,
      (counts.get(value.referenceDataName) ?? 0) + 1
    );
  }

  const entries: CountEntry[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ id: label, label, count }));

  if (unassigned > 0) {
    entries.push({
      id: "__unassigned",
      label: UNASSIGNED_LABEL,
      count: unassigned,
    });
  }

  return entries;
}

// Card "Giocatori": distribuzione sui 4 stati derivati (`getCharacterStatus`),
// sempre tutti e 4 anche a conteggio zero — il chiamante deve passare righe
// filtrate solo per Tipo (mai per Stato, altrimenti il totale coinciderebbe
// con le altre card, vanificando lo scopo della card).
export function countByStatus(rows: ReportCharacterRow[]): CountEntry[] {
  const counts: Record<CharacterStatus, number> = {
    approved: 0,
    review: 0,
    parked: 0,
    dead: 0,
  };

  for (const row of rows) {
    const status = getCharacterStatus({
      approvalDate: row.approvalDate ? new Date(row.approvalDate) : null,
      parkDate: row.parkDate ? new Date(row.parkDate) : null,
      deathDate: row.deathDate ? new Date(row.deathDate) : null,
    });
    counts[status] += 1;
  }

  return STATUS_DISPLAY_ORDER.map(status => ({
    id: status,
    label: CHARACTER_STATUS[status].label,
    count: counts[status],
  }));
}

// Talenti: a differenza delle categorie sopra un personaggio può averne più
// di uno (cardinalità multi), quindi niente card a torta. L'elenco dei nomi
// non si scopre dai dati assegnati (a differenza di `discoverCategories`) ma
// viene dal catalogo di campagna (`listTalentCatalogForCampaign`, passato da
// `page.tsx`): un talento definito ma non ancora assegnato a nessuno deve
// restare cercabile con conteggio 0, non sparire dalla checklist. Qui resta
// solo il conteggio, sempre su `rows` filtrate Tipo+Stato.
export function countTalents(rows: ReportCharacterRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    // Set: un talento ripetibile compare più volte in `row.talents`, ma il
    // conteggio è in personaggi, non in acquisizioni.
    for (const talent of new Set(row.talents)) {
      counts.set(talent, (counts.get(talent) ?? 0) + 1);
    }
  }
  return counts;
}

// Personaggi (già filtrati Tipo+Stato dal chiamante) che hanno il talento:
// alimenta sia la modale sia la colonna "Personaggi" dell'export CSV.
export function charactersWithTalent(
  rows: ReportCharacterRow[],
  talentName: string
): ReportCharacterRow[] {
  return rows.filter(row => row.talents.includes(talentName));
}
