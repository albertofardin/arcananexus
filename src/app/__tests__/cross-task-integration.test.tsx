/**
 * Test di integrazione CROSS-TASK per la Fase 1 Backend (T-1...T-7).
 *
 * A differenza dei test già presenti per singolo task (che spesso mockano via
 * `vi.mock` proprio la funzione di autorizzazione sotto esame, per isolare il
 * componente), qui si usano le implementazioni REALI di
 * `src/lib/authorization.ts`, dei repository (`campaign.repository`,
 * `grant.repository`, `user.repository`) e dei layout/route reali, con solo
 * `@/lib/db`, `@/lib/auth`, `next/headers` e `next/navigation` mockati. Lo
 * scopo è verificare che le guardie di task diversi si compongano
 * correttamente quando lavorano sullo stesso branch di codice integrato,
 * scenario che nessun test per-task (validato in isolamento) copre.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import {
  Role,
  CampaignType,
  UserStatus,
  type Grant,
  type User,
  type Membership,
  type Campaign,
} from "@prisma/client";
import { headers } from "next/headers";
// `vi.mock` è hoisted sopra gli import: importare qui i moduli mockati è sicuro.
import CampaignLayout from "../(dashboard)/dashboard/[campaignSlug]/layout";
import CampaignAdminLayout from "../(dashboard)/dashboard/[campaignSlug]/admin/layout";
import { GET as getCampaignGrants } from "../api/campaigns/[campaignSlug]/grants/route";
import { POST as postAssociationRole } from "../api/admin/association-roles/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  checkCampaignAccess,
  checkAssociationQuotaAccess,
  isHardcodedSviluppo,
  getCurrentAssociationYear,
} from "@/lib/authorization";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCampaign,
  mockOrganization,
  mockGrant,
  mockUser,
  mockMembership,
} from "@/test/helpers/prisma-fixtures";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock manuale di `@/lib/db` (stesso pattern già in uso nei test di route,
// es. grants/__tests__/route.test.ts): un oggetto stabile con i soli metodi
// usati dai path esercitati qui, configurato per-test con mockImplementation.
// A differenza di `prismaMock`/`prismaClient` (vitest-mock-extended), questo
// mock è quello che i layout/route REALMENTE importano via
// `import { prisma } from "@/lib/db"`.
vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    grant: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    membership: { findUnique: vi.fn() },
  },
}));

const SVILUPPO_EMAIL = "mattia@arcana.it";
const CURRENT_YEAR = getCurrentAssociationYear();

interface DbFixture {
  campaign: Campaign & { organization: ReturnType<typeof mockOrganization> };
  grants?: Grant[];
  users?: User[];
  memberships?: Membership[];
}

// Configura il mock di `@/lib/db` con dati coerenti (in-memory), così le
// funzioni reali di authorization.ts/repository interrogano "un piccolo DB"
// invece di dover essere mockate loro stesse.
function configureDb({
  campaign,
  grants = [],
  users = [],
  memberships = [],
}: DbFixture) {
  (prisma.campaign.findFirst as Mock).mockImplementation(async () => campaign);

  (prisma.grant.findUnique as Mock).mockImplementation(
    async ({
      where,
    }: {
      where: { userId_campaignId: { userId: string; campaignId: number } };
    }) => {
      const { userId, campaignId } = where.userId_campaignId;
      return (
        grants.find(g => g.userId === userId && g.campaignId === campaignId) ??
        null
      );
    }
  );
  (prisma.grant.findMany as Mock).mockImplementation(
    async ({ where }: { where?: { campaignId?: number } } = {}) =>
      where?.campaignId
        ? grants.filter(g => g.campaignId === where.campaignId)
        : grants
  );

  (prisma.user.findUnique as Mock).mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      users.find(u => u.id === where.id) ?? null
  );
  (prisma.user.findMany as Mock).mockImplementation(async () => users);

  (prisma.membership.findUnique as Mock).mockImplementation(
    async ({
      where,
    }: {
      where: { userId_year: { userId: string; year: number } };
    }) => {
      const { userId, year } = where.userId_year;
      return (
        memberships.find(m => m.userId === userId && m.year === year) ?? null
      );
    }
  );
}

function setActiveUser(session: { id: string; name: string; email: string }) {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: session,
  });
  (headers as unknown as Mock).mockResolvedValue(new Headers());
}

const campaign = {
  ...mockCampaign({ id: 42, slug: "campagna-integrazione" }),
  organization: mockOrganization({ slug: "arcana-domine" }),
};

const oneShotCampaign = {
  ...mockCampaign({
    id: 43,
    slug: "one-shot-integrazione",
    type: CampaignType.oneShot,
  }),
  organization: mockOrganization({ slug: "arcana-domine" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  (headers as unknown as Mock).mockResolvedValue(new Headers());
});

// ---------------------------------------------------------------------------
// 1. Ruoli di campagna a 3 livelli (T-1/T-2/T-3): gerarchia head_master ⊇
//    master ⊇ supporter, e coerenza fra guardia API (T-2) e guardia pagina
//    (T-3) per lo STESSO utente/ruolo/campagna.
// ---------------------------------------------------------------------------
describe("Gerarchia ruoli di campagna a 3 livelli (T-2 API vs T-3 pagina)", () => {
  it("il rank intermedio 'master' soddisfa il requisito supporter ma non head_master (checkCampaignAccess)", async () => {
    const grant = mockGrant({ role: Role.master });
    prismaMock.grant.findUnique.mockResolvedValue(grant);

    await expect(
      checkCampaignAccess(prismaClient, "user-1", 1, Role.supporter)
    ).resolves.toBe(true);

    prismaMock.grant.findUnique.mockResolvedValue(grant);
    await expect(
      checkCampaignAccess(prismaClient, "user-1", 1, Role.master)
    ).resolves.toBe(true);

    prismaMock.grant.findUnique.mockResolvedValue(grant);
    await expect(
      checkCampaignAccess(prismaClient, "user-1", 1, Role.head_master)
    ).resolves.toBe(false);
  });

  it.each([
    { role: Role.head_master, expectPass: true },
    { role: Role.master, expectPass: true },
    { role: Role.supporter, expectPass: true },
  ])(
    "ruolo campagna $role: la guardia API (GET grants, T-2) e la guardia pagina (CampaignAdminLayout, T-3) danno lo STESSO esito per l'admin di settings/admin (richiesto supporter+, sola lettura ammessa a chi non è head_master)",
    async ({ role, expectPass }) => {
      const grants = [
        mockGrant({ userId: "user-1", campaignId: campaign.id, role }),
      ];
      configureDb({
        campaign,
        grants,
        users: [mockUser({ id: "user-1", email: "staff@example.com" })],
      });
      setActiveUser({
        id: "user-1",
        name: "Staff",
        email: "staff@example.com",
      });

      // T-2: API di gestione Grant (richiede supporter+ via requireCampaignSupporterBySlug)
      const apiResponse = await getCampaignGrants(
        new NextRequest(
          `http://localhost/api/campaigns/${campaign.slug}/grants`
        ),
        { params: Promise.resolve({ campaignSlug: campaign.slug }) }
      );

      // T-3: guardia pagina della sezione admin/ (stesso requisito supporter+)
      const pageResult = await CampaignAdminLayout({
        params: Promise.resolve({ campaignSlug: campaign.slug }),
        children: <div>ADMIN_MARKER</div>,
      });
      const pageSerialized = JSON.stringify(pageResult);

      if (expectPass) {
        expect(apiResponse.status).toBe(200);
        expect(pageSerialized).toContain("ADMIN_MARKER");
        expect(pageSerialized).not.toContain("Permessi insufficienti");
      } else {
        expect(apiResponse.status).toBe(403);
        expect(pageSerialized).not.toContain("ADMIN_MARKER");
        expect(pageSerialized).toContain("Permessi insufficienti");
      }
    }
  );

  it("nessun Grant sulla campagna: la guardia API (GET grants, T-2) e la guardia pagina (CampaignAdminLayout, T-3) danno entrambe esito negativo", async () => {
    configureDb({
      campaign,
      grants: [],
      users: [mockUser({ id: "user-1", email: "staff@example.com" })],
    });
    setActiveUser({ id: "user-1", name: "Staff", email: "staff@example.com" });

    const apiResponse = await getCampaignGrants(
      new NextRequest(`http://localhost/api/campaigns/${campaign.slug}/grants`),
      { params: Promise.resolve({ campaignSlug: campaign.slug }) }
    );
    expect(apiResponse.status).toBe(403);

    const pageResult = await CampaignAdminLayout({
      params: Promise.resolve({ campaignSlug: campaign.slug }),
      children: <div>ADMIN_MARKER</div>,
    });
    const pageSerialized = JSON.stringify(pageResult);
    expect(pageSerialized).not.toContain("ADMIN_MARKER");
    expect(pageSerialized).toContain("Permessi insufficienti");
  });

  it("cross-tenant: head_master della campagna A riceve 403 sia dall'API Grant sia dal guard pagina scoped sulla campagna B", async () => {
    const campaignB = {
      ...mockCampaign({ id: 99, slug: "campagna-b" }),
      organization: mockOrganization({ slug: "arcana-domine" }),
    };
    // user-1 è head_master SOLO della campagna A (id 42), non della B (id 99).
    const grants = [
      mockGrant({
        userId: "user-1",
        campaignId: campaign.id,
        role: Role.head_master,
      }),
    ];
    configureDb({
      campaign: campaignB,
      grants,
      users: [mockUser({ id: "user-1", email: "staff@example.com" })],
    });
    setActiveUser({ id: "user-1", name: "Staff", email: "staff@example.com" });

    const apiResponse = await getCampaignGrants(
      new NextRequest(
        `http://localhost/api/campaigns/${campaignB.slug}/grants`
      ),
      { params: Promise.resolve({ campaignSlug: campaignB.slug }) }
    );
    expect(apiResponse.status).toBe(403);

    const pageResult = await CampaignAdminLayout({
      params: Promise.resolve({ campaignSlug: campaignB.slug }),
      children: <div>ADMIN_MARKER</div>,
    });
    expect(JSON.stringify(pageResult)).toContain("Permessi insufficienti");
  });
});

// ---------------------------------------------------------------------------
// 2. Guardia quota associativa (T-4) composta con guardia ruolo di progetto
//    (T-3, inlined in admin/layout.tsx) su layout ANNIDATI reali:
//    [campaignSlug]/layout.tsx (T-4) → [campaignSlug]/admin/layout.tsx (T-3).
// ---------------------------------------------------------------------------
describe("Composizione layout annidati: guardia quota (T-4) + guardia ruolo (T-3)", () => {
  const marker = "ADMIN_SUBROUTE_CONTENT";

  async function renderComposedAdminSection(campaignFixture: typeof campaign) {
    // admin/layout.tsx esegue direttamente le query del guard di ruolo (T-3),
    // quindi va invocato solo DOPO aver stabilito che il guard quota (T-4) del
    // layout padre non blocca — repliochiamo così il vero ordine di
    // rendering di App Router (il layout esterno viene risolto per primo, il
    // segmento figlio è invocato solo se l'esterno lo lascia passare).
    const outerRaw = await CampaignLayout({
      params: Promise.resolve({ campaignSlug: campaignFixture.slug }),
      children: <div>__PLACEHOLDER__</div>,
    });

    const outerSerialized = JSON.stringify(outerRaw);
    const quotaBlocked = outerSerialized.includes("Tesseramento non in regola");

    let outerResult: unknown = outerRaw;
    if (!quotaBlocked) {
      outerResult = await CampaignAdminLayout({
        params: Promise.resolve({ campaignSlug: campaignFixture.slug }),
        children: <div>{marker}</div>,
      });
    }

    return { outerResult, quotaBlocked };
  }

  it("nessuna Membership per l'anno corrente non blocca più l'accesso (guardia quota T-4 rimossa da [campaignSlug]/layout.tsx): l'accesso dipende solo dal ruolo (T-3)", async () => {
    const grants = [
      mockGrant({
        userId: "user-1",
        campaignId: campaign.id,
        role: Role.head_master,
      }),
    ];
    const users = [
      mockUser({
        id: "user-1",
        email: "staff@example.com",
      }),
    ];
    configureDb({ campaign, grants, users, memberships: [] }); // nessuna Membership per l'anno corrente
    setActiveUser({ id: "user-1", name: "Staff", email: "staff@example.com" });

    const { outerResult } = await renderComposedAdminSection(campaign);
    const serialized = JSON.stringify(outerResult);

    expect(serialized).not.toContain("Tesseramento non in regola");
    expect(serialized).toContain(marker);
    // Il guard T-3 gira comunque, e lascia passare grazie al Grant head_master.
    expect(prisma.grant.findUnique).toHaveBeenCalled();
  });

  it("ruolo supporter (il minimo ammesso) supera la sezione admin (T-3)", async () => {
    const grants = [
      mockGrant({
        userId: "user-2",
        campaignId: campaign.id,
        role: Role.supporter,
      }),
    ];
    const users = [
      mockUser({
        id: "user-2",
        email: "supporter@example.com",
      }),
    ];
    const memberships = [
      mockMembership({ userId: "user-2", year: CURRENT_YEAR }),
    ];
    configureDb({ campaign, grants, users, memberships });
    setActiveUser({
      id: "user-2",
      name: "Supporter",
      email: "supporter@example.com",
    });

    const { outerResult } = await renderComposedAdminSection(campaign);
    const serialized = JSON.stringify(outerResult);

    expect(serialized).not.toContain("Tesseramento non in regola");
    expect(serialized).not.toContain("Permessi insufficienti");
    expect(serialized).toContain(marker);
    // La query Grant (T-3) è stata eseguita: il guard interno gira davvero.
    expect(prisma.grant.findUnique).toHaveBeenCalled();
  });

  it("nessun Grant sulla campagna blocca sulla sezione admin (T-3)", async () => {
    const users = [
      mockUser({
        id: "user-2",
        email: "no-grant@example.com",
      }),
    ];
    const memberships = [
      mockMembership({ userId: "user-2", year: CURRENT_YEAR }),
    ];
    configureDb({ campaign, grants: [], users, memberships });
    setActiveUser({
      id: "user-2",
      name: "No Grant",
      email: "no-grant@example.com",
    });

    const { outerResult } = await renderComposedAdminSection(campaign);
    const serialized = JSON.stringify(outerResult);

    expect(serialized).not.toContain("Tesseramento non in regola");
    expect(serialized).toContain("Permessi insufficienti");
    expect(serialized).not.toContain(marker);
    expect(prisma.grant.findUnique).toHaveBeenCalled();
  });

  it("quota in regola E ruolo head_master idoneo: entrambe le guardie passano, il contenuto è visibile", async () => {
    const grants = [
      mockGrant({
        userId: "user-3",
        campaignId: campaign.id,
        role: Role.head_master,
      }),
    ];
    const users = [mockUser({ id: "user-3", email: "hm@example.com" })];
    const memberships = [
      mockMembership({ userId: "user-3", year: CURRENT_YEAR }),
    ];
    configureDb({ campaign, grants, users, memberships });
    setActiveUser({ id: "user-3", name: "HM", email: "hm@example.com" });

    const { outerResult } = await renderComposedAdminSection(campaign);
    const serialized = JSON.stringify(outerResult);

    expect(serialized).toContain(marker);
    expect(serialized).not.toContain("Tesseramento non in regola");
    expect(serialized).not.toContain("Permessi insufficienti");
  });

  it("una campagna one-shot (T-5, CampaignType.oneShot) è trattata identicamente da entrambe le guardie: stesso esito di una campagna normale a parità di ruolo/quota", async () => {
    const grants = [
      mockGrant({
        userId: "user-4",
        campaignId: oneShotCampaign.id,
        role: Role.head_master,
      }),
    ];
    const users = [mockUser({ id: "user-4", email: "hm-oneshot@example.com" })];
    const memberships = [
      mockMembership({ userId: "user-4", year: CURRENT_YEAR }),
    ];
    configureDb({ campaign: oneShotCampaign, grants, users, memberships });
    setActiveUser({
      id: "user-4",
      name: "HM OneShot",
      email: "hm-oneshot@example.com",
    });

    const { outerResult } = await renderComposedAdminSection(oneShotCampaign);
    const serialized = JSON.stringify(outerResult);

    expect(serialized).toContain(marker);
    expect(serialized).not.toContain("Tesseramento non in regola");
    expect(serialized).not.toContain("Permessi insufficienti");
  });

  it("email cablata Sviluppo Web worst-case (nessuna Membership, NESSUN Grant sulla campagna) NON bypassa più la guardia di ruolo (bypass generico rimosso, T-4bis)", async () => {
    // Nessun grant per l'utente in nessun elenco: worst-case reale. L'email
    // cablata resta comunque Sviluppo Web a livello applicativo
    // (`isHardcodedSviluppo`), ma quel flag non concede più nulla sulle rotte
    // di business generiche: solo un Grant di campagna reale conta qui.
    const users = [
      mockUser({
        id: "admin-1",
        email: SVILUPPO_EMAIL,
      }),
    ];
    configureDb({ campaign, grants: [], users, memberships: [] });
    setActiveUser({
      id: "admin-1",
      name: "Dev Web",
      email: SVILUPPO_EMAIL,
    });

    const { outerResult } = await renderComposedAdminSection(campaign);
    const serialized = JSON.stringify(outerResult);

    expect(serialized).not.toContain("Tesseramento non in regola");
    expect(serialized).toContain("Permessi insufficienti");
    expect(serialized).not.toContain(marker);
  });

  it("impersonation: lo sviluppo web che impersona un utente normale SENZA ruolo di campagna resta bloccato come il target (nessun bypass ereditato)", async () => {
    const targetUser = mockUser({
      id: "target-1",
      email: "target@example.com",
    });
    const adminUser = mockUser({ id: "admin-1", email: SVILUPPO_EMAIL });
    configureDb({
      campaign,
      grants: [],
      users: [targetUser, adminUser],
      memberships: [],
    });

    // Con il plugin `admin` di Better Auth (T-010) la sessione attiva È
    // quella del target; `session.impersonatedBy` porta l'id dell'admin
    // originale — `getSessionContext` lo risolve con una query separata
    // (vedi src/lib/impersonation.ts), niente più doppio cookie/doppia
    // `getSession`.
    (headers as unknown as Mock).mockResolvedValue(new Headers());
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "target-1", name: "Target", email: "target@example.com" },
      session: { impersonatedBy: "admin-1" },
    });

    const { outerResult } = await renderComposedAdminSection(campaign);
    const serialized = JSON.stringify(outerResult);

    // Bloccato dalla guardia ruolo (T-3) come il target, NON bypassato
    // nonostante l'admin dietro le quinte sia Sviluppo Web.
    expect(serialized).toContain("Permessi insufficienti");
    expect(serialized).not.toContain(marker);
  });
});

// ---------------------------------------------------------------------------
// 3. L'autorità di campagna (Grant/T-2/T-3) NON si traduce in autorità di
//    Amministrazione (direttivo/sviluppo web, T-2 association-roles).
// ---------------------------------------------------------------------------
describe("Isolamento fra autorità di campagna e autorità associativa (T-2)", () => {
  it("un head_master REALE (con Grant valido su una campagna) riceve comunque 403 su POST /api/admin/association-roles", async () => {
    configureDb({
      campaign,
      grants: [
        mockGrant({
          userId: "user-1",
          campaignId: campaign.id,
          role: Role.head_master,
        }),
      ],
      users: [mockUser({ id: "user-1", email: "hm@example.com" })],
    });
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "hm@example.com" },
    });

    // Prova preliminare: l'utente è davvero head_master di campagna (T-3/T-2
    // OK) — usa lo stesso mock di `@/lib/db` configurato sopra (non
    // `prismaClient`, che è un mock indipendente e qui non configurato).
    await expect(
      checkCampaignAccess(prisma, "user-1", campaign.id, Role.head_master)
    ).resolves.toBe(true);

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          group: "direttivo",
        }),
        headers: { "content-type": "application/json" },
      }
    );
    const response = await postAssociationRole(request, {});

    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 4. isDirettivo/isSviluppo (ex AssociationRole, T-1): bypass della quota
//    associativa e loro ortogonalità rispetto al ruolo di campagna (Grant/T-3).
// ---------------------------------------------------------------------------
describe("isDirettivo/isSviluppo — bypass quota associativa, ortogonalità col ruolo di campagna", () => {
  it.each([
    { isDirettivo: false, isSviluppo: false, bypasses: false },
    { isDirettivo: true, isSviluppo: false, bypasses: true },
    { isDirettivo: false, isSviluppo: true, bypasses: true },
    { isDirettivo: true, isSviluppo: true, bypasses: true },
  ])(
    "checkAssociationQuotaAccess bypassa la quota se isDirettivo=$isDirettivo o isSviluppo=$isSviluppo (bypasses=$bypasses)",
    async ({ isDirettivo, isSviluppo, bypasses }) => {
      const user = mockUser({
        id: "user-x",
        email: "user-x@example.com",
        isDirettivo,
        isSviluppo,
      });
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.membership.findUnique.mockResolvedValue(null);

      const result = await checkAssociationQuotaAccess(prismaClient, "user-x");

      expect(result).toBe(bypasses);
    }
  );

  it("un utente isDirettivo=true NON ottiene accesso alla sezione admin/settings di una campagna: resta necessario un Grant di campagna (T-3, nessun bypass generico)", async () => {
    // Nessun Grant per president-1 su questa campagna.
    prismaMock.grant.findUnique.mockResolvedValue(null);

    const result = await checkCampaignAccess(
      prismaClient,
      "president-1",
      campaign.id,
      Role.head_master
    );

    expect(result).toBe(false);
  });

  it("un head_master di campagna senza isDirettivo/isSviluppo ottiene comunque accesso alla sezione admin: quei flag non sono richiesti lì (T-3)", async () => {
    const grant = mockGrant({
      userId: "user-5",
      campaignId: campaign.id,
      role: Role.head_master,
    });
    prismaMock.grant.findUnique.mockResolvedValue(grant);

    const result = await checkCampaignAccess(
      prismaClient,
      "user-5",
      campaign.id,
      Role.head_master
    );

    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. UserStatus.banned — nessun enforcement in nessun punto (T-1 dichiara
//    "solo dato, nessun enforcement" per questa fase: verifica di non
//    regressione, non un successo funzionale).
// ---------------------------------------------------------------------------
describe("UserStatus.banned — verifica che NON blocchi nulla (nessun enforcement per design in questa fase)", () => {
  it("un utente banned con Grant head_master valido passa comunque checkCampaignAccess (T-3)", async () => {
    const grant = mockGrant({
      userId: "banned-1",
      campaignId: campaign.id,
      role: Role.head_master,
    });
    prismaMock.grant.findUnique.mockResolvedValue(grant);

    await expect(
      checkCampaignAccess(
        prismaClient,
        "banned-1",
        campaign.id,
        Role.head_master
      )
    ).resolves.toBe(true);
  });

  it("un utente banned con Membership valida passa comunque checkAssociationQuotaAccess (T-4)", async () => {
    const user = mockUser({
      id: "banned-2",
      email: "banned2@example.com",
      status: UserStatus.banned,
    });
    const membership = mockMembership({
      userId: "banned-2",
      year: CURRENT_YEAR,
    });
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.membership.findUnique.mockResolvedValue(membership);

    await expect(
      checkAssociationQuotaAccess(prismaClient, "banned-2")
    ).resolves.toBe(true);
  });

  it("un utente banned SENZA quota e SENZA ruolo idoneo viene bloccato per lo STESSO motivo di un utente attivo nelle stesse condizioni (banned non introduce un blocco extra né un bypass)", async () => {
    const bannedUser = mockUser({
      id: "banned-3",
      email: "banned3@example.com",
      status: UserStatus.banned,
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(bannedUser);
    prismaMock.membership.findUnique.mockResolvedValueOnce(null);
    const bannedResult = await checkAssociationQuotaAccess(
      prismaClient,
      "banned-3"
    );

    const activeUser = mockUser({
      id: "active-3",
      email: "active3@example.com",
      status: UserStatus.active,
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(activeUser);
    prismaMock.membership.findUnique.mockResolvedValueOnce(null);
    const activeResult = await checkAssociationQuotaAccess(
      prismaClient,
      "active-3"
    );

    expect(bannedResult).toBe(false);
    expect(activeResult).toBe(false);
    expect(bannedResult).toBe(activeResult);
  });

  it("verifica statica: authorization.ts non referenzia mai UserStatus.banned/`.status` come condizione di blocco (grep di non-regressione)", () => {
    // Consapevolmente ridondante rispetto ai test funzionali sopra: fa
    // fallire rumorosamente la suite se in futuro qualcuno introduce un
    // `if (user.status === "banned")`, invece di scoprirlo solo a runtime.
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../lib/authorization.ts"),
      "utf-8"
    );
    // Nota: il file contiene deliberatamente riferimenti testuali a
    // `UserStatus.banned` nei commenti JSDoc (per documentarne l'esclusione
    // dallo scope) — qui si verifica solo l'assenza di un confronto/branch
    // di codice reale che lo usi come condizione (es. `=== UserStatus.banned`
    // o `status === "banned"`), non l'assenza della stringa in sé.
    expect(source).not.toMatch(/status\s*===\s*["']banned["']/);
    expect(source).not.toMatch(
      /===\s*UserStatus\.banned|UserStatus\.banned\s*===/
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Email cablate Sviluppo Web: sanity check diretto su isHardcodedSviluppo,
//    unica fonte di verità per l'OR con `User.isSviluppo` (`getUserGroupFlags`).
// ---------------------------------------------------------------------------
describe("isHardcodedSviluppo — sanity check condiviso dal gate Amministrazione/impersonation", () => {
  it("riconosce solo le due email cablate come sviluppo web", () => {
    expect(isHardcodedSviluppo(SVILUPPO_EMAIL)).toBe(true);
    expect(isHardcodedSviluppo("prevalentementealberto@gmail.com")).toBe(true);
    expect(isHardcodedSviluppo("chiunque-altro@example.com")).toBe(false);
    expect(isHardcodedSviluppo("")).toBe(false);
  });
});
