"use client";

import * as React from "react";
import {
  DataTypeKind,
  type CharacterType,
  type DataCardinality,
  type DataTypeAssignability,
  type DataVisibility,
  type ReferenceData,
} from "@prisma/client";
import CharacterEditorHero from "./CharacterEditorHero";
import CharacterEditorAnagraphic from "./CharacterEditorAnagraphic";
import CharacterEditorNotes from "./CharacterEditorNotes";
import CharacterEditorStatusBanner from "./CharacterEditorStatusBanner";
import CharacterEditorPointBonusBanner from "./CharacterEditorPointBonusBanner";
import ModalXpHistory from "./ModalXpHistory";
import ModalTalents from "./ModalTalents";
import BtnUpdatePointsXp from "./BtnUpdatePointsXp";
import ActionRow from "./ActionRow";
import { useCharacterEditorDraft } from "./useCharacterEditorDraft";
import BtnUpdatePointsDowntime from "./BtnUpdatePointsDowntime";
import BtnUpdatePointsMissive from "./BtnUpdatePointsMissive";
import FieldText from "@/components/_core/FieldText";
import Icon from "@/components/_core/Icon";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import BtnBase from "@/components/_core/BtnBase";
import Card from "@/components/_core/Card";
import Accordion from "@/components/_core/Accordion";
import SaveBar from "@/components/SaveBar";
import { cn } from "@/lib/utils";
import type { CharacterDataForSheet } from "@/lib/repositories/characterData.repository";
import type { FeatureWithType } from "@/lib/repositories/feature.repository";
import type { XpTransactionWithReferenceData } from "@/lib/repositories/xpTransaction.repository";
import { useQueryCharacterTalents } from "@/lib/queries/characterTalents";
import type { TalentAccordionEntry } from "@/components/TalentList";
import type { ProgressFeatureData } from "@/lib/features/handlers/progress.schema";
import { FT_DOWNTIME, FT_MISSIVE } from "@/lib/features/featuresName";
import { missiveFeatureSchema } from "@/lib/features/handlers/missive.schema";
import { downtimeFeatureSchema } from "@/lib/features/handlers/downtime";
import { sumPointBonuses } from "@/lib/features/pointBonus";

export interface CharacterEditorValue {
  name: string;
  type: CharacterType;
  background: string;
  playerNotes: string;
  masterPublicNotes: string;
  masterNotes: string;
  approvalDate: string;
  deathDate: string;
  parkDate: string;
}

export interface CharacterDataGroup {
  dataType: {
    id: number;
    name: string;
    icon: string;
    kind: DataTypeKind;
    cardinality: DataCardinality | null;
    assignability: DataTypeAssignability;
    // Visibilità del CAMPO in sé (anche vuoto) al giocatore, non solo delle
    // singole `CharacterData` già assegnate (T-0xx, vedi
    // `characterEditor.service.ts`).
    visibility: DataVisibility;
  };
  entries: CharacterDataForSheet[];
}

export interface CharacterXpBalance {
  earned: number;
  available: number;
}

// Riusata da `characterEditor.service.ts` (fetch condiviso tra la pagina
// scheda personaggio e la home campagna, quando c'è un solo PG attivo) per
// tipare il valore di ritorno senza duplicare questa forma.
export interface CharacterEditorProps {
  characterId?: number;
  campaignSlug?: string;
  initial: CharacterEditorValue;
  initialAvatar?: string | null;
  isMaster?: boolean;
  isOwner?: boolean;
  playerName?: string;
  characterDataGroups?: CharacterDataGroup[];
  originsCatalog?: ReferenceData[];
  missiveActions?: FeatureWithType[];
  downtimeFeature?: FeatureWithType | null;
  progressFeature?: FeatureWithType | null;
  progressConfig?: ProgressFeatureData | null;
  ownedReferenceDataIds?: number[];
  downtimePoints?: number;
  missivePoints?: number;
  // Massimale personale (T-0xx, talenti "Aggiungi punto Missiva/Downtime"):
  // sommato al `maxPoints`/`maxPerEvent` configurato sulla Feature per
  // ottenere il massimo mostrato a QUESTO personaggio — vedi
  // `resetCampaignPointsForActiveCharacters`, che applica la stessa somma.
  downtimePointsBonus?: number;
  missivePointsBonus?: number;
  xpBalance?: CharacterXpBalance | null;
  xpTransactions?: XpTransactionWithReferenceData[];
}

const CharacterEditor = ({
  characterId,
  campaignSlug,
  initial,
  initialAvatar = null,
  isMaster = false,
  isOwner = false,
  playerName = "",
  characterDataGroups = [],
  originsCatalog = [],
  missiveActions = [],
  downtimeFeature = null,
  progressFeature = null,
  progressConfig = null,
  ownedReferenceDataIds = [],
  downtimePoints = 0,
  missivePoints = 0,
  downtimePointsBonus = 0,
  missivePointsBonus = 0,
  xpBalance = null,
  xpTransactions = [],
}: CharacterEditorProps) => {
  const [avatar, setAvatar] = React.useState<string | null>(initialAvatar);
  // `isMaster` = permesso reale (grant); `masterView` = toggle "Player View"
  // in UI; `viewingAsMaster` = combinazione dei due, cioè "sto vedendo/
  // editando la scheda come master adesso". `canEdit` (sotto, da
  // `useCharacterEditorDraft`) è un'altra cosa ancora: editabilità
  // effettiva, che dipende anche da proprietario/status del PG.
  const [masterView, setMasterView] = React.useState(isMaster);
  const viewingAsMaster = isMaster && masterView;

  // Talenti acquisibili + requisiti (T-0xx): NON più props eager dal server
  // (vedi `characterEditor.service.ts`) — richiesti on-demand la prima volta
  // che si apre il modale talenti (`openTalents` sotto), poi tenuti in
  // cache da TanStack Query per le riaperture successive.
  const [talentsRequested, setTalentsRequested] = React.useState(false);
  const { data: talentsData, isLoading: talentsLoading } =
    useQueryCharacterTalents(
      campaignSlug,
      characterId,
      talentsRequested,
      viewingAsMaster
    );
  // `description: t.description ?? null` normalizza il tipo inferito dallo
  // schema Zod (che marca `description` come chiave opzionale pur
  // richiedendola sempre a runtime — `.nullable()` senza `.optional()`) alla
  // forma richiesta da `TalentAccordionEntry`.
  const acquirableTalents: TalentAccordionEntry[] = (
    talentsData?.acquirableTalents ?? []
  ).map(t => ({ ...t, description: t.description ?? null }));
  const talentRequirements = talentsData?.talentRequirements ?? [];
  const unlockedTalentReferenceDataIds = React.useMemo(
    () => new Set(talentsData?.unlockedReferenceDataIds ?? []),
    [talentsData?.unlockedReferenceDataIds]
  );

  const {
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
  } = useCharacterEditorDraft({
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
  });

  const [xpTransactionsOpen, setXpTransactionsOpen] = React.useState(false);
  const [talentsOpen, setTalentsOpen] = React.useState(false);

  const openTalents = React.useCallback(() => {
    setTalentsRequested(true);
    setTalentsOpen(true);
  }, []);

  const acquiredTalents = characterDataGroups
    .filter(group => group.dataType.kind === DataTypeKind.talent)
    .flatMap(group => group.entries);

  const missiveFeature = missiveActions.find(
    feature => feature.featureType.functionName === FT_MISSIVE
  );
  const missiveActive = !!missiveFeature?.active;

  const downtimeActive = !!downtimeFeature?.active;

  // Talenti (T-0xx, fusione in "Progressione PG"): attivi solo se la
  // Feature contenitore è attiva E il sotto-toggle `talentsEnabled` lo è
  // (indipendente da `deathXpRecoveryEnabled`, che non ha alcuna card qui —
  // il recupero XP alla morte non ha mai avuto un trigger lato giocatore).
  const talentsActive =
    !!progressFeature?.active && !!progressConfig?.talentsEnabled;

  const downtimeData = downtimeFeatureSchema.safeParse(
    downtimeFeature?.featureData
  ).data;
  const missiveData = missiveFeature
    ? missiveFeatureSchema.parse(missiveFeature.featureData)
    : undefined;

  // Bonus/malus del master (`pointBonuses`) per QUESTO personaggio, solo di
  // feature attive: alimentano sia il massimale sia il banner sotto l'Hero.
  const downtimeBonuses = (
    downtimeActive ? (downtimeData?.pointBonuses ?? []) : []
  ).filter(b => b.characterId === characterId);
  const missiveBonuses = (
    missiveActive ? (missiveData?.pointBonuses ?? []) : []
  ).filter(b => b.characterId === characterId);

  const maxDowntimePoints =
    (downtimeData?.maxPoints ?? 0) +
    downtimePointsBonus +
    sumPointBonuses(downtimeBonuses, characterId);

  const maxMissivePoints =
    (missiveData?.maxPerEvent ?? 0) +
    missivePointsBonus +
    sumPointBonuses(missiveBonuses, characterId);

  return (
    <>
      <CharacterEditorHero
        characterId={characterId}
        avatar={avatar}
        onAvatarChange={setAvatar}
        name={value.name}
        onNameChange={name => patch({ name })}
        playerName={playerName}
        isMaster={isMaster}
        viewingAsMaster={viewingAsMaster}
        canEdit={canEdit}
        type={value.type}
        onTypeChange={type => patch({ type })}
        status={status}
        onStatusChange={handleStatusChange}
        masterView={masterView}
        onMasterViewChange={setMasterView}
      />
      {!canEdit && <CharacterEditorStatusBanner status={status} />}
      <CharacterEditorPointBonusBanner
        missive={missiveBonuses}
        downtime={downtimeBonuses}
      />
      <CharacterEditorNotes
        value={value}
        canEdit={canEdit}
        viewingAsMaster={viewingAsMaster}
        onChange={patch}
      />
      <Accordion
        title="Anagrafica"
        titleIcon="person"
        buttonClassName="px-4 gap-4"
      >
        <CharacterEditorAnagraphic
          characterId={characterId}
          campaignSlug={campaignSlug}
          characterDataGroups={characterDataGroups}
          originsCatalog={originsCatalog}
          originsSelection={originsSelection}
          onOriginsSelectionChange={patchOriginSelection}
          originsVisibilityDraft={originsVisibilityDraft}
          onOriginsVisibilityDraftChange={patchOriginVisibility}
          originsSaving={saving}
          viewingAsMaster={viewingAsMaster}
          canEdit={canEdit}
        />
      </Accordion>
      <Accordion
        title="Background"
        titleIcon="tower"
        buttonClassName="px-4 gap-4"
      >
        <FieldText
          multiline
          multilineFullHeight
          value={value.background}
          onChange={background => patch({ background })}
          disabled={!viewingAsMaster}
          className={cn(!viewingAsMaster && "bg-transparent border-none")}
        />
      </Accordion>

      {talentsActive && characterId && campaignSlug && (
        <Card className="flex items-center gap-1 shrink-0 hover:bg-accent rounded-xl overflow-hidden min-h-[40px] pr-1">
          <BtnBase
            onClick={openTalents}
            color="var(--primary)"
            className="flex min-w-0 self-stretch items-center gap-3 flex-1 pl-4 sm:gap-4"
          >
            <Icon className="text-muted-fg" children="talent" />
            <Text
              weight="bolder"
              className="flex-1 text-left"
              children="Talenti"
            />
            {xpBalance && (
              <Btn
                small
                className="bg-card"
                icon="history"
                label="Cronologia"
                labelPosition
                labelClassName="hidden text-right sm:block"
                tooltip="Cronologia"
                onClick={() => setXpTransactionsOpen(true)}
              />
            )}
          </BtnBase>
          <BtnUpdatePointsXp
            characterId={characterId}
            value={draftXpAvailable}
            isMaster={viewingAsMaster}
          />
        </Card>
      )}

      {downtimeActive && (
        <ActionRow
          active={downtimeActive}
          icon="bulb_charging"
          label="Scrivi una nuova Downtime"
          functionName={FT_DOWNTIME}
          characterId={characterId}
          campaignSlug={campaignSlug}
          canEdit={canEdit}
          canSend={downtimePoints > 0}
          emptyLabel="Downtime esaurite"
          counter={
            <BtnUpdatePointsDowntime
              characterId={characterId}
              isMaster={viewingAsMaster}
              value={downtimePoints}
              max={maxDowntimePoints}
            />
          }
        />
      )}

      {missiveActive && (
        <ActionRow
          active={missiveActive}
          icon="send"
          label="Scrivi una nuova Missiva"
          functionName={FT_MISSIVE}
          characterId={characterId}
          campaignSlug={campaignSlug}
          canEdit={canEdit}
          canSend={missivePoints > 0}
          emptyLabel="Missive esaurite"
          counter={
            <BtnUpdatePointsMissive
              characterId={characterId}
              isMaster={viewingAsMaster}
              value={missivePoints}
              max={maxMissivePoints}
            />
          }
        />
      )}

      <ModalXpHistory
        open={xpTransactionsOpen}
        onClose={() => setXpTransactionsOpen(false)}
        xpBalance={xpBalance}
        xpTransactions={xpTransactions}
      />
      <ModalTalents
        open={talentsOpen}
        onClose={() => setTalentsOpen(false)}
        campaignSlug={campaignSlug}
        characterId={characterId}
        viewingAsMaster={viewingAsMaster}
        canEdit={canEdit}
        isLoading={talentsLoading}
        acquiredTalents={acquiredTalents}
        entries={acquirableTalents}
        requirements={talentRequirements}
        ownedReferenceDataIds={ownedReferenceDataIdsSet}
        unlockedReferenceDataIds={unlockedTalentReferenceDataIds}
        draftCounts={talentDraftCounts}
        onAcquireDraft={incrementTalentDraft}
        onReleaseDraft={decrementTalentDraft}
        draftXpAvailable={draftXpAvailable}
      />
      <SaveBar
        dirty={dirty}
        saving={saving}
        saved={saveSuccess}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
};

export default CharacterEditor;
