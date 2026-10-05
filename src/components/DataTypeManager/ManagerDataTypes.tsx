"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DataTypeKind,
  DataTypeAssignability,
  DataCardinality,
} from "@prisma/client";
import ModalDataType, { type DataTypeFormState } from "./ModalDataType";
import ModalDeleteDataType from "./ModalDeleteDataType";
import ModalDeactivateAssignability, {
  type PendingDeactivation,
} from "./ModalDeactivateAssignability";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import Skeleton from "@/components/_core/Skeleton";
import { useToast } from "@/components/_core/Toast";
import { ErrorCard, EmptyCard } from "@/components/Feedback";
import Badge from "@/components/_core/Badge";
import BtnMoveOrder from "@/components/BtnMoveOrder";
import HeroPage from "@/components/HeroPage";
import { useQueryCampaignDataTypes } from "@/lib/queries/dataTypes";
import type { DataTypeAdmin } from "@/lib/validations/dataType";
import {
  DATA_TYPE_KIND_LABELS,
  DATA_TYPE_KIND_ICONS,
  DATA_TYPE_RENDER_LABELS,
  DATA_TYPE_RENDER_ICONS,
} from "@/lib/labels";
import { routes } from "@/app/routes";
import Avatar from "@/components/_core/Avatar";
import Divider from "@/components/_core/Divider";

const computeAssignability = (
  values: Pick<
    DataTypeFormState,
    "kind" | "cardinality" | "assignability" | "mandatory"
  >
): {
  assignability: DataTypeAssignability;
  cardinality: DataCardinality | null;
  mandatory: boolean;
} => {
  switch (values.kind) {
    case DataTypeKind.generic:
      return {
        assignability: DataTypeAssignability.none,
        cardinality: null,
        mandatory: false,
      };
    case DataTypeKind.origins:
      return {
        assignability: DataTypeAssignability.creationOnly,
        cardinality: DataCardinality.single,
        mandatory: values.mandatory,
      };
    case DataTypeKind.assignable:
      return {
        assignability: values.assignability,
        cardinality: values.cardinality,
        mandatory: values.mandatory,
      };
    case DataTypeKind.talent:
      return {
        assignability: values.assignability,
        cardinality: values.cardinality,
        mandatory: false,
      };
  }
};

// ── Riga lista ───────────────────────────────────────────────────────────

interface DataTypeRowProps {
  dataType: DataTypeAdmin;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggleSidebar: () => void;
  onMove: (direction: "up" | "down") => void;
  onManageReferenceData: () => void;
}

const DataTypeRow = ({
  dataType: dt,
  canMoveUp,
  canMoveDown,
  busy,
  onEdit,
  onToggleSidebar,
  onMove,
  onManageReferenceData,
}: DataTypeRowProps) => (
  <>
    <button
      type="button"
      data-testid={`data-type-row-${dt.id}`}
      disabled={busy}
      onClick={onManageReferenceData}
      className="flex w-full flex-wrap items-center gap-3 p-2 text-left rounded hover:bg-accent"
    >
      <Avatar
        icon={dt.icon || DATA_TYPE_KIND_ICONS[dt.kind]}
        className="bg-bg"
      />
      <div className="min-w-[160px] flex-1">
        <Text size={2} weight="bolder" ellipsis children={dt.name} />
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Badge
            icon={DATA_TYPE_RENDER_ICONS[dt.renderAs]}
            label={DATA_TYPE_RENDER_LABELS[dt.renderAs]}
            disabled
          />
          <Badge
            icon={DATA_TYPE_KIND_ICONS[dt.kind]}
            label={DATA_TYPE_KIND_LABELS[dt.kind]}
            disabled
          />
          {!!dt._count && dt._count.referenceData > 0 && (
            <Badge
              icon="menu_book"
              label={`${dt._count.referenceData} voci`}
              disabled
            />
          )}
        </div>
      </div>

      {/* mobile: le azioni vanno a capo, allineate a destra */}
      <div className="ml-auto flex items-center gap-3">
        {dt.sidebarShow && (
          <BtnMoveOrder
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            disabled={busy}
            onMoveUp={() => onMove("up")}
            onMoveDown={() => onMove("down")}
          />
        )}

        <BtnCheckbox
          label="sidebar"
          selected={dt.sidebarShow}
          disabled={busy}
          onClick={onToggleSidebar}
        />

        <div className="flex shrink-0 items-center gap-1">
          <Btn icon="tune" disabled={busy} onClick={onEdit} />
        </div>
      </div>
    </button>
    <Divider className="last:hidden mx-2" />
  </>
);

// ── Componente principale ──────────────────────────────────────────────

/**
 * Amministrazione dei `DataType` della campagna (T-029): CRUD + composizione
 * sidebar (ordine, icona, `sidebarShow`). Guardia head_master ereditata da
 * `admin/layout.tsx` (T-028).
 */
const ManagerDataTypes = () => {
  const params = useParams<{ campaignSlug: string }>();
  const campaignSlug = params.campaignSlug;
  const router = useRouter();
  const { showToast } = useToast();

  const {
    data: dataTypes,
    isLoading,
    error,
    refetch,
  } = useQueryCampaignDataTypes(campaignSlug);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DataTypeAdmin | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<DataTypeAdmin | null>(null);
  // Guardia T-035 (round 2, finding reviewer): un `DataType` con `cardinality`
  // già valorizzata (quindi già in uso per assegnazioni ai PG) che perde
  // l'assegnabilità verrebbe reso silenziosamente non assegnabile a
  // chiunque, nemmeno dal master (`NotAssignableDataTypeError`, non
  // bypassabile — vedi `characterData.service.ts`). Popolato da `handleSubmit`
  // invece di forzare `cardinality: null` senza preavviso: l'utente deve
  // confermare esplicitamente l'azione distruttiva.
  const [pendingDeactivation, setPendingDeactivation] =
    React.useState<PendingDeactivation | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [reordering, setReordering] = React.useState(false);

  // Ordine di visualizzazione: sezioni in sidebar prima (stesso ordine con
  // cui le vede il giocatore, `campaign.repository.ts` → T-020: sidebarOrder
  // asc, null in coda, poi nome), poi le altre in ordine alfabetico.
  const sorted = React.useMemo(() => {
    const list = dataTypes ?? [];
    return [...list].sort((a, b) => {
      if (a.sidebarShow !== b.sidebarShow) return a.sidebarShow ? -1 : 1;
      if (a.sidebarShow && b.sidebarShow) {
        const orderA = a.sidebarOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sidebarOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [dataTypes]);

  const sidebarVisible = React.useMemo(
    () => sorted.filter(dt => dt.sidebarShow),
    [sorted]
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (dt: DataTypeAdmin) => {
    setEditing(dt);
    setFormOpen(true);
  };
  const closeForm = () => setFormOpen(false);
  const goToReferenceData = (dt: DataTypeAdmin) =>
    router.push(routes.campaignAdminDataType(campaignSlug, dt.name) as never);

  const patchDataType = async (id: number, body: Record<string, unknown>) => {
    const response = await fetch(
      `/api/campaigns/${campaignSlug}/data-types/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      showToast({
        variant: "error",
        message: json?.error ?? "Errore durante l'aggiornamento",
      });
      return false;
    }
    return true;
  };

  // Persistenza vera e propria (create/edit), senza alcuna guardia: usata sia
  // dal submit diretto sia dalla conferma esplicita di disattivazione sotto.
  const persistDataType = async (
    values: DataTypeFormState
  ): Promise<boolean> => {
    const sidebarOrder =
      values.sidebarOrder.trim() === "" ? null : Number(values.sidebarOrder);
    // Invariante kind/assignability/cardinality/mandatory (T-035, estesa
    // T-047/T-048, T-0xx `mandatory`, applicata anche lato server): i valori
    // transitori dei select sono derivati dal `kind` selezionato, non
    // inviati grezzi.
    const { assignability, cardinality, mandatory } =
      computeAssignability(values);

    try {
      if (editing) {
        const ok = await patchDataType(editing.id, {
          name: values.name.trim(),
          description: values.description.trim() || null,
          // `kind` è inviato solo quando è stato effettivamente cambiato:
          // la route tratta la sua sola presenza nel body come richiesta di
          // cambio tipologia (guard "talent non cambia mai kind" +
          // "solo senza ReferenceData figlie"), quindi un salvataggio che
          // non tocca la Tipologia non deve farlo scattare.
          ...(values.kind !== editing.kind && { kind: values.kind }),
          cardinality,
          assignability,
          mandatory,
          renderAs: values.renderAs,
          sidebarShow: values.sidebarShow,
          sidebarOrder,
          icon: values.icon || null,
          visibility: values.visibility,
        });
        if (!ok) return false;
        showToast({ variant: "success", message: "Tipo di dato aggiornato" });
      } else {
        const response = await fetch(
          `/api/campaigns/${campaignSlug}/data-types`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: values.name.trim(),
              description: values.description.trim() || null,
              kind: values.kind,
              cardinality,
              assignability,
              mandatory,
              renderAs: values.renderAs,
              sidebarShow: values.sidebarShow,
              sidebarOrder,
              icon: values.icon || null,
              visibility: values.visibility,
            }),
          }
        );
        if (!response.ok) {
          const json = await response.json().catch(() => null);
          showToast({
            variant: "error",
            message: json?.error ?? "Errore durante la creazione",
          });
          return false;
        }
        showToast({ variant: "success", message: "Tipo di dato creato" });
      }
      await refetch();
      return true;
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: editing
          ? "Errore durante l'aggiornamento"
          : "Errore durante la creazione",
      });
      return false;
    }
  };

  // Entry point del form: intercetta la disattivazione distruttiva (T-035,
  // round 2) prima di persistere. `editing.cardinality` è lo stato reale sul
  // server (non il valore transitorio del form): se è già valorizzata, la
  // categoria è già in uso per assegnazioni — passare a `cardinality: null`
  // la renderebbe non assegnabile a nessuno, master incluso
  // (`NotAssignableDataTypeError`, controllato prima del branch master in
  // `characterData.service.ts`). Nota T-047/T-048: `assignability:
  // "masterOnly"` per `kind: "assignable"` NON azzera `cardinality` (resta
  // comunque assegnabile dal master) — non è quindi lo stesso caso e non
  // passa da qui; solo un cambio di kind verso `"generic"` azzera
  // `cardinality` (`computeAssignability`), sia per una categoria legacy già
  // `generic` con `cardinality` non-null residua, sia — ora che `kind` è
  // modificabile — per un cambio kind reale da assignable/origins a
  // generic (bloccato lato server con 409 se la categoria ha già
  // `ReferenceData` figlie, vedi route PATCH). Chiude il modal di
  // creazione/modifica (invece di lasciarlo aperto dietro la conferma:
  // eviterebbe due modal sovrapposti con le stesse etichette "ANNULLA") e
  // mostra una conferma esplicita al suo posto, invece di forzare
  // `cardinality: null` in silenzio.
  const handleSubmit = async (values: DataTypeFormState): Promise<boolean> => {
    const { cardinality } = computeAssignability(values);
    if (editing && editing.cardinality !== null && cardinality === null) {
      closeForm();
      setPendingDeactivation({ dataType: editing, values });
      return false;
    }
    return persistDataType(values);
  };

  const handleToggleSidebar = async (dt: DataTypeAdmin) => {
    setBusyId(dt.id);
    try {
      const nextShow = !dt.sidebarShow;
      const body: Record<string, unknown> = { sidebarShow: nextShow };
      // Prima promozione a sidebar: assegna in coda, così l'ordine resta
      // deterministico anche se `sidebarOrder` non è mai stato impostato.
      if (nextShow && dt.sidebarOrder === null) {
        body.sidebarOrder = sidebarVisible.length;
      }
      const ok = await patchDataType(dt.id, body);
      if (ok) await refetch();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'aggiornamento",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleMove = async (dt: DataTypeAdmin, direction: "up" | "down") => {
    const idx = sidebarVisible.findIndex(d => d.id === dt.id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sidebarVisible.length) return;

    setReordering(true);
    try {
      // Rinormalizza l'intero sottoinsieme "in sidebar" a interi
      // sequenziali 0..n-1 in base alla posizione corrente, scambiando le
      // due posizioni coinvolte: gestisce in modo deterministico anche i
      // `sidebarOrder` nulli o non consecutivi (es. la prima volta che si
      // riordina), non solo lo scambio tra i due elementi toccati.
      const targets = sidebarVisible
        .map((item, i) => ({
          item,
          order: i === idx ? targetIdx : i === targetIdx ? idx : i,
        }))
        .filter(({ item, order }) => item.sidebarOrder !== order);

      for (const { item, order } of targets) {
        const ok = await patchDataType(item.id, { sidebarOrder: order });
        if (!ok) {
          // Fallimento a metà sequenza: alcune PATCH possono essere già
          // andate a buon fine sul server. Riallinea comunque la UI allo
          // stato reale invece di lasciarla ferma alla vista pre-move
          // (il toast d'errore è già stato mostrato da `patchDataType`).
          await refetch();
          return;
        }
      }
      await refetch();
    } catch (err) {
      console.error(err);
      showToast({ variant: "error", message: "Errore durante il riordino" });
      // Anche qui: qualche PATCH potrebbe essere andata a buon fine prima
      // dell'eccezione. Riallinea la UI allo stato reale del server.
      await refetch();
    } finally {
      setReordering(false);
    }
  };

  return (
    <>
      <HeroPage
        title="Tipi di Dato"
        subtitle="Composizione dei dati di campagna e del pannello laterale"
        action={
          <Btn
            variant="bold"
            icon="add"
            label="Nuovo tipo di dato"
            onClick={openCreate}
          />
        }
      />

      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col p-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[60px] w-full mb-1" />
            ))
          ) : error ? (
            <ErrorCard onRetry={() => refetch()} />
          ) : sorted.length === 0 ? (
            <EmptyCard
              icon="category"
              title="Nessun tipo di dato"
              message="Crea il primo tipo di dato per iniziare a comporre il catalogo della campagna."
              action={
                <Btn
                  variant="bold"
                  icon="add"
                  label="Nuovo tipo di dato"
                  onClick={openCreate}
                />
              }
            />
          ) : (
            sorted.map(dt => {
              const visibleIdx = sidebarVisible.findIndex(d => d.id === dt.id);
              return (
                <DataTypeRow
                  key={dt.id}
                  dataType={dt}
                  canMoveUp={visibleIdx > 0}
                  canMoveDown={
                    visibleIdx !== -1 && visibleIdx < sidebarVisible.length - 1
                  }
                  busy={busyId === dt.id || reordering}
                  onEdit={() => openEdit(dt)}
                  onToggleSidebar={() => handleToggleSidebar(dt)}
                  onMove={direction => handleMove(dt, direction)}
                  onManageReferenceData={() => goToReferenceData(dt)}
                />
              );
            })
          )}
        </div>

        <ModalDataType
          open={formOpen}
          editing={editing}
          onClose={closeForm}
          onSubmit={handleSubmit}
          onDelete={
            editing
              ? () => {
                  closeForm();
                  setPendingDelete(editing);
                }
              : undefined
          }
        />

        <ModalDeleteDataType
          dataType={pendingDelete}
          campaignSlug={campaignSlug}
          onClose={() => setPendingDelete(null)}
          onDeleted={refetch}
        />

        <ModalDeactivateAssignability
          pending={pendingDeactivation}
          onClose={() => setPendingDeactivation(null)}
          onConfirm={persistDataType}
        />
      </Card>
    </>
  );
};

export default ManagerDataTypes;
