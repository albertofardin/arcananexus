"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import z from "zod";
import {
  CharacterType,
  DataVisibility,
  type DataCardinality,
  type DataTypeKind,
} from "@prisma/client";
import HeroPage from "../HeroPage";
import CharacterCreationWarnings from "./CharacterCreationWarnings";
import BadgeRole from "@/components/BadgeRole";
import Card from "@/components/_core/Card";
import FieldSelect from "@/components/_core/FieldSelect";
import FieldText from "@/components/_core/FieldText";
import FieldCharacterType from "@/components/FieldCharacterType";
import { useToast } from "@/components/_core/Toast";
import SaveBar from "@/components/SaveBar";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import Badge from "@/components/_core/Badge";
import Divider from "@/components/_core/Divider";
import Text from "@/components/_core/Text";
import { EmptyCard } from "@/components/Feedback";
import TalentList, {
  TalentCategoryList,
  TalentSearchBar,
  TalentViewToolbar,
  readTalentFlags,
  useTalentBrowser,
  incrementTalentCount,
  decrementTalentCount,
  expandTalentCounts,
  sumTalentCost,
  type TalentAccordionEntry,
  type TalentCounts,
  type TalentRequirementEdge,
} from "@/components/TalentList";
import { routes } from "@/app/routes";
import {
  isEvaluationErrorDetails,
  formatRequirementEvaluationMessage,
} from "@/lib/requirementErrorMessage";
import { FT_PROGRESS } from "@/lib/features/featuresName";

export interface DeceasedCharacterOption {
  id: number;
  name: string;
  avatar: string | null;
  availableXp: number;
}

export interface CatalogReferenceDataItem {
  id: number;
  name: string;
  description: string | null;
  flags: unknown;
}

export interface CatalogDataType {
  id: number;
  name: string;
  kind: DataTypeKind;
  cardinality: DataCardinality;
  description: string | null;
  icon: string | null;
  mandatory: boolean;
  // Mai visibile a un giocatore ordinario (`assignability: "masterOnly"` o
  // `visibility: "hidden"`, T-0xx): solo lo staff arriva a vedere questa
  // riga qui (il catalogo lato server già la esclude altrimenti), quindi il
  // badge "Solo Master" serve a ricordargli che il giocatore non la vedrà.
  masterOnly: boolean;
  referenceData: CatalogReferenceDataItem[];
}

export interface CatalogRequirementEdge {
  definitionId: number;
  requiredDefinitionId: number;
  type: "requires" | "blocks";
  groupId?: number | null;
}

// Arco `grants` (T-050, "Aggiunge"): assegnare `definitionId` conferisce
// anche `requiredDefinitionId`, gratis e a cascata (lo applica il server in
// `assignReferenceDataToCharacter`, qui serve solo per l'anteprima).
export interface CatalogGrantEdge {
  definitionId: number;
  requiredDefinitionId: number;
}

// Voci conferite (a cascata, anti-ciclo) da `rootIds` via `grants`, con le
// voci che le conferiscono direttamente — per l'avviso "da Elfo".
function collectGranted(
  rootIds: Iterable<number>,
  grantsByDefinition: Map<number, number[]>
): Map<number, number[]> {
  const granted = new Map<number, number[]>();
  const visited = new Set<number>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const target of grantsByDefinition.get(current) ?? []) {
      granted.set(target, [...(granted.get(target) ?? []), current]);
      queue.push(target);
    }
  }
  return granted;
}

const creationFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Il nome del personaggio è obbligatorio")
    .max(200),
  background: z
    .string()
    .trim()
    .min(1, "Il background del personaggio è obbligatorio")
    .max(20000),
  playerNotes: z.string().max(20000),
});

type CreationFormValues = z.infer<typeof creationFormSchema>;

export interface SelectionEvaluation {
  missingRequires: CatalogReferenceDataItem[];
  // OR-group (T-039) non soddisfatti: un array per gruppo, con le
  // alternative del gruppo — vedi `missingRequirementGroups` in
  // `RequirementEvaluation` (`characterData.service.ts`), stessa forma.
  missingRequirementGroups: CatalogReferenceDataItem[][];
  blockingConflicts: CatalogReferenceDataItem[];
}

const IDENTITY_KIND_ORDER: Partial<Record<DataTypeKind, number>> = {
  assignable: 0,
  origins: 1,
};

interface SubmitErrorBody {
  error?: string;
  details?: unknown;
}

function isXpErrorDetails(
  details: unknown
): details is { available: number; cost: number } {
  return (
    !!details &&
    typeof details === "object" &&
    "available" in details &&
    "cost" in details
  );
}

// Mappa la risposta di errore di `POST /api/campaigns/[campaignSlug]/characters`
// (T-018: 422 requisiti/XP, 409 non ripetibile, 403 permessi, 404 catalogo) su
// un messaggio unico per il toast — il testo di base è già in italiano lato
// server, qui si aggiunge solo il dettaglio numerico/nominale quando disponibile.
function mapSubmitErrorMessage(body: SubmitErrorBody | null): string {
  const base = body?.error ?? "Errore durante la creazione del personaggio";
  if (isXpErrorDetails(body?.details)) {
    return `${base} (disponibili ${body.details.available} XP, richiesti ${body.details.cost} XP)`;
  }
  if (isEvaluationErrorDetails(body?.details)) {
    return formatRequirementEvaluationMessage(base, body.details);
  }
  return base;
}

function readNumberFlag(flags: unknown, key: string): number | undefined {
  if (!flags || typeof flags !== "object") return undefined;
  const value = (flags as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function readBooleanFlag(flags: unknown, key: string): boolean | undefined {
  if (!flags || typeof flags !== "object") return undefined;
  const value = (flags as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

const DEFAULT_KIND_ICON: Record<DataTypeKind, string> = {
  generic: "category",
  origins: "handshake",
  talent: "auto_awesome",
  assignable: "groups",
};

// Evidenzia un campo obbligatorio non compilato: bordo 1px `var(--fail)`
// invece del `border-border` di default (`Field.tsx`), condiviso da tutti i
// campi base del form (nome, background, categorie identitarie).
const FIELD_ERROR_CLASSNAME = "border border-fail";

const FieldSelectDataType = ({
  dataType,
  selectedIds,
  error,
  onSingleChange,
  onMultiChange,
}: {
  dataType: CatalogDataType;
  selectedIds: Set<number>;
  error?: boolean;
  onSingleChange: (dataType: CatalogDataType, id: number | null) => void;
  onMultiChange: (dataType: CatalogDataType, ids: (string | number)[]) => void;
}) => (
  <div className="relative">
    {dataType.masterOnly && (
      <BadgeRole className="absolute top-0 right-1 z-10" type="onlyMaster" />
    )}
    {dataType.cardinality === "single" ? (
      <FieldSelect
        placeholder="Nessuna selezione"
        label={dataType.name}
        labelIcon={dataType.icon || DEFAULT_KIND_ICON[dataType.kind]}
        labelMandatory={dataType.mandatory}
        className={error ? FIELD_ERROR_CLASSNAME : undefined}
        value={
          dataType.referenceData.find(item => selectedIds.has(item.id))?.id
        }
        items={[
          { id: "__none__", label: "Nessuna selezione" },
          ...dataType.referenceData.map(item => ({
            id: item.id,
            label: item.name,
            subLabel: item.description,
          })),
        ]}
        onChange={value =>
          onSingleChange(
            dataType,
            value === "__none__" ? null : (value as number)
          )
        }
        showAllItems
      />
    ) : (
      <FieldSelect
        multiple
        label={dataType.name}
        labelIcon={dataType.icon || DEFAULT_KIND_ICON[dataType.kind]}
        labelMandatory={dataType.mandatory}
        className={error ? FIELD_ERROR_CLASSNAME : undefined}
        placeholder="Nessuna selezione"
        value={dataType.referenceData
          .filter(item => selectedIds.has(item.id))
          .map(item => item.id)}
        items={dataType.referenceData.map(item => {
          const cost = readNumberFlag(item.flags, "cost");
          const creationOnly = readBooleanFlag(item.flags, "creationOnly");
          return {
            id: item.id,
            label: item.name,
            children:
              cost !== undefined || creationOnly ? (
                <span className="flex shrink-0 items-center gap-1">
                  {cost !== undefined && (
                    <span className="text-muted-fg rounded bg-muted-bg px-1.5 py-0.5 text-xs">
                      {cost} XP
                    </span>
                  )}
                  {creationOnly && (
                    <span className="rounded bg-accent px-1.5 py-0.5 text-xs">
                      Solo in creazione
                    </span>
                  )}
                </span>
              ) : undefined,
          };
        })}
        onChange={value =>
          onMultiChange(dataType, value as (string | number)[])
        }
        showAllItems
      />
    )}
  </div>
);

const CharacterCreation = ({
  campaignSlug,
  isMaster,
  catalog,
  requirements,
  grants = [],
  deceasedCharacters = [],
  deathXpRecoveryPercentage = 0,
}: {
  campaignSlug: string;
  isMaster: boolean;
  catalog: CatalogDataType[];
  requirements: CatalogRequirementEdge[];
  grants?: CatalogGrantEdge[];
  deceasedCharacters?: DeceasedCharacterOption[];
  deathXpRecoveryPercentage?: number;
}) => {
  const { showToast } = useToast();
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  // Insieme delle `ReferenceData` scelte, a prescindere dal `DataType` di
  // appartenenza: la cardinalità (single/multi) è imposta dal controllo
  // renderizzato per gruppo (FieldSelect singolo sostituisce sempre, FieldSelect
  // multiplo accumula), non da una validazione a posteriori su questo Set.
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(
    () => new Set()
  );
  // Talenti: conteggio separato da `selectedIds` (T-0xx), non un semplice
  // Set — un talento `repeatable` può essere scelto più di una volta già in
  // creazione, fino a `flags.maxRepetitions` (imposto lato server). Le altre
  // categorie (origini/fazioni) restano su `selectedIds`, sempre 0/1 per id.
  const [talentCounts, setTalentCounts] = React.useState<TalentCounts>(
    () => new Map()
  );

  const [formValues, setFormValues] = React.useState<CreationFormValues>({
    name: "",
    background: "",
    playerNotes: "",
  });
  // Solo lo staff può scegliere PG/PNG (`isMaster` sopra): il giocatore
  // ordinario crea sempre e solo un proprio PG, coerente con
  // `CHARACTER_STAFF_ONLY_FIELDS` lato server.
  const [type, setType] = React.useState<CharacterType>(CharacterType.pg);
  // PG deceduto scelto come "donatore" per il recupero XP alla morte
  // (T-019): `null` = nessuna selezione, nessun recupero.
  const [deceasedCharacterId, setDeceasedCharacterId] = React.useState<
    number | null
  >(null);
  // Diventa true al primo tentativo di submit: prima di allora i campi
  // obbligatori (nome/background/identità) non hanno ancora un valore
  // valido di default e mostrare i loro errori sarebbe rumore, non un
  // avviso utile — l'unico errore mostrato subito è `tooManyOrigins` (sotto).
  const [attemptedSubmit, setAttemptedSubmit] = React.useState(false);

  // Validazione live del form base: non è più legata al click su Salva,
  // così l'errore sul nome sparisce non appena l'utente lo scrive, invece
  // di restare visibile fino al prossimo tentativo di submit.
  const parsedForm = React.useMemo(
    () => creationFormSchema.safeParse(formValues),
    [formValues]
  );
  const fieldError = React.useCallback(
    (key: keyof CreationFormValues): string | undefined =>
      attemptedSubmit
        ? parsedForm.error?.issues.find(issue => issue.path[0] === key)?.message
        : undefined,
    [attemptedSubmit, parsedForm]
  );

  const patchForm = React.useCallback(
    (next: Partial<CreationFormValues>) =>
      setFormValues(prev => ({ ...prev, ...next })),
    []
  );

  // Lookup di tutte le voci di catalogo visibili (per nome, in un unico posto)
  // e del `DataType` di ciascuna: serve sia a risolvere i nomi nei warning di
  // requisiti sia a calcolare il budget XP.
  const { itemsById, groupOfItem } = React.useMemo(() => {
    const items = new Map<number, CatalogReferenceDataItem>();
    const groups = new Map<number, CatalogDataType>();
    for (const dataType of catalog) {
      for (const item of dataType.referenceData) {
        items.set(item.id, item);
        groups.set(item.id, dataType);
      }
    }
    return { itemsById: items, groupOfItem: groups };
  }, [catalog]);

  const grantsByDefinition = React.useMemo(() => {
    const map = new Map<number, number[]>();
    for (const edge of grants) {
      map.set(edge.definitionId, [
        ...(map.get(edge.definitionId) ?? []),
        edge.requiredDefinitionId,
      ]);
    }
    return map;
  }, [grants]);

  // Voci conferite gratuitamente dalla selezione corrente (origini/fazioni
  // + talenti scelti): mai inviate come assegnazioni (le applica il server
  // a cascata) e mai contate nel budget XP.
  const grantedBy = React.useMemo(
    () =>
      collectGranted(
        [...selectedIds, ...talentCounts.keys()],
        grantsByDefinition
      ),
    [selectedIds, talentCounts, grantsByDefinition]
  );
  const grantedIds = React.useMemo(
    () => new Set(grantedBy.keys()),
    [grantedBy]
  );

  // Una voce già scelta a mano che diventa conferita (es. il talento scelto
  // prima della razza) esce dalla selezione manuale: altrimenti tornerebbe
  // a pesare sul budget se la razza venisse poi cambiata.
  const purgeGranted = React.useCallback(
    (ids: Set<number>, counts: TalentCounts): TalentCounts => {
      const granted = collectGranted(
        [...ids, ...counts.keys()],
        grantsByDefinition
      );
      if (![...counts.keys()].some(id => granted.has(id))) return counts;
      return new Map([...counts].filter(([id]) => !granted.has(id)));
    },
    [grantsByDefinition]
  );

  const toggleSingle = React.useCallback(
    (dataType: CatalogDataType, nextId: number | null) => {
      const next = new Set(selectedIds);
      for (const item of dataType.referenceData) next.delete(item.id);
      if (nextId !== null) next.add(nextId);
      setSelectedIds(next);
      setTalentCounts(prev => purgeGranted(next, prev));
    },
    [selectedIds, purgeGranted]
  );

  const setGroupSelection = React.useCallback(
    (dataType: CatalogDataType, ids: (string | number)[]) => {
      const next = new Set(selectedIds);
      for (const item of dataType.referenceData) next.delete(item.id);
      for (const id of ids) next.add(id as number);
      setSelectedIds(next);
      setTalentCounts(prev => purgeGranted(next, prev));
    },
    [selectedIds, purgeGranted]
  );

  // Origini selezionate: più di una è ambigua (stesso rifiuto 422 applicato
  // dal server, `route.ts`, "È stata selezionata più di un'origine") —
  // bloccante per chiunque, anche per il master (il server non lo bypassa).
  const selectedOrigins = React.useMemo(
    () =>
      Array.from(selectedIds)
        .map(id => itemsById.get(id))
        .filter(
          (item): item is CatalogReferenceDataItem =>
            !!item && groupOfItem.get(item.id)?.kind === "origins"
        ),
    [selectedIds, itemsById, groupOfItem]
  );
  const tooManyOrigins = selectedOrigins.length > 1;

  // Unione di `selectedIds` (origini/fazioni) e dei talenti scelti in bozza:
  // un requisito/blocco può referenziare un talento da un lato all'altro
  // (es. un'origine che richiede un talento), quindi la valutazione
  // sottostante deve vedere entrambi come "selezionato", a prescindere da
  // quante volte un talento ripetibile compaia in `talentCounts`.
  const selectedOrTalentIds = React.useMemo(
    () => new Set([...selectedIds, ...talentCounts.keys(), ...grantedIds]),
    [selectedIds, talentCounts, grantedIds]
  );

  // Le categorie di appartenenza (`kind: assignable`, es. Fazione/Divinità)
  // e l'Origine (`kind: origins`) definiscono l'identità del personaggio.
  const identityDataTypes = React.useMemo(
    () =>
      catalog
        .filter(dt => dt.kind in IDENTITY_KIND_ORDER)
        .sort(
          (a, b) =>
            (IDENTITY_KIND_ORDER[a.kind] ?? 0) -
            (IDENTITY_KIND_ORDER[b.kind] ?? 0)
        ),
    [catalog]
  );

  // Categorie identitarie obbligatorie (`mandatory: true`, configurato in
  // admin) senza ancora nessuna voce selezionata: gate di form base, non
  // bypassabile dal master (a differenza del gate requisiti/XP sotto).
  const missingMandatoryIdentities = React.useMemo(
    () =>
      identityDataTypes.filter(
        dt =>
          dt.mandatory &&
          !dt.referenceData.some(item => selectedIds.has(item.id))
      ),
    [identityDataTypes, selectedIds]
  );

  // Anteprima soft di `evaluateRequirements` (T-017): stessa forma
  // (`missingRequires`/`missingRequirementGroups`/`blockingConflicts`), ma
  // calcolata contro la selezione corrente del form invece che contro le
  // `CharacterData` di un PG già esistente (che qui non c'è ancora) —
  // l'enforcement reale resta lato server al submit.
  const evaluateSelection = React.useCallback(
    (id: number): SelectionEvaluation => {
      const missingRequires: CatalogReferenceDataItem[] = [];
      const blockingConflicts: CatalogReferenceDataItem[] = [];
      const seenBlocking = new Set<number>();

      // Righe senza `groupId`: requisito individuale, invariato (AND) —
      // ciascuna obbligatoria per conto proprio. `== null` (non `===`) copre
      // sia `null` sia `undefined` (fixture di test più vecchie di questo
      // campo), stessa scelta di `evaluateRequirements` lato server (T-039).
      const requiresEdgesForId = requirements.filter(
        edge => edge.definitionId === id && edge.type === "requires"
      );
      for (const edge of requiresEdgesForId) {
        if (edge.groupId != null) continue;
        const required = itemsById.get(edge.requiredDefinitionId);
        if (required && !selectedOrTalentIds.has(required.id)) {
          missingRequires.push(required);
        }
      }

      // Righe con `groupId`: raggruppate — soddisfatte se il PG ha
      // selezionato ALMENO UNA delle alternative del gruppo (OR), non tutte
      // (fix review round 1: prima ogni arco del gruppo finiva comunque in
      // `missingRequires`, falso positivo su un'alternativa non scelta anche
      // quando un'altra del gruppo era già selezionata).
      const groupedRequiresEdges = new Map<number, typeof requiresEdgesForId>();
      for (const edge of requiresEdgesForId) {
        if (edge.groupId == null) continue;
        const group = groupedRequiresEdges.get(edge.groupId) ?? [];
        group.push(edge);
        groupedRequiresEdges.set(edge.groupId, group);
      }
      const missingRequirementGroups: CatalogReferenceDataItem[][] = [];
      for (const group of groupedRequiresEdges.values()) {
        const groupSatisfied = group.some(edge =>
          selectedOrTalentIds.has(edge.requiredDefinitionId)
        );
        if (groupSatisfied) continue;
        const alternatives = group
          .map(edge => itemsById.get(edge.requiredDefinitionId))
          .filter((item): item is CatalogReferenceDataItem => !!item);
        if (alternatives.length > 0) {
          missingRequirementGroups.push(alternatives);
        }
      }

      for (const edge of requirements) {
        if (
          edge.type === "blocks" &&
          edge.definitionId === id &&
          selectedOrTalentIds.has(edge.requiredDefinitionId) &&
          !seenBlocking.has(edge.requiredDefinitionId)
        ) {
          const other = itemsById.get(edge.requiredDefinitionId);
          if (other) {
            seenBlocking.add(other.id);
            blockingConflicts.push(other);
          }
        }
        if (
          edge.type === "blocks" &&
          edge.requiredDefinitionId === id &&
          selectedOrTalentIds.has(edge.definitionId) &&
          !seenBlocking.has(edge.definitionId)
        ) {
          const other = itemsById.get(edge.definitionId);
          if (other) {
            seenBlocking.add(other.id);
            blockingConflicts.push(other);
          }
        }
      }

      return { missingRequires, missingRequirementGroups, blockingConflicts };
    },
    [requirements, selectedOrTalentIds, itemsById]
  );

  const selectionWarnings = React.useMemo(() => {
    const warnings: {
      item: CatalogReferenceDataItem;
      evaluation: SelectionEvaluation;
    }[] = [];
    for (const id of selectedOrTalentIds) {
      const item = itemsById.get(id);
      if (!item) continue;
      const evaluation = evaluateSelection(id);
      if (
        evaluation.missingRequires.length > 0 ||
        evaluation.missingRequirementGroups.length > 0 ||
        evaluation.blockingConflicts.length > 0
      ) {
        warnings.push({ item, evaluation });
      }
    }
    return warnings;
  }, [selectedOrTalentIds, itemsById, evaluateSelection]);

  // Talenti: selezionabili solo dopo aver scelto un'Origine, che è l'unica
  // fonte del budget PX di creazione (`flags.startingPx`, T-025 —
  // `grantInitialXp` lato server legge lo stesso flag). Una volta scelta,
  // qualunque talento del catalogo è acquisibile purché rispetti requisiti e
  // PX disponibili, esattamente come l'apprendimento talenti sulla scheda
  // personaggio (`ModalTalents`/`useCharacterEditorDraft`) — qui senza
  // characterId, il budget e i requisiti si valutano solo lato client contro
  // `selectedIds` (l'enforcement reale resta il 422 del server al submit).
  const talentEntries: TalentAccordionEntry[] = React.useMemo(
    () =>
      catalog
        .filter(dataType => dataType.kind === "talent")
        .flatMap(dataType => dataType.referenceData)
        .map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          visibility: DataVisibility.visible,
          flags: item.flags,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "it")),
    [catalog]
  );

  const talentRequirements: TalentRequirementEdge[] = React.useMemo(
    () =>
      requirements.map(edge => ({
        ...edge,
        requiredDefinitionName:
          itemsById.get(edge.requiredDefinitionId)?.name ?? "",
      })),
    [requirements, itemsById]
  );

  const selectedOrigin =
    selectedOrigins.length === 1 ? selectedOrigins[0] : null;
  const startingPx = readNumberFlag(selectedOrigin?.flags, "startingPx") ?? 0;

  // Talenti conferiti: mostrati come già selezionati (×1) e bloccati.
  const grantedTalentIds = React.useMemo(
    () =>
      new Set(
        talentEntries.filter(entry => grantedIds.has(entry.id)).map(e => e.id)
      ),
    [talentEntries, grantedIds]
  );
  const displayTalentCounts = React.useMemo(() => {
    const counts = new Map(talentCounts);
    for (const id of grantedTalentIds) counts.set(id, 1);
    return counts;
  }, [talentCounts, grantedTalentIds]);
  // Avviso "Ottieni gratuitamente": solo voci visibili al viewer (una voce
  // nascosta conferita non deve rivelarne il nome).
  const grantedNotices = React.useMemo(
    () =>
      [...grantedBy]
        .map(([id, sourceIds]) => ({
          item: itemsById.get(id),
          sources: sourceIds
            .map(sourceId => itemsById.get(sourceId)?.name)
            .filter((name): name is string => !!name),
        }))
        .filter(
          (
            notice
          ): notice is {
            item: CatalogReferenceDataItem;
            sources: string[];
          } => !!notice.item
        ),
    [grantedBy, itemsById]
  );

  const talentsCost = React.useMemo(
    () => sumTalentCost(talentEntries, talentCounts),
    [talentEntries, talentCounts]
  );
  // Anteprima dell'importo che `deathXpRecovery.ts` accrediterà davvero al
  // submit (stessa formula, `Math.floor`): sommato subito al budget PX così
  // il talento scelto insieme al recupero risulta acquistabile in creazione,
  // invece di dover salvare e tornare sulla scheda per spenderlo.
  const recoveredXp =
    deceasedCharacterId !== null
      ? Math.floor(
          ((deceasedCharacters.find(c => c.id === deceasedCharacterId)
            ?.availableXp ?? 0) *
            deathXpRecoveryPercentage) /
            100
        )
      : 0;
  const talentXpAvailable = startingPx - talentsCost + recoveredXp;

  // Come `disabledAcquireIds` di `ModalTalents`: blocca "Aggiungi" per un
  // talento non ancora scelto se manca un requisito, è in conflitto con una
  // selezione già fatta, o costa più dei PX rimasti — un talento già scelto
  // resta comunque togglabile per rimuoverlo. Si applica anche al master:
  // in `ModalTalents` è "Concedi" (azione separata, assente qui) a
  // bypassare i requisiti, non "Aggiungi", che resta vincolato per chiunque.
  const disabledTalentIds = React.useMemo(() => {
    const disabled = new Map<number, string>();
    for (const entry of talentEntries) {
      if ((displayTalentCounts.get(entry.id) ?? 0) > 0) continue;
      const evaluation = evaluateSelection(entry.id);
      if (evaluation.blockingConflicts.length > 0) {
        disabled.set(entry.id, "Incompatibile con una selezione già fatta");
        continue;
      }
      if (
        evaluation.missingRequires.length > 0 ||
        evaluation.missingRequirementGroups.length > 0
      ) {
        disabled.set(entry.id, "Mancano i requisiti richiesti");
        continue;
      }
      const cost = readTalentFlags(entry.flags).cost;
      if (typeof cost === "number" && cost > talentXpAvailable) {
        disabled.set(
          entry.id,
          `Servono ${cost} XP (disponibili ${talentXpAvailable})`
        );
      }
    }
    return disabled;
  }, [
    talentEntries,
    displayTalentCounts,
    evaluateSelection,
    talentXpAvailable,
  ]);

  const incrementTalent = React.useCallback(
    (entry: TalentAccordionEntry) => {
      setTalentCounts(prev =>
        purgeGranted(selectedIds, incrementTalentCount(prev, entry.id))
      );
    },
    [selectedIds, purgeGranted]
  );

  const decrementTalent = React.useCallback((entry: TalentAccordionEntry) => {
    setTalentCounts(prev => decrementTalentCount(prev, entry.id));
  }, []);

  const [talentsOpen, setTalentsOpen] = React.useState(false);
  const [onlyAffordableTalents, setOnlyAffordableTalents] =
    React.useState(false);

  const selectedTalentNames = talentEntries
    .filter(entry => (displayTalentCounts.get(entry.id) ?? 0) > 0)
    .map(entry => entry.name)
    .join(", ");

  // Con "Solo acquistabili" attivo, nasconde chi non è acquisibile ora
  // (`disabledTalentIds`, stessa logica riga per riga) — un talento già
  // scelto resta sempre visibile: il filtro riguarda solo cosa si sta per
  // aggiungere, non quello che si è già scelto.
  const visibleTalentEntries = React.useMemo(
    () =>
      onlyAffordableTalents
        ? talentEntries.filter(
            entry =>
              (displayTalentCounts.get(entry.id) ?? 0) > 0 ||
              !disabledTalentIds.has(entry.id)
          )
        : talentEntries,
    [
      talentEntries,
      onlyAffordableTalents,
      disabledTalentIds,
      displayTalentCounts,
    ]
  );

  const {
    search: talentSearch,
    setSearch: setTalentSearch,
    viewMode: talentViewMode,
    setViewMode: setTalentViewMode,
    expandedId: talentExpandedId,
    expandAll: talentExpandAll,
    toggleExpandAll: toggleTalentExpandAll,
    collapsedCategories: talentCollapsedCategories,
    toggleCategoryCollapsed: toggleTalentCategoryCollapsed,
    isSearching: isSearchingTalents,
    groups: talentGroups,
    detailGroup: talentDetailGroup,
    toggleExpand: toggleTalentExpand,
    backToCategories: backToTalentCategories,
    selectCategory: selectTalentCategory,
  } = useTalentBrowser(visibleTalentEntries);

  const requirementsSatisfied = selectionWarnings.length === 0;
  // Il giocatore ordinario non può forzare requisiti non soddisfatti (l'API
  // rifiuta con 422/RequirementsNotSatisfiedError); il master bypassa questo
  // gate lato server, ma non il vincolo "una sola origine" (rifiutato
  // incondizionatamente dalla route, prima della transazione).
  const canSubmit = !tooManyOrigins && (isMaster || requirementsSatisfied);

  // Errori mostrati nel banner unico (`CharacterCreationWarnings`): i campi
  // obbligatori base (nome/background/identità) solo dopo un tentativo di
  // submit, `tooManyOrigins` sempre — era già un avviso live prima di questo
  // merge, qui semplicemente cambia contenitore grafico.
  const bannerFieldErrors = React.useMemo(() => {
    const errors: string[] = [];
    if (tooManyOrigins) {
      errors.push("È stata selezionata più di un'origine: scegline una sola.");
    }
    if (attemptedSubmit) {
      const nameError = fieldError("name");
      if (nameError) errors.push(nameError);
      const backgroundError = fieldError("background");
      if (backgroundError) errors.push(backgroundError);
      for (const dt of missingMandatoryIdentities) {
        errors.push(`Campo obbligatorio mancante: ${dt.name}`);
      }
    }
    return errors;
  }, [tooManyOrigins, attemptedSubmit, fieldError, missingMandatoryIdentities]);

  const onSubmit = React.useCallback(async () => {
    setAttemptedSubmit(true);

    if (
      !parsedForm.success ||
      tooManyOrigins ||
      missingMandatoryIdentities.length > 0
    ) {
      return;
    }

    // Blocco soft lato client (l'enforcement reale resta il 422 del
    // server, T-017/018): il giocatore ordinario non può forzare requisiti
    // mancanti, solo il master può.
    if (!canSubmit) {
      showToast({
        variant: "error",
        message:
          "Requisiti non soddisfatti: solo lo staff (master) può forzare la creazione",
      });
      return;
    }

    const values = parsedForm.data;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/characters`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            type: isMaster ? type : undefined,
            background: values.background,
            playerNotes: values.playerNotes || null,
            // Le voci conferite via `grants` le assegna il server a cascata:
            // inviarle anche qui le duplicherebbe (o fallirebbe per non
            // ripetibili).
            assignments: [
              ...Array.from(selectedIds).filter(id => !grantedIds.has(id)),
              ...expandTalentCounts(talentCounts),
            ].map(referenceDataId => ({ referenceDataId })),
          }),
        }
      );

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: mapSubmitErrorMessage(json),
        });
        return;
      }

      const created = await response.json();

      // Recupero XP alla morte (T-019): il PG appena creato non esiste
      // ancora al momento della selezione, quindi l'azione si dichiara solo
      // ora — un fallimento qui non deve bloccare la navigazione, il
      // personaggio è comunque stato creato.
      if (deceasedCharacterId !== null) {
        const recoveryResponse = await fetch(
          `/api/campaigns/${campaignSlug}/characters/${created.character.id}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              functionName: FT_PROGRESS,
              actionData: { kind: "deathXpRecovery", deceasedCharacterId },
            }),
          }
        );
        if (!recoveryResponse.ok) {
          showToast({
            variant: "error",
            message:
              "Personaggio creato, ma il recupero XP dal PG deceduto non è riuscito",
          });
        }
      }

      showToast({ variant: "success", message: "Personaggio creato" });
      router.push(routes.campaignCharacter(campaignSlug, created.character.id));
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante la creazione del personaggio",
      });
    } finally {
      setSaving(false);
    }
  }, [
    parsedForm,
    campaignSlug,
    selectedIds,
    talentCounts,
    grantedIds,
    isMaster,
    type,
    deceasedCharacterId,
    tooManyOrigins,
    missingMandatoryIdentities,
    canSubmit,
    showToast,
    router,
  ]);

  return (
    <>
      <HeroPage title="Nuovo Personaggio" />

      <Card className="flex-col items-stretch p-2 gap-3">
        <FieldText
          label="Nome"
          labelIcon="edit"
          labelMandatory
          placeholder="Nome del personaggio..."
          error={!!fieldError("name")}
          className={fieldError("name") ? FIELD_ERROR_CLASSNAME : undefined}
          value={formValues.name}
          onChange={name => patchForm({ name })}
        />
        {isMaster && (
          <div className="relative">
            <BadgeRole
              className="absolute top-0 right-1 z-10"
              type="onlyMaster"
            />
            <FieldCharacterType
              label="Tipo"
              labelMandatory
              value={type}
              onChange={next => next && setType(next)}
            />
          </div>
        )}

        {identityDataTypes.map(dataType => (
          <FieldSelectDataType
            key={dataType.id}
            dataType={dataType}
            selectedIds={selectedIds}
            error={
              attemptedSubmit &&
              missingMandatoryIdentities.some(mdt => mdt.id === dataType.id)
            }
            onSingleChange={toggleSingle}
            onMultiChange={setGroupSelection}
          />
        ))}

        {grantedNotices.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded border border-border px-3 py-2">
            <Text
              size={0}
              weight="bolder"
              className="text-muted-fg"
              children="Ottieni gratuitamente"
            />
            <div className="flex flex-wrap gap-1.5">
              {grantedNotices.map(({ item, sources }) => (
                <Badge
                  key={item.id}
                  icon="gift_card"
                  color="var(--succ)"
                  label={
                    sources.length > 0
                      ? `${item.name} (da ${sources.join(", ")})`
                      : item.name
                  }
                />
              ))}
            </div>
          </div>
        )}

        {deceasedCharacters.length > 0 && (
          <FieldSelect
            placeholder="Nessuna selezione"
            label={`Recupero XP da PG deceduto (${deathXpRecoveryPercentage}%)`}
            labelIcon="skull"
            value={deceasedCharacterId ?? undefined}
            items={[
              { id: "__none__", label: "Nessuna selezione" },
              ...deceasedCharacters.map(character => ({
                id: character.id,
                label: character.name,
                avatar: character.avatar ?? undefined,
                avatarText: character.name,
                subLabel: `Ottieni ${Math.floor((character.availableXp * deathXpRecoveryPercentage) / 100)} XP`,
              })),
            ]}
            onChange={value =>
              setDeceasedCharacterId(
                value === "__none__" ? null : (value as number)
              )
            }
            showAllItems
          />
        )}

        {talentEntries.length > 0 && selectedOrigin && (
          <div className="relative">
            <div className="absolute top-0 right-1 z-10">
              <Badge className="mr-2" label={`${talentXpAvailable} XP`} />
            </div>
            <FieldText
              multiline
              readOnly
              label="Talenti"
              labelIcon="talent"
              placeholder="Nessun talento selezionato"
              value={selectedTalentNames}
              onClick={() => setTalentsOpen(true)}
            />
          </div>
        )}

        <FieldText
          multiline
          label="Background"
          labelIcon="menu_book"
          labelMandatory
          placeholder="Racconta le origini, le motivazioni e i legami del personaggio…"
          error={!!fieldError("background")}
          className={
            fieldError("background") ? FIELD_ERROR_CLASSNAME : undefined
          }
          value={formValues.background}
          onChange={background => patchForm({ background })}
        />
      </Card>

      <Modal
        open={talentsOpen}
        onClose={() => setTalentsOpen(false)}
        titleClose
        title="Talenti"
        titleChildren={<Badge label={`${talentXpAvailable} XP`} />}
        fullscreen
        contentClassName="p-0"
        content={
          visibleTalentEntries.length === 0 ? (
            <EmptyCard
              className="w-full"
              icon="school"
              title="Nessun talento"
              message="Nessun talento soddisfa il filtro corrente."
            />
          ) : (
            <div className="flex flex-col items-stretch justify-start h-full">
              {talentDetailGroup ? (
                <>
                  <div className="flex items-center gap-3 p-2">
                    <Btn
                      icon="arrow_back"
                      label="Listati"
                      onClick={backToTalentCategories}
                    />
                    <Badge
                      label={talentDetailGroup.label}
                      className="rounded px-4 py-2"
                    />
                    <Btn
                      className="ml-auto"
                      icon={talentExpandAll ? "expand_less" : "expand_more"}
                      label={
                        talentExpandAll ? "Comprimi tutto" : "Espandi tutto"
                      }
                      selected={talentExpandAll}
                      onClick={toggleTalentExpandAll}
                    />
                  </div>
                  <Divider />
                </>
              ) : (
                <>
                  {talentEntries.length >= 10 && (
                    <TalentSearchBar
                      value={talentSearch}
                      onChange={setTalentSearch}
                    />
                  )}
                  <TalentViewToolbar
                    viewMode={talentViewMode}
                    onViewModeChange={setTalentViewMode}
                    isSearching={isSearchingTalents}
                    expandAll={talentExpandAll}
                    onToggleExpandAll={toggleTalentExpandAll}
                    onlyAffordable={onlyAffordableTalents}
                    onToggleOnlyAffordable={() =>
                      setOnlyAffordableTalents(prev => !prev)
                    }
                  />
                  <Divider />
                </>
              )}

              <div className="flex flex-col p-1 overflow-scroll flex-1">
                {talentDetailGroup ? (
                  <TalentList
                    campaignSlug={campaignSlug}
                    entries={talentDetailGroup.entries}
                    isMaster={isMaster}
                    expandedId={talentExpandedId}
                    expandAll={talentExpandAll}
                    onToggleExpand={toggleTalentExpand}
                    onAcquire={incrementTalent}
                    onRelease={decrementTalent}
                    draftCounts={displayTalentCounts}
                    disabledAcquireIds={disabledTalentIds}
                    lockedIds={grantedTalentIds}
                    requirements={talentRequirements}
                  />
                ) : talentViewMode === "flat" || isSearchingTalents ? (
                  talentGroups.length === 0 ? (
                    <EmptyCard
                      className="w-full"
                      icon="school"
                      title="Nessun talento trovato"
                      message="Affina la ricerca per trovare quello che cerchi"
                    />
                  ) : (
                    talentGroups.map(group => {
                      const collapsed = talentCollapsedCategories.has(
                        group.key
                      );
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
                              onClick={() =>
                                toggleTalentCategoryCollapsed(group.key)
                              }
                            />
                            <Badge
                              label={group.label}
                              className="rounded px-4 py-2"
                            />
                          </div>
                          <Divider className="mx-1 bg-primary" />
                          {!collapsed && (
                            <TalentList
                              campaignSlug={campaignSlug}
                              entries={group.entries}
                              isMaster={isMaster}
                              expandedId={talentExpandedId}
                              expandAll={talentExpandAll}
                              onToggleExpand={toggleTalentExpand}
                              onAcquire={incrementTalent}
                              onRelease={decrementTalent}
                              draftCounts={displayTalentCounts}
                              disabledAcquireIds={disabledTalentIds}
                              lockedIds={grantedTalentIds}
                              requirements={talentRequirements}
                            />
                          )}
                        </div>
                      );
                    })
                  )
                ) : talentGroups.length === 0 ? (
                  <EmptyCard
                    className="w-full"
                    icon="school"
                    title="Nessun talento trovato"
                    message="Non ci sono talenti disponibili al momento."
                  />
                ) : (
                  <TalentCategoryList
                    groups={talentGroups}
                    onSelect={selectTalentCategory}
                  />
                )}
              </div>
            </div>
          )
        }
      />

      {(bannerFieldErrors.length > 0 || selectionWarnings.length > 0) && (
        <CharacterCreationWarnings
          isMaster={isMaster}
          fieldErrors={bannerFieldErrors}
          selectionWarnings={selectionWarnings}
        />
      )}

      <div className="p-6 m-6" />

      <SaveBar
        dirty
        saving={saving}
        saved={false}
        message="Crea nuovo personaggio"
        saveLabel="Invia"
        savingLabel="Invio…"
        onSave={onSubmit}
        onDiscard={() => router.back()}
        icon="person_add"
      />
    </>
  );
};

export default CharacterCreation;
