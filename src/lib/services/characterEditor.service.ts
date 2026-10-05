import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataTypeRender,
  DataVisibility,
  Role,
  type PrismaClient,
} from "@prisma/client";
import type { CharacterEditorProps } from "@/components/CharacterEditor";
import { getUserCampaignRole } from "@/lib/authorization";
import { getCharacterByIdScoped } from "@/lib/repositories/character.repository";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import {
  listCharacterDataForCharacterWithDetails,
  type CharacterDataForSheet,
} from "@/lib/repositories/characterData.repository";
import { listDataTypes } from "@/lib/repositories/dataType.repository";
import { listFeaturesForCampaign } from "@/lib/repositories/feature.repository";
import { listReferenceDataForCampaign } from "@/lib/repositories/referenceData.repository";
import { getXpBalance } from "@/lib/services/xp.service";
import { listXpTransactionsForCharacter } from "@/lib/repositories/xpTransaction.repository";
import { filterVisible } from "@/lib/visibility";
import {
  isKnownFeatureFunctionName,
  FT_MISSIVE,
  FT_DOWNTIME,
  FT_PROGRESS,
} from "@/lib/features";
import { progressFeatureSchema } from "@/lib/features/handlers/progress";
import type { CharacterDetail } from "@/lib/validations/character";

// Cronologia XP mostrata da `ModalXpHistory` (dietro click su "Cronologia"):
// un tetto esplicito evita di scaricare l'intera vita di un personaggio
// vecchio ad ogni caricamento della scheda quando la modale non si apre
// nemmeno. Non incide sul saldo (`getXpBalance` usa aggregati SQL separati,
// non questa lista).
const XP_HISTORY_LIMIT = 50;

// head_master/master hanno sempre pieni diritti "master" sulla scheda, su
// qualunque personaggio della campagna. Il supporter (rank più basso, T-0xx:
// prima veniva equiparato a master su tutta la campagna via `forceMaster`
// nella pagina admin, un'incoerenza rispetto alla pagina giocatore) li ha
// SOLO sul proprio personaggio — su quelli altrui resta sola lettura, esatto
// grado di un giocatore qualunque senza Grant.
function resolveIsMaster(role: Role | null, isOwner: boolean): boolean {
  if (role === Role.master || role === Role.head_master) return true;
  if (role === Role.supporter) return isOwner;
  return false;
}

function groupCharacterDataByDataType(
  entries: CharacterDataForSheet[]
): CharacterEditorProps["characterDataGroups"] {
  const groups = new Map<
    number,
    NonNullable<CharacterEditorProps["characterDataGroups"]>[number]
  >();
  for (const entry of entries) {
    const existing = groups.get(entry.dataType.id);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(entry.dataType.id, {
        dataType: {
          id: entry.dataType.id,
          name: entry.dataType.name,
          icon: entry.dataType.icon,
          kind: entry.dataType.kind,
          cardinality: entry.dataType.cardinality,
          assignability: entry.dataType.assignability,
          visibility: entry.dataType.visibility,
        },
        entries: [entry],
      });
    }
  }
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      entries: [...group.entries].sort((a, b) =>
        a.referenceData.name.localeCompare(b.referenceData.name)
      ),
    }))
    .sort((a, b) => a.dataType.name.localeCompare(b.dataType.name));
}

export interface GetCharacterEditorDataParams {
  characterId: number;
  orgSlug: string;
  campaignSlug: string;
  sessionUserId: string;
}

// Fetch/shape completo dietro `CharacterEditor` (scheda personaggio,
// talenti acquisibili, missive/downtime, XP...). Condiviso tra la pagina
// dedicata (characters/[id]/page.tsx), la home campagna (quando c'è un solo
// PG attivo, T-0xx) e la pagina admin (admin/characters/[id]/page.tsx), così
// la query pesante vive in un solo posto.
export async function getCharacterEditorData(
  prisma: PrismaClient,
  {
    characterId,
    orgSlug,
    campaignSlug,
    sessionUserId,
  }: GetCharacterEditorDataParams
): Promise<CharacterEditorProps | null> {
  const character = await getCharacterByIdScoped(
    prisma,
    characterId,
    orgSlug,
    campaignSlug
  );

  if (!character) {
    return null;
  }

  const isOwner = character.userId === sessionUserId;
  const role = await getUserCampaignRole(
    prisma,
    sessionUserId,
    character.campaignId
  );
  const isMaster = resolveIsMaster(role, isOwner);

  const [
    campaign,
    ownedCharacterData,
    xpBalance,
    xpTransactions,
    campaignFeatures,
    campaignDataTypes,
  ] = await Promise.all([
    getCampaignBySlug(prisma, campaignSlug, orgSlug),
    listCharacterDataForCharacterWithDetails(prisma, character.id),
    getXpBalance(prisma, character.id),
    listXpTransactionsForCharacter(prisma, character.id, XP_HISTORY_LIMIT),
    listFeaturesForCampaign(prisma, character.campaignId),
    listDataTypes(prisma, character.campaignId),
  ]);

  // `DataType` di kind `origins`/`assignable` (non `generic` — cataloghi di
  // campagna come Oggetti/Ingredienti, mai assegnabili su una scheda — né
  // `talent`, gestito a parte): i candidati per le sezioni Anagrafica, sia
  // per il gruppo vuoto "campo non ancora valorizzato" (sotto) sia per il
  // catalogo di editing del master.
  const originsDataTypes = campaignDataTypes.filter(
    dataType =>
      (dataType.kind === DataTypeKind.origins ||
        dataType.kind === DataTypeKind.assignable) &&
      dataType.renderAs === DataTypeRender.catalog
  );
  // Catalogo "origini" (razza, fazione, ...): per il master copre TUTTI i
  // `DataType` `origins`/`assignable` della campagna, per mostrare in
  // Anagrafica anche i campi mai valorizzati sul personaggio, permettendone
  // l'assegnazione. Per un giocatore/proprietario resta scoperto ai
  // `DataType` già posseduti PIÙ quelli `assignability: "always"` e
  // `visibility: visible` (T-0xx): l'auto-assegnazione immediata in
  // Anagrafica (`FieldSelfAssignData`), permessa per quella combinazione,
  // deve poter mostrare le opzioni anche prima che il personaggio ne abbia
  // già una.
  const originsDataTypeIds = isMaster
    ? [...new Set(originsDataTypes.map(dt => dt.id))]
    : [
        ...new Set([
          ...ownedCharacterData
            .filter(entry => entry.dataType.kind !== DataTypeKind.talent)
            .map(entry => entry.dataType.id),
          ...originsDataTypes
            .filter(
              dt =>
                dt.assignability === DataTypeAssignability.always &&
                dt.visibility === DataVisibility.visible
            )
            .map(dt => dt.id),
        ]),
      ];
  const referenceData = originsDataTypeIds.length
    ? await listReferenceDataForCampaign(
        prisma,
        character.campaignId,
        originsDataTypeIds
      )
    : [];

  const visibleCharacterData = campaign
    ? filterVisible(
        ownedCharacterData,
        { userId: sessionUserId, isStaff: isMaster },
        { campaign, character, ownedData: ownedCharacterData }
      )
    : [];

  const characterDataGroups =
    groupCharacterDataByDataType(visibleCharacterData);

  // In Anagrafica compaiono anche i `DataType` mai valorizzati sul
  // personaggio (T-0xx): `groupCharacterDataByDataType` sopra produce un
  // gruppo solo per i `DataType` con almeno una `CharacterData` esistente,
  // qui si aggiungono con `entries: []` quelli ancora del tutto assenti. Il
  // master li vede tutti (deve poterli valorizzare); il giocatore solo
  // quelli con `DataType.visibility: visible` E `assignability: "always"`
  // a cardinalità singola — cioè solo quelli che può effettivamente
  // auto-assegnarsi (`FieldSelfAssignData`, T-0xx). Un campo `creationOnly`/
  // `masterOnly` mai valorizzato non è più azionabile dal giocatore (poteva
  // scegliere solo in creazione, o solo il master può assegnarlo): mostrarlo
  // vuoto sarebbe solo un placeholder inerte, quindi resta invisibile
  // finché il master non lo valorizza lui stesso. `visibility` da sola resta
  // invece il gate per i campi GIÀ valorizzati ma nascosti (icona occhio),
  // gestito a parte in `CharacterEditorAnagraphic`.
  {
    const groupedDataTypeIds = new Set(
      characterDataGroups.map(group => group.dataType.id)
    );
    const emptyGroupDataTypes = originsDataTypes.filter(
      dataType =>
        isMaster ||
        (dataType.visibility === DataVisibility.visible &&
          dataType.assignability === DataTypeAssignability.always &&
          dataType.cardinality === DataCardinality.single)
    );
    for (const dataType of emptyGroupDataTypes) {
      if (groupedDataTypeIds.has(dataType.id)) continue;
      characterDataGroups.push({
        dataType: {
          id: dataType.id,
          name: dataType.name,
          icon: dataType.icon ?? "",
          kind: dataType.kind,
          cardinality: dataType.cardinality,
          assignability: dataType.assignability,
          visibility: dataType.visibility,
        },
        entries: [],
      });
    }
    characterDataGroups.sort((a, b) =>
      a.dataType.name.localeCompare(b.dataType.name)
    );
  }

  const registeredFeatures = campaign
    ? campaignFeatures.filter(feature =>
        isKnownFeatureFunctionName(feature.featureType.functionName)
      )
    : [];

  // Missive e progressione PG (talenti + recupero XP alla morte) hanno una
  // card dedicata in `CharacterEditor.tsx`: esclusi qui per non comparire
  // due volte nell'elenco generico delle azioni. Le impostazioni generali
  // downtime (`FT_DOWNTIME`, T-0xx) non sono mai un'azione: hanno solo il
  // segnale `downtimeFeature` sotto, per il gate "downtime disattivato" di
  // `CharacterEditor.tsx`.
  const missiveActions = registeredFeatures.filter(
    feature => feature.featureType.functionName === FT_MISSIVE
  );
  // `talents`/`deathXpRecovery` (T-0xx, fusione in "Progressione PG"): non
  // hanno più una propria `Feature` per campagna, la loro abilitazione vive
  // qui sotto — vedi `progress.ts`.
  const progressFeature =
    registeredFeatures.find(
      feature => feature.featureType.functionName === FT_PROGRESS
    ) ?? null;
  const downtimeFeature =
    registeredFeatures.find(
      feature => feature.featureType.functionName === FT_DOWNTIME
    ) ?? null;
  // Talenti acquisibili e grafo requisiti (T-0xx): NON più calcolati qui —
  // serviva l'intero catalogo di campagna (talenti+oggetti+tutto il resto)
  // solo per popolare due modali che restano chiuse nella maggior parte dei
  // caricamenti della scheda. `CharacterEditor.tsx` li richiede on-demand a
  // `GET .../characters/[id]/talents` (`getCharacterAcquirableTalents`)
  // solo quando una delle due si apre davvero.
  const ownedReferenceDataIds = ownedCharacterData.map(
    entry => entry.referenceData.id
  );
  const progressConfig = progressFeature
    ? progressFeatureSchema.parse(progressFeature.featureData)
    : null;

  const characterDetail: CharacterDetail = {
    id: character.id,
    campaignId: character.campaignId,
    userId: character.userId,
    type: character.type,
    name: character.name,
    background: character.background,
    approvalDate: character.approvalDate,
    deathDate: character.deathDate,
    parkDate: character.parkDate,
    playerNotes: character.playerNotes,
    masterPublicNotes: character.masterPublicNotes,
    masterNotes: character.masterNotes,
    downtimePoints: character.downtimePoints,
    missivePoints: character.missivePoints,
    creationDate: character.creationDate,
    lastUpdateDate: character.lastUpdateDate ?? new Date(),
    campaign: {
      id: character.campaign.id,
      name: character.campaign.name,
      slug: character.campaign.slug,
      organization: {
        slug: character.campaign.organization.slug,
      },
    },
    user: {
      id: character.user.id,
      name: character.user.name,
    },
    bookings: character.bookings.map(booking => ({
      id: booking.id,
      bookingDate: booking.bookingDate,
      paymentDate: booking.paymentDate,
      present: booking.present,
      event: {
        id: booking.event.id,
        name: booking.event.name,
        dateEventStart: booking.event.dateEventStart,
        place: booking.event.place,
      },
    })),
  };

  const toDateInput = (date: Date | null | undefined) =>
    date ? date.toISOString().slice(0, 10) : "";

  const initial = {
    name: characterDetail.name,
    type: characterDetail.type,
    background: characterDetail.background ?? "",
    playerNotes: characterDetail.playerNotes ?? "",
    masterPublicNotes: characterDetail.masterPublicNotes ?? "",
    masterNotes: characterDetail.masterNotes ?? "",
    approvalDate: toDateInput(characterDetail.approvalDate),
    deathDate: toDateInput(characterDetail.deathDate),
    parkDate: toDateInput(characterDetail.parkDate),
  };

  return {
    characterId: characterDetail.id,
    campaignSlug,
    initial,
    initialAvatar: character.avatar,
    isMaster,
    isOwner,
    playerName: characterDetail.user.name,
    characterDataGroups,
    originsCatalog: referenceData,
    missiveActions,
    downtimeFeature,
    progressFeature,
    progressConfig,
    ownedReferenceDataIds,
    downtimePoints: character.downtimePoints,
    missivePoints: character.missivePoints,
    downtimePointsBonus: character.downtimePointsBonus,
    missivePointsBonus: character.missivePointsBonus,
    xpBalance,
    xpTransactions,
  };
}
