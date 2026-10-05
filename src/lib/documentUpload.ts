import {
  DataTypeRender,
  DataVisibility,
  type PrismaClient,
  type ReferenceData,
} from "@prisma/client";
import { isUserCampaignMaster } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getDataTypeByIdScoped } from "@/lib/repositories/dataType.repository";
import {
  createReferenceData,
  getReferenceDataByIdScoped,
  updateReferenceData,
} from "@/lib/repositories/referenceData.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { deleteFileBestEffort, type UploadedFile } from "@/lib/uploadFile";

// Logica di autorizzazione/persistenza dell'upload documenti (T-021),
// estratta dal file router UploadThing (`src/app/api/uploadthing/core.ts`)
// perché sia testabile senza toccare l'SDK/il protocollo UploadThing (niente
// account/token reali in questo ambiente — vedi Note/Log del task): il
// `.middleware()`/`.onUploadComplete()` restano wrapper sottili su queste
// funzioni.

// `type` (non `interface`): l'oggetto restituito da `.middleware()` deve
// essere strutturalmente assegnabile a `ValidMiddlewareObject` di UploadThing
// (che ha un indice `[key: string]: unknown`) — un alias con literal type
// riceve un indice implicito in quel confronto, un'`interface` no (dovrebbe
// dichiararlo esplicitamente, il che romperebbe `keyof`/`Omit` a valle in
// `onUploadComplete` e farebbe collassare i campi al solo indice).
export type DocumentUploadContext = {
  campaignId: number;
  campaignSlug: string;
  dataTypeId: number;
  title: string;
  // Solo in creazione (`referenceDataId` assente): una sostituzione non
  // tocca la descrizione esistente, modificabile solo via rinomina (vedi
  // `applyDocumentUpload`).
  description?: string | null;
  // Solo in creazione, stessa ragione di `description` qui sopra. Assente
  // (`undefined`) equivale a `DataVisibility.visible` (vedi
  // `applyDocumentUpload`).
  visibility?: DataVisibility;
  referenceDataId?: number;
  // Chiave del file precedente (solo in sostituzione di un documento
  // esistente): usata da `applyDocumentUpload` per ripulire lo storage dopo
  // l'upload del nuovo file.
  previousFileKey: string | null;
};

export type DocumentUploadAuthResult =
  | { ok: true; context: DocumentUploadContext }
  | { ok: false; status: number; message: string };

export interface AuthorizeDocumentUploadParams {
  userId: string | null;
  userEmail: string | null;
  campaignSlug: string;
  dataTypeId: number;
  title: string;
  description?: string | null;
  visibility?: DataVisibility;
  referenceDataId?: number;
}

// Autorizza un upload/sostituzione di documento: solo master/head_master
// della campagna possono caricare (criterio T-021: "solo al master").
// Risolve e scopa campagna/`DataType`/`ReferenceData` esistente
// (multi-tenant, mai per id nudo) prima di restituire il contesto che
// `applyDocumentUpload` userà in `onUploadComplete`.
export async function authorizeDocumentUpload(
  prisma: PrismaClient,
  params: AuthorizeDocumentUploadParams
): Promise<DocumentUploadAuthResult> {
  if (!params.userId || !params.userEmail) {
    return { ok: false, status: 401, message: "Non autenticato" };
  }

  const campaign = await getCampaignBySlug(
    prisma,
    params.campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    return { ok: false, status: 404, message: "Campagna non trovata" };
  }

  const isMaster = await isUserCampaignMaster(
    prisma,
    params.userId,
    campaign.id
  );
  if (!isMaster) {
    return { ok: false, status: 403, message: "Permessi insufficienti" };
  }

  const dataType = await getDataTypeByIdScoped(
    prisma,
    params.dataTypeId,
    campaign.id
  );
  if (!dataType || dataType.renderAs !== DataTypeRender.files) {
    return {
      ok: false,
      status: 404,
      message: "Categoria documenti non trovata",
    };
  }

  let previousFileKey: string | null = null;
  if (params.referenceDataId !== undefined) {
    const existing = await getReferenceDataByIdScoped(
      prisma,
      params.referenceDataId,
      campaign.id
    );
    if (!existing || existing.dataTypeId !== dataType.id) {
      return { ok: false, status: 404, message: "Documento non trovato" };
    }
    previousFileKey = existing.fileKey;
  }

  return {
    ok: true,
    context: {
      campaignId: campaign.id,
      campaignSlug: campaign.slug,
      dataTypeId: dataType.id,
      title: params.title,
      description: params.description,
      visibility: params.visibility,
      referenceDataId: params.referenceDataId,
      previousFileKey,
    },
  };
}

// Crea/aggiorna la `ReferenceData` del documento dopo un upload riuscito
// (`onUploadComplete`), poi ripulisce il file precedente su UploadThing se lo
// stiamo sostituendo. `deleteFile` è iniettato (mai `utapi` importato qui
// direttamente): lo chiamante di produzione passa `utapi.deleteFiles`, i test
// passano uno spy, mantenendo questo modulo isolato dall'SDK.
export async function applyDocumentUpload(
  prisma: PrismaClient,
  context: DocumentUploadContext,
  file: UploadedFile,
  deleteFile: (fileKey: string) => Promise<unknown>
): Promise<ReferenceData> {
  const referenceData = context.referenceDataId
    ? await updateReferenceData(prisma, context.referenceDataId, {
        name: context.title,
        fileUrl: file.url,
        fileKey: file.key,
      })
    : await createReferenceData(prisma, {
        dataTypeId: context.dataTypeId,
        name: context.title,
        description: context.description ?? null,
        // Scelta dal master in creazione; se assente i documenti restano
        // visibili di default (scaricabili dai giocatori fin da subito),
        // modificabile comunque in seguito tramite la PATCH generica di
        // `ReferenceData` (stessa regola di visibilità di T-020/T-026).
        visibility: context.visibility ?? DataVisibility.visible,
        fileUrl: file.url,
        fileKey: file.key,
      });

  if (context.previousFileKey && context.previousFileKey !== file.key) {
    // Best-effort: un fallimento nella cleanup del vecchio file non deve far
    // fallire la sostituzione, il nuovo documento è già persistito (stesso
    // approccio dell'avatar upload, vedi `characters/[id]/avatar/route.ts`).
    await deleteFileBestEffort(
      deleteFile,
      context.previousFileKey,
      "previous document file after replace"
    );
  }

  return referenceData;
}
