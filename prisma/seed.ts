import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataTypeRender,
  RequirementType,
} from "@prisma/client";
import { prisma } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { getCurrentAssociationYear } from "../src/lib/authorization";
import {
  createOrganization,
  getOrganizationBySlug,
} from "../src/lib/repositories/organization.repository";
import {
  createCampaign,
  getCampaignBySlug,
} from "../src/lib/repositories/campaign.repository";
import {
  createDataType,
  getDataTypeByName,
} from "../src/lib/repositories/dataType.repository";
import {
  createReferenceData,
  getReferenceDataByName,
} from "../src/lib/repositories/referenceData.repository";
import {
  createDataRequirement,
  listOutgoingRequirements,
} from "../src/lib/repositories/dataRequirement.repository";
import {
  createCharacter,
  getUserCharacterInCampaign,
} from "../src/lib/repositories/character.repository";
import { getXpBalance } from "../src/lib/services/xp.service";
import {
  assignCharacterData,
  assignRaceWithInitialXp,
  purchaseTalent,
} from "../src/lib/seed/characterAssignment";
import {
  DEMO_CHARACTER_EXPECTED_XP_BALANCE,
  RACE_STARTING_PX,
  TALENT_COSTS,
} from "../src/lib/seed/demoCampaignPlan";
import {
  ensureFeatureTypesRegistered,
  listRegisteredFeatureHandlers,
} from "../src/lib/features";
import { seedNuovaFrontiera } from "./seed-nuova-frontiera/index";

// Password condivisa da tutte le persone di test create da questo seed
// (rispetta il minimo di 8 caratteri di Better Auth, nessun `minPasswordLength`
// custom in `src/lib/auth.ts`). Documentata anche in
// `.task/qa-report-fase-1-backend.md`.
const TEST_PASSWORD = "ArcanaDomineTest2026!";

// Crea (se manca) un utente davvero loggabile via Better Auth email/password:
// passa da `auth.api.signUpEmail` invece di un `prisma.user.create` a mano,
// così `Account` viene creato con la password hashata correttamente dalla
// libreria. Idempotente: se l'utente esiste già (email), lo riusa così com'è.
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

async function main() {
  console.log("🌱 Seeding started...\n");

  // ============================================================================
  // USERS
  // ============================================================================
  const adminUser = await prisma.user.upsert({
    where: {
      email: "admin@ad.com",
    },
    update: {},
    create: {
      id: "1",
      email: "admin@ad.com",
      name: "Admin",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log("✓ Admin user:", adminUser.email);

  // ============================================================================
  // ORGANIZATION 1: ARCANA DOMINE
  // Created by migration 20260706110117_add_organization_and_campaign_scoping
  // (reference data pinned to id = 1) — the seed only relies on it here.
  // ============================================================================
  console.log("\n📂 Organization 1: Arcana Domine");

  const org1 = await getOrganizationBySlug(prisma, "arcana-domine");
  if (!org1) {
    throw new Error(
      "Default 'arcana-domine' organization is missing. Run `bunx prisma migrate deploy` before seeding."
    );
  }
  console.log("  ✓ Organization exists:", org1.name);

  // Campaign 1.1: Campaign 1
  let campaign1_1 = await getCampaignBySlug(
    prisma,
    "campaign1",
    "arcana-domine"
  );
  if (!campaign1_1) {
    campaign1_1 = await createCampaign(prisma, {
      name: "Campaign 1",
      slug: "campaign1",
      description: "The first campaign in Arcana Domine",
      organizationId: org1.id,
    });
    console.log("  ✓ Campaign created:", campaign1_1.name);
  } else {
    console.log("  ✓ Campaign exists:", campaign1_1.name);
  }

  // NOTA (T-032): i 4 `DataType` legacy pre-metamodel di questa campagna
  // ("Regolamento", "Bandi", "PNG", "Cronache" — generici, senza `kind`/
  // `ReferenceData`) sono stati rimossi. Duplicavano concettualmente i
  // `DataType` del metamodel T-023 più sotto (in particolare "Regolamento"
  // vs "Regolamenti", `kind: document`), una volta consolidata qui la
  // campagna d'esempio del metamodel (in origine una campagna separata).
  // Verificato che nessuna `ReferenceData` li referenziasse e che nessun
  // test QA T-1..T-14 dipendesse dal loro nome (solo conteggio generico in
  // `qa-report-fase-1-backend.md`/`test-users.md`, che non li nominano —
  // vedi il task T-032 in `.task/` per la motivazione completa).

  // Events for Campaign 1.1
  const event1_1_1 = await prisma.event.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      organizationId: campaign1_1.organizationId,
      campaignId: campaign1_1.id,
      name: "The Awakening",
      place: "Mystwood Forest",
      description:
        "# The Awakening\n\nAn ancient power stirs in the Mystwood Forest. Heroes are called to investigate mysterious disappearances and uncover the truth behind the awakening darkness.",
      datePublicationStart: new Date("2024-01-01"),
      datePublicationEnd: new Date("2024-02-15"),
      dateEventStart: new Date("2024-03-01"),
      dateEventEnd: new Date("2024-03-01"),
    },
  });
  console.log("    ✓ Event 1:", event1_1_1.name);

  const event1_1_2 = await prisma.event.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      organizationId: campaign1_1.organizationId,
      campaignId: campaign1_1.id,
      name: "Shadows Rising",
      place: "Castle Darkmore",
      description:
        "# Shadows Rising\n\nThe darkness spreads. Castle Darkmore becomes the battleground where heroes must stand against the rising shadows threatening the realm.",
      datePublicationStart: new Date("2024-06-01"),
      datePublicationEnd: new Date("2024-08-15"),
      dateEventStart: new Date("2024-09-01"),
      dateEventEnd: new Date("2024-09-01"),
    },
  });
  console.log("    ✓ Event 2:", event1_1_2.name);

  const event1_1_3 = await prisma.event.upsert({
    where: { id: 15 },
    update: {},
    create: {
      id: 15,
      organizationId: campaign1_1.organizationId,
      campaignId: campaign1_1.id,
      name: "The Final Stand",
      place: "Mystwood Forest",
      description:
        "# The Final Stand\n\nReturn to where it all began. The forces of darkness gather for one final assault. Will the heroes prevail, or will the realm fall into eternal shadow?",
      datePublicationStart: new Date("2025-01-01"),
      datePublicationEnd: new Date("2025-03-15"),
      dateEventStart: new Date("2025-04-15"),
      dateEventEnd: new Date("2025-04-15"),
    },
  });
  console.log("    ✓ Event 3:", event1_1_3.name);

  const event1_1_4 = await prisma.event.upsert({
    where: { id: 16 },
    update: {},
    create: {
      id: 16,
      organizationId: campaign1_1.organizationId,
      campaignId: campaign1_1.id,
      name: "New Beginnings",
      place: "Kingdom of Light",
      description:
        "# New Beginnings\n\nWith the darkness vanquished, the realm enters a new age. Celebrate the victory and forge new alliances as peace returns to the land.",
      datePublicationStart: new Date("2025-06-01"),
      datePublicationEnd: new Date("2025-09-15"),
      dateEventStart: new Date("2025-10-15"),
      dateEventEnd: new Date("2025-10-15"),
    },
  });
  console.log("    ✓ Event 4:", event1_1_4.name);

  // Campaign 1.2: Winter Chronicles
  let campaign1_2 = await getCampaignBySlug(
    prisma,
    "winter-chronicles",
    "arcana-domine"
  );
  if (!campaign1_2) {
    campaign1_2 = await createCampaign(prisma, {
      name: "Winter Chronicles",
      slug: "winter-chronicles",
      description: "A winter-themed campaign full of frost and magic",
      organizationId: org1.id,
    });
    console.log("  ✓ Campaign created:", campaign1_2.name);
  } else {
    console.log("  ✓ Campaign exists:", campaign1_2.name);
  }

  // DataTypes for Campaign 1.2
  const dataType1_2_1 = await prisma.dataType.upsert({
    where: { id: 5 },
    update: {},
    create: {
      id: 5,
      organizationId: campaign1_2.organizationId,
      campaignId: campaign1_2.id,
      name: "Regolamento",
    },
  });
  console.log("    ✓ DataType 1:", dataType1_2_1.name);

  const dataType1_2_2 = await prisma.dataType.upsert({
    where: { id: 6 },
    update: {},
    create: {
      id: 6,
      organizationId: campaign1_2.organizationId,
      campaignId: campaign1_2.id,
      name: "Lore",
    },
  });
  console.log("    ✓ DataType 2:", dataType1_2_2.name);

  const dataType1_2_3 = await prisma.dataType.upsert({
    where: { id: 7 },
    update: {},
    create: {
      id: 7,
      organizationId: campaign1_2.organizationId,
      campaignId: campaign1_2.id,
      name: "Magia",
    },
  });
  console.log("    ✓ DataType 3:", dataType1_2_3.name);

  // Events for Campaign 1.2
  const event1_2_1 = await prisma.event.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      organizationId: campaign1_2.organizationId,
      campaignId: campaign1_2.id,
      name: "Winter's Arrival",
      place: "Frostpine Village",
      description:
        "# Winter's Arrival\n\nThe first snow has fallen earlier than expected. Strange symbols appear in the frost, and the elders speak of ancient prophecies awakening.",
      datePublicationStart: new Date("2023-09-01"),
      datePublicationEnd: new Date("2023-11-15"),
      dateEventStart: new Date("2023-12-01"),
      dateEventEnd: new Date("2023-12-01"),
    },
  });
  console.log("    ✓ Event 1:", event1_2_1.name);

  const event1_2_2 = await prisma.event.upsert({
    where: { id: 4 },
    update: {},
    create: {
      id: 4,
      organizationId: campaign1_2.organizationId,
      campaignId: campaign1_2.id,
      name: "Frost Festival",
      place: "Winterhaven Village",
      description:
        "# Frost Festival\n\nJoin the annual Frost Festival in Winterhaven Village. Mysteries unfold as the village prepares for the longest night of winter.",
      datePublicationStart: new Date("2024-06-01"),
      datePublicationEnd: new Date("2024-11-15"),
      dateEventStart: new Date("2024-12-15"),
      dateEventEnd: new Date("2024-12-15"),
    },
  });
  console.log("    ✓ Event 2:", event1_2_2.name);

  const event1_2_3 = await prisma.event.upsert({
    where: { id: 17 },
    update: {},
    create: {
      id: 17,
      organizationId: campaign1_2.organizationId,
      campaignId: campaign1_2.id,
      name: "The Eternal Ice",
      place: "Frozen Peaks",
      description:
        "# The Eternal Ice\n\nVenture into the Frozen Peaks to discover the secret of the Eternal Ice. Ancient magic awaits those brave enough to face the cold.",
      datePublicationStart: new Date("2025-02-01"),
      datePublicationEnd: new Date("2025-05-15"),
      dateEventStart: new Date("2025-06-15"),
      dateEventEnd: new Date("2025-06-15"),
    },
  });
  console.log("    ✓ Event 3:", event1_2_3.name);

  const event1_2_4 = await prisma.event.upsert({
    where: { id: 18 },
    update: {},
    create: {
      id: 18,
      organizationId: campaign1_2.organizationId,
      campaignId: campaign1_2.id,
      name: "Spring Thaw",
      place: "Crystal Lake",
      description:
        "# Spring Thaw\n\nAs winter's grip loosens, Crystal Lake begins to thaw, revealing secrets long frozen beneath the ice. What treasures and terrors await?",
      datePublicationStart: new Date("2025-09-01"),
      datePublicationEnd: new Date("2026-02-15"),
      dateEventStart: new Date("2026-03-15"),
      dateEventEnd: new Date("2026-03-15"),
    },
  });
  console.log("    ✓ Event 4:", event1_2_4.name);

  // ============================================================================
  // ORGANIZATION 2: SHADOW REALMS
  // ============================================================================
  console.log("\n📂 Creating Organization 2: Shadow Realms");

  let org2 = await getOrganizationBySlug(prisma, "shadow-realms");
  if (!org2) {
    org2 = await createOrganization(prisma, {
      name: "Shadow Realms",
      slug: "shadow-realms",
      description: "Shadow Realms LARP organization",
    });
    console.log("  ✓ Organization created:", org2.name);
  } else {
    console.log("  ✓ Organization exists:", org2.name);
  }

  // Campaign 2.1: Dark Prophecy
  let campaign2_1 = await getCampaignBySlug(
    prisma,
    "dark-prophecy",
    "shadow-realms"
  );
  if (!campaign2_1) {
    campaign2_1 = await createCampaign(prisma, {
      name: "Dark Prophecy",
      slug: "dark-prophecy",
      description: "A campaign about ancient prophecies and dark omens",
      organizationId: org2.id,
    });
    console.log("  ✓ Campaign created:", campaign2_1.name);
  } else {
    console.log("  ✓ Campaign exists:", campaign2_1.name);
  }

  // DataTypes for Campaign 2.1
  const dataType2_1_1 = await prisma.dataType.upsert({
    where: { id: 8 },
    update: {},
    create: {
      id: 8,
      organizationId: campaign2_1.organizationId,
      campaignId: campaign2_1.id,
      name: "Profezie",
    },
  });
  console.log("    ✓ DataType 1:", dataType2_1_1.name);

  const dataType2_1_2 = await prisma.dataType.upsert({
    where: { id: 9 },
    update: {},
    create: {
      id: 9,
      organizationId: campaign2_1.organizationId,
      campaignId: campaign2_1.id,
      name: "Reliquie",
    },
  });
  console.log("    ✓ DataType 2:", dataType2_1_2.name);

  const dataType2_1_3 = await prisma.dataType.upsert({
    where: { id: 10 },
    update: {},
    create: {
      id: 10,
      organizationId: campaign2_1.organizationId,
      campaignId: campaign2_1.id,
      name: "Fazioni",
    },
  });
  console.log("    ✓ DataType 3:", dataType2_1_3.name);

  // Events for Campaign 2.1
  const event2_1_1 = await prisma.event.upsert({
    where: { id: 5 },
    update: {},
    create: {
      id: 5,
      organizationId: campaign2_1.organizationId,
      campaignId: campaign2_1.id,
      name: "Signs and Portents",
      place: "Temple Ruins",
      description:
        "# Signs and Portents\n\nStrange omens appear across the land. The stars align in patterns not seen for a thousand years. Something ancient awakens.",
      datePublicationStart: new Date("2023-06-01"),
      datePublicationEnd: new Date("2023-08-15"),
      dateEventStart: new Date("2023-09-15"),
      dateEventEnd: new Date("2023-09-15"),
    },
  });
  console.log("    ✓ Event 1:", event2_1_1.name);

  const event2_1_2 = await prisma.event.upsert({
    where: { id: 6 },
    update: {},
    create: {
      id: 6,
      organizationId: campaign2_1.organizationId,
      campaignId: campaign2_1.id,
      name: "The Oracle Speaks",
      place: "Temple of Shadows",
      description:
        "# The Oracle Speaks\n\nThe Oracle awakens after centuries of silence. Gather at the Temple of Shadows to hear the prophecy that will shape the fate of the realm.",
      datePublicationStart: new Date("2024-03-01"),
      datePublicationEnd: new Date("2024-05-15"),
      dateEventStart: new Date("2024-06-01"),
      dateEventEnd: new Date("2024-06-01"),
    },
  });
  console.log("    ✓ Event 2:", event2_1_2.name);

  const event2_1_3 = await prisma.event.upsert({
    where: { id: 19 },
    update: {},
    create: {
      id: 19,
      organizationId: campaign2_1.organizationId,
      campaignId: campaign2_1.id,
      name: "The Chosen Gather",
      place: "Sacred Grove",
      description:
        "# The Chosen Gather\n\nThose touched by the prophecy feel an irresistible pull to the Sacred Grove. United by destiny, they must prepare for what lies ahead.",
      datePublicationStart: new Date("2024-12-01"),
      datePublicationEnd: new Date("2025-02-28"),
      dateEventStart: new Date("2025-03-20"),
      dateEventEnd: new Date("2025-03-20"),
    },
  });
  console.log("    ✓ Event 3:", event2_1_3.name);

  const event2_1_4 = await prisma.event.upsert({
    where: { id: 20 },
    update: {},
    create: {
      id: 20,
      organizationId: campaign2_1.organizationId,
      campaignId: campaign2_1.id,
      name: "Prophecy Fulfilled",
      place: "Ruins of Fate",
      description:
        "# Prophecy Fulfilled\n\nThe time has come. Travel to the Ruins of Fate where the ancient prophecy will be fulfilled. Will you be ready?",
      datePublicationStart: new Date("2025-05-01"),
      datePublicationEnd: new Date("2025-07-15"),
      dateEventStart: new Date("2025-08-15"),
      dateEventEnd: new Date("2025-08-15"),
    },
  });
  console.log("    ✓ Event 4:", event2_1_4.name);

  // Campaign 2.2: Realm of Shadows
  let campaign2_2 = await getCampaignBySlug(
    prisma,
    "realm-of-shadows",
    "shadow-realms"
  );
  if (!campaign2_2) {
    campaign2_2 = await createCampaign(prisma, {
      name: "Realm of Shadows",
      slug: "realm-of-shadows",
      description:
        "Journey through the shadow realm and face the darkness within",
      organizationId: org2.id,
    });
    console.log("  ✓ Campaign created:", campaign2_2.name);
  } else {
    console.log("  ✓ Campaign exists:", campaign2_2.name);
  }

  // DataTypes for Campaign 2.2
  const dataType2_2_1 = await prisma.dataType.upsert({
    where: { id: 11 },
    update: {},
    create: {
      id: 11,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Regolamento",
    },
  });
  console.log("    ✓ DataType 1:", dataType2_2_1.name);

  const dataType2_2_2 = await prisma.dataType.upsert({
    where: { id: 12 },
    update: {},
    create: {
      id: 12,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Ombre",
    },
  });
  console.log("    ✓ DataType 2:", dataType2_2_2.name);

  const dataType2_2_3 = await prisma.dataType.upsert({
    where: { id: 13 },
    update: {},
    create: {
      id: 13,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Luoghi",
    },
  });
  console.log("    ✓ DataType 3:", dataType2_2_3.name);

  const dataType2_2_4 = await prisma.dataType.upsert({
    where: { id: 14 },
    update: {},
    create: {
      id: 14,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Rituali",
    },
  });
  console.log("    ✓ DataType 4:", dataType2_2_4.name);

  // Events for Campaign 2.2
  const event2_2_1 = await prisma.event.upsert({
    where: { id: 7 },
    update: {},
    create: {
      id: 7,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Whispers in the Dark",
      place: "Abandoned Cathedral",
      description:
        "# Whispers in the Dark\n\nIn the ruins of an abandoned cathedral, shadows move with purpose and whispers echo through empty halls. Something is trying to communicate from beyond the veil.",
      datePublicationStart: new Date("2023-11-01"),
      datePublicationEnd: new Date("2024-01-15"),
      dateEventStart: new Date("2024-02-10"),
      dateEventEnd: new Date("2024-02-10"),
    },
  });
  console.log("    ✓ Event 1:", event2_2_1.name);

  const event2_2_2 = await prisma.event.upsert({
    where: { id: 8 },
    update: {},
    create: {
      id: 8,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Gateway to Shadows",
      place: "The Void Gate",
      description:
        "# Gateway to Shadows\n\nThe Void Gate opens once every decade. Step through and experience the mysterious Realm of Shadows. But beware - not all who enter return unchanged.",
      datePublicationStart: new Date("2024-05-01"),
      datePublicationEnd: new Date("2024-08-15"),
      dateEventStart: new Date("2024-09-15"),
      dateEventEnd: new Date("2024-09-15"),
    },
  });
  console.log("    ✓ Event 2:", event2_2_2.name);

  const event2_2_3 = await prisma.event.upsert({
    where: { id: 21 },
    update: {},
    create: {
      id: 21,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Walking Between Worlds",
      place: "The Shadowlands",
      description:
        "# Walking Between Worlds\n\nTrapped in the Shadowlands, adventurers must navigate a realm where reality shifts and the boundaries between worlds grow thin. Time flows differently here.",
      datePublicationStart: new Date("2025-01-01"),
      datePublicationEnd: new Date("2025-04-15"),
      dateEventStart: new Date("2025-05-10"),
      dateEventEnd: new Date("2025-05-10"),
    },
  });
  console.log("    ✓ Event 3:", event2_2_3.name);

  const event2_2_4 = await prisma.event.upsert({
    where: { id: 22 },
    update: {},
    create: {
      id: 22,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Return from Darkness",
      place: "The Threshold",
      description:
        "# Return from Darkness\n\nAfter a long journey through shadow, heroes must find their way back to the light. Face your inner demons and emerge stronger, or be consumed by the darkness.",
      datePublicationStart: new Date("2025-08-01"),
      datePublicationEnd: new Date("2025-11-15"),
      dateEventStart: new Date("2025-12-10"),
      dateEventEnd: new Date("2025-12-10"),
    },
  });
  console.log("    ✓ Event 4:", event2_2_4.name);

  const event2_2_5 = await prisma.event.upsert({
    where: { id: 23 },
    update: {},
    create: {
      id: 23,
      organizationId: campaign2_2.organizationId,
      campaignId: campaign2_2.id,
      name: "Eclipse of Souls",
      place: "Twilight Citadel",
      description:
        "# Eclipse of Souls\n\nA rare cosmic event brings the shadow realm and mortal world into alignment. The Twilight Citadel manifests, offering unprecedented power to those brave enough to claim it.",
      datePublicationStart: new Date("2026-03-01"),
      datePublicationEnd: new Date("2026-07-15"),
      dateEventStart: new Date("2026-08-20"),
      dateEventEnd: new Date("2026-08-20"),
    },
  });
  console.log("    ✓ Event 5:", event2_2_5.name);

  // I blocchi sopra inseriscono `DataType`/`Event` con `id` espliciti
  // (upsert su valori fissi) senza mai passare da `nextval()`: le sequenze
  // Postgres restano indietro. I successivi insert autoincrement (helper
  // `ensureDataType`/`ensureEvent`, qui e in `seedNuovaFrontiera`)
  // finirebbero prima o poi a collidere con questi id fissi (P2002 su
  // `id`). Risincronizziamo le sequenze sul MAX(id) corrente prima che
  // parta qualunque insert autoincrement.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"DataType"', 'id'), COALESCE((SELECT MAX(id) FROM "DataType"), 1))`
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Event"', 'id'), COALESCE((SELECT MAX(id) FROM "Event"), 1))`
  );

  // ============================================================================
  // GRANTS - Give admin access to all campaigns
  // ============================================================================
  console.log("\n🔑 Creating admin grants");

  const campaigns = [campaign1_1, campaign1_2, campaign2_1, campaign2_2];

  for (const campaign of campaigns) {
    await prisma.grant.upsert({
      where: {
        userId_campaignId: {
          userId: adminUser.id,
          campaignId: campaign.id,
        },
      },
      update: {},
      create: {
        userId: adminUser.id,
        campaignId: campaign.id,
        role: "head_master",
      },
    });
    console.log(`  ✓ Admin grant for: ${campaign.name}`);
  }

  // ============================================================================
  // TEST PERSONS — Fase 1 Backend manual QA (see
  // .task/qa-report-fase-1-backend.md, "Persone di test & credenziali").
  // All loggable via email/password with TEST_PASSWORD. All scoped to
  // "arcana-domine" / campaign1, the only org reachable from the dashboard UI
  // today (ARCANA_DOMINE_SLUG is hardcoded).
  // ============================================================================
  console.log("\n🧪 Test persons for manual QA (Fase 1 Backend)");

  const currentYear = getCurrentAssociationYear();
  const yearStart = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${currentYear}-12-31T23:59:59.000Z`);

  async function grantQuotaForCurrentYear(userId: string) {
    await prisma.membership.upsert({
      where: { userId_year: { userId, year: currentYear } },
      update: {},
      create: {
        userId,
        year: currentYear,
        startDate: yearStart,
        endDate: yearEnd,
        // Nessuna FK reale verso Payment su questo campo (vedi schema): un
        // valore fittizio è sufficiente per rappresentare "quota pagata".
        paymentId: 0,
      },
    });
  }

  async function grantCampaignRole(
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

  // --- 1. Account Sviluppo Web cablato -----------------------------------------
  // Nessuna Membership, nessun Grant: `mattia@arcana.it` è sempre `isSviluppo`
  // via l'email cablata in `HARDCODED_SVILUPPO_EMAILS`
  // (`src/lib/authorization.ts`), a prescindere dal flag a DB. Il vecchio
  // bypass "god mode" su rotte di business generiche è stato rimosso senza
  // sostituto: questo account non ha più alcun privilegio lì, solo accesso
  // alla sezione Amministrazione e all'impersonation.
  const superAdmin = await ensureLoggableUser(
    "mattia@arcana.it",
    "Mattia (Sviluppo Web)"
  );
  console.log("  ✓ Sviluppo Web (email cablata):", superAdmin.email);

  // --- 2/3/6. Tre ruoli di campagna a 3 livelli su campaign1, quota in regola --
  const headMasterC1 = await ensureLoggableUser(
    "headmaster.campaign1@ad.com",
    "Elena Bianchi (Head Master)"
  );
  await grantCampaignRole(headMasterC1.id, campaign1_1.id, "head_master");
  await grantQuotaForCurrentYear(headMasterC1.id);
  console.log("  ✓ Head master (campaign1, quota ok):", headMasterC1.email);

  const masterC1 = await ensureLoggableUser(
    "master.campaign1@ad.com",
    "Marco Verdi (Master)"
  );
  await grantCampaignRole(masterC1.id, campaign1_1.id, "master");
  await grantQuotaForCurrentYear(masterC1.id);
  console.log("  ✓ Master (campaign1, quota ok):", masterC1.email);

  const supporterC1 = await ensureLoggableUser(
    "supporter.campaign1@ad.com",
    "Sara Neri (Supporter)"
  );
  await grantCampaignRole(supporterC1.id, campaign1_1.id, "supporter");
  await grantQuotaForCurrentYear(supporterC1.id);
  console.log("  ✓ Supporter (campaign1, quota ok):", supporterC1.email);

  // --- 1/4/5. Utente senza quota E senza ruolo idoneo -------------------------
  // Nessun Grant su campaign1 (funge anche da "utente base senza ruoli"),
  // nessuna Membership per l'anno corrente, isDirettivo/isSviluppo entrambi
  // false (default): usato per T-1 (tesseramento) e come bersaglio
  // impersonation per T-4/T-5.
  const noQuotaUser = await ensureLoggableUser(
    "no-quota@ad.com",
    "Luca Ferrari (senza quota)"
  );
  console.log("  ✓ Utente senza quota/ruolo:", noQuotaUser.email);

  // --- 4 extra. Utente banned con Grant/quota validi (nessun enforcement) -----
  const bannedHeadMaster = await ensureLoggableUser(
    "banned.headmaster@ad.com",
    "Giulia Romano (banned)"
  );
  await prisma.user.update({
    where: { id: bannedHeadMaster.id },
    data: { status: "banned" },
  });
  await grantCampaignRole(bannedHeadMaster.id, campaign1_1.id, "head_master");
  await grantQuotaForCurrentYear(bannedHeadMaster.id);
  console.log(
    "  ✓ Head master banned (campaign1, quota ok, verifica extra):",
    bannedHeadMaster.email
  );

  // --- 5/7. Membro del direttivo — persona pulita per ManagerRolesAdmin -------
  const president = await ensureLoggableUser(
    "president@ad.com",
    "Paolo Colombo (Presidente)"
  );
  await prisma.user.update({
    where: { id: president.id },
    data: { isDirettivo: true },
  });
  console.log("  ✓ Direttivo (loggabile):", president.email);

  // --- 5. Utente Sviluppo Web di copertura (non email cablata) ----------------
  // Utile per testare manualmente ManagerRolesAdmin (permessi di editing del
  // gruppo "Sviluppo Web") senza usare l'account cablato sopra.
  const coverageSviluppo = await prisma.user.upsert({
    where: { email: "coverage.sviluppo@ad.com" },
    update: { isSviluppo: true },
    create: {
      id: "coverage-sviluppo",
      email: "coverage.sviluppo@ad.com",
      name: "Coverage Sviluppo",
      emailVerified: true,
      isSviluppo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(
    "  ✓ Sviluppo Web (coverage, non cablato):",
    coverageSviluppo.email
  );

  // --- 9. Dati anagrafici realistici su un utente loggabile -------------------
  // NOTA: richiede la migrazione `20260707130000_personal_data_drop_email`
  // applicata (droppa la colonna `email`, oggi NOT NULL senza default sul DB
  // di sviluppo se la migrazione non è stata ancora deployata). Questo task
  // non tocca schema/migrazioni: se la migrazione non è ancora applicata lo
  // step viene loggato come skip invece di far fallire l'intero seed.
  try {
    await prisma.personalData.upsert({
      where: { userId: headMasterC1.id },
      update: {},
      create: {
        userId: headMasterC1.id,
        firstName: "Elena",
        lastName: "Bianchi",
        ssn: "BNCLNE85M41H501Z",
        address: "Via Roma 12, 00100 Roma (RM)",
        dateOfBirth: new Date("1985-08-01T00:00:00.000Z"),
        placeOfBirth: "Roma",
      },
    });
    console.log("  ✓ PersonalData set for:", headMasterC1.email);
  } catch (err) {
    console.warn(
      "  ⚠ PersonalData skipped — probabile migrazione " +
        "20260707130000_personal_data_drop_email non applicata su questo DB " +
        "(colonna 'email' ancora NOT NULL senza default). Esegui `bunx prisma " +
        "migrate deploy` e rilancia il seed. Dettaglio:",
      err instanceof Error ? err.message : err
    );
  }

  // ============================================================================
  // METAMODEL CATALOG PER CAMPAIGN 1 (T-023, consolidato dentro campaign1 da
  // T-032 — in origine viveva in una campagna d'esempio separata, ora
  // rimossa: vedi il task T-032 in `.task/` per la motivazione). Esercita
  // l'intero metamodel Fase 2 (T-015 schema, T-016
  // catalogo, T-025 ledger XP, T-026 visibilità condizionale, T-021
  // rendering documenti): razze con budget XP di partenza diverso, religioni
  // a cardinalità multi, talenti con grafo requisiti (requires/blocks) e
  // flag costo/repeatable/creationOnly, un talento nascosto salvo
  // appartenenza a fazione/religione, regolamenti come documenti, e un PG
  // che copre grant iniziale, acquisti XP normali e un acquisto forzato dal
  // master (override). Nessun `Event` aggiuntivo: T-023 non ne seedava,
  // resta fuori scope anche dopo il consolidamento in campaign1.
  //
  // NOTA: il servizio di assegnazione completo di T-017 non esiste ancora in
  // questo stack (`status: todo`, non stackato qui — vedi
  // `.task/023-seed-campagna-esempio.md#Artifacts`): le assegnazioni sotto
  // passano da `src/lib/seed/characterAssignment.ts`, uno stand-in che riusa
  // il ledger XP reale (T-025) ma non reimplementa il motore generico di
  // validazione cardinalità/requisiti — l'ordine delle chiamate rispetta a
  // mano il grafo `requires` costruito qui.
  // ============================================================================
  console.log("\n📂 Metamodel catalog for Campaign 1 (T-023)");

  // `campaign1_1` è già narrowed a non-null qui (assegnato in entrambi i rami
  // del blocco "Campaign 1.1: Campaign 1" sopra), ma la narrowing di TS non
  // attraversa le closure sotto: fissato in una costante locale invece di
  // ripetere `campaign1_1!` a ogni uso (stesso pattern di `demoCampaignId`
  // prima del consolidamento T-032).
  const campaign1Id = campaign1_1.id;

  // Helper locali di idempotenza, sul modello di `ensureLoggableUser` sopra:
  // niente chiave unique a schema su `ReferenceData`/`DataRequirement`,
  // quindi "get by natural key, altrimenti create" invece di un `upsert` per
  // id fisso.
  async function ensureDataType(
    name: string,
    data: Omit<Parameters<typeof createDataType>[1], "name" | "campaignId">
  ) {
    const existing = await getDataTypeByName(prisma, campaign1Id, name);
    if (existing) return existing;
    return createDataType(prisma, {
      name,
      campaignId: campaign1Id,
      ...data,
    });
  }

  async function ensureReferenceData(
    dataTypeId: number,
    name: string,
    data: Omit<Parameters<typeof createReferenceData>[1], "name" | "dataTypeId">
  ) {
    const existing = await getReferenceDataByName(prisma, dataTypeId, name);
    if (existing) return existing;
    return createReferenceData(prisma, { dataTypeId, name, ...data });
  }

  async function ensureDataRequirement(
    definitionId: number,
    requiredDefinitionId: number,
    type: RequirementType,
    groupId?: number
  ) {
    const outgoing = await listOutgoingRequirements(prisma, definitionId);
    const existing = outgoing.find(
      req =>
        req.requiredDefinitionId === requiredDefinitionId &&
        req.type === type &&
        req.groupId === (groupId ?? null)
    );
    if (existing) return existing;
    return createDataRequirement(prisma, {
      definitionId,
      requiredDefinitionId,
      type,
      groupId,
    });
  }

  // --- DataType: Razza (single) ------------------------------------------------
  const dataTypeRazza = await ensureDataType("Razza", {
    kind: DataTypeKind.origins,
    cardinality: DataCardinality.single,
    assignability: DataTypeAssignability.creationOnly,
    sidebarShow: true,
    sidebarOrder: 1,
    icon: "atomic_power",
  });

  const razzaUmano = await ensureReferenceData(dataTypeRazza.id, "Umano", {
    visibility: "visible",
    flags: { startingPx: RACE_STARTING_PX.umano },
  });
  await ensureReferenceData(dataTypeRazza.id, "Elfo", {
    visibility: "visible",
    flags: { startingPx: RACE_STARTING_PX.elfo },
  });
  const razzaNano = await ensureReferenceData(dataTypeRazza.id, "Nano", {
    visibility: "visible",
    flags: { startingPx: RACE_STARTING_PX.nano },
  });
  console.log(
    "  ✓ DataType Razza (single) con 3 razze a startingPx diverso:",
    [RACE_STARTING_PX.umano, RACE_STARTING_PX.elfo, RACE_STARTING_PX.nano].join(
      "/"
    )
  );

  // --- DataType: Religioni (multi) ---------------------------------------------
  const dataTypeReligioni = await ensureDataType("Religioni", {
    kind: DataTypeKind.assignable,
    cardinality: DataCardinality.multi,
    assignability: DataTypeAssignability.creationOnly,
    sidebarShow: true,
    sidebarOrder: 2,
    icon: "account_balance",
  });

  const religioneSole = await ensureReferenceData(
    dataTypeReligioni.id,
    "Culto del Sole Nascente",
    { visibility: "visible" }
  );
  const religioneBosco = await ensureReferenceData(
    dataTypeReligioni.id,
    "Via del Bosco Sacro",
    { visibility: "visible" }
  );
  console.log("  ✓ DataType Religioni (multi) con 2 religioni");

  // --- DataType: Talenti (multi, requires/blocks, costo XP) --------------------
  // `assignability: "always"` (T-035, round 3 — decisione owner; rinominato
  // T-048): sotto l'invariante `assignability !== "none" ⟹ cardinality !==
  // null` (validazione Zod, `dataType.ts`), `cardinality: multi` non può più
  // convivere con `assignability: "none"` — renderebbe "Talenti"
  // strutturalmente non assegnabile a nessuno, nemmeno al master
  // (`NotAssignableDataTypeError`, non bypassabile). Un giocatore ordinario
  // può selezionare in creazione PG qualunque talento, non solo quelli
  // `creationOnly: true` (T-041): quel flag governa solo l'asse opposto,
  // "ottenibile SOLO in creazione, mai dopo" (`CreationOnlyAssignmentError`)
  // — "Lama del Veterano" (`creationOnly: true` sotto) è quindi ottenibile
  // solo qui, mentre gli altri talenti restano scegliibili sia in creazione
  // sia via il downtime "Impara talento" (coda di approvazione, T-019/T-033).
  const dataTypeTalenti = await ensureDataType("Talenti", {
    kind: DataTypeKind.talent,
    cardinality: DataCardinality.multi,
    assignability: DataTypeAssignability.always,
    sidebarShow: true,
    sidebarOrder: 3,
    icon: "talent",
  });

  const talentoLama = await ensureReferenceData(
    dataTypeTalenti.id,
    "Lama del Veterano",
    {
      visibility: "visible",
      flags: {
        cost: TALENT_COSTS.lamaDelVeterano,
        repeatable: false,
        creationOnly: true,
      },
    }
  );
  const talentoFendente = await ensureReferenceData(
    dataTypeTalenti.id,
    "Fendente Implacabile",
    {
      visibility: "visible",
      flags: {
        cost: TALENT_COSTS.fendenteImplacabile,
        repeatable: false,
        creationOnly: false,
      },
    }
  );
  await ensureDataRequirement(
    talentoFendente.id,
    talentoLama.id,
    RequirementType.requires
  );

  // Esempio di `grants` (T-050, copertura seed): ottenere la razza Nano
  // assegna automaticamente e gratuitamente "Lama del Veterano", a
  // prescindere dal suo `flags.cost`/`creationOnly` (bypassati come per una
  // concessione master, vedi `assignReferenceDataToCharacter`). Il PG demo
  // sotto è Umano, quindi questo arco non viene mai attraversato dal seed
  // stesso: resta solo un nodo/arco del grafo, coerente con `blocks` sopra.
  await ensureDataRequirement(
    razzaNano.id,
    talentoLama.id,
    RequirementType.grants
  );

  // Visibile ai non-staff solo a chi appartiene a una delle due religioni
  // seedate (T-050, sostituisce il vecchio registry `VisibilityCondition`
  // `memberOfAnyFactionOrReligion`): due archi `visibleWith` nello stesso
  // OR-group, quindi basta l'una o l'altra. `visibility: hidden` qui è il
  // fallback corretto (nessun accesso incondizionato senza soddisfare
  // l'arco).
  const talentoCodice = await ensureReferenceData(
    dataTypeTalenti.id,
    "Codice degli Iniziati",
    {
      visibility: "hidden",
      flags: {
        cost: TALENT_COSTS.codiceDegliIniziati,
        repeatable: true,
        creationOnly: false,
      },
    }
  );
  await ensureDataRequirement(
    talentoCodice.id,
    religioneSole.id,
    RequirementType.visibleWith,
    1
  );
  await ensureDataRequirement(
    talentoCodice.id,
    religioneBosco.id,
    RequirementType.visibleWith,
    1
  );
  const talentoFede = await ensureReferenceData(
    dataTypeTalenti.id,
    "Fede Incrollabile",
    {
      visibility: "visible",
      flags: { cost: 6, repeatable: false, creationOnly: false },
    }
  );
  // "Codice degli Iniziati" e "Fede Incrollabile" sono mutuamente esclusivi:
  // il PG demo possiede il primo, quindi il secondo non gli viene mai
  // assegnato (solo il nodo/arco del grafo, nessuna verifica a runtime qui —
  // il motore generico è T-017).
  await ensureDataRequirement(
    talentoCodice.id,
    talentoFede.id,
    RequirementType.blocks
  );

  const talentoDonoProibito = await ensureReferenceData(
    dataTypeTalenti.id,
    "Dono Proibito del Sangue Nero",
    {
      visibility: "visible",
      flags: {
        cost: TALENT_COSTS.donoProibitoDelSangueNero,
        repeatable: false,
        creationOnly: false,
      },
    }
  );
  // `requires` "Fede Incrollabile", che il PG demo non possiede (è bloccata
  // da "Codice degli Iniziati", sopra): un requisito volutamente non
  // soddisfatto, acquistabile solo in deroga del master più sotto.
  await ensureDataRequirement(
    talentoDonoProibito.id,
    talentoFede.id,
    RequirementType.requires
  );
  console.log(
    "  ✓ DataType Talenti (multi) con 4 talenti: requires, blocks, " +
      "1 condizionato via visibleWith OR-group (T-050), " +
      "1 grants da Razza Nano, flag cost/repeatable/creationOnly"
  );

  // --- DataType: Regolamenti (documents) ---------------------------------------
  // `cardinality: null` (T-035): nessuna istanza di questo `DataType` viene
  // mai assegnata a un personaggio (è un catalogo di documenti campagna, non
  // un dato di scheda PG) — coerente con `assignability: "none"`, fisso per
  // `kind: "generic"` (`validations/dataType.ts`).
  const dataTypeRegolamenti = await ensureDataType("Regolamenti", {
    kind: DataTypeKind.generic,
    cardinality: null,
    assignability: DataTypeAssignability.none,
    sidebarShow: true,
    sidebarOrder: 4,
    icon: "styles",
    renderAs: DataTypeRender.files,
  });
  await ensureReferenceData(
    dataTypeRegolamenti.id,
    "Regolamento di Ambientazione",
    {
      visibility: "visible",
      // Placeholder: nessun upload reale su UploadThing in questo ambiente
      // di seed (T-021). `fileKey` resta `null` di conseguenza — solo un
      // upload vero via `documentUpload.ts` lo valorizza.
      fileUrl: "https://example.com/regolamenti/ambientazione-demo.pdf",
    }
  );
  console.log(
    "  ✓ DataType Regolamenti (generic, renderAs files) con 1 voce (fileUrl)"
  );

  // --- Master della campagna demo (riusa Marco Verdi, già loggabile) -----------
  // Nessun grant da (ri)creare qui: `masterC1` è già "master" e `adminUser`
  // già "head_master" su `campaign1_1` (vedi rispettivamente la sezione "Tre
  // ruoli di campagna" sopra e il loop "Admin grants" — entrambi coprono
  // `campaign1_1` da prima del consolidamento T-032 di questa sezione).

  // --- PG demo: Aurelio delle Nebbie --------------------------------------------
  const demoPlayer = await ensureLoggableUser(
    "giocatore.demo@ad.com",
    "Giulia Neve (giocatrice, PG demo)"
  );

  let demoCharacter = await getUserCharacterInCampaign(
    prisma,
    demoPlayer.id,
    campaign1Id
  );
  if (!demoCharacter) {
    demoCharacter = await createCharacter(prisma, {
      campaignId: campaign1Id,
      userId: demoPlayer.id,
      name: "Aurelio delle Nebbie",
      background:
        "Cresciuto ai margini delle Terre Grigie, Aurelio (di razza Umano) " +
        "ha abbracciato il Culto del Sole Nascente dopo aver visto la " +
        "propria tempra messa alla prova dalle prime nebbie invernali.",
      approvalDate: new Date(),
    });
    console.log("  ✓ PG demo creato:", demoCharacter.name);
  } else {
    console.log("  ✓ PG demo esiste:", demoCharacter.name);
  }

  // `demoCharacter` è narrowed a non-null qui (stessa ragione di
  // `campaign1Id` sopra): fissato in una costante per le closure sotto.
  const character = demoCharacter;

  // 1. Razza (cardinalità single) + grant XP iniziale, atomici nella stessa
  //    transazione (composabilità di `assignRaceWithInitialXp`, vedi
  //    `characterAssignment.ts`).
  await prisma.$transaction(tx =>
    assignRaceWithInitialXp(tx, character, razzaUmano)
  );

  // 2. Religioni (cardinalità multi, nessun costo XP): due istanze sullo
  //    stesso `DataType`, a differenza della razza (single).
  await assignCharacterData(prisma, character, religioneSole);
  await assignCharacterData(prisma, character, religioneBosco);

  // 3/4/5. Acquisti talento normali, in ordine di soddisfacimento dei
  //    `requires` (Lama → Fendente; la religione appena assegnata soddisfa
  //    la condizione di "Codice degli Iniziati").
  await prisma.$transaction(tx => purchaseTalent(tx, character, talentoLama));
  await prisma.$transaction(tx =>
    purchaseTalent(tx, character, talentoFendente)
  );
  await prisma.$transaction(tx => purchaseTalent(tx, character, talentoCodice));

  // 6. Acquisto forzato dal master: `requires` "Fede Incrollabile" non
  //    soddisfatto e XP insufficienti a questo punto del ledger — la deroga
  //    (`grantedByOverride: true`) bypassa entrambi i check.
  await prisma.$transaction(tx =>
    purchaseTalent(tx, character, talentoDonoProibito, {
      grantedByOverride: true,
      grantedById: masterC1.id,
    })
  );

  // Nota (T-050, fuori scope del piano ma bloccava `bunx prisma db seed`):
  // `XpBalance` espone `{ earned, available }`, mai `.balance` — pre-esistente
  // su `main`, corretto qui solo per poter verificare il seed di questo task.
  const demoCharacterXpBalance = await getXpBalance(prisma, demoCharacter.id);
  if (demoCharacterXpBalance.available !== DEMO_CHARACTER_EXPECTED_XP_BALANCE) {
    throw new Error(
      `Saldo XP del PG demo incoerente: atteso ${DEMO_CHARACTER_EXPECTED_XP_BALANCE}, ` +
        `trovato ${demoCharacterXpBalance.available}. Controlla ` +
        "src/lib/seed/demoCampaignPlan.ts rispetto agli acquisti sopra."
    );
  }
  console.log(
    "  ✓ PG demo:",
    demoCharacter.name,
    "— saldo XP finale:",
    demoCharacterXpBalance.available,
    "(atteso, incl. acquisto in deroga del master)"
  );

  // --- 8. Campagna one-shot ----------------------------------------------------
  let oneShotCampaign = await getCampaignBySlug(
    prisma,
    "prova-one-shot",
    "arcana-domine"
  );
  if (!oneShotCampaign) {
    oneShotCampaign = await createCampaign(prisma, {
      name: "Prova One-Shot",
      slug: "prova-one-shot",
      description: "Campagna one-shot di prova per QA (evento unico)",
      organizationId: org1.id,
      type: "oneShot",
    });
    console.log("  ✓ One-shot campaign created:", oneShotCampaign.name);
  } else {
    console.log("  ✓ One-shot campaign exists:", oneShotCampaign.name);
  }

  // ============================================================================
  // FEATURE TYPES CATALOG — registry funzioni feature (T-019). Platform-wide
  // (nessun campaignId): un `FeatureType` per ogni handler auto-registrato in
  // `src/lib/features/`. Non è più responsabilità del seed farlo esistere
  // (era la causa del bug "feature assenti su staging": DB mai seedato) —
  // `ensureFeatureTypesRegistered` (`@/lib/features/registry`) è la stessa
  // funzione che l'app chiama ad ogni lettura del catalogo, richiamata qui
  // solo per comodità di sviluppo locale post-seed.
  // ============================================================================
  console.log("\n🧩 Feature types catalog (registry T-019)");
  await ensureFeatureTypesRegistered(prisma);

  // ============================================================================
  // NUOVA FRONTIERA — campagna reale dell'associazione (T-040/T-041),
  // richiamata qui in fondo così `bunx prisma db seed` la include.
  // Idempotente come tutto il resto sopra.
  // ============================================================================
  await seedNuovaFrontiera();

  console.log("\n🎉 Seeding completed successfully!");
  console.log("\n📊 Summary:");
  console.log("  - 1 User (Admin)");
  console.log("  - 2 Organizations");
  console.log(
    "  - 5 Campaigns (2 shadow-realms + 3 arcana-domine incl. 1 one-shot)"
  );
  console.log(
    "  - 14 DataTypes (3-4 per campaign legacy + 4 kind-specific su campaign1, " +
      "consolidati da Demo Metamodello, T-032)"
  );
  console.log("  - 17 Events (4-5 per campaign, spanning past/present/future)");
  console.log("  - 4 Admin grants");
  console.log(
    "  - 9 Test persons (8 loggable + 1 isSviluppo coverage-only), password:",
    TEST_PASSWORD
  );
  console.log(
    "  - Metamodel catalog su campaign1 (T-023, consolidato da T-032): " +
      "3 razze, 2 religioni, 4 talenti (requires+blocks+1 condizionato " +
      "T-026), 1 regolamento (documents), 1 PG con grant iniziale + " +
      "3 acquisti + 1 override master"
  );
  console.log(
    `  - ${listRegisteredFeatureHandlers().length} FeatureTypes (registry funzioni feature, T-019)`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    console.error("\n❌ Seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
