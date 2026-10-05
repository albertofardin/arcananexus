// Seed dedicato per la campagna reale "Nuova Frontiera" (T-040): importa il
// catalogo dati (razze, fazioni, divinità, talenti, dicerie, oggetti) e le
// azioni Downtime del regolamento (cap. 16) da CSV — mai trascritti a mano —
// sotto l'organizzazione `arcana-domine` esistente. Richiamato da
// `prisma/seed.ts` come parte del seed classico (`bunx prisma db seed`).
//
// Idempotente: ogni entità è cercata prima per una chiave stabile
// (`ReferenceData.externalId`, nome del `DataType`/evento, `functionName`
// della `Feature`, email dell'utente) e creata solo se assente — ri-eseguire
// questo script non duplica nulla.
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../src/lib/db";
import { auth } from "../../src/lib/auth";
import { getCurrentAssociationYear } from "../../src/lib/authorization";
import { getOrganizationBySlug } from "../../src/lib/repositories/organization.repository";
import {
  createCampaign,
  getCampaignBySlug,
} from "../../src/lib/repositories/campaign.repository";
import {
  createDataType,
  getDataTypeByName,
} from "../../src/lib/repositories/dataType.repository";
import {
  createReferenceData,
  getReferenceDataByExternalId,
} from "../../src/lib/repositories/referenceData.repository";
import {
  createDataRequirement,
  listRequirementsForCampaign,
} from "../../src/lib/repositories/dataRequirement.repository";
import {
  createFeatureType,
  getFeatureTypeByFunctionName,
} from "../../src/lib/repositories/featureType.repository";
import {
  createFeature,
  getFeatureByFunctionName,
} from "../../src/lib/repositories/feature.repository";
import {
  FT_DOWNTIME,
  FT_MISSIVE,
  getFeatureHandler,
} from "../../src/lib/features";
import { readCatalogCsv } from "./paths";
import { cleanHtml } from "./html";
import {
  resolveOggettoDataTypeName,
  buildOggettoDescription,
  type OggettoRow,
} from "./oggetti";
import {
  buildTalentoRequirements,
  resolveTalentoCategory,
  type TalentoRow,
  type TalentiCategoriaRow,
} from "./talenti";
import { parseCsvDate, derivePublicationDate } from "./eventi";

const ORGANIZATION_SLUG = "arcana-domine";
const CAMPAIGN_SLUG = "nuova-frontiera";
const CAMPAIGN_NAME = "Nuova Frontiera";

// Stessa password di test di `prisma/seed.ts` (rispetta il minimo di 8
// caratteri di Better Auth, nessun `minPasswordLength` custom in
// `src/lib/auth.ts`): un solo valore condiviso da ricordare per tutte le
// persone di test della piattaforma.
const TEST_PASSWORD = "ArcanaDomineTest2026!";

function mapStatusToVisibility(status: string): DataVisibility {
  return status.trim().toLowerCase() === "visibile"
    ? DataVisibility.visible
    : DataVisibility.hidden;
}

// ── Helper di idempotenza (stesso pattern di `prisma/seed.ts`) ──────────

async function ensureDataType(
  campaignId: number,
  name: string,
  data: Omit<Parameters<typeof createDataType>[1], "name" | "campaignId">
) {
  const existing = await getDataTypeByName(prisma, campaignId, name);
  if (existing) return existing;
  return createDataType(prisma, { name, campaignId, ...data });
}

async function ensureReferenceDataByExternalId(
  dataTypeId: number,
  externalId: string,
  data: Omit<
    Parameters<typeof createReferenceData>[1],
    "dataTypeId" | "externalId"
  >
) {
  const existing = await getReferenceDataByExternalId(
    prisma,
    dataTypeId,
    externalId
  );
  if (existing) return existing;
  return createReferenceData(prisma, { dataTypeId, externalId, ...data });
}

// Nessuna chiave naturale/unique a schema su `Event`: il nome (unico sulle 8
// righe reali di `table_eventi.csv`) basta come chiave di idempotenza per
// questo import, stesso principio di `getReferenceDataByName` per le
// `ReferenceData` senza `externalId`.
async function ensureEvent(
  campaignId: number,
  name: string,
  data: Omit<
    Prisma.EventUncheckedCreateInput,
    "name" | "campaignId" | "organizationId"
  >
) {
  const existing = await prisma.event.findFirst({
    where: { campaignId, name },
  });
  if (existing) return existing;
  const { organizationId } = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { organizationId: true },
  });
  return prisma.event.create({
    data: { campaignId, organizationId, name, ...data },
  });
}

async function ensureLoggableUser(email: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const result = await auth.api.signUpEmail({
    body: { name, email, password: TEST_PASSWORD },
  });
  if (!result?.user?.id) {
    throw new Error(`signUpEmail non ha restituito un utente per ${email}`);
  }
  const created = await prisma.user.findUnique({
    where: { id: result.user.id },
  });
  if (!created) {
    throw new Error(`Utente ${email} creato da signUpEmail ma non trovato`);
  }
  return created;
}

async function ensureGrant(
  userId: string,
  campaignId: number,
  role: "head_master" | "master" | "supporter"
) {
  await prisma.grant.upsert({
    where: { userId_campaignId: { userId, campaignId } },
    update: { role },
    create: { userId, campaignId, role },
  });
}

async function ensureMembershipForCurrentYear(userId: string) {
  const year = getCurrentAssociationYear();
  await prisma.membership.upsert({
    where: { userId_year: { userId, year } },
    update: {},
    create: {
      userId,
      year,
      startDate: new Date(`${year}-01-01T00:00:00.000Z`),
      endDate: new Date(`${year}-12-31T23:59:59.000Z`),
      // Nessuna FK reale verso Payment su questo campo (vedi schema, stesso
      // trattamento di `prisma/seed.ts`): un valore fittizio rappresenta
      // "quota pagata".
      paymentId: 0,
    },
  });
}

// Esportata (invece di auto-eseguirsi al top-level) così `prisma/seed.ts` può
// richiamarla come parte del seed classico (`bunx prisma db seed`).
export async function seedNuovaFrontiera() {
  console.log("🌱 Seeding Nuova Frontiera started...\n");

  // ── Organizzazione + campagna ──────────────────────────────────────────
  const organization = await getOrganizationBySlug(prisma, ORGANIZATION_SLUG);
  if (!organization) {
    throw new Error(
      `Organizzazione "${ORGANIZATION_SLUG}" mancante: esegui le migrazioni Prisma prima di questo seed.`
    );
  }

  let campaign = await getCampaignBySlug(
    prisma,
    CAMPAIGN_SLUG,
    ORGANIZATION_SLUG
  );
  if (!campaign) {
    campaign = await createCampaign(prisma, {
      name: CAMPAIGN_NAME,
      slug: CAMPAIGN_SLUG,
      description:
        "Campagna reale dell'Associazione Arcana Domine, importata dal " +
        "gestionale precedente (T-040).",
      organizationId: organization.id,
    });
    console.log("✓ Campagna creata:", campaign.name);
  } else {
    console.log("✓ Campagna esistente:", campaign.name);
  }
  const campaignId = campaign.id;

  // ── Razze ────────────────────────────────────────────────────────────
  console.log("\n📂 Razze");
  const dataTypeRazza = await ensureDataType(campaignId, "Razza", {
    kind: DataTypeKind.origins,
    cardinality: DataCardinality.single,
    assignability: DataTypeAssignability.creationOnly,
    sidebarShow: true,
    sidebarOrder: 1,
    icon: "handshake",
  });
  const razzeRows = readCatalogCsv("table_razze");
  for (const row of razzeRows) {
    await ensureReferenceDataByExternalId(
      dataTypeRazza.id,
      `nf-razza-${row.id}`,
      {
        name: row.nome,
        description: row.descrizione.trim() || null,
        visibility: mapStatusToVisibility(row.status),
        flags: { startingPx: Number(row.exp_iniziali) || 0 },
      }
    );
  }
  console.log(`  ✓ ${razzeRows.length} razze (attese 7)`);

  // ── Fazioni ──────────────────────────────────────────────────────────
  console.log("\n📂 Fazioni");
  const dataTypeFazione = await ensureDataType(campaignId, "Fazione", {
    kind: DataTypeKind.assignable,
    cardinality: DataCardinality.single,
    assignability: DataTypeAssignability.creationOnly,
    sidebarShow: true,
    sidebarOrder: 2,
    icon: "flag",
  });
  const fazioniRows = readCatalogCsv("table_fazioni");
  for (const row of fazioniRows) {
    await ensureReferenceDataByExternalId(
      dataTypeFazione.id,
      `nf-fazione-${row.id}`,
      {
        name: row.nome,
        description: row.descrizione.trim() || null,
        visibility: mapStatusToVisibility(row.status),
      }
    );
  }
  console.log(`  ✓ ${fazioniRows.length} fazioni (attese 6)`);

  // ── Divinità (riusa kind: assignable) ─────────────────────────────────
  console.log("\n📂 Divinità");
  const dataTypeDivinita = await ensureDataType(campaignId, "Divinità", {
    kind: DataTypeKind.assignable,
    cardinality: DataCardinality.single,
    assignability: DataTypeAssignability.creationOnly,
    sidebarShow: true,
    sidebarOrder: 3,
    icon: "auto_stories",
  });
  const divinitaRows = readCatalogCsv("table_divinita");
  for (const row of divinitaRows) {
    await ensureReferenceDataByExternalId(
      dataTypeDivinita.id,
      `nf-divinita-${row.id}`,
      {
        name: row.nome,
        description: row.descrizione.trim() || null,
        visibility: mapStatusToVisibility(row.status),
      }
    );
  }
  console.log(`  ✓ ${divinitaRows.length} divinità (attese 5)`);

  // ── Talenti (categorie da flags.category, T-039 groupId per gli OR) ──
  console.log("\n📂 Talenti");
  const dataTypeTalenti = await ensureDataType(campaignId, "Talenti", {
    kind: DataTypeKind.talent,
    cardinality: DataCardinality.multi,
    assignability: DataTypeAssignability.always,
    sidebarShow: false,
    sidebarOrder: 4,
    icon: "talent",
  });

  const talentiCategorieRows: TalentiCategoriaRow[] = readCatalogCsv(
    "table_talenti_categorie"
  );
  const talentiRows: TalentoRow[] = readCatalogCsv("table_talenti");

  // Primo passaggio: import di tutte le 238 righe + mappa csvId -> id DB
  // (necessaria per il secondo passaggio, il grafo requisiti — gli id
  // referenziati da and/or/not_ids_talenti sono id CSV, non id DB).
  const talentoCsvIdToDbId = new Map<number, number>();
  for (const row of talentiRows) {
    const category = resolveTalentoCategory(row, talentiCategorieRows);
    const referenceData = await ensureReferenceDataByExternalId(
      dataTypeTalenti.id,
      `nf-talento-${row.id}`,
      {
        name: row.nome,
        description: row.descrizione.trim() || null,
        visibility: mapStatusToVisibility(row.status),
        flags: {
          cost: Number(row.costo_exp) || 0,
          repeatable: false,
          creationOnly: false,
          category,
        },
      }
    );
    talentoCsvIdToDbId.set(Number(row.id), referenceData.id);
  }
  console.log(`  ✓ ${talentiRows.length} talenti (attesi 238)`);

  // Secondo passaggio: grafo requisiti/blocchi, con gli id CSV già tradotti
  // in id DB e i riferimenti sganciati (righe soft-cancellate nel gestionale
  // precedente) già isolati da `buildTalentoRequirements`.
  const { requirements, skipped } = buildTalentoRequirements(talentiRows);
  const existingRequirements = await listRequirementsForCampaign(
    prisma,
    campaignId
  );
  const existingRequirementKeys = new Set(
    existingRequirements.map(
      r => `${r.definitionId}:${r.requiredDefinitionId}:${r.type}`
    )
  );

  let createdRequirements = 0;
  for (const requirement of requirements) {
    const definitionId = talentoCsvIdToDbId.get(requirement.definitionCsvId);
    const requiredDefinitionId = talentoCsvIdToDbId.get(
      requirement.requiredDefinitionCsvId
    );
    // Entrambi gli id CSV coinvolti in un `RequirementDescriptor` sono già
    // stati verificati risolvere tra le 238 righe reali (vedi
    // `buildTalentoRequirements`): se non fossero nella mappa qui sarebbe un
    // bug del primo passaggio, non un caso atteso — nessun fallback silente.
    if (definitionId === undefined || requiredDefinitionId === undefined) {
      throw new Error(
        `Talento CSV id ${requirement.definitionCsvId} o ${requirement.requiredDefinitionCsvId} ` +
          "non risolto in talentoCsvIdToDbId nonostante validato da buildTalentoRequirements."
      );
    }

    const key = `${definitionId}:${requiredDefinitionId}:${requirement.type}`;
    if (existingRequirementKeys.has(key)) continue;

    await createDataRequirement(prisma, {
      definitionId,
      requiredDefinitionId,
      type: requirement.type,
      // L'id DB della `definition` come `groupId`: stabile e per
      // costruzione univoco per quella `definitionId` (vedi
      // `DataRequirement.groupId` in schema.prisma, T-039).
      groupId: requirement.isOrGroup ? definitionId : null,
    });
    existingRequirementKeys.add(key);
    createdRequirements++;
  }
  console.log(
    `  ✓ ${createdRequirements} DataRequirement creati (${requirements.length} attesi dal CSV, ` +
      `${skipped.length} riferimenti a talenti non presenti tra le 238 righe reali scartati)`
  );
  if (skipped.length > 0) {
    console.log(
      "    (riferimenti scartati, righe soft-cancellate nel gestionale precedente):",
      skipped
        .map(
          s =>
            `talento ${s.definitionCsvId} -> ${s.requiredDefinitionCsvId} (${s.field})`
        )
        .join("; ")
    );
  }

  // ── Dicerie ──────────────────────────────────────────────────────────
  console.log("\n📂 Dicerie");
  const dataTypeDicerie = await ensureDataType(campaignId, "Dicerie", {
    kind: DataTypeKind.generic,
    // `cardinality: null` (T-035/T-048): `kind: "generic"` non è mai
    // assegnabile a un personaggio (`assignability: "none"`, fisso) — un
    // catalogo di consultazione, non un dato di scheda PG.
    cardinality: null,
    assignability: DataTypeAssignability.none,
    sidebarShow: true,
    sidebarOrder: 5,
    icon: "campaign",
  });
  const dicerieRows = readCatalogCsv("table_dicerie");
  for (const row of dicerieRows) {
    await ensureReferenceDataByExternalId(
      dataTypeDicerie.id,
      `nf-diceria-${row.id}`,
      {
        name: row.nome,
        description: cleanHtml(row.descrizione_completa) || "",
        visibility: mapStatusToVisibility(row.status),
      }
    );
  }
  console.log(`  ✓ ${dicerieRows.length} dicerie (attese 29)`);

  // ── Oggetti (split in 8 DataType per categoria) ─────────────────────
  console.log("\n📂 Oggetti");
  const oggettiIcons: Record<string, string> = {
    Ingredienti: "grass",
    Oggetti: "inventory",
    "Oggetti Incantati": "auto_awesome",
    Droghe: "science",
    Malattie: "coronavirus",
    "Tonici da Battaglia": "local_pharmacy",
    "Oggetti Speciali": "star",
    Maledizioni: "warning",
  };
  const oggettiDataTypes = new Map<
    string,
    Awaited<ReturnType<typeof ensureDataType>>
  >();
  let sidebarOrder = 6;
  for (const [name, icon] of Object.entries(oggettiIcons)) {
    const dataType = await ensureDataType(campaignId, name, {
      kind: DataTypeKind.generic,
      // `cardinality: null` (T-035/T-048): come "Dicerie" sopra.
      cardinality: null,
      assignability: DataTypeAssignability.none,
      // T-041 (richiesta owner): le 8 sezioni oggetti restano fuori dalla
      // sidebar di navigazione — consultabili solo via requisiti/scheda PG,
      // non come voci di menu dedicate.
      sidebarShow: false,
      sidebarOrder: sidebarOrder++,
      icon,
    });
    oggettiDataTypes.set(name, dataType);
  }

  const oggettiRows: OggettoRow[] = readCatalogCsv("table_oggetti");
  for (const row of oggettiRows) {
    const dataTypeName = resolveOggettoDataTypeName(row);
    const dataType = oggettiDataTypes.get(dataTypeName);
    if (!dataType) {
      throw new Error(
        `DataType "${dataTypeName}" non predisposto per gli oggetti.`
      );
    }
    await ensureReferenceDataByExternalId(dataType.id, `nf-oggetto-${row.id}`, {
      name: row.nome,
      description: buildOggettoDescription(row) || null,
      // Tutte le righe CSV hanno `status: nascosto`: mappato comunque
      // tramite `mapStatusToVisibility` (non un `hidden` hardcoded) per
      // restare corretto se una futura estrazione ne avesse di visibili.
      visibility: mapStatusToVisibility(row.status),
    });
  }
  console.log(`  ✓ ${oggettiRows.length} oggetti (attesi 923) su 8 DataType`);

  // ── Eventi ───────────────────────────────────────────────────────────
  console.log("\n📂 Eventi");
  const eventiRows = readCatalogCsv("table_eventi");
  for (const row of eventiRows) {
    const dateEventStart = parseCsvDate(row.data_evento, row.id);
    const datePublicationEnd = parseCsvDate(row.scadenza_iscrizioni, row.id);
    const datePublicationStart = derivePublicationDate(
      dateEventStart,
      datePublicationEnd
    );

    await ensureEvent(campaignId, row.nome, {
      place: row.luogo_evento.trim() || null,
      description: cleanHtml(row.descrizione_completa) || null,
      dateEventStart,
      dateEventEnd: dateEventStart,
      datePublicationEnd,
      datePublicationStart,
    });
  }
  console.log(`  ✓ ${eventiRows.length} eventi (attesi 8)`);

  // ── Azioni Downtime (10 righe CSV) ───────────────────────────────────
  // 8 categorie + le 2 righe missiva del CSV ("Missiva a PG"/"Missiva a
  // PNG", che risolvono a `FT_MISSIVE`, destinatario un campo dell'azione).
  // T-0xx (fix catalogo globale): le categorie non sono più una
  // `FeatureType`/`Feature` dedicata per nome — sono semplici stringhe
  // dentro `featureData.categories` del contenitore `FT_DOWNTIME`, una sola
  // `Feature` per l'intera campagna.
  console.log("\n🧩 Azioni Downtime (cap. 16 del regolamento)");
  const downtimeRows = readCatalogCsv("table_azioni_downtime");
  const MISSIVE_LABELS = new Set(["Missiva a PG", "Missiva a PNG"]);
  const categoryNames = Array.from(
    new Set(
      downtimeRows
        .map(row => row.nome)
        .filter(nome => !MISSIVE_LABELS.has(nome))
    )
  );

  // `FT_MISSIVE`: idempotente, `featureData` vuoto (i settaggi reali si
  // configurano da `ModalFeatureMissive`).
  let missiveFeatureType = await getFeatureTypeByFunctionName(
    prisma,
    FT_MISSIVE
  );
  if (!missiveFeatureType) {
    const definition = getFeatureHandler(FT_MISSIVE);
    missiveFeatureType = await createFeatureType(prisma, {
      featureName: definition.featureName,
      functionName: definition.functionName,
      actionSchema: z.toJSONSchema(
        definition.actionSchema
      ) as Prisma.InputJsonValue,
      featureSchema: z.toJSONSchema(
        definition.featureSchema
      ) as Prisma.InputJsonValue,
    });
  }
  const existingMissiveFeature = await getFeatureByFunctionName(
    prisma,
    campaignId,
    FT_MISSIVE
  );
  if (!existingMissiveFeature) {
    await createFeature(prisma, {
      campaignId,
      featureTypeId: missiveFeatureType.id,
      featureData: {},
    });
  }

  // `FT_DOWNTIME`: idem, con l'elenco categorie del CSV in `featureData`.
  let downtimeFeatureType = await getFeatureTypeByFunctionName(
    prisma,
    FT_DOWNTIME
  );
  if (!downtimeFeatureType) {
    const definition = getFeatureHandler(FT_DOWNTIME);
    downtimeFeatureType = await createFeatureType(prisma, {
      featureName: definition.featureName,
      functionName: definition.functionName,
      actionSchema: z.toJSONSchema(
        definition.actionSchema
      ) as Prisma.InputJsonValue,
      featureSchema: z.toJSONSchema(
        definition.featureSchema
      ) as Prisma.InputJsonValue,
    });
  }
  const existingDowntimeFeature = await getFeatureByFunctionName(
    prisma,
    campaignId,
    FT_DOWNTIME
  );
  if (!existingDowntimeFeature) {
    await createFeature(prisma, {
      campaignId,
      featureTypeId: downtimeFeatureType.id,
      featureData: {
        maxPoints: 0,
        notifyUserIds: [],
        categories: categoryNames,
      },
    });
  }
  console.log(
    `  ✓ ${categoryNames.length} categorie downtime attive su Nuova Frontiera`
  );

  // ── Azione Downtime "Impara talento" (T-041) ────────────────────────
  // `talents` (T-019/T-033, handler `talents.ts`) non fa
  // parte delle categorie CSV sopra (non ha una riga dedicata in
  // `table_azioni_downtime`): dimenticata da T-040,
  // attivata qui con lo stesso pattern idempotente (`FeatureType`
  // platform-wide già seedato da `prisma/seed.ts`/qui sopra per gli altri
  // handler, `Feature` per-campagna creata solo se assente).
  console.log('\n🧩 Azione Downtime "Impara talento"');
  const talentsFunctionName = "talents";
  let talentsFeatureType = await getFeatureTypeByFunctionName(
    prisma,
    talentsFunctionName
  );
  if (!talentsFeatureType) {
    const definition = getFeatureHandler(talentsFunctionName);
    talentsFeatureType = await createFeatureType(prisma, {
      featureName: definition.featureName,
      functionName: definition.functionName,
      actionSchema: z.toJSONSchema(
        definition.actionSchema
      ) as Prisma.InputJsonValue,
      featureSchema: z.toJSONSchema(
        definition.featureSchema
      ) as Prisma.InputJsonValue,
    });
  }

  const existingTalentsFeature = await getFeatureByFunctionName(
    prisma,
    campaignId,
    talentsFunctionName
  );
  if (!existingTalentsFeature) {
    await createFeature(prisma, {
      campaignId,
      featureTypeId: talentsFeatureType.id,
      featureData: {},
    });
    console.log("  ✓ talents attivata su Nuova Frontiera");
  } else {
    console.log("  ✓ talents già attiva su Nuova Frontiera");
  }

  // ── Utenti (5 nuovi, nessun Character) ──────────────────────────────
  console.log("\n🔑 Utenti");

  const headmaster = await ensureLoggableUser(
    "headmaster.nuovafrontiera@ad.com",
    "Responsabile Nuova Frontiera (Head Master)"
  );
  await ensureGrant(headmaster.id, campaignId, "head_master");
  await ensureMembershipForCurrentYear(headmaster.id);
  console.log("  ✓ Head master:", headmaster.email);

  const master = await ensureLoggableUser(
    "master.nuovafrontiera@ad.com",
    "Master Nuova Frontiera"
  );
  await ensureGrant(master.id, campaignId, "master");
  await ensureMembershipForCurrentYear(master.id);
  console.log("  ✓ Master:", master.email);

  const supporter = await ensureLoggableUser(
    "supporter.nuovafrontiera@ad.com",
    "Supporter Nuova Frontiera"
  );
  await ensureGrant(supporter.id, campaignId, "supporter");
  await ensureMembershipForCurrentYear(supporter.id);
  console.log("  ✓ Supporter:", supporter.email);

  const player1 = await ensureLoggableUser(
    "player1.nuovafrontiera@ad.com",
    "Giocatore Uno"
  );
  console.log("  ✓ Player 1 (nessun Grant):", player1.email);

  const player2 = await ensureLoggableUser(
    "player2.nuovafrontiera@ad.com",
    "Giocatore Due"
  );
  console.log("  ✓ Player 2 (nessun Grant):", player2.email);

  console.log("\n🎉 Seeding Nuova Frontiera completed successfully!");
  console.log(`   Password condivisa: ${TEST_PASSWORD}`);
}
