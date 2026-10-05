"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalEditDataTalent from "./ModalEditDataTalent";
import { useDeleteEntry } from "./useDeleteEntry";
import ModalConfirmDelete from "./ModalConfirmDelete";
import type { ContentEntry } from "./types";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Divider from "@/components/_core/Divider";
import { EmptyCard } from "@/components/Feedback";
import TalentList, {
  TalentCategoryList,
  TalentSearchBar,
  TalentViewToolbar,
  useTalentBrowser,
  type TalentRequirementEdge,
} from "@/components/TalentList";
import Badge from "@/components/_core/Badge";

interface IManagerDataTalents {
  campaignSlug: string;
  dataTypeId: number;
  entries: ContentEntry[];
  isMaster: boolean;
  missiveActive?: boolean;
  downtimeActive?: boolean;
  categories?: string[];
  requirements?: TalentRequirementEdge[];
}

const ManagerDataTalents = ({
  campaignSlug,
  dataTypeId,
  entries,
  isMaster,
  missiveActive,
  downtimeActive,
  requirements,
  categories,
}: IManagerDataTalents) => {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ContentEntry | null>(null);

  const {
    deletingId,
    pendingDeleteId,
    setPendingDeleteId,
    blocked,
    handleDelete,
  } = useDeleteEntry({
    buildUrl: id => `/api/campaigns/${campaignSlug}/reference-data/${id}`,
    onDeleted: () => router.refresh(),
    successMessage: "Voce eliminata",
  });

  const {
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
    groups,
    detailGroup,
    toggleExpand,
    backToCategories,
    selectCategory,
  } = useTalentBrowser(entries);

  const openEdit = (entry: ContentEntry) => {
    setEditing(entry);
    setFormOpen(true);
  };

  return (
    <>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0 pt-2">
        {detailGroup ? (
          <>
            <div className="flex flex-wrap items-center gap-3 p-2 min-h-[56px]">
              <Btn
                icon="arrow_back"
                label="Listati"
                onClick={backToCategories}
              />
              <Badge
                color="var(--info)"
                label={detailGroup.label}
                className="px-4 py-2"
              />
              <Btn
                className="ml-auto"
                icon={expandAll ? "expand_less" : "expand_more"}
                label={expandAll ? "Comprimi tutto" : "Espandi tutto"}
                selected={expandAll}
                onClick={toggleExpandAll}
              />
            </div>
            <Divider />
          </>
        ) : entries.length === 0 ? null : (
          <>
            {entries.length >= 10 && (
              <TalentSearchBar value={search} onChange={setSearch} />
            )}
            <TalentViewToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              isSearching={isSearching}
              expandAll={expandAll}
              onToggleExpandAll={toggleExpandAll}
            />
            <Divider />
          </>
        )}

        <div className="flex flex-col p-2">
          {detailGroup ? (
            <TalentList
              campaignSlug={campaignSlug}
              entries={detailGroup.entries}
              isMaster={isMaster}
              expandedId={expandedId}
              expandAll={expandAll}
              onToggleExpand={toggleExpand}
              onEdit={isMaster ? openEdit : undefined}
              onDeleteRequest={isMaster ? setPendingDeleteId : undefined}
              deletingId={deletingId}
              requirements={requirements}
            />
          ) : viewMode === "flat" || isSearching ? (
            groups.length === 0 ? (
              <EmptyCard
                icon="inventory"
                title="Nessuna voce trovata"
                message="Affina la ricerca per trovare quello che cerchi"
              />
            ) : (
              groups.map(group => {
                const collapsed = collapsedCategories.has(group.key);
                return (
                  <div key={group.key} className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <Badge
                        label={group.label}
                        className="rounded-bl-none rounded-br-none rounded-tl-md rounded-tr-md border-b-0 w-fit py-1 px-3"
                      />
                      <Btn
                        small
                        icon={collapsed ? "expand_more" : "expand_less"}
                        tooltip={
                          collapsed
                            ? "Mostra talenti della categoria"
                            : "Nascondi talenti della categoria"
                        }
                        onClick={() => toggleCategoryCollapsed(group.key)}
                      />
                    </div>
                    <Divider className="bg-primary" />
                    {!collapsed && (
                      <TalentList
                        campaignSlug={campaignSlug}
                        entries={group.entries}
                        isMaster={isMaster}
                        expandedId={expandedId}
                        expandAll={expandAll}
                        onToggleExpand={toggleExpand}
                        onEdit={isMaster ? openEdit : undefined}
                        onDeleteRequest={
                          isMaster ? setPendingDeleteId : undefined
                        }
                        deletingId={deletingId}
                        requirements={requirements}
                      />
                    )}
                  </div>
                );
              })
            )
          ) : (
            <TalentCategoryList groups={groups} onSelect={selectCategory} />
          )}
        </div>
      </Card>
      <ModalEditDataTalent
        open={formOpen}
        editing={editing}
        campaignSlug={campaignSlug}
        dataTypeId={dataTypeId}
        onClose={() => setFormOpen(false)}
        onSaved={() => router.refresh()}
        missiveActive={missiveActive}
        downtimeActive={downtimeActive}
        categories={categories}
      />
      <ModalConfirmDelete
        open={pendingDeleteId !== null}
        title="Elimina voce"
        message="Sei sicuro di voler eliminare questa voce? L'operazione non è reversibile."
        extra={
          blocked?.assignedCount ? (
            <Text
              className="text-fail"
              children={`Questa voce è assegnata a ${blocked.assignedCount} ${
                blocked.assignedCount === 1 ? "personaggio" : "personaggi"
              }. Rimuovi prima quelle assegnazioni.`}
            />
          ) : blocked?.dependents && blocked.dependents.length > 0 ? (
            <Text
              className="text-fail"
              children={`Dipendono da questa voce: ${blocked.dependents
                .map(d => d.name)
                .join(", ")}. Rimuovi prima quei requisiti.`}
            />
          ) : undefined
        }
        submitting={deletingId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default ManagerDataTalents;
