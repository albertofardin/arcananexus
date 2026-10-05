import type { Font, Template } from "@pdfme/common";
import type { PrintSheet } from "@prisma/client";
import {
  buildInputs,
  computePlacements,
  type SheetSpacing,
  SHEET_SIZES,
  type PrintRow,
} from "@/lib/print/fields";

// Generazione PDF lato client (pdfme + pdf-lib), caricati on demand: sono
// pesanti e servono solo al click su "Scarica PDF".

const MM_TO_PT = 72 / 25.4;

export async function loadPlugins() {
  const { text, image, rectangle, ellipse, line, barcodes } =
    await import("@pdfme/schemas");
  return {
    Testo: text,
    Immagine: image,
    Rettangolo: rectangle,
    Ellisse: ellipse,
    Linea: line,
    QR: barcodes.qrcode,
  };
}

// Font del designer e del PDF: il Roboto regolare incluso in pdfme più le
// varianti grassetto/corsivo (OFL, `public/fonts/print/`) usate dalla barra
// "Stile testo" tramite `fontName` del campo.
export const FONTS = {
  regular: "Roboto",
  bold: "Roboto Bold",
  italic: "Roboto Italic",
  boldItalic: "Roboto Bold Italic",
} as const;

const FONT_FILES: Record<Exclude<keyof typeof FONTS, "regular">, string> = {
  bold: "/fonts/print/Roboto-Bold.ttf",
  italic: "/fonts/print/Roboto-Italic.ttf",
  boldItalic: "/fonts/print/Roboto-BoldItalic.ttf",
};

export function fontName(bold: boolean, italic: boolean): string {
  if (bold && italic) return FONTS.boldItalic;
  if (bold) return FONTS.bold;
  if (italic) return FONTS.italic;
  return FONTS.regular;
}

export function fontStyle(name: string | undefined) {
  return {
    bold: name === FONTS.bold || name === FONTS.boldItalic,
    italic: name === FONTS.italic || name === FONTS.boldItalic,
  };
}

let fontsPromise: Promise<Font> | null = null;

export function loadFonts(): Promise<Font> {
  fontsPromise ??= (async () => {
    const { getDefaultFont } = await import("@pdfme/common");
    const extra = await Promise.all(
      (Object.keys(FONT_FILES) as (keyof typeof FONT_FILES)[]).map(
        async key => {
          const res = await fetch(FONT_FILES[key]);
          if (!res.ok) throw new Error(`Font non trovato: ${FONT_FILES[key]}`);
          return [FONTS[key], { data: await res.arrayBuffer() }] as const;
        }
      )
    );
    return { ...getDefaultFont(), ...Object.fromEntries(extra) };
  })().catch(err => {
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

export async function renderPdf(
  template: Template,
  rows: PrintRow[],
  sheet: PrintSheet,
  spacing: SheetSpacing
): Promise<Uint8Array> {
  const [{ generate }, plugins, font] = await Promise.all([
    import("@pdfme/generator"),
    loadPlugins(),
    loadFonts(),
  ]);
  const pdf = await generate({
    template,
    inputs: buildInputs(template, rows),
    plugins,
    options: { font },
  });
  return sheet === "none"
    ? pdf
    : tileOnSheets(pdf, SHEET_SIZES[sheet], spacing);
}

// Affianca le pagine generate (una per scheda) su fogli A4/A3.
async function tileOnSheets(
  pdf: Uint8Array,
  [sheetW, sheetH]: [number, number],
  spacing: SheetSpacing
): Promise<Uint8Array> {
  const { PDFDocument } = await import("@pdfme/pdf-lib");
  const out = await PDFDocument.create();
  const src = await PDFDocument.load(pdf);
  const pages = await out.embedPdf(src, src.getPageIndices());
  const placements = computePlacements(
    pages.map(p => [p.width / MM_TO_PT, p.height / MM_TO_PT]),
    [sheetW, sheetH],
    spacing
  );

  const sheets: ReturnType<typeof out.addPage>[] = [];
  pages.forEach((page, i) => {
    const { sheet, x, y, scale } = placements[i];
    sheets[sheet] ??= out.addPage([sheetW * MM_TO_PT, sheetH * MM_TO_PT]);
    // pdf-lib ha l'origine in basso a sinistra.
    sheets[sheet].drawPage(page, {
      x: x * MM_TO_PT,
      y: (sheetH - y) * MM_TO_PT - page.height * scale,
      width: page.width * scale,
      height: page.height * scale,
    });
  });
  return out.save();
}

export function downloadPdf(pdf: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([pdf as BlobPart], { type: "application/pdf" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
