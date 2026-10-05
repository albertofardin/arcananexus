import {
  Prisma,
  DataTypeKind,
  type PrismaClient,
  type DataType,
  type ReferenceData,
} from "@prisma/client";
import type {
  CreateReferenceDataInput,
  UpdateReferenceDataInput,
  PrismaTransactionClient,
} from "./types";

// `ReferenceData` con la sua `DataType` sempre inclusa (serve a valle per
// risolvere il `kind` — es. validazione `flags` per-`kind` in update, T-016).
export type ReferenceDataWithDataType = ReferenceData & { dataType: DataType };

// `flags` è `Json?`: un `null` esplicito deve mappare a `Prisma.JsonNull`
// (valore SQL NULL), non alla stringa JSON "null" — `undefined` resta
// "campo non toccato" in update / "usa il default" in create.
function toJsonInput(
  value: Prisma.InputJsonValue | null | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
}

export async function getReferenceDataById(
  prisma: PrismaClient,
  id: number,
  includeRequirements = false
): Promise<ReferenceDataWithDataType | null> {
  return prisma.referenceData.findUnique({
    where: { id },
    include: includeRequirements
      ? {
          dataType: true,
          requirements: { include: { requiredDefinition: true } },
          requiredBy: { include: { definition: true } },
        }
      : { dataType: true },
  });
}

// Come `getReferenceDataById`, ma con scoping esplicito su `campaignId` (via
// `dataType.campaignId`): usata dalle route per trattare come "non trovato"
// (404) un id valido ma di un'altra campagna (T-016, invariante multi-tenant).
export async function getReferenceDataByIdScoped(
  prisma: PrismaClient,
  id: number,
  campaignId: number
): Promise<ReferenceDataWithDataType | null> {
  return prisma.referenceData.findUnique({
    where: { id, dataType: { campaignId } },
    include: { dataType: true },
  });
}

// `dataTypeId` accetta anche un array (T-0xx, catalogo "origini" della
// scheda PG): il chiamante filtra su più `DataType` posseduti dal
// personaggio in una sola query invece di caricare l'intero catalogo di
// campagna (che su una campagna matura può contare migliaia di voci, la
// maggior parte irrilevanti per quella scheda).
export async function listReferenceDataForCampaign(
  prisma: PrismaClient,
  campaignId: number,
  dataTypeId?: number | number[]
): Promise<ReferenceData[]> {
  return prisma.referenceData.findMany({
    where: {
      dataType: { campaignId },
      ...(dataTypeId === undefined
        ? {}
        : {
            dataTypeId: Array.isArray(dataTypeId)
              ? { in: dataTypeId }
              : dataTypeId,
          }),
    },
    // `order` più alto in cima (voce più recente/appena creata, vedi
    // `createReferenceData`); `dataTypeId` prima per tenere raggruppate le
    // voci quando la query non è filtrata su un singolo `DataType`.
    orderBy: [{ dataTypeId: "asc" }, { order: "desc" }],
    include: { dataType: true },
  });
}

// Voci scelte per l'Area Stampa (cartellini), scopate a campagna: un id di
// un'altra campagna viene ignorato.
export async function listReferenceDataForPrint(
  prisma: PrismaClient,
  campaignId: number,
  ids: number[]
): Promise<ReferenceDataWithDataType[]> {
  return prisma.referenceData.findMany({
    where: { id: { in: ids }, dataType: { campaignId } },
    include: { dataType: true },
  });
}

// Solo `id`/`name` per un insieme puntuale di voci (T-0xx, risoluzione nomi
// dei requisiti talenti): a differenza di `listReferenceDataForCampaign`,
// non scopa per campagna — il chiamante conosce già gli id esatti (dagli
// archi `DataRequirement`, già scopati a monte) e non ha bisogno di altro
// che l'etichetta da mostrare.
export async function getReferenceDataNamesByIds(
  prisma: PrismaClient,
  ids: number[]
): Promise<Pick<ReferenceData, "id" | "name">[]> {
  if (ids.length === 0) return [];
  return prisma.referenceData.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
}

// Nomi di tutti i talenti definiti in campagna (`DataType.kind: "talent"`),
// assegnati o no — per la checklist del Report Personaggi (T-0xx): un
// talento nel catalogo ma senza ancora un'assegnazione non deve sparire
// dalla ricerca, a differenza delle categorie a torta (Razza/Fazione/...)
// che invece si scoprono solo dai dati realmente assegnati.
export async function listTalentCatalogForCampaign(
  prisma: PrismaClient,
  campaignId: number
) {
  return prisma.referenceData.findMany({
    where: { dataType: { campaignId, kind: DataTypeKind.talent } },
    select: {
      id: true,
      name: true,
      description: true,
      visibility: true,
      flags: true,
    },
    orderBy: { name: "asc" },
  });
}

// Voci di catalogo di un singolo `DataType` (T-026): pensata per chi deve
// poi passare le entries a `filterVisible` (T-020, sidebar/sezione) — la
// condizione di visibilità (`visibleWith`) non è più un campo della voce ma
// un arco `DataRequirement` risolto separatamente dal chiamante (vedi
// `characterTalents.service.ts`).
export async function listReferenceDataForDataType(
  prisma: PrismaClient,
  dataTypeId: number
): Promise<ReferenceData[]> {
  return prisma.referenceData.findMany({
    where: { dataTypeId },
    // `order` più alto in cima (voce più recente/appena creata in testa,
    // vedi `createReferenceData`).
    orderBy: { order: "desc" },
  });
}

// Solo gli id delle voci di un `DataType`: usata dalla route di riordino per
// verificare che l'insieme ricevuto coincida con quello esistente, senza il
// costo dell'elenco completo caricato da `listReferenceDataForDataType`.
export async function listReferenceDataIdsForDataType(
  prisma: PrismaClient,
  dataTypeId: number
): Promise<number[]> {
  const rows = await prisma.referenceData.findMany({
    where: { dataTypeId },
    select: { id: true },
  });
  return rows.map(row => row.id);
}

// Come `listReferenceDataForDataType`, ma sull'intero catalogo di una
// campagna in un'unica query (T-037): la creazione PG (`characters/new`)
// deve valutare `filterVisible` su tutte le `ReferenceData` assegnabili
// prima di costruire il catalogo lato client, e farlo con una query per
// `DataType` sarebbe N query inutili quando serve comunque l'intero
// catalogo in un colpo solo.
export async function listReferenceDataForCampaignWithVisibility(
  prisma: PrismaClient,
  campaignId: number,
  dataTypeId?: number | number[]
): Promise<ReferenceData[]> {
  return prisma.referenceData.findMany({
    where: {
      dataType: { campaignId },
      ...(dataTypeId === undefined
        ? {}
        : {
            dataTypeId: Array.isArray(dataTypeId)
              ? { in: dataTypeId }
              : dataTypeId,
          }),
    },
    // `order` più alto in cima, raggruppato per `dataTypeId` — vedi
    // `listReferenceDataForCampaign`.
    orderBy: [{ dataTypeId: "asc" }, { order: "desc" }],
  });
}

// Guard applicativo per il cambio di `kind` di un `DataType` (PATCH
// `data-types/[dataTypeId]/route.ts`): cambiare `kind` con voci già
// esistenti le lascerebbe con `flags` shape-ati per il vecchio `kind`
// (schema per-`kind`, `validations/referenceDataFlags.ts`) — bloccato a
// monte invece di rischiare dati incoerenti, stessa logica del guard T-036
// su DELETE (`countCharacterDataByDataType`).
export async function countReferenceDataByDataType(
  prisma: PrismaClient,
  dataTypeId: number
): Promise<number> {
  return prisma.referenceData.count({ where: { dataTypeId } });
}

export async function getReferenceDataByName(
  prisma: PrismaClient,
  dataTypeId: number,
  name: string
): Promise<ReferenceData | null> {
  return prisma.referenceData.findFirst({
    where: {
      dataTypeId,
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
  });
}

// Lookup per import legacy idempotenti (T-024/T-040): a differenza del
// nome (che può duplicarsi legittimamente — es. 16 nomi di oggetti duplicati
// nell'estrazione "Nuova Frontiera", causati da record diversi con lo stesso
// nome ma id sorgente diversi), `externalId` è la chiave stabile scelta
// dall'importer (prefisso + id del gestionale di origine, es.
// `nf-oggetto-123`). Scoped su `dataTypeId` come `getReferenceDataByName`,
// non globale: stessa unità di idempotenza (un `DataType` per campagna).
export async function getReferenceDataByExternalId(
  prisma: PrismaClient,
  dataTypeId: number,
  externalId: string
): Promise<ReferenceData | null> {
  return prisma.referenceData.findFirst({
    where: { dataTypeId, externalId },
  });
}

// `order` non è tra i campi accettati in input: viene assegnato qui in coda
// alle voci esistenti dello stesso `dataTypeId` (T-021), così ogni entry ha
// sempre un ordinamento esplicito senza bisogno di un riordino manuale a
// valle (drag&drop resta il modo per cambiarlo, non per assegnarlo la
// prima volta).
// Accetta `PrismaTransactionClient` (T-0xx, creazione atomica talento +
// requisiti in bozza): la route POST la chiama dentro una `prisma.$transaction`
// insieme a `createDataRequirement`, così un fallimento su un requisito fa
// rollback anche della voce appena creata invece di lasciarla orfana.
export async function createReferenceData(
  prisma: PrismaTransactionClient,
  data: CreateReferenceDataInput
): Promise<ReferenceData> {
  const { _max } = await prisma.referenceData.aggregate({
    where: { dataTypeId: data.dataTypeId },
    _max: { order: true },
  });
  return prisma.referenceData.create({
    data: {
      dataTypeId: data.dataTypeId,
      name: data.name,
      description: data.description,
      flags: toJsonInput(data.flags),
      visibility: data.visibility,
      fileUrl: data.fileUrl,
      fileKey: data.fileKey,
      externalId: data.externalId,
      order: (_max.order ?? -1) + 1,
    },
    include: { dataType: true },
  });
}

export async function updateReferenceData(
  prisma: PrismaClient,
  id: number,
  data: UpdateReferenceDataInput
): Promise<ReferenceData> {
  return prisma.referenceData.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      flags: toJsonInput(data.flags),
      visibility: data.visibility,
      fileUrl: data.fileUrl,
      fileKey: data.fileKey,
      externalId: data.externalId,
    },
    include: { dataType: true },
  });
}

// Riordino manuale delle voci di un `DataType` (drag&drop master-side,
// qualunque `renderAs` — files, catalog o pages): assegna `order` in
// blocco secondo l'array di id ricevuto,
// che rappresenta l'ordine di visualizzazione dall'alto verso il basso.
// L'`order` più alto va in cima (tutte le query di listing ordinano
// `order desc`), quindi il primo id dell'array (in cima) riceve l'indice
// invertito: `orderedIds.length - 1`. Non valida qui che gli id
// appartengano al `dataTypeId` indicato: la route chiamante lo garantisce
// (stessa lista letta e riscritta, T-021 pattern).
export async function reorderReferenceData(
  prisma: PrismaClient,
  orderedIds: number[]
): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.referenceData.update({
        where: { id },
        data: { order: orderedIds.length - 1 - index },
      })
    )
  );
}

// Accetta `PrismaClient | Prisma.TransactionClient` (round 2, T-036): la
// route DELETE la chiama con lo stesso `tx` del guard
// `countCharacterDataByReferenceData` precedente, dentro un'unica
// `prisma.$transaction`, per chiudere la finestra TOCTOU tra il check e la
// cancellazione effettiva.
export async function deleteReferenceData(
  prisma: PrismaTransactionClient,
  id: number
): Promise<ReferenceData> {
  return prisma.referenceData.delete({
    where: { id },
  });
}
