import type { PrintLayout } from "@prisma/client";

export type PrintLayoutDto = Pick<
  PrintLayout,
  "id" | "source" | "name" | "template" | "sheet" | "sheetGap" | "sheetMargin"
>;

export type PrintItem = { id: number; label: string; subtitle?: string };
