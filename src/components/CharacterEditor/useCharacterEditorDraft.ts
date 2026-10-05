"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataCardinality, DataTypeKind, DataVisibility } from "@prisma/client";
import type {
  CharacterDataGroup,
  CharacterEditorValue,
  CharacterXpBalance,
} from "./CharacterEditor";
import { useToast } from "@/components/_core/Toast";
import {
  getCharacterStatus,
  type CharacterStatus,
} from "@/components/BadgeCharacterStatus";
import {
  decrementTalentCount,
  incrementTalentCount,
  sumTalentCost,
  totalTalentCount,
  type TalentAccordionEntry,
  type TalentCounts,
  type TalentRequirementEdge,
} from "@/components/TalentList";
import { FT_PROGRESS } from "@/lib/features/featuresName";
import { sortTalentDraftIds } from "@/lib/features/talentDraftOrder";
import {
  mapAcquireErrorMessage,
  type ApiErrorBody,
} from "@/lib/apiErrorMessage";

const DATE_FIELDS = ["approvalDate", "deathDate", "parkDate"] as const;
type DateField = (typeof DATE_FIELDS)[number];

const isDateField = (key: keyof CharacterEditorValue): key is DateField =>
  (DATE_FIELDS as readonly string[]).includes(key);

// Stato "origini" (razza, fazione, e ogni altro `DataType` non-talento) della
// scheda PG: draft locale al pari di `value`/`savedSnapshot` sotto, così le
// modifiche di `FieldEditorData` (in `CharacterEditorAnagraphic`) restano in
// sospeso finché non si preme "Salva" sulla `SaveBar`, invece di scrivere
// subito sul server ad ogni selezione.
interface OriginEntryRef {
  characterDataId: number;
  referenceDataId: number;
}
type OriginsEntryMap = Record<number, OriginEntryRef[]>;
type OriginsSelection = Record<number, number[]>;
// Visibilità scelta dal master per una nuova assegnazione ancora in bozza,
// prima ancora che esista una `CharacterData` da poter rivelare/nascondere
// con l'icona occhio (T-0xx): sovrascrive `DataType.visibility` solo per il
// prossimo `toAdd` di quel `dataTypeId` in `saveOriginsDiff` sotto. Una
// entry già salvata resta invece sul percorso PATCH immediato esistente
// (`CharacterDataVisibilityToggle`), non passa da qui.
type OriginsVisibilityDraft = Record<number, DataVisibility>;

function buildOriginsEntryMap(groups: CharacterDataGroup[]): OriginsEntryMap {
  const map: OriginsEntryMap = {};
  for (const group of groups) {
    if (group.dataType.kind === DataTypeKind.talent) continue;
    map[group.dataType.id] = group.entries.map(entry => ({
      characterDataId: entry.id,
      referenceDataId: entry.referenceData.id,
    }));
  }
  return map;
}

function selectionFromEntryMap(map: OriginsEntryMap): OriginsSelection {
  const selection: OriginsSelection = {};
  for (const [dataTypeId, entries] of Object.entries(map)) {
    selection[Number(dataTypeId)] = entries.map(entry => entry.referenceDataId);
  }
  return selection;
}

function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(id => setB.has(id));
}

function originsAreDirty(
  current: OriginsSelection,
  saved: OriginsSelection
): boolean {
  const dataTypeIds = new Set([
    ...Object.keys(current).map(Number),
    ...Object.keys(saved).map(Number),
  ]);
  for (const dataTypeId of dataTypeIds) {
    if (!sameIds(current[dataTypeId] ?? [], saved[dataTypeId] ?? []))
      return true;
  }
  return false;
}

// Errore di `saveTalentDraft`: porta `anySucceeded` così `handleSave` sa se
// deve fare un `router.refresh()` anche sul percorso di fallimento (item
// precedenti del batch già assegnati lato server prima di questo errore).
class TalentDraftSaveError extends Error {
  constructor(
    message: string,
    readonly anySucceeded: boolean
  ) {
    super(message);
    this.name = "TalentDraftSaveError";
  }
}

interface UseCharacterEditorDraftParams {
  characterId?: number;
  campaignSlug?: string;
  initial: CharacterEditorValue;
  isMaster: boolean;
  viewingAsMaster: boolean;
  isOwner: boolean;
  characterDataGroups: CharacterDataGroup[];
  acquirableTalents: TalentAccordionEntry[];
  talentRequirements: TalentRequirementEdge[];
  ownedReferenceDataIds: number[];
  xpBalance: CharacterXpBalance | null;
}

// Stato e logica di salvataggio della bozza della scheda personaggio: campi
// testo/date, origini (razza/fazione/...) e talenti in apprendimento restano
// tutti in sospeso finché non si preme "Salva" sulla `SaveBar` di
// `CharacterEditor`, che è il solo consumer di questo hook.
export function useCharacterEditorDraft({
  characterId,
  campaignSlug,
  initial,
  isMaster,
  viewingAsMaster,
  isOwner,
  characterDataGroups,
  acquirableTalents,
  talentRequirements,
  ownedReferenceDataIds,
  xpBalance,
}: UseCharacterEditorDraftParams) {
  const { showToast } = useToast();
  const router = useRouter();

  const [value, setValue] = React.useState<CharacterEditorValue>(initial);
  const [savedSnapshot, setSavedSnapshot] =
    React.useState<CharacterEditorValue>(initial);
  const [saving, setSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const [originsEntryMap, setOriginsEntryMap] = React.useState<OriginsEntryMap>(
    () => buildOriginsEntryMap(characterDataGroups)
  );
  const [originsSelection, setOriginsSelection] =
    React.useState<OriginsSelection>(() =>
      selectionFromEntryMap(originsEntryMap)
    );
  const [savedOriginsSelection, setSavedOriginsSelection] =
    React.useState<OriginsSelection>(originsSelection);
  const [originsVisibilityDraft, setOriginsVisibilityDraft] =
    React.useState<OriginsVisibilityDraft>({});

  const patchOriginVisibility = React.useCallback(
    (dataTypeId: number, visibility: DataVisibility) =>
      setOriginsVisibilityDraft(prev => ({
        ...prev,
        [dataTypeId]: visibility,
      })),
    []
  );

  // Cardinalità per `DataType` (usata solo da `saveOriginsDiff` sotto, per
  // capire quando una sostituzione `single` rende ridondante — e quindi
  // dannosa, 404 — una DELETE esplicita sulla entry precedente).
  const originsCardinalityById = React.useMemo(() => {
    const map = new Map<number, DataCardinality | null>();
    for (const group of characterDataGroups) {
      map.set(group.dataType.id, group.dataType.cardinality);
    }
    return map;
  }, [characterDataGroups]);

  const ownedReferenceDataIdsSet = React.useMemo(
    () => new Set(ownedReferenceDataIds),
    [ownedReferenceDataIds]
  );
  const [talentDraftCounts, setTalentDraftCounts] =
    React.useState<TalentCounts>(() => new Map());

  const incrementTalentDraft = React.useCallback((referenceDataId: number) => {
    setTalentDraftCounts(prev => incrementTalentCount(prev, referenceDataId));
  }, []);

  const decrementTalentDraft = React.useCallback((referenceDataId: number) => {
    setTalentDraftCounts(prev => decrementTalentCount(prev, referenceDataId));
  }, []);

  // Costo XP totale della bozza: sottratto dal saldo disponibile per
  // l'anteprima "in rosso" — a differenza dei requisiti (bloccanti, gate su
  // `disabledAcquireIds` in `ModalTalentsLearn`), l'XP NON blocca l'aggiunta
  // alla bozza, solo il salvataggio (guard in `handleSave` sotto).
  const draftTalentsCost = React.useMemo(
    () => sumTalentCost(acquirableTalents, talentDraftCounts),
    [acquirableTalents, talentDraftCounts]
  );

  const draftTalentsCount = React.useMemo(
    () => totalTalentCount(talentDraftCounts),
    [talentDraftCounts]
  );

  const draftXpAvailable = (xpBalance?.available ?? 0) - draftTalentsCost;
  const talentsXpNegative = draftTalentsCount > 0 && draftXpAvailable < 0;

  const dirty = React.useMemo(
    () =>
      JSON.stringify(value) !== JSON.stringify(savedSnapshot) ||
      originsAreDirty(originsSelection, savedOriginsSelection) ||
      draftTalentsCount > 0,
    [
      value,
      savedSnapshot,
      originsSelection,
      savedOriginsSelection,
      draftTalentsCount,
    ]
  );

  const patch = React.useCallback(
    (next: Partial<CharacterEditorValue>) =>
      setValue(prev => ({ ...prev, ...next })),
    []
  );

  const patchOriginSelection = React.useCallback(
    (dataTypeId: number, referenceDataIds: number[]) =>
      setOriginsSelection(prev => ({
        ...prev,
        [dataTypeId]: referenceDataIds,
      })),
    []
  );

  const status = React.useMemo(
    () =>
      getCharacterStatus({
        deathDate: value.deathDate ? new Date(value.deathDate) : null,
        parkDate: value.parkDate ? new Date(value.parkDate) : null,
        approvalDate: value.approvalDate ? new Date(value.approvalDate) : null,
      }),
    [value.deathDate, value.parkDate, value.approvalDate]
  );

  // Il master (reale, o supporter sul proprio personaggio: vedi
  // `resolveIsMaster` in `characterEditor.service.ts`) può sempre modificare
  // la scheda; il proprietario non-master solo quando il personaggio è
  // "Attivo" (status "approved"). Chi non è né master né proprietario (es.
  // un supporter che guarda la scheda di un altro giocatore) resta sempre in
  // sola lettura, a prescindere dallo status.
  //
  // Con la Master View disattivata il master deve vedere (ed editare) la
  // scheda esattamente come la vedrebbe il proprietario reale (T-0xx) —
  // anche su un personaggio che non è il suo, altrimenti "Player View" su un
  // PG altrui degrada a semplice sola-lettura invece di essere una vera
  // anteprima (i campi self-assign/"Note giocatore" restavano disabilitati
  // solo perché `isOwner` guarda la sessione reale del master, non quella
  // del proprietario). `isPreviewingAsPlayer` sostituisce quindi `isOwner`
  // in questo calcolo quando il viewer è master con la Master View spenta:
  // la scrittura resta comunque sempre autorizzata lato server come
  // concessione master (route `.../data`, `isMasterOrAbove`), qui si
  // decide solo cosa mostrare come editabile in anteprima.
  const isPreviewingAsPlayer = isMaster && !viewingAsMaster;
  const canEdit =
    viewingAsMaster ||
    ((isOwner || isPreviewingAsPlayer) && status === "approved");

  // Lo stato deriva dalle date (dead > parked > approved > review):
  // selezionarne uno imposta/azzera le date coerentemente.
  const handleStatusChange = React.useCallback((next: string | number) => {
    const today = new Date().toISOString().slice(0, 10);
    setValue(prev => {
      switch (next as CharacterStatus) {
        case "review":
          return { ...prev, approvalDate: "", parkDate: "", deathDate: "" };
        case "approved":
          return {
            ...prev,
            approvalDate: prev.approvalDate || today,
            parkDate: "",
            deathDate: "",
          };
        case "parked":
          return { ...prev, parkDate: prev.parkDate || today, deathDate: "" };
        case "dead":
          return { ...prev, deathDate: prev.deathDate || today };
        default:
          return prev;
      }
    });
  }, []);

  // Applica il diff fra `originsSelection` (draft) e `savedOriginsSelection`
  // per ogni `DataType` cambiato: aggiunte via POST (assegnazione, riusata
  // sia da `single` che da `multi`), rimozioni via la DELETE
  // `.../data/[characterDataId]` — non esiste una singola chiamata che
  // "sostituisca l'insieme", quindi il diff va calcolato lato client.
  // Ritorna la mappa aggiornata (con i nuovi `characterDataId` restituiti
  // dalle POST) così il chiamante può aggiornare lo stato "salvato" senza
  // dover attendere il `router.refresh()`.
  const saveOriginsDiff =
    React.useCallback(async (): Promise<OriginsEntryMap> => {
      const nextEntryMap: OriginsEntryMap = { ...originsEntryMap };
      const dataTypeIds = new Set([
        ...Object.keys(originsSelection).map(Number),
        ...Object.keys(savedOriginsSelection).map(Number),
      ]);

      for (const dataTypeId of dataTypeIds) {
        const current = originsSelection[dataTypeId] ?? [];
        const saved = savedOriginsSelection[dataTypeId] ?? [];
        if (sameIds(current, saved)) continue;

        const savedEntries = originsEntryMap[dataTypeId] ?? [];
        const toAdd = current.filter(id => !saved.includes(id));
        // Cardinalità `single`: il POST sotto sostituisce SEMPRE l'intera
        // assegnazione esistente per questo `DataType` lato server
        // (`deleteCharacterDataByDataType`, a prescindere dal valore
        // precedente) — quando c'è un `toAdd` la entry vecchia è quindi già
        // sparita prima ancora della DELETE esplicita sotto, che altrimenti
        // fallirebbe con 404 (o 403 per un self-assign giocatore, la DELETE
        // è riservata al master). La si salta del tutto in quel caso.
        const cardinality = originsCardinalityById.get(dataTypeId);
        const singleReplaced =
          cardinality === DataCardinality.single && toAdd.length > 0;
        const toRemove = singleReplaced
          ? []
          : savedEntries.filter(
              entry => !current.includes(entry.referenceDataId)
            );

        // Visibilità esplicita scelta dal master prima ancora di salvare
        // (icona occhio mostrata anche a campo vuoto, T-0xx): se non toccata
        // resta `undefined`, e la route usa il default di `DataType.visibility`
        // (vedi `resolveAssignmentVisibility`).
        const explicitVisibility = originsVisibilityDraft[dataTypeId];

        const added = await Promise.all(
          toAdd.map(async referenceDataId => {
            const response = await fetch(
              `/api/campaigns/${campaignSlug}/characters/${characterId}/data`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  referenceDataId,
                  ...(explicitVisibility && { visibility: explicitVisibility }),
                }),
              }
            );
            if (!response.ok) {
              const json = await response.json().catch(() => null);
              throw new Error(
                json?.error ?? "Errore durante il salvataggio delle origini"
              );
            }
            const result = await response.json();
            return {
              characterDataId: result.characterData.id as number,
              referenceDataId,
            };
          })
        );

        await Promise.all(
          toRemove.map(async entry => {
            const response = await fetch(
              `/api/campaigns/${campaignSlug}/characters/${characterId}/data/${entry.characterDataId}`,
              { method: "DELETE" }
            );
            if (!response.ok) {
              const json = await response.json().catch(() => null);
              throw new Error(
                json?.error ?? "Errore durante il salvataggio delle origini"
              );
            }
          })
        );

        if (singleReplaced) {
          // Le `savedEntries` precedenti sono già sparite lato server
          // (sostituite dal POST sopra): non vanno riportate nella mappa,
          // a differenza del ramo sotto dove è la DELETE esplicita a
          // determinare cosa è stato rimosso.
          nextEntryMap[dataTypeId] = added;
        } else {
          const removedIds = new Set(
            toRemove.map(entry => entry.characterDataId)
          );
          nextEntryMap[dataTypeId] = [
            ...savedEntries.filter(
              entry => !removedIds.has(entry.characterDataId)
            ),
            ...added,
          ];
        }
      }

      return nextEntryMap;
    }, [
      campaignSlug,
      characterId,
      originsCardinalityById,
      originsEntryMap,
      originsSelection,
      originsVisibilityDraft,
      savedOriginsSelection,
    ]);

  // Sottomette la bozza talenti in ordine topologico rispetto a
  // `talentRequirements` (`sortTalentDraftIds`, client-side: l'endpoint
  // `.../actions` non è transazionale sull'intero batch come la creazione
  // PG), un POST alla volta verso lo stesso endpoint usato per
  // l'acquisizione immediata — ogni acquisizione ha sempre effetto
  // immediato, deciso lato server dentro l'handler. Rimuove ogni id dalla bozza SUBITO
  // dopo il suo POST riuscito (non in blocco a fine batch): se un item
  // successivo fallisce, i precedenti restano comunque rimossi dalla bozza
  // — a differenza del PUT campi/origini sopra (idempotenti, un retry li
  // ripete senza danno), un talento già assegnato non è ri-sottomettibile
  // senza rischiare un doppio addebito XP o un 409.
  const saveTalentDraft = React.useCallback(async (): Promise<void> => {
    let anySucceeded = false;
    // `sortTalentDraftIds` deduplica per costruzione (un `Set` interno): si
    // ordinano solo gli id distinti rispetto ai requisiti, poi ciascuno viene
    // ripetuto tante volte quante il suo conteggio in bozza (talento
    // ripetibile scelto più di una volta).
    const orderedDistinctIds = sortTalentDraftIds(
      Array.from(talentDraftCounts.keys()),
      talentRequirements,
      ownedReferenceDataIdsSet
    );
    const orderedIds = orderedDistinctIds.flatMap(id =>
      Array<number>(talentDraftCounts.get(id) ?? 0).fill(id)
    );

    for (const referenceDataId of orderedIds) {
      // `kind: "talent"` (T-0xx, fusione talenti/recupero XP alla morte in
      // "Progressione PG", Opzione B): un solo `functionName` eseguibile per
      // entrambe le azioni, distinte da questo campo discriminante — vedi
      // `progressActionSchema` in `handlers/progress.ts`.
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/characters/${characterId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            functionName: FT_PROGRESS,
            actionData: { kind: "talent", referenceDataId },
          }),
        }
      );

      if (!response.ok) {
        const json: ApiErrorBody | null = await response
          .json()
          .catch(() => null);
        // Porta con sé `anySucceeded` (item precedenti già assegnati prima
        // di questo fallimento): senza, il chiamante non saprebbe se serve
        // un `router.refresh()` per riallineare saldo/elenco dopo un
        // fallimento a metà batch — vedi `TalentDraftSaveError` sopra.
        throw new TalentDraftSaveError(
          mapAcquireErrorMessage(json),
          anySucceeded
        );
      }

      anySucceeded = true;
      setTalentDraftCounts(prev => decrementTalentCount(prev, referenceDataId));
    }
  }, [
    campaignSlug,
    characterId,
    talentDraftCounts,
    talentRequirements,
    ownedReferenceDataIdsSet,
  ]);

  const handleSave = React.useCallback(async () => {
    // Blocco soft lato client (stesso pattern di `CharacterCreation.tsx` per
    // i requisiti non soddisfatti): l'XP negativo non impedisce di
    // costruire la bozza, solo di salvarla. Il badge XP è già in rosso in
    // questo stato.
    if (talentsXpNegative) {
      showToast({
        variant: "error",
        message:
          "XP insufficienti: rimuovi qualche talento dalla bozza prima di salvare",
      });
      return;
    }

    // Invia solo i campi cambiati: i proprietari non possono toccare i campi
    // riservati allo staff, quindi quelli invariati devono restare fuori dal
    // payload.
    const payload: Record<string, string | null> = {};
    for (const key of Object.keys(value) as (keyof CharacterEditorValue)[]) {
      if (value[key] !== savedSnapshot[key]) {
        payload[key] =
          isDateField(key) && value[key] === "" ? null : value[key];
      }
    }
    const fieldsDirty = Object.keys(payload).length > 0;
    const originsDirty = originsAreDirty(
      originsSelection,
      savedOriginsSelection
    );
    const talentsDirty = draftTalentsCount > 0;
    if (!fieldsDirty && !originsDirty && !talentsDirty) return;

    setSaving(true);
    try {
      if (fieldsDirty) {
        const response = await fetch(`/api/characters/${characterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const json = await response.json().catch(() => null);
          const details =
            typeof json?.details === "string" ? ` ${json.details}` : "";
          showToast({
            variant: "error",
            message: json?.error
              ? `${json.error}.${details}`
              : "Errore durante il salvataggio",
          });
          return;
        }
      }

      const nextOriginsEntryMap = originsDirty
        ? await saveOriginsDiff()
        : originsEntryMap;

      if (talentsDirty) {
        await saveTalentDraft();
      }

      setSavedSnapshot(value);
      setOriginsEntryMap(nextOriginsEntryMap);
      setSavedOriginsSelection(selectionFromEntryMap(nextOriginsEntryMap));
      // Consumata dal `saveOriginsDiff` appena eseguito: ogni entry ora
      // esistente ha una sua `visibility` reale, gestibile da qui in poi col
      // PATCH immediato (`CharacterDataVisibilityToggle`), non più da qui.
      setOriginsVisibilityDraft({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      showToast({ variant: "success", message: "Personaggio salvato" });
      router.refresh();
    } catch (err) {
      console.error(err);
      // Se almeno un talento della bozza è stato assegnato prima
      // dell'errore (es. il secondo di tre fallisce), saldo/acquirable
      // mostrati sono ormai disallineati dal server: un refresh li
      // riallinea anche in caso di fallimento parziale.
      if (err instanceof TalentDraftSaveError && err.anySucceeded) {
        router.refresh();
      }
      showToast({
        variant: "error",
        message:
          err instanceof Error ? err.message : "Errore durante il salvataggio",
      });
    } finally {
      setSaving(false);
    }
  }, [
    characterId,
    router,
    savedSnapshot,
    showToast,
    value,
    originsEntryMap,
    originsSelection,
    savedOriginsSelection,
    saveOriginsDiff,
    draftTalentsCount,
    talentsXpNegative,
    saveTalentDraft,
  ]);

  const handleDiscard = React.useCallback(() => {
    setValue(savedSnapshot);
    setOriginsSelection(savedOriginsSelection);
    setOriginsVisibilityDraft({});
    setTalentDraftCounts(new Map());
  }, [savedSnapshot, savedOriginsSelection]);

  return {
    value,
    patch,
    status,
    canEdit,
    handleStatusChange,
    originsSelection,
    patchOriginSelection,
    originsVisibilityDraft,
    patchOriginVisibility,
    talentDraftCounts,
    incrementTalentDraft,
    decrementTalentDraft,
    ownedReferenceDataIdsSet,
    draftXpAvailable,
    dirty,
    saving,
    saveSuccess,
    handleSave,
    handleDiscard,
  };
}
