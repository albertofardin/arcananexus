"use client";

import * as React from "react";
import { Pie, PieChart, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { CountEntry } from "./aggregate";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Divider from "@/components/_core/Divider";
import BtnCheckbox from "@/components/_core/BtnCheckbox";

// Palette ciclica per le categorie dinamiche (Razza/Fazione/Divinità/...):
// non hanno un colore proprio come `CHARACTER_STATUS`/`CHARACTER_TYPE`
// (sono `DataType` configurabili per campagna), quindi si assegna un
// colore per indice.
const PALETTE = [
  "#2563EB",
  "#D97706",
  "#16A34A",
  "#DB2777",
  "#7C3AED",
  "#0D9488",
  "#DC2626",
  "#65A30D",
];
const UNASSIGNED_COLOR = "#939393";

export interface IReportCategoryCard {
  title: string;
  entries: CountEntry[];
  total: number;
  /** Colore fisso per id (es. gli stati derivati); altrimenti si usa la palette per indice. */
  colorForId?: (id: string) => string | undefined;
  /** Se la categoria è inclusa nell'export CSV: la selezione vive qui sulla
   * card (stessa UX del tab Talenti), non più in un modale a parte. */
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}

const ReportCategoryCard = ({
  title,
  entries,
  total,
  colorForId,
  selected,
  onSelectedChange,
}: IReportCategoryCard) => {
  const colored = React.useMemo(
    () =>
      entries.map((entry, index) => ({
        ...entry,
        color:
          entry.id === "__unassigned"
            ? UNASSIGNED_COLOR
            : (colorForId?.(entry.id) ?? PALETTE[index % PALETTE.length]),
      })),
    [entries, colorForId]
  );
  const hasData = total > 0;

  return (
    <Card
      elevation={2}
      className="flex-col items-stretch justify-start gap-3 p-3"
    >
      <BtnCheckbox
        selected={selected}
        onClick={onSelectedChange}
        label={title}
        labelClassName="text-base font-bold tracking-[0.012em]"
      />
      <Divider />

      {!hasData ? (
        <Text
          className="text-muted-fg py-6 text-center"
          children="Nessun dato"
        />
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-[160px] flex-1 flex-col gap-1">
            {colored.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <Text ellipsis children={entry.label} />
                </div>
                <Text weight="bolder" children={entry.count} />
              </div>
            ))}
            <Divider className="my-1" />
            <div className="flex items-center justify-between gap-2">
              <Text weight="bolder" children="Totale" />
              <Text weight="bolder" children={total} />
            </div>
          </div>

          <div className="h-[180px] w-[180px] shrink-0 m-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={colored}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={40}
                  outerRadius={80}
                >
                  {colored.map(entry => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ReportCategoryCard;
