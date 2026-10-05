"use client";

import Card from "../_core/Card";
import type { TalentViewMode } from "./useTalentBrowser";
import Btn from "@/components/_core/Btn";

interface ITalentViewToolbar {
  viewMode: TalentViewMode;
  onViewModeChange: (mode: TalentViewMode) => void;
  // Una ricerca a testo libero mostra l'elenco raggruppato per categoria
  // anche in vista "Listati" (vedi ManagerDataTalents/ModalTalentsLearn):
  // "Espandi tutto" deve comparire anche lì, non solo in vista "Elenco".
  isSearching: boolean;
  expandAll: boolean;
  onToggleExpandAll: () => void;
  // Filtro "Solo apprendibili": opzionale, passato solo da ModalTalents
  // (unico contesto in cui ha senso confrontare il costo in XP dei talenti
  // con i punti a disposizione). Se `onToggleOnlyAffordable` è assente il
  // pulsante non viene mostrato.
  onlyAffordable?: boolean;
  onToggleOnlyAffordable?: () => void;
  // Filtro "Solo appresi": stesso pattern di `onlyAffordable`, opzionale e
  // passato solo da ModalTalents. Se `onToggleOnlyOwned` è assente il
  // pulsante non viene mostrato.
  onlyOwned?: boolean;
  onToggleOnlyOwned?: () => void;
}

// Barra di controllo vista sopra l'elenco/categorie dei talenti, condivisa
// da ManagerDataTalents e ModalTalentsLearn (T-051). "Espandi tutto" appare
// solo quando sotto è visibile un elenco di talenti (vista "Elenco" o
// ricerca attiva): sui pulsanti-categoria non c'è nulla da espandere (nella
// vista a dettaglio di un listato il pulsante equivalente è nel breadcrumb,
// non qui: la toolbar non è visibile lì).
export const TalentViewToolbar = ({
  viewMode,
  onViewModeChange,
  isSearching,
  expandAll,
  onToggleExpandAll,
  onlyAffordable,
  onToggleOnlyAffordable,
  onlyOwned,
  onToggleOnlyOwned,
}: ITalentViewToolbar) => (
  <div className="flex flex-wrap items-center gap-2 p-2 -mr-[2px]">
    {!isSearching && (
      <Card className="max-w-full border-primary rounded">
        <Btn
          color="var(--primary)"
          className="border-0 rounded-r-none  w-[110px]"
          icon="grid_view"
          label="Listati"
          selected={viewMode === "categories"}
          onClick={() => onViewModeChange("categories")}
        />
        <Btn
          color="var(--primary)"
          className="border-0 rounded-l-none w-[110px]"
          icon="list_view"
          label="Elenco"
          selected={viewMode === "flat"}
          onClick={() => onViewModeChange("flat")}
        />
      </Card>
    )}
    <Card className="max-w-full border-button rounded">
      {onToggleOnlyOwned && (
        <Btn
          className="border-0 rounded-r-none  w-[160px]"
          icon="talent"
          label="Solo appresi"
          selected={onlyOwned}
          onClick={onToggleOnlyOwned}
        />
      )}
      {onToggleOnlyAffordable && (
        <Btn
          className="border-0 rounded-l-none w-[160px]"
          icon="learn"
          label="Solo acquistabili"
          selected={onlyAffordable}
          onClick={onToggleOnlyAffordable}
        />
      )}
    </Card>
    <div className="flex-1" />
    {(viewMode === "flat" || isSearching) && (
      <Btn
        icon={expandAll ? "expand_less" : "expand_more"}
        label={expandAll ? "Comprimi tutto" : "Espandi tutto"}
        labelPosition
        selected={expandAll}
        onClick={onToggleExpandAll}
      />
    )}
  </div>
);

export default TalentViewToolbar;
