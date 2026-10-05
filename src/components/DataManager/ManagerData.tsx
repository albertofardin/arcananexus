import * as React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DataTypeKind, DataTypeRender } from "@prisma/client";
import ButtonCreateDataCatalog from "./ButtonCreateDataCatalog";
import ManagerDataCatalogs from "./ManagerDataCatalogs";
import ButtonCreateDataPage from "./ButtonCreateDataPage";
import ManagerDataPages from "./ManagerDataPages";
import ButtonCreateDataFile from "./ButtonCreateDataFile";
import ManagerDataFiles from "./ManagerDataFiles";
import type { ContentEntry } from "./types";
import type { EntryFormAdvancedConfig } from "./useEntryForm";
import ButtonEditingToggle from "./ButtonEditingToggle";
import ButtonCreateDataTalent from "./ButtonCreateDataTalent";
import ManagerDataTalents from "./ManagerDataTalents";
import ButtonExportTalentsCsv from "./ButtonExportTalentsCsv";
import ButtonImportTalentsCsv from "./ButtonImportTalentsCsv";
import { readTalentFlags } from "./talentsCsv";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  isUserCampaignHelper,
  isUserCampaignMaster,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getDataTypeByName } from "@/lib/repositories/dataType.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import {
  FT_PROGRESS,
  FT_MISSIVE,
  FT_DOWNTIME,
} from "@/lib/features/featuresName";
import { progressFeatureSchema } from "@/lib/features/handlers/progress";
import {
  listReferenceDataForDataType,
  listReferenceDataForCampaignWithVisibility,
} from "@/lib/repositories/referenceData.repository";
import { listRequirementsForCampaign } from "@/lib/repositories/dataRequirement.repository";
import { getUserCharacterInCampaign } from "@/lib/repositories/character.repository";
import { listOwnedCharacterDataInCampaign } from "@/lib/repositories/characterData.repository";
import { buildVisibilityConditions, filterVisible } from "@/lib/visibility";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import HeroPage from "@/components/HeroPage";
import { EmptyCard } from "@/components/Feedback";
import type { TalentRequirementEdge } from "@/components/TalentList";

interface IManagerData {
  campaignSlug: string;
  dataSlug: string;
  editing?: boolean;
  backLink?: React.ReactNode;
}

export default async function ManagerData({
  campaignSlug,
  dataSlug,
  editing = false,
  backLink,
}: IManagerData) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    notFound();
  }

  const campaign = await getCampaignBySlug(
    prisma,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    notFound();
  }

  const dataType = await getDataTypeByName(
    prisma,
    campaign.id,
    decodeURIComponent(dataSlug)
  );
  if (!dataType) {
    notFound();
  }

  const isMaster = await isUserCampaignMaster(
    prisma,
    session.user.id,
    campaign.id
  );
  const isStaff =
    isMaster ||
    (await isUserCampaignHelper(prisma, session.user.id, campaign.id));

  // `sidebarShow` nasconde la categoria dalla navigazione
  // * Un Giocatore che ne conosce l'URL non deve vederla.
  // * Un Master che ne conosce l'URL deve poter gestirne i data.
  if (!dataType.sidebarShow && !isStaff) {
    notFound();
  }

  // "Talenti" (kind: talent) dipende interamente dal sotto-toggle
  // `talentsEnabled` di "Progressione PG" (T-0xx, fusione — talenti non ha
  // più una propria Feature): se disabilitato, la categoria non è
  // raggiungibile da nessuno, staff incluso — riattivarla dall'admin delle
  // feature è l'unico modo per tornare a gestirla/vederla (stessa regola
  // applicata in `admin/data-types` e in
  // `/api/campaigns/[campaignSlug]/data-types`).
  // `missiveActive`/`downtimeActive` (T-0xx, flag talento "Aggiungi punto
  // Missiva/Downtime"): condizionano solo la visibilità delle due checkbox
  // in `FlagsForm` (talenti di una campagna senza quella Feature attiva non
  // devono poterle impostare), calcolati qui insieme a `progressFeature`
  // per restare a un'unica tornata di query invece di tre sequenziali.
  let missiveActive = false;
  let downtimeActive = false;
  if (dataType.kind === DataTypeKind.talent) {
    const [progressFeature, missiveFeature, downtimeFeature] =
      await Promise.all([
        getFeatureByFunctionName(prisma, campaign.id, FT_PROGRESS),
        getFeatureByFunctionName(prisma, campaign.id, FT_MISSIVE),
        getFeatureByFunctionName(prisma, campaign.id, FT_DOWNTIME),
      ]);
    const talentsEnabled =
      !!progressFeature &&
      progressFeatureSchema.parse(progressFeature.featureData).talentsEnabled;
    if (!talentsEnabled) {
      notFound();
    }
    missiveActive = !!missiveFeature;
    downtimeActive = !!downtimeFeature;
  }

  const character = await getUserCharacterInCampaign(
    prisma,
    session.user.id,
    campaign.id
  );
  const [ownedData, entries, requirementEdges] = await Promise.all([
    listOwnedCharacterDataInCampaign(prisma, campaign.id, {
      userId: session.user.id,
      characterId: character?.id ?? null,
    }),
    listReferenceDataForDataType(prisma, dataType.id),
    listRequirementsForCampaign(prisma, campaign.id),
  ]);
  // Archi `visibleWith` (T-050): senza, una voce "Visibile con X" sarebbe
  // mostrata a tutti i non-staff in base alla sola `visibility` di base.
  const visibilityConditions = buildVisibilityConditions(requirementEdges);
  const visibleEntries = filterVisible(
    entries,
    { userId: session.user.id, isStaff },
    { campaign, character, ownedData, visibilityConditions }
  );

  const contentEntries: ContentEntry[] = visibleEntries.map(entry => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    visibility: entry.visibility,
    flags: entry.flags,
  }));

  const advancedConfig: EntryFormAdvancedConfig | undefined = {
    kind: dataType.kind,
    missiveActive,
    downtimeActive,
  };

  let manager: React.ReactNode;
  let headerAction: React.ReactNode;

  // "Talenti" (kind: talent, T-046) è un caso speciale, indipendente da
  // `renderAs`: sempre gestito da `ManagerDataTalents` (raggruppamento per
  // categoria, niente riordino manuale). Da round 3, "Talenti" non ha più
  // una pagina/route dedicata: è raggiunto esattamente come ogni altro
  // DataType, dalle due `page.tsx` gemelle che montano questo componente
  // (`data/[dataSlug]` per i giocatori, `admin/data-types/[dataSlug]` per il
  // master con `editing` di default a true) — `sidebarShow` è sempre `true`,
  // quindi la sidebar linka sempre alla prima. Il form usa il componente
  // dedicato `ModalEditDataTalent`/`ButtonCreateDataTalent` (non il generico
  // `ModalEditDataCatalog`): gli attributi di un talento sono un insieme
  // fisso e noto, diverso dagli altri kind derivati genericamente dallo
  // schema Zod (`FlagsForm`).
  if (dataType.kind === DataTypeKind.talent) {
    // Grafo requisiti (`requires`/`blocks`) dell'intera campagna, così
    // `ManagerDataTalents` può mostrare i badge "Richiede: X" a QUALSIASI
    // viewer (non solo al master, T-0xx) senza dover chiamare l'endpoint
    // `.../requirements`, che è admin-only — filtrato alle sole voci
    // `visibleReferenceData` (stesso `filterVisible`/contesto già usato sopra
    // per `visibleEntries`, solo esteso all'intero catalogo campagna invece
    // che al solo `dataType` corrente): un requisito verso una voce nascosta
    // al viewer non deve rivelarne il nome.
    const campaignReferenceData =
      await listReferenceDataForCampaignWithVisibility(prisma, campaign.id);
    const visibleReferenceData = filterVisible(
      campaignReferenceData,
      { userId: session.user.id, isStaff },
      { campaign, character, ownedData, visibilityConditions }
    );
    const visibleReferenceDataIds = new Set(
      visibleReferenceData.map(rd => rd.id)
    );
    const referenceDataNameById = new Map(
      visibleReferenceData.map(rd => [rd.id, rd.name])
    );
    // Archi con entrambi gli estremi visibili al viewer (tutti e 4 i tipi):
    // servono al CSV export/import, che porta anche `visibleWith`/`grants`.
    const visibleEdges = requirementEdges.filter(
      edge =>
        visibleReferenceDataIds.has(edge.definitionId) &&
        visibleReferenceDataIds.has(edge.requiredDefinitionId)
    );
    // Solo `requires`/`blocks` per il display "albero talenti":
    // `visibleWith`/`grants` (T-050) sono archi dell'editor admin, non dei
    // badge — stesso filtro esplicito di `characterTalents.service.ts`. Type
    // guard (non un semplice `.filter(cb)`) per restringere `edge.type` a due
    // sole opzioni agli occhi del compilatore, richiesto da
    // `TalentRequirementEdge`.
    const visibleRequirementEdges = visibleEdges.filter(
      (
        edge
      ): edge is (typeof visibleEdges)[number] & {
        type: "requires" | "blocks";
      } => edge.type === "requires" || edge.type === "blocks"
    );
    const talentRequirements: TalentRequirementEdge[] =
      visibleRequirementEdges.map(edge => ({
        definitionId: edge.definitionId,
        requiredDefinitionId: edge.requiredDefinitionId,
        requiredDefinitionName:
          referenceDataNameById.get(edge.requiredDefinitionId) ?? "",
        type: edge.type,
        groupId: edge.groupId,
      }));
    // Per il CSV export/import (`Richiede`/`Blocca`/`Visibile con`/`Aggiunge`):
    // catalogo dell'intera
    // campagna (nome ↔ id, un requisito può attraversare categorie) e gli
    // gli archi `visibleEdges` (col loro `id`) — necessario per
    // poterli rimuovere via DELETE in fase di apply, a differenza degli
    // archi passati a `ManagerDataTalents` (solo visualizzazione).
    const catalogEntries = visibleReferenceData.map(rd => ({
      id: rd.id,
      name: rd.name,
    }));
    // Categorie esistenti, suggerite nel campo categoria del modal talento.
    const talentCategories = Array.from(
      new Set(
        contentEntries
          .map(e => readTalentFlags(e.flags).category)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    manager = (
      <ManagerDataTalents
        campaignSlug={campaign.slug}
        dataTypeId={dataType.id}
        entries={contentEntries}
        isMaster={editing && isMaster}
        missiveActive={missiveActive}
        downtimeActive={downtimeActive}
        requirements={talentRequirements}
        categories={talentCategories}
      />
    );
    headerAction = (
      <div className="flex flex-wrap gap-2">
        <ButtonExportTalentsCsv
          entries={contentEntries}
          catalogEntries={catalogEntries}
          requirementEdges={visibleEdges}
        />
        <ButtonImportTalentsCsv
          campaignSlug={campaign.slug}
          dataTypeId={dataType.id}
          entries={contentEntries}
          catalogEntries={catalogEntries}
          requirementEdges={visibleEdges}
        />
        <ButtonCreateDataTalent
          campaignSlug={campaign.slug}
          dataTypeId={dataType.id}
          missiveActive={missiveActive}
          downtimeActive={downtimeActive}
          categories={talentCategories}
        />
      </div>
    );
  } else {
    switch (dataType.renderAs) {
      case DataTypeRender.files:
        manager = (
          <ManagerDataFiles
            campaignSlug={campaign.slug}
            dataTypeId={dataType.id}
            documents={visibleEntries.map(entry => ({
              id: entry.id,
              name: entry.name,
              description: entry.description,
              fileUrl: entry.fileUrl,
              visibility: entry.visibility,
            }))}
            isMaster={editing && isMaster}
          />
        );
        headerAction = (
          <ButtonCreateDataFile
            campaignSlug={campaign.slug}
            dataTypeId={dataType.id}
          />
        );
        break;

      case DataTypeRender.pages:
        manager = (
          <ManagerDataPages
            campaignSlug={campaign.slug}
            dataSlug={dataSlug}
            dataTypeId={dataType.id}
            entries={contentEntries}
            isMaster={editing && isMaster}
          />
        );
        headerAction = (
          <ButtonCreateDataPage
            campaignSlug={campaign.slug}
            dataTypeId={dataType.id}
          />
        );
        break;

      case DataTypeRender.catalog:
      default:
        manager = (
          <ManagerDataCatalogs
            campaignSlug={campaign.slug}
            dataTypeId={dataType.id}
            entries={contentEntries}
            isMaster={editing && isMaster}
            advanced={advancedConfig}
          />
        );
        headerAction = (
          <ButtonCreateDataCatalog
            campaignSlug={campaign.slug}
            dataTypeId={dataType.id}
            advanced={advancedConfig}
          />
        );
    }
  }

  return (
    <>
      {(backLink || isMaster) && (
        <div className="flex justify-between">
          {backLink}
          <div className="flex-1" />
          {isMaster && <ButtonEditingToggle editing={editing} />}
        </div>
      )}
      <HeroPage
        title={dataType.name}
        subtitle={dataType.description ?? undefined}
        action={editing && isMaster ? headerAction : undefined}
      />
      {visibleEntries.length === 0 ? (
        <EmptyCard
          icon="inventory"
          title="Nessun contenuto disponibile"
          message="Non ci sono contenuti da mostrare qui al momento"
        />
      ) : (
        manager
      )}
    </>
  );
}
