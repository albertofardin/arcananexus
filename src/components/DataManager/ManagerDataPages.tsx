"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataVisibility } from "@prisma/client";
import ModalEditDataPage from "./ModalEditDataPage";
import { useManualReorder } from "./useManualReorder";
import { useDeleteEntry } from "./useDeleteEntry";
import ModalConfirmDelete from "./ModalConfirmDelete";
import type { ContentEntry } from "./types";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import BadgeRole from "@/components/BadgeRole";
import BtnMoveOrder from "@/components/BtnMoveOrder";
import { EmptyCard } from "@/components/Feedback";
import { routes } from "@/app/routes";
import Divider from "@/components/_core/Divider";

interface IManagerDataPages {
  campaignSlug: string;
  dataSlug: string;
  dataTypeId: number;
  entries: ContentEntry[];
  isMaster: boolean;
}

const ManagerDataPages = ({
  campaignSlug,
  dataSlug,
  dataTypeId,
  entries,
  isMaster,
}: IManagerDataPages) => {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ContentEntry | null>(null);
  const { reordering, handleMove } = useManualReorder(
    campaignSlug,
    dataTypeId,
    entries,
    () => router.refresh()
  );
  const { deletingId, pendingDeleteId, setPendingDeleteId, handleDelete } =
    useDeleteEntry({
      buildUrl: id => `/api/campaigns/${campaignSlug}/reference-data/${id}`,
      onDeleted: () => router.refresh(),
      successMessage: "Pagina eliminata",
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
            <div className="flex flex-wrap items-center gap-3 p-3">
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

        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col p-2">
          {filtered.length === 0 && search ? (
            <EmptyCard
              icon="article"
              title="Nessuna pagina trovata"
              message="Affina la ricerca per trovare quello che cerchi."
            />
          ) : filtered.length > 0 ? (
            filtered.map(entry => {
              const globalIndex = entries.findIndex(e => e.id === entry.id);
              return (
                <React.Fragment key={entry.id}>
                  <button
                    type="button"
                    className="flex w-full items-center text-left gap-3 p-2 rounded hover:bg-accent"
                    onClick={() =>
                      router.push(
                        routes.campaignDataPage(
                          campaignSlug,
                          dataSlug,
                          entry.id
                        ) as never
                      )
                    }
                  >
                    <Btn icon="article" />
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
                      <Btn icon="tune" onClick={() => openEdit(entry)} />
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
                  <Divider className="last:hidden mx-2" />
                </React.Fragment>
              );
            })
          ) : null}
        </div>
      </Card>
      <ModalEditDataPage
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
      />
      <ModalConfirmDelete
        open={pendingDeleteId !== null}
        title="Elimina pagina"
        message="Sei sicuro di voler eliminare questa pagina? L'operazione non è reversibile."
        submitting={deletingId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default ManagerDataPages;
