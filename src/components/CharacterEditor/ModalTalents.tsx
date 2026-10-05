"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DataVisibility } from "@prisma/client";
import ModalTalentActionConfirm from "./ModalTalentActionConfirm";
import BtnUpdatePointsXp from "./BtnUpdatePointsXp";
import Btn from "@/components/_core/Btn";
import Divider from "@/components/_core/Divider";
import Modal from "@/components/_core/Modal";
import { useToast } from "@/components/_core/Toast";
import { useApiAction } from "@/hooks/useApiAction";
import { EmptyCard } from "@/components/Feedback";
import TalentList, {
  TalentCategoryList,
  TalentCategoryUnlockToggle,
  TalentSearchBar,
  TalentViewToolbar,
  readTalentFlags,
  useTalentBrowser,
  type TalentAccordionEntry,
  type TalentCounts,
  type TalentRequirementEdge,
} from "@/components/TalentList";
import Badge from "@/components/_core/Badge";
import type { CharacterDataForSheet } from "@/lib/repositories";
import { characterTalentsQueryKey } from "@/lib/queries/characterTalents";

// `unlock: true` → POST (sblocca il talento per questo personaggio),
// `unlock: false` → DELETE (lo blocca di nuovo) — stesso endpoint
// `.../talents/unlocks`, verbo diverso invece di un PATCH con body, per
// restare RESTful sulla riga `CharacterTalentUnlock` (creazione/cancellazione
// di un'eccezione, non update di un campo).
async function patchTalentUnlock(
  campaignSlug: string,
  characterId: number,
  referenceDataId: number,
  unlock: boolean
): Promise<boolean> {
  const base = `/api/campaigns/${campaignSlug}/characters/${characterId}/talents/unlocks`;
  const response = unlock
    ? await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceDataId }),
      })
    : await fetch(`${base}/${referenceDataId}`, { method: "DELETE" });
  return response.ok;
}

interface IModalTalents {
  open: boolean;
  onClose: () => void;
  campaignSlug: string;
  characterId: number;
  viewingAsMaster: boolean;
  canEdit: boolean;
  isLoading?: boolean;
  acquiredTalents: CharacterDataForSheet[];
  entries: TalentAccordionEntry[];
  requirements: TalentRequirementEdge[];
  ownedReferenceDataIds: ReadonlySet<number>;
  // Talenti-catalogo `hidden` sbloccati per QUESTO personaggio (T-0xx,
  // occhio master): dal payload server di `getCharacterAcquirableTalents`,
  // già ristretto ai soli talenti (non serve altro filtro qui).
  unlockedReferenceDataIds: ReadonlySet<number>;
  draftCounts: TalentCounts;
  onAcquireDraft: (referenceDataId: number) => void;
  onReleaseDraft: (referenceDataId: number) => void;
  draftXpAvailable: number;
}

const ModalTalents = ({
  open,
  onClose,
  campaignSlug,
  characterId,
  viewingAsMaster,
  canEdit,
  isLoading = false,
  acquiredTalents,
  entries,
  requirements,
  ownedReferenceDataIds,
  unlockedReferenceDataIds,
  draftCounts,
  onAcquireDraft,
  onReleaseDraft,
  draftXpAvailable,
}: IModalTalents) => {
  const queryClient = useQueryClient();
  const invalidateTalentsQuery = React.useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: characterTalentsQueryKey(campaignSlug, characterId),
      }),
    [queryClient, campaignSlug, characterId]
  );

  const { pending: masterGranting, run: runGrant } = useApiAction();
  const [pendingMasterGrant, setPendingMasterGrant] =
    React.useState<TalentAccordionEntry | null>(null);
  const [onlyAffordable, setOnlyAffordable] = React.useState(false);
  const [onlyOwned, setOnlyOwned] = React.useState(false);

  // Rimozione di un talento già posseduto (ex `ModalTalentsAcquired`,
  // eliminato: stessa funzione qui, un'unica lista invece di due modali —
  // `ownedReferenceDataIds` (già disponibile, eager da
  // `characterDataGroups`) marca quali entry della lista unificata sotto
  // sono "possedute").
  const { pending: removing, run: runRemove } = useApiAction();
  const referenceDataIdToCharacterDataId = React.useMemo(
    () =>
      new Map(acquiredTalents.map(entry => [entry.referenceData.id, entry.id])),
    [acquiredTalents]
  );
  const [pendingRemove, setPendingRemove] =
    React.useState<TalentAccordionEntry | null>(null);

  const confirmRemoveTalent = React.useCallback(() => {
    if (!pendingRemove) return;
    const characterDataId = referenceDataIdToCharacterDataId.get(
      pendingRemove.id
    );
    if (!characterDataId) return;

    return runRemove(
      `/api/campaigns/${campaignSlug}/characters/${characterId}/data/${characterDataId}`,
      { method: "DELETE" },
      {
        errorMessage: "Errore durante la rimozione del talento",
        successMessage: `«${pendingRemove.name}» rimosso`,
        refresh: true,
        onSuccess: () => {
          setPendingRemove(null);
          void invalidateTalentsQuery();
        },
      }
    );
  }, [
    pendingRemove,
    characterId,
    campaignSlug,
    referenceDataIdToCharacterDataId,
    runRemove,
    invalidateTalentsQuery,
  ]);

  // Occhio "unlock" (T-0xx): `unlockedReferenceDataIds` arriva già dal
  // server (payload di `getCharacterAcquirableTalents`), niente da derivare
  // qui — solo lo stato pending e le due azioni (riga/categoria) che
  // chiamano `patchTalentUnlock`.
  const { showToast } = useToast();
  const router = useRouter();
  const [visibilityPendingIds, setVisibilityPendingIds] = React.useState<
    ReadonlySet<number>
  >(new Set());

  // POST/DELETE in parallelo (`Promise.all`, non una `useApiAction` per riga
  // — un singolo toast/refresh anche quando `targets` copre un'intera
  // categoria) sullo stesso endpoint `.../talents/unlocks`: nessun bisogno
  // di una route batch dedicata per un'azione master-only a basso volume (al
  // più poche decine di talenti per categoria).
  const applyUnlockChange = React.useCallback(
    async (referenceDataIds: number[], unlock: boolean) => {
      if (referenceDataIds.length === 0) return;
      setVisibilityPendingIds(prev => new Set([...prev, ...referenceDataIds]));
      try {
        const results = await Promise.all(
          referenceDataIds.map(id =>
            patchTalentUnlock(campaignSlug, characterId, id, unlock)
          )
        );
        const failed = results.filter(ok => !ok).length;
        if (failed === 0) {
          showToast({
            variant: "success",
            message:
              referenceDataIds.length === 1
                ? unlock
                  ? "Talento sbloccato per questo personaggio"
                  : "Talento bloccato di nuovo per questo personaggio"
                : unlock
                  ? "Talenti sbloccati per questo personaggio"
                  : "Talenti bloccati di nuovo per questo personaggio",
          });
        } else {
          showToast({
            variant: "error",
            message:
              failed === referenceDataIds.length
                ? "Errore durante il cambio di visibilità"
                : `${failed} talenti su ${referenceDataIds.length} non aggiornati`,
          });
        }
        router.refresh();
        await invalidateTalentsQuery();
      } finally {
        setVisibilityPendingIds(prev => {
          const next = new Set(prev);
          referenceDataIds.forEach(id => next.delete(id));
          return next;
        });
      }
    },
    [campaignSlug, characterId, router, showToast, invalidateTalentsQuery]
  );

  const handleToggleTalentUnlock = React.useCallback(
    (referenceDataId: number) => {
      void applyUnlockChange(
        [referenceDataId],
        !unlockedReferenceDataIds.has(referenceDataId)
      );
    },
    [unlockedReferenceDataIds, applyUnlockChange]
  );

  const handleToggleGroupUnlock = React.useCallback(
    (groupEntries: TalentAccordionEntry[]) => {
      const eligible = groupEntries.filter(
        entry =>
          entry.visibility === DataVisibility.hidden &&
          !ownedReferenceDataIds.has(entry.id)
      );
      if (eligible.length === 0) return;
      const anyLocked = eligible.some(
        entry => !unlockedReferenceDataIds.has(entry.id)
      );
      const targets = eligible
        .filter(entry => unlockedReferenceDataIds.has(entry.id) !== anyLocked)
        .map(entry => entry.id);
      void applyUnlockChange(targets, anyLocked);
    },
    [ownedReferenceDataIds, unlockedReferenceDataIds, applyUnlockChange]
  );

  // Solo i talenti apprendibili fuori dalla creazione del personaggio
  // possono comparire tra le azioni "Aggiungi"/"Concedi" — un talento
  // posseduto ma `creationOnly` resta comunque visibile (sotto, unito a
  // `ownedOnlyEntries`), solo senza quelle azioni. In master view il filtro
  // non si applica: il master deve vedere (e poter concedere) anche i
  // talenti `creationOnly` fuori dalla creazione del personaggio.
  //
  // Bug T-0xx: `entries` arriva dal server SEMPRE "vista master" (la route
  // valuta `isStaff` sul ruolo reale della sessione, non sa nulla del
  // toggle "player view" client-side) — include quindi anche i talenti
  // `hidden` non sbloccati per questo personaggio. In "player view"
  // (`!viewingAsMaster`, ma il master resta autenticato) li togliamo qui,
  // client-side: il master ha già legittimamente ricevuto questi dati (non
  // è un viewer non autorizzato a cui filtrarli lato server, è una preview),
  // stesso trattamento già riservato ai campi Anagrafica
  // (`CharacterEditorAnagraphic`, `entry.visibility === hidden ? viewingAsMaster && canEdit : true`).
  const learnableEntries = React.useMemo(() => {
    if (viewingAsMaster) return entries;
    return entries.filter(
      entry =>
        !readTalentFlags(entry.flags).creationOnly &&
        (entry.visibility !== DataVisibility.hidden ||
          unlockedReferenceDataIds.has(entry.id))
    );
  }, [entries, viewingAsMaster, unlockedReferenceDataIds]);

  // Id apprendibili/concedibili in questa sessione: governa quali righe
  // della lista unificata mostrano "Aggiungi"/"Concedi" (`TalentList.
  // acquirableIds`) — un talento posseduto e non ripetibile non è qui, resta
  // in lista solo col badge "Posseduto".
  const acquirableIds = React.useMemo(
    () => new Set(learnableEntries.map(entry => entry.id)),
    [learnableEntries]
  );

  // Talenti posseduti ma esclusi dal fetch "apprendibili" (server-side, non
  // ripetibili o `creationOnly`): vanno comunque uniti alla lista per
  // restare visibili col badge "Posseduto" invece di sparire.
  //
  // Stesso bug T-0xx di `learnableEntries` sopra, sul lato posseduti:
  // `acquiredTalents` arriva anch'esso "vista master" (server-side
  // `filterVisible` bypassato da `isStaff`, vedi `characterEditor.service.ts`)
  // — un talento che il master ha nascosto al giocatore
  // (`CharacterData.visibility: hidden`, occhio in Anagrafica/T-038) resta
  // quindi nella lista anche in "player view" se non filtrato qui.
  const ownedOnlyEntries = React.useMemo(() => {
    const learnableIds = new Set(entries.map(entry => entry.id));
    const seen = new Set<number>();
    const result: TalentAccordionEntry[] = [];
    for (const owned of acquiredTalents) {
      if (!viewingAsMaster && owned.visibility === DataVisibility.hidden) {
        continue;
      }
      const rd = owned.referenceData;
      if (learnableIds.has(rd.id) || seen.has(rd.id)) continue;
      seen.add(rd.id);
      result.push(rd);
    }
    return result;
  }, [acquiredTalents, entries, viewingAsMaster]);

  // Lista unica mostrata nel browser (categorie/ricerca): apprendibili +
  // posseduti-soltanto, così un talento appare una sola volta a prescindere
  // da quale dei due insiemi lo contiene (T-0xx: prima erano due modali
  // separati).
  const allEntries = React.useMemo(
    () => [...learnableEntries, ...ownedOnlyEntries],
    [learnableEntries, ownedOnlyEntries]
  );

  // Mappa id → motivo (mostrato come tooltip sul bottone "Aggiungi"
  // disabilitato) invece di un semplice Set, così la riga spiega perché non
  // è acquisibile invece di limitarsi a bloccare il click.
  const disabledAcquireIds = React.useMemo(() => {
    const owned = new Set([...ownedReferenceDataIds, ...draftCounts.keys()]);
    const disabled = new Map<number, string>();

    for (const entry of learnableEntries) {
      const requiresEdges = requirements.filter(
        edge => edge.definitionId === entry.id && edge.type === "requires"
      );

      const missingIndividual = requiresEdges.some(
        edge => edge.groupId == null && !owned.has(edge.requiredDefinitionId)
      );

      const groupedEdges = new Map<number, typeof requiresEdges>();
      for (const edge of requiresEdges) {
        if (edge.groupId == null) continue;
        const group = groupedEdges.get(edge.groupId) ?? [];
        group.push(edge);
        groupedEdges.set(edge.groupId, group);
      }
      const missingGroup = Array.from(groupedEdges.values()).some(
        group => !group.some(edge => owned.has(edge.requiredDefinitionId))
      );

      const blocked = requirements.some(
        edge =>
          edge.type === "blocks" &&
          ((edge.definitionId === entry.id &&
            owned.has(edge.requiredDefinitionId)) ||
            (edge.requiredDefinitionId === entry.id &&
              owned.has(edge.definitionId)))
      );

      if (blocked) {
        disabled.set(entry.id, "Incompatibile con un talento già posseduto");
      } else if (missingIndividual || missingGroup) {
        disabled.set(entry.id, "Mancano i requisiti richiesti");
      }
    }

    return disabled;
  }, [learnableEntries, requirements, ownedReferenceDataIds, draftCounts]);

  // Conteggio per definizione dai talenti già posseduti (una riga per
  // istanza in `acquiredTalents`, T-0xx): alimenta il badge "×N"/"N/max" e il
  // tetto `maxRepetitions` insieme a `draftCounts` (bozza non ancora
  // salvata) — la riga li somma per decidere se "Aggiungi" resta abilitato.
  const ownedTalentCounts = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const owned of acquiredTalents) {
      const id = owned.referenceData.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [acquiredTalents]);

  // Talenti mostrati nel browser con "Solo apprendibili" attivo: nasconde
  // chi non soddisfa i requisiti/è bloccato
  // (`disabledAcquireIds`, la stessa logica che disabilita "Aggiungi" riga
  // per riga) E chi costa più degli XP a disposizione — il costo
  // `undefined`/non numerico è considerato gratuito e resta sempre visibile.
  // Un talento già posseduto resta sempre visibile: il filtro riguarda solo
  // cosa si sta per acquisire, non quello che si ha già.
  const visibleEntries = React.useMemo(() => {
    if (onlyOwned) {
      return allEntries.filter(entry => ownedReferenceDataIds.has(entry.id));
    }
    if (onlyAffordable) {
      return allEntries.filter(entry => {
        if (ownedReferenceDataIds.has(entry.id)) return true;
        if (disabledAcquireIds.has(entry.id)) return false;
        const cost = readTalentFlags(entry.flags).cost;
        return typeof cost !== "number" || cost <= draftXpAvailable;
      });
    }
    return allEntries;
  }, [
    allEntries,
    onlyAffordable,
    onlyOwned,
    draftXpAvailable,
    disabledAcquireIds,
    ownedReferenceDataIds,
  ]);

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
  } = useTalentBrowser(visibleEntries);

  const handleToggleOnlyAffordable = () => {
    setOnlyAffordable(prev => !prev);
    setOnlyOwned(false);
  };
  const handleToggleOnlyOwned = () => {
    setOnlyOwned(prev => !prev);
    setOnlyAffordable(false);
  };

  const emptyBrowseMessage = isSearching
    ? "Affina la ricerca per trovare quello che cerchi"
    : onlyOwned
      ? "Non hai ancora appreso nessun talento."
      : onlyAffordable
        ? "Nessun talento è apprendibile ora: verifica requisiti e punti XP disponibili."
        : "Non ci sono talenti disponibili al momento.";

  const handleAcquire = (entry: TalentAccordionEntry) =>
    onAcquireDraft(entry.id);
  const handleRelease = (entry: TalentAccordionEntry) =>
    onReleaseDraft(entry.id);

  const confirmMasterGrant = React.useCallback(() => {
    if (!pendingMasterGrant) return;
    return runGrant(
      `/api/campaigns/${campaignSlug}/characters/${characterId}/data`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceDataId: pendingMasterGrant.id,
          freeOfCharge: true,
        }),
      },
      {
        errorMessage: "Errore durante la concessione del talento",
        successMessage: "Talento concesso",
        refresh: true,
        onSuccess: () => {
          setPendingMasterGrant(null);
          void invalidateTalentsQuery();
        },
      }
    );
  }, [
    campaignSlug,
    characterId,
    pendingMasterGrant,
    runGrant,
    invalidateTalentsQuery,
  ]);

  // Azioni riga per riga: `onAcquire`/`onMasterGrant` solo se il personaggio
  // è editabile (`canEdit`) — a differenza della lista in sé, che resta
  // sempre sfogliabile anche in sola lettura, come già i "Talenti acquisiti"
  // prima della fusione dei due modali. `TalentList.acquirableIds` filtra
  // ulteriormente riga per riga (un posseduto non ripetibile non ha né
  // "Aggiungi" né "Concedi", a prescindere da `canEdit`).
  const onAcquire = canEdit ? handleAcquire : undefined;
  const onRelease = canEdit ? handleRelease : undefined;
  const onMasterGrant =
    viewingAsMaster && canEdit
      ? (entry: TalentAccordionEntry) => setPendingMasterGrant(entry)
      : undefined;
  const onDeleteRequest =
    viewingAsMaster && canEdit
      ? (id: number) =>
          setPendingRemove(
            acquiredTalents.find(entry => entry.referenceData.id === id)
              ?.referenceData ?? null
          )
      : undefined;
  const onToggleVisibility =
    viewingAsMaster && canEdit ? handleToggleTalentUnlock : undefined;

  const body =
    allEntries.length === 0 ? (
      <EmptyCard
        className="w-full"
        icon="school"
        title="Nessun talento"
        message="Non ci sono talenti posseduti o disponibili da apprendere."
      />
    ) : (
      <div className="flex flex-col items-stretch justify-start h-full">
        {detailGroup ? (
          <>
            <div className="flex flex-wrap items-center gap-2 p-2">
              <Btn
                icon="arrow_back"
                label="Listati"
                onClick={backToCategories}
              />
              <Badge label={detailGroup.label} className="rounded px-4 py-2" />
              {onToggleVisibility && (
                <TalentCategoryUnlockToggle
                  entries={detailGroup.entries}
                  ownedReferenceDataIds={ownedReferenceDataIds}
                  unlockedReferenceDataIds={unlockedReferenceDataIds}
                  pendingIds={visibilityPendingIds}
                  onToggle={() => handleToggleGroupUnlock(detailGroup.entries)}
                />
              )}
              <div className="flex-1" />
              <Btn
                labelPosition
                icon={expandAll ? "expand_less" : "expand_more"}
                label={expandAll ? "Comprimi tutto" : "Espandi tutto"}
                selected={expandAll}
                onClick={toggleExpandAll}
                className="pr-[5px]"
              />
            </div>
            <Divider />
          </>
        ) : (
          <>
            {allEntries.length >= 10 && (
              <TalentSearchBar value={search} onChange={setSearch} />
            )}
            <TalentViewToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              isSearching={isSearching}
              expandAll={expandAll}
              onToggleExpandAll={toggleExpandAll}
              onlyAffordable={onlyAffordable}
              onToggleOnlyAffordable={handleToggleOnlyAffordable}
              onlyOwned={onlyOwned}
              onToggleOnlyOwned={handleToggleOnlyOwned}
            />
            <Divider />
          </>
        )}

        <div className="flex flex-col p-1 overflow-scroll flex-1">
          {detailGroup ? (
            <TalentList
              campaignSlug={campaignSlug}
              entries={detailGroup.entries}
              isMaster={viewingAsMaster}
              expandedId={expandedId}
              expandAll={expandAll}
              onToggleExpand={toggleExpand}
              onAcquire={onAcquire}
              onRelease={onRelease}
              draftCounts={draftCounts}
              acquirableIds={acquirableIds}
              disabledAcquireIds={disabledAcquireIds}
              onMasterGrant={onMasterGrant}
              masterGrantingId={
                pendingMasterGrant && masterGranting
                  ? pendingMasterGrant.id
                  : null
              }
              onDeleteRequest={onDeleteRequest}
              deletableIds={ownedReferenceDataIds}
              deletingId={pendingRemove && removing ? pendingRemove.id : null}
              ownedCounts={ownedTalentCounts}
              requirements={requirements}
              ownedReferenceDataIds={ownedReferenceDataIds}
              onToggleVisibility={onToggleVisibility}
              unlockedIds={unlockedReferenceDataIds}
              visibilityPendingIds={visibilityPendingIds}
            />
          ) : viewMode === "flat" || isSearching ? (
            groups.length === 0 ? (
              <EmptyCard
                className="w-full"
                icon="school"
                title="Nessun talento trovato"
                message={emptyBrowseMessage}
              />
            ) : (
              groups.map(group => {
                const collapsed = collapsedCategories.has(group.key);
                return (
                  <div key={group.key} className="flex flex-col">
                    <div className="flex items-center gap-1 mx-1.5 my-1">
                      <Btn
                        small
                        icon={collapsed ? "arrow_forward" : "filter_list"}
                        tooltip={
                          collapsed
                            ? "Mostra talenti della categoria"
                            : "Nascondi talenti della categoria"
                        }
                        onClick={() => toggleCategoryCollapsed(group.key)}
                      />
                      <Badge
                        label={group.label}
                        className="rounded px-4 py-2"
                      />
                      {onToggleVisibility && (
                        <TalentCategoryUnlockToggle
                          entries={group.entries}
                          ownedReferenceDataIds={ownedReferenceDataIds}
                          unlockedReferenceDataIds={unlockedReferenceDataIds}
                          pendingIds={visibilityPendingIds}
                          onToggle={() =>
                            handleToggleGroupUnlock(group.entries)
                          }
                        />
                      )}
                    </div>
                    <Divider className="mx-1 bg-primary" />
                    {!collapsed && (
                      <TalentList
                        campaignSlug={campaignSlug}
                        entries={group.entries}
                        isMaster={viewingAsMaster}
                        expandedId={expandedId}
                        expandAll={expandAll}
                        onToggleExpand={toggleExpand}
                        onAcquire={onAcquire}
                        onRelease={onRelease}
                        draftCounts={draftCounts}
                        acquirableIds={acquirableIds}
                        disabledAcquireIds={disabledAcquireIds}
                        onMasterGrant={onMasterGrant}
                        masterGrantingId={
                          pendingMasterGrant && masterGranting
                            ? pendingMasterGrant.id
                            : null
                        }
                        onDeleteRequest={onDeleteRequest}
                        deletableIds={ownedReferenceDataIds}
                        deletingId={
                          pendingRemove && removing ? pendingRemove.id : null
                        }
                        ownedCounts={ownedTalentCounts}
                        requirements={requirements}
                        ownedReferenceDataIds={ownedReferenceDataIds}
                        onToggleVisibility={onToggleVisibility}
                        unlockedIds={unlockedReferenceDataIds}
                        visibilityPendingIds={visibilityPendingIds}
                      />
                    )}
                  </div>
                );
              })
            )
          ) : groups.length === 0 ? (
            <EmptyCard
              className="w-full"
              icon="school"
              title="Nessun talento trovato"
              message={emptyBrowseMessage}
            />
          ) : (
            <TalentCategoryList
              groups={groups}
              onSelect={selectCategory}
              ownedReferenceDataIds={ownedReferenceDataIds}
              unlockedReferenceDataIds={unlockedReferenceDataIds}
              visibilityPendingIds={visibilityPendingIds}
              onToggleGroupVisibility={
                onToggleVisibility ? handleToggleGroupUnlock : undefined
              }
            />
          )}
        </div>
        <ModalTalentActionConfirm
          variant="grant"
          open={pendingMasterGrant !== null}
          talentName={pendingMasterGrant?.name ?? ""}
          submitting={masterGranting}
          onClose={() => setPendingMasterGrant(null)}
          onConfirm={() => void confirmMasterGrant()}
        />
        <ModalTalentActionConfirm
          variant="remove"
          open={pendingRemove !== null}
          talentName={pendingRemove?.name ?? ""}
          submitting={removing}
          onClose={() => setPendingRemove(null)}
          onConfirm={() => void confirmRemoveTalent()}
        />
      </div>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      loading={isLoading}
      titleClose
      title="Talenti"
      titleChildren={
        <BtnUpdatePointsXp
          characterId={characterId}
          value={draftXpAvailable}
          isMaster={viewingAsMaster}
        />
      }
      fullscreen
      contentClassName="p-0"
      content={body}
    />
  );
};

export default ModalTalents;
