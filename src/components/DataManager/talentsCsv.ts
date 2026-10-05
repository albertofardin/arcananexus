import { DataVisibility, RequirementType } from "@prisma/client";
import type { ContentEntry } from "./types";
import { DATA_VISIBILITY_LABELS } from "@/lib/labels";

export interface TalentFlagsShape {
  category: string;
  cost: number;
  repeatable: boolean;
  maxRepetitions: number | undefined;
  creationOnly: boolean;
  isDowntimeUsable: boolean;
  isMissivePointBonus: boolean;
  isDowntimePointBonus: boolean;
}

export function readTalentFlags(flags: unknown): TalentFlagsShape {
  const f = (flags && typeof flags === "object" ? flags : {}) as Record<
    string,
    unknown
  >;
  return {
    category: typeof f.category === "string" ? f.category : "",
    cost: typeof f.cost === "number" ? f.cost : 0,
    repeatable: !!f.repeatable,
    maxRepetitions:
      typeof f.maxRepetitions === "number" ? f.maxRepetitions : undefined,
    creationOnly: !!f.creationOnly,
    isDowntimeUsable: !!f.isDowntimeUsable,
    isMissivePointBonus: !!f.isMissivePointBonus,
    isDowntimePointBonus: !!f.isDowntimePointBonus,
  };
}

// Voce del catalogo dell'intera campagna (non solo i Talenti): un requisito
// può puntare a qualunque categoria (RulesSection, `ModalEditDataCatalog`),
// quindi la risoluzione nome → id in import deve poter cercare fuori dal
// `DataType` corrente.
export interface CatalogEntryRef {
  id: number;
  name: string;
}

// Arco del grafo requisiti così come restituito da
// `listRequirementsForCampaign` (con `id`, necessario per poterlo rimuovere
// via DELETE in fase di apply — a differenza di `TalentRequirementEdge`,
// usato solo per la visualizzazione dei badge, che non lo porta).
export interface RequirementEdgeRef {
  id: number;
  definitionId: number;
  requiredDefinitionId: number;
  type: RequirementType;
  groupId: number | null;
}

export const CSV_HEADERS = [
  "Nome",
  "Descrizione",
  "Listato",
  "Costo",
  "Ripetibile",
  "Max ripetizioni",
  "Solo in creazione",
  "Usabile come downtime",
  "Bonus missiva",
  "Bonus downtime",
  "Visibilità",
  "Regola: Richiede",
  "Regola: Blocca",
  "Regola: Visibile con",
  "Regola: Aggiunge",
];

// Facoltative in import: se assenti, gli archi esistenti di quel tipo restano
// intatti (vedi `ParsedTalentRow.visibleWith`/`grants`).
export const CSV_OPTIONAL_HEADERS = new Set([
  "Regola: Richiede",
  "Regola: Blocca",
  "Regola: Visibile con",
  "Regola: Aggiunge",
]);

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Una voce per riga, separate da "; ": il nome della voce richiesta, con
// "(gruppo N)" in coda solo per gli archi che fanno parte di un gruppo OR
// (`DataRequirement.groupId`, solo `requires`/`visibleWith` — vedi
// `RulesSection`). `blocks`/`grants` non hanno mai gruppo (il backend lo
// rifiuta a monte).
function formatRequirementCell(
  edges: RequirementEdgeRef[],
  definitionId: number,
  type: RequirementType,
  nameById: Map<number, string>
): string {
  return edges
    .filter(edge => edge.definitionId === definitionId && edge.type === type)
    .map(edge => {
      const name = nameById.get(edge.requiredDefinitionId);
      if (!name) return null;
      return edge.groupId != null ? `${name} (gruppo ${edge.groupId})` : name;
    })
    .filter((v): v is string => v !== null)
    .join("; ");
}

export function buildTalentsCsv(
  entries: ContentEntry[],
  requirementEdges: RequirementEdgeRef[] = [],
  catalogEntries: CatalogEntryRef[] = []
): string {
  const nameById = new Map(catalogEntries.map(e => [e.id, e.name]));
  const rows = entries.map(entry => {
    const flags = readTalentFlags(entry.flags);
    return [
      entry.name,
      entry.description ?? "",
      flags.category,
      String(flags.cost),
      flags.repeatable ? "true" : "false",
      flags.maxRepetitions === undefined ? "" : String(flags.maxRepetitions),
      flags.creationOnly ? "true" : "false",
      flags.isDowntimeUsable ? "true" : "false",
      flags.isMissivePointBonus ? "true" : "false",
      flags.isDowntimePointBonus ? "true" : "false",
      DATA_VISIBILITY_LABELS[entry.visibility],
      formatRequirementCell(requirementEdges, entry.id, "requires", nameById),
      formatRequirementCell(requirementEdges, entry.id, "blocks", nameById),
      formatRequirementCell(
        requirementEdges,
        entry.id,
        "visibleWith",
        nameById
      ),
      formatRequirementCell(requirementEdges, entry.id, "grants", nameById),
    ];
  });
  return [CSV_HEADERS, ...rows]
    .map(row => row.map(csvEscape).join(","))
    .join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  // BOM (`﻿`) davanti al contenuto: senza, Excel apre il CSV UTF-8
  // interpretandolo come Latin-1 e storpia gli accenti ("Visibilità").
  const blob = new Blob(["﻿" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Parser CSV minimale (RFC4180: campi tra virgolette per contenere
// virgola/newline, virgolette interne raddoppiate) — niente dipendenza
// esterna per un formato a colonne fisse come questo.
export function parseCsv(text: string): string[][] {
  // Delimitatore dedotto dall'intestazione: Excel/Numbers in locale italiano
  // esportano con ";", l'export dell'app usa ",".
  const header = text.split("\n", 1)[0];
  const delimiter =
    header.split(";").length > header.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      endField();
    } else if (c === "\n") {
      endRow();
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows.filter(r => r.some(cell => cell.trim() !== ""));
}

export interface ParsedRequirementRef {
  name: string;
  groupId: number | null;
}

export interface ParsedTalentRow {
  name: string;
  description: string;
  category: string;
  cost: number;
  repeatable: boolean;
  maxRepetitions: number | undefined;
  creationOnly: boolean;
  isDowntimeUsable: boolean;
  isMissivePointBonus: boolean;
  isDowntimePointBonus: boolean;
  visibility: DataVisibility;
  // Colonne "Regola: …": `undefined` = colonna assente nel CSV, gli archi
  // esistenti di quel tipo restano intatti in import, invece di essere
  // rimossi come farebbe una colonna presente ma vuota.
  requires?: ParsedRequirementRef[];
  blocks?: ParsedRequirementRef[];
  visibleWith?: ParsedRequirementRef[];
  grants?: ParsedRequirementRef[];
}

const HEADER_KEY_BY_LABEL: Record<string, keyof ParsedTalentRow | undefined> = {
  nome: "name",
  descrizione: "description",
  listato: "category",
  categoria: "category",
  costo: "cost",
  ripetibile: "repeatable",
  "max ripetizioni": "maxRepetitions",
  "solo in creazione": "creationOnly",
  "usabile come downtime": "isDowntimeUsable",
  "bonus missiva": "isMissivePointBonus",
  "bonus downtime": "isDowntimePointBonus",
  visibilità: "visibility",
  visibilita: "visibility",
  richiede: "requires",
  blocca: "blocks",
  "visibile con": "visibleWith",
  aggiunge: "grants",
};

function parseBoolean(value: string): boolean {
  return ["true", "1", "sì", "si", "x"].includes(value.trim().toLowerCase());
}

function parseVisibility(value: string): DataVisibility | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "visible" || normalized === "visibile")
    return DataVisibility.visible;
  if (
    normalized === "hidden" ||
    normalized === "nascosta" ||
    normalized === "nascosto"
  )
    return DataVisibility.hidden;
  return null;
}

// "Nome1; Nome2 (gruppo 3)" → [{name:"Nome1",groupId:null}, {name:"Nome2",groupId:3}]
function parseRequirementCell(value: string): ParsedRequirementRef[] {
  if (!value.trim()) return [];
  return value
    .split(";")
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      const match = token.match(/^(.*?)\s*\(gruppo\s+(\d+)\)$/i);
      return match
        ? { name: match[1].trim(), groupId: Number(match[2]) }
        : { name: token, groupId: null };
    });
}

export interface TalentCsvParseResult {
  rows: ParsedTalentRow[];
  errors: string[];
}

export function parseTalentsCsv(text: string): TalentCsvParseResult {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: ["Il file è vuoto"] };

  const [headerRow, ...dataRows] = table;
  // Prefisso "Regola:" facoltativo: i CSV esportati prima che venisse
  // introdotto usano "Richiede", "Blocca", … senza prefisso.
  const columns = headerRow.map(
    h =>
      HEADER_KEY_BY_LABEL[
        h
          .trim()
          .toLowerCase()
          .replace(/^regol[ae]:\s*/, "")
      ] ?? null
  );
  if (!columns.includes("name")) {
    return {
      rows: [],
      errors: ['Colonna "Nome" mancante nell\'intestazione del CSV'],
    };
  }

  const rows: ParsedTalentRow[] = [];
  const errors: string[] = [];

  dataRows.forEach((cells, index) => {
    const lineNumber = index + 2; // riga 1 = intestazione, righe dati 1-based
    const draft: Partial<ParsedTalentRow> = {};

    columns.forEach((key, colIndex) => {
      if (!key) return;
      const raw = cells[colIndex] ?? "";
      switch (key) {
        case "name":
          draft.name = raw.trim();
          break;
        case "description":
          draft.description = raw.trim();
          break;
        case "category":
          draft.category = raw.trim();
          break;
        case "cost": {
          const trimmed = raw.trim();
          const num = trimmed === "" ? 0 : Number(trimmed);
          draft.cost = Number.isFinite(num)
            ? Math.max(0, Math.round(num))
            : NaN;
          break;
        }
        case "repeatable":
          draft.repeatable = parseBoolean(raw);
          break;
        case "maxRepetitions": {
          const trimmed = raw.trim();
          if (trimmed === "") {
            draft.maxRepetitions = undefined;
          } else {
            const num = Number(trimmed);
            draft.maxRepetitions = Number.isFinite(num) ? Math.round(num) : NaN;
          }
          break;
        }
        case "creationOnly":
          draft.creationOnly = parseBoolean(raw);
          break;
        case "isDowntimeUsable":
          draft.isDowntimeUsable = parseBoolean(raw);
          break;
        case "isMissivePointBonus":
          draft.isMissivePointBonus = parseBoolean(raw);
          break;
        case "isDowntimePointBonus":
          draft.isDowntimePointBonus = parseBoolean(raw);
          break;
        case "visibility": {
          const parsed = parseVisibility(raw);
          if (raw.trim() !== "" && parsed === null) {
            errors.push(
              `Riga ${lineNumber}: visibilità "${raw}" non riconosciuta`
            );
          }
          draft.visibility = parsed ?? DataVisibility.visible;
          break;
        }
        case "requires":
          draft.requires = parseRequirementCell(raw);
          break;
        case "blocks":
          // Niente gruppi OR sui blocks (il backend li rifiuta): un eventuale
          // "(gruppo N)" scritto a mano nella colonna "Blocca" viene ignorato.
          draft.blocks = parseRequirementCell(raw).map(r => ({
            name: r.name,
            groupId: null,
          }));
          break;
        case "visibleWith":
          draft.visibleWith = parseRequirementCell(raw);
          break;
        case "grants":
          // Come i blocks: nessun gruppo OR (il backend lo rifiuta).
          draft.grants = parseRequirementCell(raw).map(r => ({
            name: r.name,
            groupId: null,
          }));
          break;
      }
    });

    if (!draft.name) {
      errors.push(`Riga ${lineNumber}: nome mancante, riga ignorata`);
      return;
    }
    if (Number.isNaN(draft.cost)) {
      errors.push(`Riga ${lineNumber}: costo non numerico, impostato a 0`);
      draft.cost = 0;
    }
    if (Number.isNaN(draft.maxRepetitions)) {
      errors.push(`Riga ${lineNumber}: max ripetizioni non numerico, ignorato`);
      draft.maxRepetitions = undefined;
    } else if (draft.maxRepetitions !== undefined && draft.maxRepetitions < 2) {
      errors.push(
        `Riga ${lineNumber}: max ripetizioni deve essere almeno 2, impostato a 2`
      );
      draft.maxRepetitions = 2;
    }

    rows.push({
      name: draft.name,
      description: draft.description ?? "",
      category: draft.category ?? "",
      cost: draft.cost ?? 0,
      repeatable: draft.repeatable ?? false,
      maxRepetitions: draft.maxRepetitions,
      creationOnly: draft.creationOnly ?? false,
      isDowntimeUsable: draft.isDowntimeUsable ?? false,
      isMissivePointBonus: draft.isMissivePointBonus ?? false,
      isDowntimePointBonus: draft.isDowntimePointBonus ?? false,
      visibility: draft.visibility ?? DataVisibility.visible,
      requires: draft.requires,
      blocks: draft.blocks,
      visibleWith: draft.visibleWith,
      grants: draft.grants,
    });
  });

  return { rows, errors };
}

export interface TalentFieldChange {
  label: string;
  from: string;
  to: string;
}

export interface ResolvedRequirement {
  // `null` = la voce richiesta non è ancora nel catalogo perché viene creata
  // da un'altra riga dello stesso CSV: l'id va risolto in fase di apply,
  // dopo che quella riga è stata creata (vedi `ButtonImportTalentsCsv`).
  requiredDefinitionId: number | null;
  requiredName: string;
  type: RequirementType;
  groupId: number | null;
}

export interface RequirementRemoval {
  id: number;
  requiredName: string;
  type: RequirementType;
  groupId: number | null;
}

export interface RequirementChangeSet {
  toAdd: ResolvedRequirement[];
  toRemove: RequirementRemoval[];
}

export interface TalentCsvDiff {
  toCreate: {
    row: ParsedTalentRow;
    requirementsToAdd: ResolvedRequirement[];
  }[];
  toUpdate: {
    row: ParsedTalentRow;
    existing: ContentEntry;
    changes: TalentFieldChange[];
    requirementChanges: RequirementChangeSet;
  }[];
  errors: string[];
}

const boolLabel = (value: boolean) => (value ? "Sì" : "No");

// Elenco dei campi effettivamente diversi tra la riga CSV e la voce esistente
// (per il pannello "cosa cambia" della preview import): array vuoto = riga
// identica alla voce già a DB, nessun aggiornamento da fare.
function describeTalentChanges(
  row: ParsedTalentRow,
  entry: ContentEntry
): TalentFieldChange[] {
  const flags = readTalentFlags(entry.flags);
  const changes: TalentFieldChange[] = [];

  if ((entry.description ?? "") !== row.description) {
    changes.push({
      label: "Descrizione",
      from: entry.description ?? "",
      to: row.description,
    });
  }
  if (flags.category !== row.category) {
    changes.push({ label: "Listato", from: flags.category, to: row.category });
  }
  if (flags.cost !== row.cost) {
    changes.push({
      label: "Costo",
      from: String(flags.cost),
      to: String(row.cost),
    });
  }
  if (flags.repeatable !== row.repeatable) {
    changes.push({
      label: "Ripetibile",
      from: boolLabel(flags.repeatable),
      to: boolLabel(row.repeatable),
    });
  }
  if ((flags.maxRepetitions ?? null) !== (row.maxRepetitions ?? null)) {
    changes.push({
      label: "Max ripetizioni",
      from:
        flags.maxRepetitions === undefined ? "" : String(flags.maxRepetitions),
      to: row.maxRepetitions === undefined ? "" : String(row.maxRepetitions),
    });
  }
  if (flags.creationOnly !== row.creationOnly) {
    changes.push({
      label: "Solo in creazione",
      from: boolLabel(flags.creationOnly),
      to: boolLabel(row.creationOnly),
    });
  }
  if (flags.isDowntimeUsable !== row.isDowntimeUsable) {
    changes.push({
      label: "Usabile come downtime",
      from: boolLabel(flags.isDowntimeUsable),
      to: boolLabel(row.isDowntimeUsable),
    });
  }
  if (flags.isMissivePointBonus !== row.isMissivePointBonus) {
    changes.push({
      label: "Bonus missiva",
      from: boolLabel(flags.isMissivePointBonus),
      to: boolLabel(row.isMissivePointBonus),
    });
  }
  if (flags.isDowntimePointBonus !== row.isDowntimePointBonus) {
    changes.push({
      label: "Bonus downtime",
      from: boolLabel(flags.isDowntimePointBonus),
      to: boolLabel(row.isDowntimePointBonus),
    });
  }
  if (entry.visibility !== row.visibility) {
    changes.push({
      label: "Visibilità",
      from: DATA_VISIBILITY_LABELS[entry.visibility],
      to: DATA_VISIBILITY_LABELS[row.visibility],
    });
  }

  return changes;
}

// Risolve i nomi scritti in "Richiede"/"Blocca"/"Visibile con"/"Aggiunge"
// contro il catalogo
// dell'intera campagna (un requisito può attraversare categorie, stessa
// regola di `RulesSection`). Un nome non trovato nel catalogo ma presente
// tra le righe dello stesso CSV (`pendingNames`) è comunque risolto, con
// `requiredDefinitionId: null`: verrà creato da un'altra riga di questo
// stesso import, il suo id reale si scopre solo in fase di apply. Un nome
// non trovato in nessuno dei due o auto-referenziato finisce in `errors` ed
// è escluso dal risultato, invece di bloccare l'intera importazione.
function resolveRowRequirements(
  row: ParsedTalentRow,
  catalogByName: Map<string, number>,
  pendingNames: Set<string>,
  errors: string[]
): ResolvedRequirement[] {
  const wanted: { ref: ParsedRequirementRef; type: RequirementType }[] = [
    ...(row.requires ?? []).map(ref => ({
      ref,
      type: RequirementType.requires,
    })),
    ...(row.blocks ?? []).map(ref => ({ ref, type: RequirementType.blocks })),
    ...(row.visibleWith ?? []).map(ref => ({
      ref,
      type: RequirementType.visibleWith,
    })),
    ...(row.grants ?? []).map(ref => ({ ref, type: RequirementType.grants })),
  ];

  const resolved: ResolvedRequirement[] = [];
  for (const { ref, type } of wanted) {
    if (ref.name.toLowerCase() === row.name.toLowerCase()) {
      errors.push(`${row.name}: non può riferirsi a se stessa ("${ref.name}")`);
      continue;
    }
    const requiredDefinitionId = catalogByName.get(ref.name.toLowerCase());
    if (requiredDefinitionId === undefined) {
      if (pendingNames.has(ref.name.toLowerCase())) {
        resolved.push({
          requiredDefinitionId: null,
          requiredName: ref.name,
          type,
          groupId: ref.groupId,
        });
        continue;
      }
      errors.push(
        `${row.name}: voce "${ref.name}" non trovata nel catalogo della campagna`
      );
      continue;
    }
    resolved.push({
      requiredDefinitionId,
      requiredName: ref.name,
      type,
      groupId: ref.groupId,
    });
  }
  return resolved;
}

// Confronta i requisiti desiderati (dal CSV) con gli archi in uscita già
// esistenti per la voce: abbinamento per (requiredDefinitionId, type) — il
// `groupId` non fa parte dell'unicità a schema (`@@unique([definitionId,
// requiredDefinitionId, type])`), quindi cambiarlo richiede comunque
// rimuovere e ricreare l'arco (nessuna PATCH sui requisiti).
function diffRequirementEdges(
  desired: ResolvedRequirement[],
  existingEdges: RequirementEdgeRef[],
  nameById: Map<number, string>
): RequirementChangeSet {
  const toAdd: ResolvedRequirement[] = [];
  const toRemove: RequirementRemoval[] = [];
  const key = (requiredDefinitionId: number, type: string) =>
    `${requiredDefinitionId}:${type}`;

  const existingByKey = new Map(
    existingEdges.map(edge => [key(edge.requiredDefinitionId, edge.type), edge])
  );
  const desiredKeys = new Set(
    desired.map(d => key(d.requiredDefinitionId, d.type))
  );

  for (const d of desired) {
    const existingEdge = existingByKey.get(key(d.requiredDefinitionId, d.type));
    if (!existingEdge) {
      toAdd.push(d);
    } else if ((existingEdge.groupId ?? null) !== (d.groupId ?? null)) {
      toRemove.push({
        id: existingEdge.id,
        requiredName: d.requiredName,
        type: d.type,
        groupId: existingEdge.groupId ?? null,
      });
      toAdd.push(d);
    }
  }
  for (const edge of existingEdges) {
    if (!desiredKeys.has(key(edge.requiredDefinitionId, edge.type))) {
      toRemove.push({
        id: edge.id,
        requiredName: nameById.get(edge.requiredDefinitionId) ?? "?",
        type: edge.type,
        groupId: edge.groupId ?? null,
      });
    }
  }

  return { toAdd, toRemove };
}

// Abbinamento riga CSV ↔ voce esistente per nome (case-insensitive), stessa
// regola di unicità già applicata dal backend (`getReferenceDataByName`).
// Le righe già identiche alla voce esistente (campi e requisiti) non
// finiscono in `toUpdate`: non c'è nulla da mostrare/confermare per
// un'importazione che non cambia nulla.
export function diffTalentsCsv(
  rows: ParsedTalentRow[],
  entries: ContentEntry[],
  catalogEntries: CatalogEntryRef[] = [],
  requirementEdges: RequirementEdgeRef[] = []
): TalentCsvDiff {
  const byName = new Map(
    entries.map(entry => [entry.name.trim().toLowerCase(), entry])
  );
  const catalogByName = new Map(
    catalogEntries.map(entry => [entry.name.trim().toLowerCase(), entry.id])
  );
  const nameById = new Map(catalogEntries.map(entry => [entry.id, entry.name]));
  // Righe dello stesso CSV: un requisito che punta a una di queste non va
  // segnalato come "non trovato" solo perché non è (ancora) nel catalogo.
  const pendingNames = new Set(rows.map(row => row.name.trim().toLowerCase()));
  const errors: string[] = [];

  const toCreate: TalentCsvDiff["toCreate"] = [];
  const toUpdate: TalentCsvDiff["toUpdate"] = [];

  for (const row of rows) {
    const requirementsToAdd = resolveRowRequirements(
      row,
      catalogByName,
      pendingNames,
      errors
    );
    const existing = byName.get(row.name.toLowerCase());
    if (!existing) {
      toCreate.push({ row, requirementsToAdd });
      continue;
    }
    const changes = describeTalentChanges(row, existing);
    // Solo i tipi di cui il CSV porta la colonna: una colonna "Regola: …"
    // assente dal file non va interpretata come "rimuovi tutto".
    const managedTypes = new Set<RequirementType>();
    if (row.requires !== undefined) managedTypes.add("requires");
    if (row.blocks !== undefined) managedTypes.add("blocks");
    if (row.visibleWith !== undefined) managedTypes.add("visibleWith");
    if (row.grants !== undefined) managedTypes.add("grants");
    const existingEdges = requirementEdges.filter(
      edge => edge.definitionId === existing.id && managedTypes.has(edge.type)
    );
    const requirementChanges = diffRequirementEdges(
      requirementsToAdd,
      existingEdges,
      nameById
    );
    if (
      changes.length > 0 ||
      requirementChanges.toAdd.length > 0 ||
      requirementChanges.toRemove.length > 0
    ) {
      toUpdate.push({ row, existing, changes, requirementChanges });
    }
  }

  return { toCreate, toUpdate, errors };
}
