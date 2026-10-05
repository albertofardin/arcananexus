"use client";

import * as React from "react";
import {
  groupTalentsByCategory,
  type TalentCategoryGroup,
} from "./TalentCategoryList";
import type { TalentAccordionEntry } from "./TalentList";

// "categories": navigazione a due livelli (default, categorie -> dettaglio).
// "flat": tutte le voci filtrate una sotto l'altra, senza raggruppamento.
export type TalentViewMode = "categories" | "flat";

export interface TalentBrowserState<TEntry extends TalentAccordionEntry> {
  search: string;
  setSearch: (value: string) => void;
  viewMode: TalentViewMode;
  setViewMode: (mode: TalentViewMode) => void;
  expandedId: number | null;
  // Indipendente da `viewMode`: ha senso sia in "flat" sia dentro il
  // dettaglio di una categoria (`detailGroup`), mai sui pulsanti-categoria.
  expandAll: boolean;
  toggleExpandAll: () => void;
  // Categorie nascoste nell'elenco raggruppato (vista "Elenco"/ricerca):
  // ogni gruppo può essere nascosto/mostrato singolarmente, indipendente da
  // `expandAll` che riguarda l'apertura dei singoli accordion.
  collapsedCategories: ReadonlySet<string>;
  toggleCategoryCollapsed: (categoryKey: string) => void;
  isSearching: boolean;
  filtered: TEntry[];
  groups: TalentCategoryGroup<TEntry>[];
  detailGroup: TalentCategoryGroup<TEntry> | null;
  toggleExpand: (id: number) => void;
  backToCategories: () => void;
  selectCategory: (categoryKey: string) => void;
}

// Stato di navigazione (ricerca, vista, categoria selezionata, riga espansa)
// condiviso da ManagerDataTalents e ModalTalentsLearn (T-046): entrambi
// implementano la stessa vista a due livelli (categorie -> dettaglio) più la
// vista piatta "Elenco" e il toggle "Espandi tutto" (T-051).
export function useTalentBrowser<TEntry extends TalentAccordionEntry>(
  entries: TEntry[]
): TalentBrowserState<TEntry> {
  const [search, setSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null
  );
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [viewMode, setViewModeState] =
    React.useState<TalentViewMode>("categories");
  const [expandAll, setExpandAll] = React.useState(false);
  const [collapsedCategories, setCollapsedCategories] = React.useState<
    Set<string>
  >(new Set());

  const isSearching = search.trim().length > 0;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry => entry.name.toLowerCase().includes(q));
  }, [entries, search]);

  const groups = React.useMemo(
    () => groupTalentsByCategory(filtered),
    [filtered]
  );

  // Voci della categoria selezionata; ricalcolato sui `groups` correnti così,
  // se l'ultima voce di una categoria viene eliminata, la vista "auto-guarisce"
  // tornando da sola alla lista di categorie invece di restare bloccata su una
  // categoria ormai vuota. Ha senso solo in vista "categories": nelle viste
  // piatte non si passa mai da `selectCategory`.
  const selectedGroup =
    viewMode !== "categories" || selectedCategory === null
      ? null
      : (groups.find(group => group.key === selectedCategory) ?? null);

  // `null` sia quando non c'è una categoria selezionata sia quando si sta
  // cercando (la ricerca salta la navigazione a due livelli): tenerla in una
  // variabile tipata, invece di un booleano `showDetail` separato, evita le
  // asserzioni non-null nel render.
  const detailGroup = isSearching ? null : selectedGroup;

  // Passare a una nuova vista azzera la categoria selezionata e la riga
  // espansa: evita di restare con uno stato di navigazione "a metà" (es.
  // categoria ancora selezionata mentre si è passati a "Elenco").
  const setViewMode = (mode: TalentViewMode) => {
    setViewModeState(mode);
    setSelectedCategory(null);
    setExpandedId(null);
  };

  const toggleExpandAll = () => {
    setExpandAll(prev => {
      const next = !prev;
      // Uscendo da "espandi tutto" si riparte da tutto richiuso, invece di
      // lasciare aperta l'ultima riga toccata manualmente.
      if (!next) setExpandedId(null);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    // Con tutti gli accordion già aperti, cliccarne uno significa volerlo
    // richiudere: si esce da "espandi tutto" e si torna all'elenco con tutto
    // richiuso, invece di aprire solo quella riga.
    if (expandAll) {
      setExpandAll(false);
      setExpandedId(null);
      return;
    }
    setExpandedId(current => (current === id ? null : id));
  };

  const toggleCategoryCollapsed = (categoryKey: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryKey)) next.delete(categoryKey);
      else next.add(categoryKey);
      return next;
    });
  };

  const backToCategories = () => {
    setSelectedCategory(null);
    setExpandedId(null);
  };

  const selectCategory = (categoryKey: string) => {
    setSelectedCategory(categoryKey);
    setExpandedId(null);
  };

  return {
    search,
    setSearch,
    viewMode,
    setViewMode,
    expandedId,
    expandAll,
    toggleExpandAll,
    collapsedCategories,
    toggleCategoryCollapsed,
    isSearching,
    filtered,
    groups,
    detailGroup,
    toggleExpand,
    backToCategories,
    selectCategory,
  };
}
