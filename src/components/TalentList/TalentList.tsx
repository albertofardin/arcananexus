"use client";

import { DataVisibility } from "@prisma/client";
import {
  getTalentRepetitionStatus,
  readTalentFlags,
  type TalentCounts,
} from "./talentRepetition";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";
import FieldText from "@/components/_core/FieldText";
import Skeleton from "@/components/_core/Skeleton";
import Badge from "@/components/_core/Badge";
import { ErrorCard } from "@/components/Feedback";
import { useQueryDataRequirements } from "@/lib/queries/dataRequirements";
import { REQUIREMENT_TYPE_LABELS } from "@/lib/labels";
import Accordion from "@/components/_core/Accordion";
import Divider from "@/components/_core/Divider";
import { cn } from "@/lib/utils";

export { readTalentFlags, type TalentFlags } from "./talentRepetition";

export interface TalentAccordionEntry {
  id: number;
  name: string;
  description: string | null;
  visibility: DataVisibility;
  flags?: unknown;
}

export interface TalentRequirementEdge {
  definitionId: number;
  requiredDefinitionId: number;
  requiredDefinitionName: string;
  type: "requires" | "blocks";
  groupId?: number | null;
}

function getRequirementBadgeStyle(
  req: TalentRequirementEdge,
  ownedReferenceDataIds?: ReadonlySet<number>
): { icon: string; color: string } {
  if (req.type === "blocks") {
    return { icon: "block", color: "var(--fail)" };
  }
  if (ownedReferenceDataIds?.has(req.requiredDefinitionId)) {
    return { icon: "check", color: "var(--succ)" };
  }
  return { icon: "link", color: "var(--info)" };
}

interface ITalentRequirements {
  campaignSlug: string;
  referenceDataId: number;
  requirements?: TalentRequirementEdge[];
  ownedReferenceDataIds?: ReadonlySet<number>;
}

export const TalentRequirements = ({
  campaignSlug,
  referenceDataId,
  requirements,
  ownedReferenceDataIds,
}: ITalentRequirements) => {
  const preloaded = requirements !== undefined;
  const {
    data: graph,
    isLoading,
    error,
    refetch,
  } = useQueryDataRequirements(
    campaignSlug,
    preloaded ? null : referenceDataId
  );

  const outgoing: TalentRequirementEdge[] = preloaded
    ? requirements.filter(edge => edge.definitionId === referenceDataId)
    : // Solo `requires`/`blocks`: l'albero talenti (T-050) non mostra
      // `visibleWith`/`grants`, editor admin non display di gioco — vedi
      // `TalentRequirementEdge.type`.
      (graph?.requires ?? [])
        .filter(
          (edge): edge is typeof edge & { type: "requires" | "blocks" } =>
            edge.type === "requires" || edge.type === "blocks"
        )
        .map(edge => ({
          definitionId: edge.definitionId,
          requiredDefinitionId: edge.requiredDefinitionId,
          requiredDefinitionName: edge.requiredDefinition.name,
          type: edge.type,
          groupId: edge.groupId,
        }));

  if (!preloaded) {
    if (isLoading) return <Skeleton className="mx-2 h-[24px]" />;
    if (error) return <ErrorCard onRetry={() => refetch()} />;
  }

  if (outgoing.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {outgoing.map((req, index) => {
        const { icon, color } = getRequirementBadgeStyle(
          req,
          ownedReferenceDataIds
        );
        return (
          <Badge
            key={`${req.requiredDefinitionId}-${req.type}-${index}`}
            icon={icon}
            label={`${REQUIREMENT_TYPE_LABELS[req.type]}: ${req.requiredDefinitionName}`}
            color={color}
          />
        );
      })}
    </div>
  );
};

export interface ITalentAccordionRow {
  campaignSlug?: string;
  entry: TalentAccordionEntry;
  isMaster: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit?: () => void;
  onDeleteRequest?: () => void;
  deleting?: boolean;
  onAcquire?: () => void;
  // Rimuove UNA selezione ancora in bozza (mai un'istanza già posseduta,
  // quella passa dal flusso `onDeleteRequest`/conferma): abilitato solo
  // quando `draftCount > 0`.
  onRelease?: () => void;
  // Volte già possedute (persistite) e volte ancora in bozza (non salvate):
  // separati invece di un unico "acquisito sì/no" perché un ripetibile può
  // avere entrambi >0 insieme, e solo la quota in bozza è annullabile da
  // `onRelease`.
  ownedCount?: number;
  draftCount?: number;
  acquireDisabled?: boolean;
  acquireDisabledReason?: string;
  // Talento conferito gratuitamente da un'altra scelta (arco `grants`,
  // T-050, es. razza → talento): sempre selezionato, non rimovibile né
  // ripetibile da qui, e senza costo XP.
  locked?: boolean;
  onMasterGrant?: () => void;
  masterGranting?: boolean;
  requirements?: TalentRequirementEdge[];
  ownedReferenceDataIds?: ReadonlySet<number>;
  // Occhio "unlock" (T-0xx): solo su una riga di catalogo `visibility:
  // hidden` non ancora posseduta, il master sblocca/blocca di nuovo il
  // talento per QUESTO personaggio (`CharacterTalentUnlock`, eccezione
  // per-personaggio — non tocca `ReferenceData.visibility`, che resta
  // campagna-wide). Il giocatore dovrà comunque "Aggiungere" e pagare XP.
  onToggleVisibility?: () => void;
  visibilityUnlocked?: boolean;
  visibilityPending?: boolean;
  // Numero mostrato come badge sulla riga (Report Personaggi: quanti
  // personaggi hanno il talento). Omesso: nessun badge.
  count?: number;
}

export const TalentAccordionRow = ({
  campaignSlug,
  entry,
  isMaster,
  expanded,
  onToggleExpand,
  onEdit,
  onDeleteRequest,
  deleting,
  onAcquire,
  onRelease,
  ownedCount = 0,
  draftCount = 0,
  acquireDisabled,
  acquireDisabledReason,
  locked,
  onMasterGrant,
  masterGranting,
  requirements,
  ownedReferenceDataIds,
  onToggleVisibility,
  visibilityUnlocked,
  visibilityPending,
  count,
}: ITalentAccordionRow) => {
  const flags = readTalentFlags(entry.flags);
  const owned = ownedCount > 0;
  const totalCount = ownedCount + draftCount;
  const repetition = getTalentRepetitionStatus(flags, totalCount);

  return (
    <>
      <Accordion
        title={entry.name}
        titleSize={1}
        open={expanded}
        onToggle={onToggleExpand}
        className="border-0 rounded"
        titleIcon={owned ? "radio_button_checked" : "sparkle"}
        titleIconClassName={owned ? "text-succ" : undefined}
        buttonClassName="rounded hover:bg-accent min-h-[46px]"
        buttonChildren={
          // mobile: le azioni vanno a capo invece di uscire dalla Card
          <div className="flex max-w-[60%] flex-wrap items-center justify-end gap-x-3 gap-y-1 sm:max-w-none">
            {count !== undefined && (
              <Badge icon="groups" label={String(count)} tooltip="Personaggi" />
            )}
            {locked ? (
              <Btn
                small
                color="var(--succ)"
                icon="lock"
                label="Concesso"
                selected
                disabled
                tooltip="Conferito gratuitamente da un'altra tua scelta"
              />
            ) : (
              onAcquire &&
              (flags.repeatable ? (
                <div className="flex items-center rounded bg-[color-mix(in_srgb,var(--info)_10%,#ffffff)]">
                  {totalCount > 0 && (
                    <>
                      {draftCount !== 0 && (
                        <Btn
                          small
                          icon="remove"
                          onClick={event => {
                            event.stopPropagation();
                            onRelease?.();
                          }}
                        />
                      )}
                      <Text
                        className="px-3 min-h-[28px] flex items-center"
                        size={0}
                        children={repetition.badgeLabel ?? `×${totalCount}`}
                      />
                    </>
                  )}
                  {repetition.canAcquireMore && !acquireDisabled && (
                    <Btn
                      small
                      icon="add"
                      label={totalCount > 0 ? "" : "Aggiungi"}
                      tooltip={
                        acquireDisabled
                          ? acquireDisabledReason
                          : repetition.atLimit
                            ? "Hai raggiunto il numero massimo di apprendimenti"
                            : undefined
                      }
                      onClick={event => {
                        event.stopPropagation();
                        onAcquire();
                      }}
                    />
                  )}
                </div>
              ) : (
                <Btn
                  small
                  color="var(--succ)"
                  icon={totalCount > 0 ? "check" : "add"}
                  label={totalCount > 0 ? "Selezionato" : "Aggiungi"}
                  selected={totalCount > 0}
                  disabled={totalCount === 0 && acquireDisabled}
                  tooltip={
                    totalCount === 0 && acquireDisabled
                      ? acquireDisabledReason
                      : undefined
                  }
                  onClick={event => {
                    event.stopPropagation();
                    if (totalCount > 0) onRelease?.();
                    else onAcquire();
                  }}
                />
              ))
            )}
            {owned && (
              <Badge color="var(--succ)" label="Appreso" icon="check" />
            )}
            {locked ? (
              <Badge label="Gratis" color="var(--succ)" />
            ) : typeof flags.cost === "number" ? (
              <Badge
                label={`${flags.cost} XP`}
                color="var(--button)"
                background={!owned}
              />
            ) : null}
            {onMasterGrant && (
              <Btn
                small
                icon="gift_card"
                tooltip={masterGranting ? "Concedo…" : "Concedi"}
                disabled={masterGranting || !repetition.canAcquireMore}
                onClick={event => {
                  event.stopPropagation();
                  onMasterGrant();
                }}
              />
            )}
            {onEdit && (
              <Btn small icon="edit" tooltip="Modifica" onClick={onEdit} />
            )}
            {onToggleVisibility && (
              <Btn
                small
                icon={visibilityUnlocked ? "visibility" : "visibility_off"}
                tooltip={
                  visibilityUnlocked
                    ? "Blocca di nuovo per questo personaggio"
                    : "Sblocca per questo personaggio"
                }
                disabled={visibilityPending}
                onClick={event => {
                  event.stopPropagation();
                  onToggleVisibility();
                }}
              />
            )}
            {onDeleteRequest && (
              <Btn
                small
                icon="delete"
                tooltip="Rimuovi"
                color="var(--fail)"
                disabled={deleting}
                onClick={onDeleteRequest}
              />
            )}
          </div>
        }
      >
        <div className="flex flex-col w-full gap-2">
          {(flags.repeatable || flags.creationOnly) && (
            <div className="mx-2 flex flex-wrap gap-1.5">
              {flags.repeatable && <Badge label="Ripetibile" icon="repeat" />}
              {flags.creationOnly && (
                <Badge label="Solo in creazione" icon="flag" disabled />
              )}
            </div>
          )}
          {campaignSlug && (isMaster || requirements !== undefined) && (
            <TalentRequirements
              campaignSlug={campaignSlug}
              referenceDataId={entry.id}
              requirements={requirements}
              ownedReferenceDataIds={ownedReferenceDataIds}
            />
          )}
          <FieldText
            className="border-0"
            value={entry.description || "- Nessun contenuto disponibile -"}
            multiline
            disabled
          />
        </div>
      </Accordion>
      <Divider className="last:hidden mx-2" />
    </>
  );
};

export interface ITalentList {
  className?: string;
  campaignSlug?: string;
  entries: TalentAccordionEntry[];
  isMaster: boolean;
  expandedId: number | null;
  // Forza tutte le righe aperte (vista "Espandi tutto"), a prescindere da
  // `expandedId`.
  expandAll?: boolean;
  onToggleExpand: (id: number) => void;
  onEdit?: (entry: TalentAccordionEntry) => void;
  onDeleteRequest?: (id: number) => void;
  deletingId?: number | null;
  onAcquire?: (entry: TalentAccordionEntry) => void;
  // Rimuove una selezione ancora in bozza (mai un'istanza già posseduta).
  onRelease?: (entry: TalentAccordionEntry) => void;
  // Volte selezionate in questa sessione, non ancora salvate (era
  // `acquiredIds`, un `Set`: ora un conteggio per riga, per i talenti
  // ripetibili con più di una selezione in corso).
  draftCounts?: TalentCounts;
  disabledAcquireIds?: ReadonlyMap<number, string>;
  // Id dei talenti conferiti gratuitamente da un'altra scelta (arco
  // `grants`): righe sempre selezionate e non rimovibili, vedi
  // `ITalentAccordionRow.locked`.
  lockedIds?: ReadonlySet<number>;
  onMasterGrant?: (entry: TalentAccordionEntry) => void;
  masterGrantingId?: number | null;
  requirements?: TalentRequirementEdge[];
  ownedReferenceDataIds?: ReadonlySet<number>;
  // Badge "Posseduto" per riga (T-0xx, lista unificata posseduti+apprendibili
  // di `ModalTalentsLearn`). Omesso: nessuna riga mostra il badge, come
  // prima — `ManagerDataTalents` non lo passa. Era `ownedIds` (`Set`): ora un
  // conteggio, per mostrare quante volte un ripetibile è già posseduto.
  ownedCounts?: TalentCounts;
  // Se presente, `onAcquire`/`onMasterGrant` si applicano SOLO alle entry
  // il cui id compare qui (es. un talento già posseduto e non ripetibile
  // resta visibile in lista ma senza pulsante "Aggiungi"/"Concedi").
  // Omesso: nessun filtro, comportamento identico a prima.
  acquirableIds?: ReadonlySet<number>;
  // Stessa idea di `acquirableIds` ma per `onDeleteRequest`: omesso, nessun
  // filtro (`ManagerDataTalents` elimina la voce di catalogo da qualunque
  // riga, non solo quelle "possedute").
  deletableIds?: ReadonlySet<number>;
  // Occhio "unlock" per riga (T-0xx): mostrato solo sulle righe di catalogo
  // `visibility: hidden` NON in `ownedIds` (un talento già posseduto è già
  // visibile al proprietario — niente da sbloccare — e uno con visibilità
  // `visible` è già visibile a tutta la campagna). `id` passato è sempre il
  // `referenceData.id` dell'entry, come per tutte le altre callback di
  // questa lista. `unlockedIds` marca quali delle righe idonee sono
  // attualmente sbloccate per QUESTO personaggio (icona/verso del toggle).
  onToggleVisibility?: (id: number) => void;
  unlockedIds?: ReadonlySet<number>;
  visibilityPendingIds?: ReadonlySet<number>;
  // Badge numerico per riga, per `entry.id` (vedi `ITalentAccordionRow.count`).
  counts?: ReadonlyMap<number, number>;
}

export const TalentList = ({
  className,
  campaignSlug,
  entries,
  isMaster,
  expandedId,
  expandAll,
  onToggleExpand,
  onEdit,
  onDeleteRequest,
  deletingId,
  onAcquire,
  onRelease,
  draftCounts,
  disabledAcquireIds,
  lockedIds,
  onMasterGrant,
  masterGrantingId,
  requirements,
  ownedReferenceDataIds,
  ownedCounts,
  acquirableIds,
  deletableIds,
  onToggleVisibility,
  unlockedIds,
  visibilityPendingIds,
  counts,
}: ITalentList) => (
  <div className={cn("flex flex-col", className)}>
    {entries.map(entry => {
      const acquirable = !acquirableIds || acquirableIds.has(entry.id);
      const deletable = !deletableIds || deletableIds.has(entry.id);
      const ownedCount = ownedCounts?.get(entry.id) ?? 0;
      const draftCount = draftCounts?.get(entry.id) ?? 0;
      const unlockEligible =
        entry.visibility === DataVisibility.hidden && ownedCount === 0;
      return (
        <TalentAccordionRow
          key={entry.id}
          campaignSlug={campaignSlug}
          entry={entry}
          isMaster={isMaster}
          expanded={expandAll || expandedId === entry.id}
          onToggleExpand={() => onToggleExpand(entry.id)}
          onEdit={onEdit ? () => onEdit(entry) : undefined}
          onDeleteRequest={
            onDeleteRequest && deletable
              ? () => onDeleteRequest(entry.id)
              : undefined
          }
          deleting={deletingId === entry.id}
          onAcquire={
            onAcquire && acquirable ? () => onAcquire(entry) : undefined
          }
          onRelease={onRelease ? () => onRelease(entry) : undefined}
          ownedCount={ownedCount}
          draftCount={draftCount}
          acquireDisabled={disabledAcquireIds?.has(entry.id) ?? false}
          acquireDisabledReason={disabledAcquireIds?.get(entry.id)}
          locked={lockedIds?.has(entry.id) ?? false}
          onMasterGrant={
            onMasterGrant && acquirable ? () => onMasterGrant(entry) : undefined
          }
          masterGranting={masterGrantingId === entry.id}
          requirements={requirements}
          ownedReferenceDataIds={ownedReferenceDataIds}
          onToggleVisibility={
            onToggleVisibility && unlockEligible
              ? () => onToggleVisibility(entry.id)
              : undefined
          }
          visibilityUnlocked={unlockedIds?.has(entry.id) ?? false}
          visibilityPending={visibilityPendingIds?.has(entry.id) ?? false}
          count={counts?.get(entry.id)}
        />
      );
    })}
  </div>
);

export default TalentList;
