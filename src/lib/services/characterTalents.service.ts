import {
  DataTypeKind,
  RequirementType,
  type PrismaClient,
} from "@prisma/client";
import type {
  TalentAccordionEntry,
  TalentRequirementEdge,
} from "@/components/TalentList";
import { listCharacterDataForCharacterWithDetails } from "@/lib/repositories/characterData.repository";
import { listDataTypes } from "@/lib/repositories/dataType.repository";
import {
  listReferenceDataForCampaignWithVisibility,
  getReferenceDataNamesByIds,
} from "@/lib/repositories/referenceData.repository";
import { listRequirementsForCampaign } from "@/lib/repositories/dataRequirement.repository";
import { getCampaignById } from "@/lib/repositories/campaign.repository";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import { listUnlockedReferenceDataIdsForCharacter } from "@/lib/repositories/characterTalentUnlock.repository";
import { selectAcquirableTalents } from "@/lib/features/handlers/talents";
import { buildVisibilityConditions, isEntryVisible } from "@/lib/visibility";

export interface GetCharacterAcquirableTalentsParams {
  characterId: number;
  campaignId: number;
  isMaster: boolean;
  userId: string;
}

export interface CharacterAcquirableTalents {
  acquirableTalents: TalentAccordionEntry[];
  talentRequirements: TalentRequirementEdge[];
  // Id dei talenti-catalogo altrimenti `hidden` sbloccati per QUESTO
  // personaggio (T-0xx, occhio master): serve solo alla UI master per
  // decidere il verso dell'occhio (sblocca/blocca di nuovo) — un giocatore
  // non ne fa nulla, li vede già inclusi in `acquirableTalents`.
  unlockedReferenceDataIds: number[];
}

// Estratto da `characterEditor.service.ts` (T-0xx): a differenza del resto
// della scheda PG, questi dati servono solo quando il giocatore apre una
// delle due modali talenti ("Apprendi talenti"/"Talenti acquisiti") — vanno
// dietro un fetch client on-demand (`GET .../characters/[id]/talents`),
// non nel payload eager della pagina. Interroga solo le `ReferenceData` di
// kind `talent` (non l'intero catalogo di campagna, che include anche
// centinaia/migliaia di voci di altri `DataType`, es. "oggetti").
export async function getCharacterAcquirableTalents(
  prisma: PrismaClient,
  {
    characterId,
    campaignId,
    isMaster,
    userId,
  }: GetCharacterAcquirableTalentsParams
): Promise<CharacterAcquirableTalents> {
  const [
    ownedCharacterData,
    dataTypes,
    campaign,
    character,
    unlockedIds,
    allRequirements,
  ] = await Promise.all([
    listCharacterDataForCharacterWithDetails(prisma, characterId),
    listDataTypes(prisma, campaignId),
    getCampaignById(prisma, campaignId),
    getCharacterInCampaign(prisma, characterId, campaignId),
    listUnlockedReferenceDataIdsForCharacter(prisma, characterId),
    listRequirementsForCampaign(prisma, campaignId),
  ]);
  const unlockedReferenceDataIds = new Set(unlockedIds);

  const talentDataTypeIds = dataTypes
    .filter(dt => dt.kind === DataTypeKind.talent)
    .map(dt => dt.id);

  const talentReferenceData = talentDataTypeIds.length
    ? await listReferenceDataForCampaignWithVisibility(
        prisma,
        campaignId,
        talentDataTypeIds
      )
    : [];

  // Archi `visibleWith` (T-050): stessa lista `allRequirements` già caricata
  // per `talentRequirementEdges` sotto, nessuna query aggiuntiva.
  const visibilityConditions = buildVisibilityConditions(allRequirements);

  // Un giocatore non-staff non deve mai vedere un talento `visibility:
  // hidden`/con condizione non soddisfatta nel catalogo apprendibile — bug
  // T-0xx: questo filtro mancava dopo l'estrazione da
  // `characterEditor.service.ts` (che lo applica solo ai talenti già
  // posseduti, non al catalogo). Lo staff bypassa sempre (`isEntryVisible`).
  // `unlockedReferenceDataIds` (T-0xx, occhio master) è un'eccezione
  // per-personaggio SOPRA questa base: un talento `hidden` sbloccato per
  // QUESTO personaggio passa comunque, anche se la condizione/base
  // visibility di campagna lo nasconderebbe — senza toccare
  // `ReferenceData.visibility` stessa (resta hidden per tutti gli altri).
  const visibleTalentReferenceData = campaign
    ? talentReferenceData.filter(
        rd =>
          unlockedReferenceDataIds.has(rd.id) ||
          isEntryVisible({ userId, isStaff: isMaster }, rd, {
            campaign,
            character,
            ownedData: ownedCharacterData,
            visibilityConditions,
          })
      )
    : [];

  const ownedTalentCounts = new Map<number, number>();
  for (const entry of ownedCharacterData) {
    if (entry.dataType.kind !== DataTypeKind.talent) continue;
    const id = entry.referenceData.id;
    ownedTalentCounts.set(id, (ownedTalentCounts.get(id) ?? 0) + 1);
  }
  const ownedTalentReferenceDataIds = new Set(ownedTalentCounts.keys());

  const acquirableTalents = selectAcquirableTalents(
    dataTypes,
    visibleTalentReferenceData,
    {
      isMaster,
      ownedReferenceDataIds: ownedTalentReferenceDataIds,
      ownedCounts: ownedTalentCounts,
    }
  );

  // Grafo requisiti (`requires`/`blocks`) solo per i talenti (`definitionId`
  // in `talentReferenceData`): a differenza del calcolo eager rimosso da
  // `characterEditor.service.ts`, non serve l'intero grafo della campagna —
  // le due modali talenti valutano sempre requisiti/blocchi di UN talento
  // alla volta (`entry.id === definitionId`). Esclude esplicitamente
  // `visibleWith`/`grants` (T-050): l'albero talenti (`TalentList`) mostra
  // solo `requires`/`blocks`, i nuovi tipi sono editor admin, non display di
  // gioco.
  const talentReferenceDataIds = new Set(talentReferenceData.map(rd => rd.id));
  const isTalentTreeEdge = (
    r: (typeof allRequirements)[number]
  ): r is (typeof allRequirements)[number] & {
    type: "requires" | "blocks";
  } => r.type === RequirementType.requires || r.type === RequirementType.blocks;
  const talentRequirementEdges = allRequirements
    .filter(isTalentTreeEdge)
    .filter(r => talentReferenceDataIds.has(r.definitionId));

  const talentNameById = new Map(
    talentReferenceData.map(rd => [rd.id, rd.name])
  );
  const missingNameIds = [
    ...new Set(
      talentRequirementEdges
        .map(r => r.requiredDefinitionId)
        .filter(id => !talentNameById.has(id))
    ),
  ];
  const resolvedNames = await getReferenceDataNamesByIds(
    prisma,
    missingNameIds
  );
  for (const rd of resolvedNames) {
    talentNameById.set(rd.id, rd.name);
  }

  const talentRequirements: TalentRequirementEdge[] =
    talentRequirementEdges.map(r => ({
      definitionId: r.definitionId,
      requiredDefinitionId: r.requiredDefinitionId,
      requiredDefinitionName: talentNameById.get(r.requiredDefinitionId) ?? "",
      type: r.type,
      groupId: r.groupId,
    }));

  return {
    acquirableTalents,
    talentRequirements,
    // Intersecato con `talentReferenceDataIds`: `unlockedReferenceDataIds`
    // letto da DB è scoped al personaggio ma non al `DataType.kind` corrente
    // (per applicazione, non a schema — vedi commento su
    // `CharacterTalentUnlock` in schema.prisma) — filtra qui un'eventuale
    // riga orfana invece di esporla alla UI.
    unlockedReferenceDataIds: unlockedIds.filter(id =>
      talentReferenceDataIds.has(id)
    ),
  };
}
