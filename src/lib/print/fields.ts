import type { PrintLayoutSource, PrintSheet } from "@prisma/client";

// Catalogo dei campi stampabili dell'Area Stampa. Il nome di un campo nel
// template pdfme è la chiave con cui viene riempito: se coincide con una di
// queste chiavi (eventualmente con suffisso " (2)", " (3)"… per usare lo
// stesso dato più volte) prende il valore del personaggio/voce, altrimenti
// stampa il contenuto fisso impostato nel designer.

// Id per singola richiesta a `print-data` (la route converte le immagini lato
// server): il client manda selezioni più grandi a blocchi.
export const MAX_PRINT_ITEMS = 200;

export type PrintFieldKind = "text" | "image";
export type PrintField = { key: string; kind: PrintFieldKind };
export type PrintRow = Record<string, string>;

export const CHARACTER_FIELDS: PrintField[] = [
  { key: "Nome", kind: "text" },
  { key: "Giocatore", kind: "text" },
  { key: "Tipo", kind: "text" },
  { key: "Avatar", kind: "image" },
  { key: "Background", kind: "text" },
  { key: "Note pubbliche", kind: "text" },
];

export const REFERENCE_FIELDS: PrintField[] = [
  { key: "Nome", kind: "text" },
  { key: "Descrizione", kind: "text" },
  { key: "Tipo di dato", kind: "text" },
  { key: "Immagine", kind: "image" },
];

// Per i personaggi, ogni `DataType` della campagna diventa un campo con i
// nomi delle voci assegnate (es. "Razza" → "Elfo", "Talenti" → "A, B").
export function characterFields(dataTypeNames: string[]): PrintField[] {
  const fixed = new Set(CHARACTER_FIELDS.map(f => f.key));
  return [
    ...CHARACTER_FIELDS,
    ...dataTypeNames
      .filter(name => !fixed.has(name))
      .map(key => ({ key, kind: "text" as const })),
  ];
}

export function fieldsForSource(
  source: PrintLayoutSource,
  dataTypeNames: string[]
): PrintField[] {
  if (source === "character") return characterFields(dataTypeNames);
  if (source === "reference") return REFERENCE_FIELDS;
  return [];
}

// Testo semplice da HTML dell'editor rich text (o da testo già semplice).
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type TemplateField = { name: string; content?: string; readOnly?: boolean };
type TemplateLike = { schemas: TemplateField[][] };

// Input pdfme per ogni riga: campo del catalogo → valore della riga; campo
// libero → il suo contenuto fisso (il generatore pdfme stamperebbe vuoto
// un campo non `readOnly` senza input). Anche l'intera riga finisce negli
// input: pdfme li usa come variabili dei testi fissi (non "Modificabili"),
// così un testo fisso `**{Nome}**` stampa il nome in grassetto.
export function buildInputs(template: TemplateLike, rows: PrintRow[]) {
  const fields = template.schemas.flat().filter(f => !f.readOnly);
  return rows.map(row => ({
    ...row,
    ...Object.fromEntries(
      fields.map(f => [
        f.name,
        row[f.name] ?? row[f.name.replace(/ \(\d+\)$/, "")] ?? f.content ?? "",
      ])
    ),
  }));
}

export function uniqueFieldName(key: string, taken: string[]): string {
  if (!taken.includes(key)) return key;
  let n = 2;
  while (taken.includes(`${key} (${n})`)) n++;
  return `${key} (${n})`;
}

// Fogli in mm. `none` = una scheda per pagina, alla sua dimensione.
export const SHEET_SIZES: Record<
  Exclude<PrintSheet, "none">,
  [number, number]
> = {
  a4_portrait: [210, 297],
  a4_landscape: [297, 210],
  a3_portrait: [297, 420],
  a3_landscape: [420, 297],
};

export const SHEET_LABELS: Record<PrintSheet, string> = {
  none: "Una scheda per pagina",
  a4_portrait: "A4 verticale",
  a4_landscape: "A4 orizzontale",
  a3_portrait: "A3 verticale",
  a3_landscape: "A3 orizzontale",
};

// Default di margine e spaziatura (mm), anche a schema: con 5 + 3 mm 9 carte
// da gioco (63×88) stanno su un A4 verticale.
export const DEFAULT_SHEET_MARGIN = 5;
export const DEFAULT_SHEET_GAP = 3;
export const MAX_SHEET_SPACING = 50;

export type SheetSpacing = { margin: number; gap: number };

export type Placement = { sheet: number; x: number; y: number; scale: number };

// Affianca le schede (anche di dimensioni diverse) sul foglio, riga per
// riga dall'alto a sinistra, a `gap` mm l'una dall'altra e a `margin` mm dal
// bordo; una scheda più grande dell'area utile viene rimpicciolita per
// starci. Coordinate in mm con origine in alto a sinistra.
export function computePlacements(
  sizes: [number, number][],
  [sheetW, sheetH]: [number, number],
  { margin, gap }: SheetSpacing = {
    margin: DEFAULT_SHEET_MARGIN,
    gap: DEFAULT_SHEET_GAP,
  }
): Placement[] {
  const maxW = Math.max(1, sheetW - margin * 2);
  const maxH = Math.max(1, sheetH - margin * 2);
  const out: Placement[] = [];
  let sheet = 0;
  let x = margin;
  let y = margin;
  let rowH = 0;

  for (const [rawW, rawH] of sizes) {
    const scale = Math.min(1, maxW / rawW, maxH / rawH);
    const w = rawW * scale;
    const h = rawH * scale;
    if (x > margin && x + w > sheetW - margin + 0.01) {
      x = margin;
      y += rowH + gap;
      rowH = 0;
    }
    if (y > margin && y + h > sheetH - margin + 0.01) {
      sheet++;
      x = margin;
      y = margin;
      rowH = 0;
    }
    out.push({ sheet, x, y, scale });
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  return out;
}
