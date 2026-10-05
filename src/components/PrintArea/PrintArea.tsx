"use client";

import * as React from "react";
import type { PrintLayoutSource } from "@prisma/client";
import PrintWorkspace from "./PrintWorkspace";
import type { PrintItem, PrintLayoutDto } from "./types";
import Btn from "@/components/_core/Btn";
import FieldSelect from "@/components/_core/FieldSelect";
import HeroPage from "@/components/HeroPage";
import { EmptyCard } from "@/components/Feedback";
import type { CharacterStatus } from "@/components/BadgeCharacterStatus/status";
import FilterCharacterStatus from "@/components/CharactersList/FilterCharacterStatus";
import { fieldsForSource } from "@/lib/print/fields";

const TABS: { source: PrintLayoutSource; label: string; icon: string }[] = [
  { source: "character", label: "Schede personaggio", icon: "profile" },
  { source: "reference", label: "Cartellini", icon: "cards" },
  { source: "free", label: "Pagine", icon: "description" },
];

export interface IPrintArea {
  layouts: PrintLayoutDto[];
  characters: (PrintItem & { status: CharacterStatus; eventIds: number[] })[];
  // Eventi con almeno un personaggio iscritto (filtro "Iscritti a").
  events: { id: number; name: string }[];
  dataTypes: { id: number; name: string }[];
  entries: (PrintItem & { dataTypeId: number })[];
}

const ALL = "all";

const PrintArea = ({
  layouts,
  characters,
  events,
  dataTypes,
  entries,
}: IPrintArea) => {
  const [tab, setTab] = React.useState<PrintLayoutSource>("character");
  const [status, setStatus] = React.useState<CharacterStatus | typeof ALL>(
    "approved"
  );
  const [eventId, setEventId] = React.useState<number | typeof ALL>(ALL);
  const [dataTypeId, setDataTypeId] = React.useState<number | null>(
    dataTypes[0]?.id ?? null
  );

  const dataTypeNames = dataTypes.map(d => d.name);
  const tabLayouts = layouts.filter(l => l.source === tab);
  const items =
    tab === "character"
      ? characters.filter(
          c =>
            (status === ALL || c.status === status) &&
            (eventId === ALL || c.eventIds.includes(eventId))
        )
      : tab === "reference"
        ? entries.filter(e => e.dataTypeId === dataTypeId)
        : [];

  return (
    <>
      <HeroPage
        title="Area Stampa"
        subtitle="Impagina e stampa schede personaggio, cartellini e pagine"
      />
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <Btn
            key={t.source}
            icon={t.icon}
            label={t.label}
            variant={tab === t.source ? "bold" : "light"}
            selected={tab === t.source}
            onClick={() => setTab(t.source)}
          />
        ))}
      </div>

      {tab === "reference" && dataTypeId === null ? (
        <EmptyCard
          icon="cards"
          title="Nessun tipo di dato"
          message="Crea prima un tipo di dato in Gestione Campagna"
        />
      ) : (
        <PrintWorkspace
          // Rimonta a ogni cambio tab: layout, selezione e designer
          // ripartono puliti. Il cambio di tipo di dato invece no.
          key={tab}
          source={tab}
          layouts={tabLayouts}
          fields={fieldsForSource(tab, dataTypeNames)}
          items={items}
          itemsFilter={
            tab === "character" ? (
              <>
                <FilterCharacterStatus
                  className="w-full sm:w-60"
                  value={status}
                  onChange={setStatus}
                />
                <FieldSelect
                  className="w-full sm:w-80"
                  label="Iscritti a"
                  value={String(eventId)}
                  items={[
                    { id: ALL, label: "Tutti gli eventi" },
                    ...events.map(e => ({ id: String(e.id), label: e.name })),
                  ]}
                  onChange={v =>
                    v !== undefined && setEventId(v === ALL ? ALL : Number(v))
                  }
                />
              </>
            ) : (
              tab === "reference" && (
                <FieldSelect
                  className="w-full sm:w-80"
                  label="Tipo di dato"
                  value={dataTypeId ?? undefined}
                  items={dataTypes.map(d => ({ id: d.id, label: d.name }))}
                  onChange={v => v !== undefined && setDataTypeId(Number(v))}
                />
              )
            )
          }
        />
      )}
    </>
  );
};

export default PrintArea;
