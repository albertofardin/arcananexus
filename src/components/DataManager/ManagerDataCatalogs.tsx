"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataVisibility } from "@prisma/client";
import ModalEditDataCatalog from "./ModalEditDataCatalog";
import { useManualReorder } from "./useManualReorder";
import { useDeleteEntry } from "./useDeleteEntry";
import ModalConfirmDelete from "./ModalConfirmDelete";
import type { ContentEntry } from "./types";
import type { EntryFormAdvancedConfig } from "./useEntryForm";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Divider from "@/components/_core/Divider";
import FieldText from "@/components/_core/FieldText";
import BadgeRole from "@/components/BadgeRole";
import BtnMoveOrder from "@/components/BtnMoveOrder";
import { EmptyCard } from "@/components/Feedback";

interface IManagerDataCatalogs {
  campaignSlug: string;
  dataTypeId: number;
  entries: ContentEntry[];
  isMaster: boolean;
  advanced?: EntryFormAdvancedConfig;
}

const ManagerDataCatalogs = ({
  campaignSlug,
  dataTypeId,
  entries,
  isMaster,
  advanced,
}: IManagerDataCatalogs) => {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ContentEntry | null>(null);
  const { reordering, handleMove } = useManualReorder(
    campaignSlug,
    dataTypeId,
    entries,
    () => router.refresh()
  );
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
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(entry => entry.name.toLowerCase().includes(q));
  }, [entries, search]);
  const openEdit = (entry: ContentEntry) => {
    setEditing(entry);
    setFormOpen(true);
  };

  return (
    <>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        {entries.length < 10 ? null : (
          <>
            <div className="flex flex-wrap items-center gap-3 p-2">
              <FieldText
                className="min-w-[220px] flex-1"
                icon="search"
                placeholder="Cerca..."
                value={search}
                onChange={setSearch}
              />
            </div>
            <Divider />
          </>
        )}

        <div className="flex flex-col p-2">
          {filtered.length === 0 && search ? (
            <EmptyCard
              icon="inventory"
              title="Nessuna voce trovata"
              message="Affina la ricerca per trovare quello che cerchi"
            />
          ) : filtered.length > 0 ? (
            filtered.map(entry => {
              const expanded = expandedId === entry.id;
              const globalIndex = entries.findIndex(e => e.id === entry.id);
              return (
                <React.Fragment key={entry.id}>
                  <div className="flex flex-col w-full items-center rounded hover:bg-accent">
                    <button
                      type="button"
                      className="flex w-full items-center text-left gap-3 p-2"
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                    >
                      <Btn
                        icon={expanded ? "expand_less" : "expand_more"}
                        className="bg-transparent"
                      />
                      <Text
                        size={2}
                        weight="bolder"
                        className="min-w-0 flex-1 break-words"
                        children={entry.name}
                      />
                      {entry.visibility === DataVisibility.hidden && (
                        <BadgeRole type="onlyStaff" />
                      )}
                      {isMaster && (
                        <Btn
                          icon="tune"
                          onClick={event => {
                            event.stopPropagation();
                            openEdit(entry);
                          }}
                        />
                      )}
                      {isMaster && !search && (
                        <BtnMoveOrder
                          canMoveUp={globalIndex > 0}
                          canMoveDown={globalIndex < entries.length - 1}
                          disabled={reordering}
                          onMoveUp={() => handleMove(globalIndex, -1)}
                          onMoveDown={() => handleMove(globalIndex, 1)}
                        />
                      )}
                    </button>
                    {expanded && (
                      <div className="flex flex-col w-full mt-0 mb-2">
                        <FieldText
                          className="border-0 mx-2"
                          value={
                            entry.description ||
                            "- Nessun contenuto disponibile -"
                          }
                          multiline
                          disabled
                        />
                      </div>
                    )}
                  </div>
                  <Divider className="last:hidden mx-2" />
                </React.Fragment>
              );
            })
          ) : null}
        </div>
      </Card>
      <ModalEditDataCatalog
        open={formOpen}
        editing={editing}
        campaignSlug={campaignSlug}
        dataTypeId={dataTypeId}
        onClose={() => setFormOpen(false)}
        onSaved={() => router.refresh()}
        onDelete={
          editing
            ? () => {
                setFormOpen(false);
                setPendingDeleteId(editing.id);
              }
            : undefined
        }
        advanced={advanced}
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

export default ManagerDataCatalogs;
