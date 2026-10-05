export interface IRichTextColor {
  label: string;
  /** null = nessun colore forzato: eredita var(--fg), quindi segue il tema chiaro/scuro */
  value: string | null;
}

// Menu a tendina disposto su griglia da 4 colori per riga (vedi grid-cols-4 in
// FieldRichText.tsx: 8 voci = 2 righe complete, nessuno spazio vuoto). Tonalità
// distanziate lungo la ruota cromatica per restare distinguibili tra loro.
export const RICH_TEXT_COLORS: IRichTextColor[] = [
  { label: "Predefinito", value: null },
  { label: "Rosso", value: "#dc2626" },
  { label: "Ambra", value: "#eab308" },
  { label: "Turchese", value: "#0d9488" },
  { label: "Blu", value: "#2563eb" },
  { label: "Viola", value: "#9333ea" },
  { label: "Rosa", value: "#f472b6" },
  { label: "Grigio", value: "#9ca3af" },
];
