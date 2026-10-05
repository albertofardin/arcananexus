import * as React from "react";
import { charactersWithTalent, type CountEntry } from "./aggregate";
import type { ReportCharacterRow } from "./types";
import AvatarUser from "@/components/AvatarUser";
import BadgeCharacterStatus, {
  getCharacterStatus,
} from "@/components/BadgeCharacterStatus";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Divider from "@/components/_core/Divider";
import Btn from "@/components/_core/Btn";
import Badge from "@/components/_core/Badge";
import Modal from "@/components/_core/Modal";
import EmptyCard from "@/components/Feedback/EmptyCard";
import TalentList, {
  TalentCategoryList,
  TalentSearchBar,
  TalentViewToolbar,
  readTalentCategory,
  useTalentBrowser,
  type TalentAccordionEntry,
} from "@/components/TalentList";

export interface IReportTalentsPanel {
  /** Catalogo talenti di campagna (con categoria/descrizione), per `TalentList`. */
  catalog: TalentAccordionEntry[];
  /** Un talento per riga (id === nome), conteggio già filtrato per Tipo+Stato. */
  talents: CountEntry[];
  /** Personaggi nello scope corrente (Tipo+Stato): alimentano la modale. */
  characters: ReportCharacterRow[];
  /** Personaggi nello scope corrente (Tipo+Stato), per calcolare le percentuali. */
  total: number;
  /** Talenti spuntati (per nome), sollevato in `CampaignReport` così il
   * pulsante "Esporta CSV" può vivere nella barra dei tab invece che qui. */
  selected: Record<string, boolean>;
  onSelectedChange: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
}

/** "Quanti hanno Guida?": lista talenti condivisa (`TalentList`, con vista
 * per categoria/elenco e ricerca) con conteggio live su ogni riga; il
 * pulsante di ogni riga spunta il talento per la tabella di confronto. Un
 * click sulla tabella apre la modale coi personaggi che hanno i talenti
 * spuntati. */
const ReportTalentsPanel = ({
  catalog,
  talents,
  characters,
  total,
  selected,
  onSelectedChange,
}: IReportTalentsPanel) => {
  const [charactersOpen, setCharactersOpen] = React.useState(false);

  // Solo la categoria: `cost`/`repeatable` non hanno senso nel report e
  // farebbero comparire XP e contatori ×N sulle righe.
  const entries = React.useMemo(
    () =>
      catalog.map(entry => ({
        ...entry,
        flags: { category: readTalentCategory(entry.flags) },
      })),
    [catalog]
  );
  const browser = useTalentBrowser(entries);

  const counts = React.useMemo(
    () =>
      new Map(
        entries.map(entry => [
          entry.id,
          talents.find(talent => talent.id === entry.name)?.count ?? 0,
        ])
      ),
    [entries, talents]
  );
  const selectedCounts = React.useMemo(
    () =>
      new Map(
        entries
          .filter(entry => selected[entry.name])
          .map(entry => [entry.id, 1])
      ),
    [entries, selected]
  );

  const select = (entry: TalentAccordionEntry) =>
    onSelectedChange(current => ({ ...current, [entry.name]: true }));
  const deselect = (entry: TalentAccordionEntry) =>
    onSelectedChange(current => {
      const next = { ...current };
      delete next[entry.name];
      return next;
    });

  // Dentro una categoria agiscono solo sui suoi talenti, altrimenti su tutti
  // quelli filtrati dalla ricerca.
  const scopeEntries = browser.detailGroup?.entries ?? browser.filtered;

  const selectAllVisible = () =>
    onSelectedChange(current => ({
      ...current,
      ...Object.fromEntries(scopeEntries.map(entry => [entry.name, true])),
    }));

  const deselectAllVisible = () =>
    onSelectedChange(current => {
      const next = { ...current };
      for (const entry of scopeEntries) delete next[entry.name];
      return next;
    });

  const renderList = (list: TalentAccordionEntry[]) => (
    <TalentList
      entries={list}
      isMaster={false}
      expandedId={browser.expandedId}
      expandAll={browser.expandAll}
      onToggleExpand={browser.toggleExpand}
      onAcquire={select}
      onRelease={deselect}
      draftCounts={selectedCounts}
      counts={counts}
    />
  );

  const selectedTalents = React.useMemo(
    () =>
      talents
        .filter(talent => selected[talent.id])
        .sort((a, b) => b.count - a.count),
    [talents, selected]
  );

  if (talents.length === 0) {
    return (
      <EmptyCard
        icon="school"
        title="Nessun talento assegnato"
        message="Il confronto sarà disponibile non appena verranno assegnati dei talenti ai personaggi nel filtro corrente."
      />
    );
  }

  const { detailGroup, groups } = browser;

  return (
    <div className="flex flex-col gap-3">
      <Card
        elevation={2}
        className="flex-col items-stretch justify-start gap-3 p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <TalentSearchBar
            value={browser.search}
            onChange={browser.setSearch}
          />
          <Btn small label="Seleziona tutti" onClick={selectAllVisible} />
          <Btn small label="Deseleziona tutti" onClick={deselectAllVisible} />
        </div>

        {detailGroup ? (
          <div className="flex flex-wrap items-center gap-2 p-2">
            <Btn
              icon="arrow_back"
              label="Listati"
              onClick={browser.backToCategories}
            />
            <Badge label={detailGroup.label} className="rounded px-4 py-2" />
          </div>
        ) : (
          <TalentViewToolbar
            viewMode={browser.viewMode}
            onViewModeChange={browser.setViewMode}
            isSearching={browser.isSearching}
            expandAll={browser.expandAll}
            onToggleExpandAll={browser.toggleExpandAll}
          />
        )}
        <Divider />

        {groups.length === 0 ? (
          <Text
            className="text-muted-fg py-4 text-center"
            children="Nessun talento corrisponde alla ricerca."
          />
        ) : detailGroup ? (
          renderList(detailGroup.entries)
        ) : browser.viewMode === "flat" || browser.isSearching ? (
          groups.map(group => (
            <div key={group.key} className="flex flex-col">
              <Badge
                label={group.label}
                className="rounded px-4 py-2 self-start mx-1.5 my-1"
              />
              <Divider className="mx-1 bg-primary" />
              {renderList(group.entries)}
            </div>
          ))
        ) : (
          <TalentCategoryList
            groups={groups}
            onSelect={browser.selectCategory}
          />
        )}
      </Card>

      <Card
        elevation={2}
        className="flex-col items-stretch justify-start gap-3 p-3"
        onClick={
          selectedTalents.length > 0 ? () => setCharactersOpen(true) : undefined
        }
      >
        <Text size={2} weight="bolder" children="Talenti selezionati" />
        <Divider />

        {selectedTalents.length === 0 ? (
          <Text
            className="text-muted-fg py-6 text-center"
            children="Spunta uno o più talenti qui sopra per costruire la tabella di confronto."
          />
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2">
            <Text
              weight="bolder"
              className="text-muted-fg"
              children="Talento"
            />
            <Text
              weight="bolder"
              className="text-muted-fg text-right"
              children="Personaggi"
            />
            <Text
              weight="bolder"
              className="text-muted-fg text-right"
              children="%"
            />
            <Divider className="col-span-3" />
            {selectedTalents.map(talent => (
              <React.Fragment key={talent.id}>
                <Text ellipsis children={talent.label} />
                <Text
                  weight="bolder"
                  className="text-right"
                  children={talent.count}
                />
                <Text
                  className="text-muted-fg text-right"
                  children={formatPercent(talent.count, total)}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={charactersOpen}
        onClose={() => setCharactersOpen(false)}
        titleClose
        title="Personaggi per talento"
        content={
          <div className="flex flex-col gap-4 p-3">
            {selectedTalents.map(talent => {
              const owners = charactersWithTalent(characters, talent.id);
              return (
                <div key={talent.id} className="flex flex-col gap-1">
                  <Text
                    weight="bolder"
                    children={`${talent.label} (${owners.length})`}
                  />
                  <Divider />
                  {owners.length === 0 ? (
                    <Text
                      className="text-muted-fg"
                      children="Nessun personaggio."
                    />
                  ) : (
                    owners.map(row => <CharacterRow key={row.id} row={row} />)
                  )}
                </div>
              );
            })}
          </div>
        }
      />
    </div>
  );
};

const toDate = (value: string | null) => (value ? new Date(value) : null);

// Riga personaggio: avatar, nome, giocatore; lo stato solo se non è attivo.
const CharacterRow = ({ row }: { row: ReportCharacterRow }) => {
  const status = getCharacterStatus({
    approvalDate: toDate(row.approvalDate),
    parkDate: toDate(row.parkDate),
    deathDate: toDate(row.deathDate),
  });
  return (
    <div className="flex items-center gap-2 p-2">
      <AvatarUser size={28} src={row.avatar ?? undefined} text={row.name} />
      <Text weight="bolder" ellipsis className="flex-1" children={row.name} />
      <Badge disabled label={row.userName} />
      {status !== "approved" && <BadgeCharacterStatus status={status} />}
    </div>
  );
};

export function formatPercent(count: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

export default ReportTalentsPanel;
