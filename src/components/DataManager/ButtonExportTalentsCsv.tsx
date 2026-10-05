"use client";

import * as React from "react";
import { DataVisibility } from "@prisma/client";
import type { ContentEntry } from "./types";
import {
  buildTalentsCsv,
  downloadCsv,
  readTalentFlags,
  type CatalogEntryRef,
  type RequirementEdgeRef,
} from "./talentsCsv";
import Btn from "@/components/_core/Btn";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import { useToast } from "@/components/_core/Toast";
import { DATA_VISIBILITY_LABELS } from "@/lib/labels";

const NO_CATEGORY = "(Senza listato)";

interface IButtonExportTalentsCsv {
  entries: ContentEntry[];
  catalogEntries: CatalogEntryRef[];
  requirementEdges: RequirementEdgeRef[];
}

const ButtonExportTalentsCsv = ({
  entries,
  catalogEntries,
  requirementEdges,
}: IButtonExportTalentsCsv) => {
  const { showToast } = useToast();
  const [open, setOpen] = React.useState(false);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    entries.forEach(entry => {
      set.add(readTalentFlags(entry.flags).category || NO_CATEGORY);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const [visibilities, setVisibilities] = React.useState<Set<DataVisibility>>(
    () => new Set([DataVisibility.visible, DataVisibility.hidden])
  );
  const [selectedCategories, setSelectedCategories] = React.useState<
    Set<string>
  >(() => new Set(categories));

  // Riallinea la selezione quando cambia l'elenco categorie disponibili
  // (es. dopo un import che ne introduce di nuove): default "tutte
  // selezionate" invece di lasciare fuori le categorie non ancora viste.
  React.useEffect(() => {
    setSelectedCategories(new Set(categories));
  }, [categories]);

  const toggleVisibility = (visibility: DataVisibility, checked: boolean) => {
    setVisibilities(prev => {
      const next = new Set(prev);
      if (checked) next.add(visibility);
      else next.delete(visibility);
      return next;
    });
  };

  const toggleCategory = (category: string, checked: boolean) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (checked) next.add(category);
      else next.delete(category);
      return next;
    });
  };

  const filteredEntries = React.useMemo(
    () =>
      entries.filter(entry => {
        if (!visibilities.has(entry.visibility)) return false;
        const category = readTalentFlags(entry.flags).category || NO_CATEGORY;
        return selectedCategories.has(category);
      }),
    [entries, visibilities, selectedCategories]
  );

  const handleExport = () => {
    downloadCsv(
      "talenti.csv",
      buildTalentsCsv(filteredEntries, requirementEdges, catalogEntries)
    );
    showToast({
      variant: "success",
      message: `${filteredEntries.length} ${
        filteredEntries.length === 1 ? "talento esportato" : "talenti esportati"
      }`,
    });
    setOpen(false);
  };

  return (
    <>
      <Btn icon="download" label="Esporta CSV" onClick={() => setOpen(true)} />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Esporta talenti"
        content={
          <div className="flex max-w-full flex-col gap-3 w-[380px]">
            <div className="flex flex-col gap-1">
              <Text
                weight="bolder"
                className="text-muted-fg"
                children="Visibilità"
              />
              {(Object.keys(DATA_VISIBILITY_LABELS) as DataVisibility[]).map(
                visibility => (
                  <BtnCheckbox
                    key={visibility}
                    label={DATA_VISIBILITY_LABELS[visibility]}
                    selected={visibilities.has(visibility)}
                    onClick={checked => toggleVisibility(visibility, checked)}
                  />
                )
              )}
            </div>
            {categories.length > 0 && (
              <div className="flex flex-col gap-1">
                <Text
                  weight="bolder"
                  className="text-muted-fg"
                  children="Listato"
                />
                <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto">
                  {categories.map(category => (
                    <BtnCheckbox
                      key={category}
                      label={category}
                      selected={selectedCategories.has(category)}
                      onClick={checked => toggleCategory(category, checked)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        }
        actions={
          <>
            <Text
              className="text-muted-fg"
              children={`${filteredEntries.length} voci selezionate`}
            />
            <div className="flex-1" />
            <Btn label="ANNULLA" onClick={() => setOpen(false)} />
            <Btn
              variant="bold"
              color="var(--succ)"
              label="ESPORTA"
              disabled={filteredEntries.length === 0}
              onClick={handleExport}
            />
          </>
        }
      />
    </>
  );
};

export default ButtonExportTalentsCsv;
