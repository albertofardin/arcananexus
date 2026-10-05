"use client";

import * as React from "react";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
  type ReferenceData,
} from "@prisma/client";
import type { CharacterDataGroup } from "./CharacterEditor";
import { useApiAction } from "@/hooks/useApiAction";
import Btn from "@/components/_core/Btn";
import Card from "@/components/_core/Card";
import FieldSelect from "@/components/_core/FieldSelect";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import BadgeRole from "@/components/BadgeRole";

const CharacterDataVisibilityToggle = ({
  campaignSlug,
  characterId,
  characterDataId,
  visibility,
}: {
  campaignSlug: string;
  characterId: number;
  characterDataId: number;
  visibility: DataVisibility;
}) => {
  const { pending, run } = useApiAction();

  const isHidden = visibility === DataVisibility.hidden;
  const nextVisibility = isHidden
    ? DataVisibility.visible
    : DataVisibility.hidden;

  const onToggle = React.useCallback(
    () =>
      run(
        `/api/campaigns/${campaignSlug}/characters/${characterId}/data/${characterDataId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: nextVisibility }),
        },
        {
          errorMessage: "Errore durante il cambio di visibilità",
          successMessage:
            nextVisibility === DataVisibility.visible
              ? "Voce resa visibile al giocatore"
              : "Voce nascosta al giocatore",
          refresh: true,
        }
      ),
    [campaignSlug, characterId, characterDataId, nextVisibility, run]
  );

  return (
    <Btn
      small
      icon={isHidden ? "visibility_off" : "visibility"}
      tooltip={
        isHidden ? "Rendi visibile al giocatore" : "Nascondi al giocatore"
      }
      disabled={pending}
      onClick={onToggle}
      className="mb-1.5 ml-1"
    />
  );
};

// Come `CharacterDataVisibilityToggle`, ma per una `DataType` senza ancora
// nessuna `CharacterData` (T-0xx): non c'è una riga da PATCHare, quindi il
// toggle vive solo nel draft `originsVisibilityDraft` (default al
// `DataType.visibility` configurato finché il master non lo tocca) e viene
// inviata come `visibility` esplicita nella POST di `saveOriginsDiff` al
// prossimo "Salva" — stessa UX del pulsante "reale", nessuna chiamata di
// rete qui.
const DraftVisibilityToggle = ({
  visibility,
  onChange,
}: {
  visibility: DataVisibility;
  onChange: (visibility: DataVisibility) => void;
}) => {
  const isHidden = visibility === DataVisibility.hidden;
  const nextVisibility = isHidden
    ? DataVisibility.visible
    : DataVisibility.hidden;

  return (
    <Btn
      small
      icon={isHidden ? "visibility_off" : "visibility"}
      tooltip={
        isHidden
          ? "Visibile al giocatore alla prossima assegnazione"
          : "Nascosta al giocatore alla prossima assegnazione"
      }
      onClick={() => onChange(nextVisibility)}
      className="mb-1.5 ml-1"
    />
  );
};

// Campo controllato: nessuna chiamata di rete qui, la selezione vive nel
// draft `originsSelection` sollevato in `CharacterEditor` e viene persistita
// in blocco al "Salva" della `SaveBar`, insieme agli altri campi della
// scheda (vedi `saveOriginsDiff` in `useCharacterEditorDraft.ts`). Un solo
// componente per cardinalità singola/multipla, rispecchiando l'API `multi`
// di `FieldSelect` stesso.
const FieldEditorData = ({
  name,
  icon,
  value,
  options,
  disabled,
  multi,
  onChange,
}: {
  name: string;
  icon: string;
  value: number[];
  options: ReferenceData[];
  disabled?: boolean;
  multi: boolean;
  onChange: (referenceDataIds: number[]) => void;
}) => {
  const onSelect = React.useCallback(
    (next: string | number | (string | number)[]) => {
      if (multi) {
        onChange(Array.isArray(next) ? (next as number[]) : []);
      } else if (typeof next === "number") {
        onChange([next]);
      }
    },
    [multi, onChange]
  );

  return (
    <FieldSelect
      multiple={multi}
      className="w-full"
      placeholder="Seleziona..."
      disabled={disabled}
      label={name}
      labelIcon={icon}
      value={multi ? value : (value[0] ?? undefined)}
      items={options.map(item => ({
        id: item.id,
        label: item.name,
        subLabel: item.description ?? undefined,
      }))}
      onChange={onSelect}
      showAllItems
    />
  );
};

// Auto-assegnazione del giocatore per `DataType` `assignability: "always"`
// a cardinalità singola (T-0xx): stesso draft di `FieldEditorData` (persistito
// in blocco al "Salva" della scheda, via `saveOriginsDiff`), non una scrittura
// immediata — resta coerente con tutti gli altri campi della scheda invece
// di comportarsi diversamente solo perché è il giocatore a editarlo.
// Mostrato come card statica (coerente con gli altri campi) con un pulsante
// "Modifica" che rivela il dropdown solo quando serve, invece di un dropdown
// sempre aperto.
const FieldSelfAssignData = ({
  name,
  icon,
  value,
  options,
  disabled,
  onChange,
}: {
  name: string;
  icon: string;
  value: number[];
  options: ReferenceData[];
  disabled?: boolean;
  onChange: (referenceDataIds: number[]) => void;
}) => {
  const [editing, setEditing] = React.useState(false);
  const selected = options.find(option => option.id === value[0]);

  if (editing) {
    return (
      <FieldEditorData
        multi={false}
        name={name}
        icon={icon}
        value={value}
        options={options}
        disabled={disabled}
        onChange={referenceDataIds => {
          onChange(referenceDataIds);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <>
      <div className="flex flex-row gap-1 items-center">
        <Icon
          className="text-muted-fg"
          style={{ lineHeight: "normal", fontSize: "14px" }}
          children={icon}
        />
        <Text size={0} className="text-muted-fg" children={name} />
      </div>
      <Card className="flex-col justify-start items-stretch gap-2 p-3">
        <div className="flex w-full items-center justify-between">
          <Text
            size={2}
            weight={selected ? "bolder" : undefined}
            className={selected ? undefined : "text-muted-fg"}
            children={selected?.name ?? "Non ancora assegnato"}
          />
          <Btn
            small
            icon="edit"
            tooltip="Modifica"
            disabled={disabled}
            onClick={() => setEditing(true)}
          />
        </div>
        {selected?.description && (
          <Text className="text-muted-fg" children={selected.description} />
        )}
      </Card>
    </>
  );
};

const CharacterEditorAnagraphic = ({
  characterId,
  campaignSlug,
  characterDataGroups = [],
  originsCatalog = [],
  originsSelection = {},
  onOriginsSelectionChange,
  originsVisibilityDraft = {},
  onOriginsVisibilityDraftChange,
  originsSaving = false,
  viewingAsMaster = false,
  canEdit = false,
}: {
  characterId?: number;
  campaignSlug?: string;
  characterDataGroups?: CharacterDataGroup[];
  originsCatalog?: ReferenceData[];
  originsSelection?: Record<number, number[]>;
  onOriginsSelectionChange?: (dataTypeId: number, ids: number[]) => void;
  originsVisibilityDraft?: Record<number, DataVisibility>;
  onOriginsVisibilityDraftChange?: (
    dataTypeId: number,
    visibility: DataVisibility
  ) => void;
  originsSaving?: boolean;
  viewingAsMaster?: boolean;
  canEdit?: boolean;
}) => {
  const groups = characterDataGroups.filter(
    group => group.dataType.kind !== DataTypeKind.talent
  );
  const catalogByDataTypeId = React.useMemo(() => {
    const map = new Map<number, ReferenceData[]>();
    for (const item of originsCatalog) {
      const list = map.get(item.dataTypeId) ?? [];
      list.push(item);
      map.set(item.dataTypeId, list);
    }
    return map;
  }, [originsCatalog]);

  if (!groups.length) return null;

  return (
    <>
      {groups.map(group => {
        const visibleEntries = group.entries.filter(entry => {
          if (entry.visibility === DataVisibility.hidden)
            return viewingAsMaster && canEdit;
          return true;
        });
        const catalogOptions = catalogByDataTypeId.get(group.dataType.id) ?? [];
        const canEditBase =
          viewingAsMaster && canEdit && !!characterId && !!campaignSlug;
        const canEditGroup =
          canEditBase &&
          group.dataType.cardinality === DataCardinality.single &&
          visibleEntries.length <= 1 &&
          catalogOptions.length > (visibleEntries.length === 1 ? 1 : 0);
        const canEditMultiGroup =
          canEditBase &&
          group.dataType.cardinality === DataCardinality.multi &&
          catalogOptions.length > 0;

        // Auto-assegnazione giocatore (T-0xx): solo cardinalità singola —
        // per `multi` non esiste ancora una route che permetta al
        // giocatore di togliere una propria voce già assegnata (solo il
        // master può farlo, `DELETE .../data/[characterDataId]`), quindi
        // l'accumulo self-service resta fuori scope per ora.
        const canSelfAssignBase =
          !viewingAsMaster && canEdit && !!characterId && !!campaignSlug;
        const canSelfAssignGroup =
          canSelfAssignBase &&
          group.dataType.assignability === DataTypeAssignability.always &&
          group.dataType.cardinality === DataCardinality.single &&
          visibleEntries.length <= 1 &&
          catalogOptions.length > 0;

        // Un campo MAI valorizzato (nessuna entry, `group.entries` vuoto) è
        // visibile al giocatore solo se il `DataType` stesso è configurato
        // `visible` (master lo vede comunque sempre, deve poterlo
        // valorizzare — vedi `characterEditor.service.ts`). Un campo che ha
        // GIÀ un'assegnazione ma è stata nascosta esplicitamente dal master
        // (`CharacterData.visibility: hidden`, icona occhio) resta invece
        // sempre invisibile al giocatore, a prescindere da
        // `DataType.visibility`: non deve comparire come "non ancora
        // assegnato" — quel campo il master l'ha valorizzato e poi nascosto
        // di proposito, il giocatore non deve nemmeno sapere che esiste una
        // scelta in corso. In più, un campo mai valorizzato compare al
        // giocatore solo se è anche effettivamente auto-assegnabile
        // (`assignability: "always"` a cardinalità singola, stessa
        // condizione di `canSelfAssignGroup`): un campo `creationOnly`/
        // `masterOnly` ancora vuoto non è azionabile dal giocatore (poteva
        // scegliere solo in creazione, o solo il master può assegnarlo), un
        // placeholder vuoto sarebbe solo rumore — resta visibile finché non
        // lo valorizza il master.
        const showAsEmptyField =
          group.entries.length === 0 &&
          (viewingAsMaster ||
            (group.dataType.visibility === DataVisibility.visible &&
              group.dataType.assignability === DataTypeAssignability.always &&
              group.dataType.cardinality === DataCardinality.single));
        if (!canEditBase && visibleEntries.length <= 0 && !showAsEmptyField)
          return null;

        const groupSelection = originsSelection[group.dataType.id] ?? [];

        // Vista statica (né editabile dal master né auto-assegnabile dal
        // giocatore in questa resa, es. "Razza" quando si passa a "player
        // view" senza aver salvato): deve comunque riflettere la bozza
        // `groupSelection`, non `visibleEntries` (stato salvato) — altrimenti
        // una modifica in master view non ancora salvata sparirebbe
        // passando a player view. Per ogni id in bozza si cerca prima
        // l'entry salvata corrispondente (mantiene `characterDataId` e
        // `visibility`, quindi badge/occhietto restano coerenti — ed è qui
        // che si applica lo stesso filtro "nascosta" di `visibleEntries`,
        // non su `group.entries` grezzo); se non esiste ancora (scelta di
        // bozza mai salvata), si risolve da `catalogOptions` come semplice
        // anteprima, senza controlli di visibilità (non esiste ancora lato
        // server).
        const displayEntries = groupSelection
          .map(id => {
            const savedEntry = group.entries.find(
              entry => entry.referenceData.id === id
            );
            if (savedEntry) {
              const visibleToViewer =
                savedEntry.visibility !== DataVisibility.hidden ||
                (viewingAsMaster && canEdit);
              if (!visibleToViewer) return null;
              return { kind: "saved" as const, entry: savedEntry };
            }
            const draftOption = catalogOptions.find(option => option.id === id);
            return draftOption
              ? { kind: "draft" as const, referenceData: draftOption }
              : null;
          })
          .filter(
            (display): display is NonNullable<typeof display> => !!display
          );

        return (
          <div key={group.dataType.id} className="flex flex-col gap-1">
            {canEditGroup || canEditMultiGroup ? (
              <div className="flex flex-row gap-1 items-end">
                <div className="flex-1 min-w-0">
                  <FieldEditorData
                    multi={canEditMultiGroup}
                    name={group.dataType.name}
                    icon={group.dataType.icon}
                    value={groupSelection}
                    options={catalogOptions}
                    disabled={originsSaving}
                    onChange={referenceDataIds =>
                      onOriginsSelectionChange?.(
                        group.dataType.id,
                        referenceDataIds
                      )
                    }
                  />
                </div>
                {canEditGroup &&
                  characterId &&
                  campaignSlug &&
                  (visibleEntries.length === 1 ? (
                    <CharacterDataVisibilityToggle
                      campaignSlug={campaignSlug}
                      characterId={characterId}
                      characterDataId={visibleEntries[0].id}
                      visibility={visibleEntries[0].visibility}
                    />
                  ) : (
                    <DraftVisibilityToggle
                      visibility={
                        originsVisibilityDraft[group.dataType.id] ??
                        group.dataType.visibility
                      }
                      onChange={visibility =>
                        onOriginsVisibilityDraftChange?.(
                          group.dataType.id,
                          visibility
                        )
                      }
                    />
                  ))}
              </div>
            ) : canSelfAssignGroup ? (
              <FieldSelfAssignData
                name={group.dataType.name}
                icon={group.dataType.icon}
                // Non `groupSelection` grezzo: una entry salvata ma
                // `hidden` (il master non l'ha ancora rivelata al
                // proprietario) non deve comparire come valore corrente —
                // stesso filtro di `displayEntries` sotto, altrimenti il
                // giocatore (o il master in "player view") vedrebbe una
                // scelta che dovrebbe restare segreta.
                value={displayEntries.map(display =>
                  display.kind === "saved"
                    ? display.entry.referenceData.id
                    : display.referenceData.id
                )}
                options={catalogOptions}
                disabled={originsSaving}
                onChange={referenceDataIds =>
                  onOriginsSelectionChange?.(
                    group.dataType.id,
                    referenceDataIds
                  )
                }
              />
            ) : (
              <>
                <div className="flex flex-row gap-1 items-center">
                  <Icon
                    className="text-muted-fg"
                    style={{ lineHeight: "normal", fontSize: "14px" }}
                    children={group.dataType.icon}
                  />
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children={group.dataType.name}
                  />
                </div>
                {displayEntries.map(display => {
                  const referenceData =
                    display.kind === "saved"
                      ? display.entry.referenceData
                      : display.referenceData;
                  return (
                    <Card
                      key={referenceData.id}
                      className="flex-col justify-start items-stretch gap-2 p-3"
                    >
                      <div className="flex w-full items-center justify-between">
                        <Text
                          size={2}
                          weight="bolder"
                          children={referenceData.name}
                        />
                        <div className="flex shrink-0 items-center gap-1">
                          {display.kind === "saved" &&
                            viewingAsMaster &&
                            display.entry.visibility ===
                              DataVisibility.hidden && (
                              <BadgeRole type="onlyStaff" />
                            )}
                          {display.kind === "saved" &&
                            viewingAsMaster &&
                            characterId &&
                            campaignSlug && (
                              <CharacterDataVisibilityToggle
                                campaignSlug={campaignSlug}
                                characterId={characterId}
                                characterDataId={display.entry.id}
                                visibility={display.entry.visibility}
                              />
                            )}
                        </div>
                      </div>
                      {referenceData.description && (
                        <Text
                          className="text-muted-fg"
                          children={referenceData.description}
                        />
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

export default CharacterEditorAnagraphic;
