"use client";

import React from "react";
import { DataVisibility } from "@prisma/client";
import type { TalentAccordionEntry } from "./TalentList";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import Divider from "@/components/_core/Divider";
import Btn from "@/components/_core/Btn";

export const NO_CATEGORY_LABEL = "Senza categoria";

// Lettura duck-typed e sicura del campo `category` da `flags` (T-040/T-046):
// non passa dal parse Zod completo dello schema talento (`talentFlagsSchema`)
// per non perdere il raggruppamento se altri campi flags fossero malformati
// — qui serve solo l'etichetta di raggruppamento, non la validazione.
export function readTalentCategory(flags: unknown): string {
  if (!flags || typeof flags !== "object") return "";
  const category = (flags as Record<string, unknown>).category;
  return typeof category === "string" ? category.trim() : "";
}

export interface TalentCategoryGroup<
  TEntry extends TalentAccordionEntry = TalentAccordionEntry,
> {
  key: string;
  label: string;
  entries: TEntry[];
}

// Bucket per categoria (`flags.category`): dentro ogni bucket le voci sono
// ordinate per nome, le categorie ordinate alfabeticamente con il bucket
// "Senza categoria" (etichetta vuota) sempre per ultimo, indipendentemente
// dall'ordine alfabetico. Condiviso (T-046 → scheda PG, `ManagerDataTalents`
// e `ModalTalentsLearn`): generico su qualunque entry a forma
// `TalentAccordionEntry` (`id,name,flags,...`).
export function groupTalentsByCategory<
  TEntry extends TalentAccordionEntry = TalentAccordionEntry,
>(entries: TEntry[]): TalentCategoryGroup<TEntry>[] {
  const buckets = new Map<string, TEntry[]>();
  for (const entry of entries) {
    const category = readTalentCategory(entry.flags);
    const bucket = buckets.get(category) ?? [];
    bucket.push(entry);
    buckets.set(category, bucket);
  }
  const sortedCategories = Array.from(buckets.keys()).sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b, "it");
  });
  return sortedCategories.map(category => ({
    key: category,
    label: category || NO_CATEGORY_LABEL,
    entries: (buckets.get(category) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "it")),
  }));
}

// Occhio "unlock" di categoria (T-0xx): mostrato solo se il gruppo contiene
// almeno un talento di catalogo `hidden` non ancora posseduto — su un
// gruppo di soli talenti visibili/già posseduti non c'è nulla da sbloccare.
// Icona/verso: se ANCHE UNO solo degli idonei è ancora bloccato, l'azione li
// sblocca tutti; altrimenti (tutti già sbloccati) li blocca tutti di nuovo.
// Condiviso da `TalentCategoryList` (qui, righe categoria prima del
// drill-in) e da `ModalTalents` (header di dettaglio categoria/vista
// "Elenco") — stessa azione, punti d'ingresso diversi.
export const TalentCategoryUnlockToggle = ({
  entries,
  ownedReferenceDataIds,
  unlockedReferenceDataIds,
  pendingIds,
  onToggle,
}: {
  entries: TalentAccordionEntry[];
  ownedReferenceDataIds: ReadonlySet<number>;
  unlockedReferenceDataIds: ReadonlySet<number>;
  pendingIds: ReadonlySet<number>;
  onToggle: () => void;
}) => {
  const eligible = entries.filter(
    entry =>
      entry.visibility === DataVisibility.hidden &&
      !ownedReferenceDataIds.has(entry.id)
  );
  if (eligible.length === 0) return null;

  const anyLocked = eligible.some(
    entry => !unlockedReferenceDataIds.has(entry.id)
  );
  const pending = eligible.some(entry => pendingIds.has(entry.id));

  return (
    <Btn
      small
      icon={anyLocked ? "visibility_off" : "visibility"}
      tooltip={
        anyLocked
          ? "Sblocca tutta la categoria per questo personaggio"
          : "Blocca di nuovo tutta la categoria per questo personaggio"
      }
      disabled={pending}
      onClick={onToggle}
    />
  );
};

interface ITalentCategoryList {
  groups: TalentCategoryGroup[];
  onSelect: (categoryKey: string) => void;
  // Occhio di categoria (T-0xx): tutti opzionali, omessi insieme →
  // comportamento identico a prima (nessun occhio) — `ManagerDataTalents`
  // (catalogo di campagna, non scoped a un personaggio) non li passa.
  ownedReferenceDataIds?: ReadonlySet<number>;
  unlockedReferenceDataIds?: ReadonlySet<number>;
  visibilityPendingIds?: ReadonlySet<number>;
  onToggleGroupVisibility?: (entries: TalentAccordionEntry[]) => void;
}

export const TalentCategoryList = ({
  groups,
  onSelect,
  ownedReferenceDataIds,
  unlockedReferenceDataIds,
  visibilityPendingIds,
  onToggleGroupVisibility,
}: ITalentCategoryList) => (
  <div className="flex flex-col">
    {groups.map(group => (
      <React.Fragment key={group.key}>
        <button
          type="button"
          className="flex flex-1 min-w-0 items-center gap-3 p-3 min-h-[46px] text-left rounded hover:bg-accent"
          onClick={() => onSelect(group.key)}
        >
          <Icon children="filter_list" />
          <Text weight="bolder" className="flex-1" children={group.label} />
          {onToggleGroupVisibility && (
            <TalentCategoryUnlockToggle
              entries={group.entries}
              ownedReferenceDataIds={ownedReferenceDataIds ?? new Set()}
              unlockedReferenceDataIds={unlockedReferenceDataIds ?? new Set()}
              pendingIds={visibilityPendingIds ?? new Set()}
              onToggle={() => onToggleGroupVisibility(group.entries)}
            />
          )}
          <Text
            className="text-muted-fg"
            children={String(group.entries.length)}
          />
          <Icon className="text-muted-fg" children="chevron_right" />
        </button>
        <Divider className="last:hidden mx-2" />
      </React.Fragment>
    ))}
  </div>
);

export default TalentCategoryList;
