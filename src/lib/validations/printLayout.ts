import z from "zod";
import { PrintLayoutSource, PrintSheet } from "@prisma/client";
import { MAX_PRINT_ITEMS, MAX_SHEET_SPACING } from "@/lib/print/fields";

// Tetto alla dimensione del template serializzato: i loghi caricati nel
// designer pdfme finiscono in base64 dentro al JSON, quindi senza un limite
// un singolo layout potrebbe gonfiare la tabella senza controllo.
export const MAX_PRINT_TEMPLATE_CHARS = 4_000_000;

const fieldSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    position: z.object({ x: z.number(), y: z.number() }),
    width: z.number(),
    height: z.number(),
  })
  .loose();

// Solo pagine bianche (`basePdf` come oggetto in mm): un PDF di base
// arbitrario caricato dal client non serve e sarebbe solo peso in più.
export const printTemplateSchema = z
  .object({
    basePdf: z.object({
      width: z.number().min(10).max(1000),
      height: z.number().min(10).max(1000),
      padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
    schemas: z.array(z.array(fieldSchema)).min(1),
  })
  .loose()
  .refine(t => JSON.stringify(t).length <= MAX_PRINT_TEMPLATE_CHARS, {
    message: "Il layout è troppo pesante: riduci le immagini caricate",
  });

export type PrintTemplateBody = z.infer<typeof printTemplateSchema>;

const sheetSpacing = z.number().min(0).max(MAX_SHEET_SPACING);

export const createPrintLayoutSchema = z
  .object({
    source: z.enum(PrintLayoutSource),
    name: z.string().trim().min(1).max(120),
    template: printTemplateSchema,
    sheet: z.enum(PrintSheet),
    sheetGap: sheetSpacing.optional(),
    sheetMargin: sheetSpacing.optional(),
  })
  .strict();

export type CreatePrintLayoutBody = z.infer<typeof createPrintLayoutSchema>;

// `source` non è modificabile: il layout è disegnato sui
// campi di quella sorgente.
export const updatePrintLayoutSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    template: printTemplateSchema.optional(),
    sheet: z.enum(PrintSheet).optional(),
    sheetGap: sheetSpacing.optional(),
    sheetMargin: sheetSpacing.optional(),
  })
  .strict();

export type UpdatePrintLayoutBody = z.infer<typeof updatePrintLayoutSchema>;

export const printDataSchema = z
  .object({
    source: z.enum(["character", "reference"]),
    ids: z.array(z.number().int().positive()).min(1).max(MAX_PRINT_ITEMS),
  })
  .strict();

export type PrintDataBody = z.infer<typeof printDataSchema>;
