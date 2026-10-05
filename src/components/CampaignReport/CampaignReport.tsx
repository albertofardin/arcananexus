"use client";

import * as React from "react";
import { CharacterType } from "@prisma/client";
import Card from "../_core/Card";
import ReportCategoryCard from "./ReportCategoryCard";
import ReportTalentsPanel, { formatPercent } from "./ReportTalentsPanel";
import { buildCsv, downloadCsv } from "./csv";
import {
  discoverCategories,
  countByCategory,
  countByStatus,
  countTalents,
  charactersWithTalent,
} from "./aggregate";
import type { ReportCharacterRow } from "./types";
import FilterCharacterType from "@/components/CharactersList/FilterCharacterType";
import FilterCharacterStatus from "@/components/CharactersList/FilterCharacterStatus";
import {
  getCharacterStatus,
  type CharacterStatus,
} from "@/components/BadgeCharacterStatus";
import { CHARACTER_STATUS, CHARACTER_TYPE } from "@/lib/constants";
import type { TalentAccordionEntry } from "@/components/TalentList";
import HeroPage from "@/components/HeroPage";
import Btn from "@/components/_core/Btn";
import EmptyCard from "@/components/Feedback/EmptyCard";

// Id di selezione per la card "Giocatori" (colonna "Stato" nell'export):
// stringa fissa, non collide mai con un `dataTypeId` numerico.
const STATUS_CATEGORY_ID = "status";

export interface ICampaignReport {
  campaignSlug: string;
  rows: ReportCharacterRow[];
  /** Tutti i talenti definiti in campagna, assegnati o no (per la lista del
   * tab Talenti: un talento senza ancora un'assegnazione deve restare
   * cercabile, a differenza delle categorie a torta). */
  talentCatalog: TalentAccordionEntry[];
}

/** Report statistico dei personaggi: card Razza/Fazione/Divinità/... (scoperte
 * dinamicamente dai `DataType` origins/assignable a cardinalità singola) più
 * la card "Giocatori" (distribuzione per stato derivato). Tutto in-memory nel
 * browser: nessuna nuova API, nessuna query TanStack, i dati sono già stati
 * fetchati una volta dal server component `page.tsx`. */
const CampaignReport = ({
  campaignSlug,
  rows,
  talentCatalog,
}: ICampaignReport) => {
  const [typeFilter, setTypeFilter] = React.useState<CharacterType | "all">(
    CharacterType.pg
  );
  const [statusFilter, setStatusFilter] = React.useState<
    CharacterStatus | "all"
  >("approved");
  const [tab, setTab] = React.useState<"overview" | "talents">("overview");
  const [selectedTalentIds, setSelectedTalentIds] = React.useState<
    Record<string, boolean>
  >({});
  // Categorie incluse nell'export CSV Panoramica, spuntate direttamente
  // sulla card (stessa UX del tab Talenti). Assente = selezionata: così
  // l'export parte "tutto incluso" senza dover sincronizzare lo stato ogni
  // volta che `categories` cambia (filtro Tipo).
  const [deselectedCategoryIds, setDeselectedCategoryIds] = React.useState<
    Record<string, boolean>
  >({});
  const isCategorySelected = (id: string) => !deselectedCategoryIds[id];
  const toggleCategory = (id: string) => (checked: boolean) =>
    setDeselectedCategoryIds(current => ({ ...current, [id]: !checked }));

  const rowsByType = React.useMemo(
    () =>
      typeFilter === "all" ? rows : rows.filter(row => row.type === typeFilter),
    [rows, typeFilter]
  );

  // Card Razza/Fazione/Divinità/...: rispettano sia Tipo sia Stato.
  const rowsByTypeAndStatus = React.useMemo(
    () =>
      statusFilter === "all"
        ? rowsByType
        : rowsByType.filter(
            row => getCharacterStatus(toDates(row)) === statusFilter
          ),
    [rowsByType, statusFilter]
  );

  // Le categorie sono scoperte sull'insieme non filtrato per Stato, così le
  // card restano stabili quando l'utente cambia il filtro Stato (una
  // categoria non sparisce solo perché il sottoinsieme filtrato è vuoto).
  const categories = React.useMemo(
    () => discoverCategories(rowsByType),
    [rowsByType]
  );

  const playersEntries = React.useMemo(
    () => countByStatus(rowsByType),
    [rowsByType]
  );

  // A differenza delle categorie a torta, l'elenco talenti viene dal
  // catalogo di campagna (`talentCatalog`, fetchato in `page.tsx`), non
  // scoperto dalle sole assegnazioni: un talento definito ma non ancora
  // assegnato a nessuno deve restare cercabile (con conteggio 0), non
  // sparire dalla checklist. I conteggi invece rispettano Tipo+Stato,
  // stesso motivo delle categorie: "quanti hanno Guida" deve rispondere per
  // il sottoinsieme filtrato in pagina, non per l'intera campagna.
  const talentCounts = React.useMemo(
    () => countTalents(rowsByTypeAndStatus),
    [rowsByTypeAndStatus]
  );
  const talents = React.useMemo(
    () =>
      talentCatalog.map(({ name }) => ({
        id: name,
        label: name,
        count: talentCounts.get(name) ?? 0,
      })),
    [talentCatalog, talentCounts]
  );

  const selectedTalents = React.useMemo(
    () =>
      talents
        .filter(talent => selectedTalentIds[talent.id])
        .sort((a, b) => b.count - a.count),
    [talents, selectedTalentIds]
  );

  const handleExportTalents = () => {
    const today = new Date().toISOString().slice(0, 10);
    const csv = buildCsv([
      ["Talento", "Personaggi", "Percentuale", "Elenco personaggi"],
      ...selectedTalents.map(talent => [
        talent.label,
        String(talent.count),
        formatPercent(talent.count, rowsByTypeAndStatus.length),
        charactersWithTalent(rowsByTypeAndStatus, talent.id)
          .map(row => row.name)
          .join("; "),
      ]),
    ]);
    downloadCsv(`report-talenti-${campaignSlug}-${today}.csv`, csv);
  };

  const handleExportOverview = () => {
    const columns: {
      label: string;
      getValue: (row: ReportCharacterRow) => string;
    }[] = [
      { label: "Nome personaggio", getValue: row => row.name },
      { label: "Giocatore", getValue: row => row.userName },
      { label: "Tipo", getValue: row => CHARACTER_TYPE[row.type].label },
    ];
    if (isCategorySelected(STATUS_CATEGORY_ID)) {
      columns.push({
        label: "Stato",
        getValue: row =>
          CHARACTER_STATUS[getCharacterStatus(toDates(row))].label,
      });
    }
    for (const category of categories) {
      if (!isCategorySelected(String(category.dataTypeId))) continue;
      columns.push({
        label: category.name,
        getValue: row =>
          row.data.find(entry => entry.dataTypeId === category.dataTypeId)
            ?.referenceDataName ?? "",
      });
    }

    const csv = buildCsv([
      columns.map(column => column.label),
      ...rowsByTypeAndStatus.map(row =>
        columns.map(column => column.getValue(row))
      ),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`report-personaggi-${campaignSlug}-${today}.csv`, csv);
  };

  if (rows.length === 0) {
    return (
      <>
        <HeroPage
          title="Report Personaggi"
          subtitle="Statistiche e distribuzione dei personaggi della campagna"
        />
        <EmptyCard
          icon="groups"
          title="Nessun personaggio nella campagna"
          message="Il report sarà disponibile non appena verranno creati dei personaggi."
        />
      </>
    );
  }

  return (
    <>
      <HeroPage
        title="Report Personaggi"
        subtitle="Statistiche e distribuzione dei personaggi della campagna"
      />
      <Card className="flex-wrap p-2 gap-2">
        <Card className="flex max-w-full border-primary overflow-hidden rounded">
          <Btn
            icon="chart_ring"
            color="var(--primary)"
            className="border-0 rounded-r-none w-[130px]"
            selected={tab === "overview"}
            label="Panoramica"
            onClick={() => setTab("overview")}
          />
          <Btn
            icon="talent"
            color="var(--primary)"
            className="border-0 rounded-l-none w-[130px]"
            selected={tab === "talents"}
            label="Talenti"
            onClick={() => setTab("talents")}
          />
        </Card>
        {tab === "overview" ? (
          <Btn
            variant="bold"
            icon="download"
            label="Esporta CSV"
            onClick={handleExportOverview}
          />
        ) : (
          <Btn
            variant="bold"
            icon="download"
            label="Esporta CSV"
            disabled={selectedTalents.length === 0}
            onClick={handleExportTalents}
          />
        )}
        <div className="flex-1" />
        <FilterCharacterType
          className="w-[150px]"
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <FilterCharacterStatus
          className="w-[150px]"
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </Card>
      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map(category => (
            <ReportCategoryCard
              key={category.dataTypeId}
              title={category.name}
              entries={countByCategory(
                rowsByTypeAndStatus,
                category.dataTypeId
              )}
              total={rowsByTypeAndStatus.length}
              selected={isCategorySelected(String(category.dataTypeId))}
              onSelectedChange={toggleCategory(String(category.dataTypeId))}
            />
          ))}
          <ReportCategoryCard
            title="Giocatori"
            entries={playersEntries}
            total={rowsByType.length}
            colorForId={id => CHARACTER_STATUS[id as CharacterStatus]?.color}
            selected={isCategorySelected(STATUS_CATEGORY_ID)}
            onSelectedChange={toggleCategory(STATUS_CATEGORY_ID)}
          />
        </div>
      ) : (
        <ReportTalentsPanel
          catalog={talentCatalog}
          talents={talents}
          characters={rowsByTypeAndStatus}
          total={rowsByTypeAndStatus.length}
          selected={selectedTalentIds}
          onSelectedChange={setSelectedTalentIds}
        />
      )}
    </>
  );
};

function toDates(row: ReportCharacterRow) {
  return {
    approvalDate: row.approvalDate ? new Date(row.approvalDate) : null,
    parkDate: row.parkDate ? new Date(row.parkDate) : null,
    deathDate: row.deathDate ? new Date(row.deathDate) : null,
  };
}

export default CampaignReport;
