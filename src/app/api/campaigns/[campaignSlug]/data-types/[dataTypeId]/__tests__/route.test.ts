import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { DataTypeAssignability, DataTypeKind, Role } from "@prisma/client";
import { GET, PATCH, DELETE } from "../route";
import { mockCampaign, mockDataType } from "@/test/helpers/prisma-fixtures";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: {
      findFirst: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
    },
    dataType: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    characterData: {
      count: vi.fn(),
    },
    referenceData: {
      count: vi.fn(),
    },
    // Round 2 (T-036): la DELETE avvolge count+delete in
    // `prisma.$transaction` per chiudere la finestra TOCTOU — il mock esegue
    // davvero la callback passandole lo stesso oggetto `prisma` mockato (i
    // model delegate sopra sono condivisi, non serve un vero motore
    // transazionale per questi test).
    $transaction: vi.fn(),
  },
}));

const buildParams = (campaignSlug: string, dataTypeId: string) => ({
  params: Promise.resolve({ campaignSlug, dataTypeId }),
});

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const campaignB = {
  ...mockCampaign({ id: 2, slug: "campaign-b" }),
  organization: { slug: "arcana-domine" },
};

function asHeadMaster(userId = "user-1") {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: "u@x" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId,
    campaignId: 1,
    role: Role.head_master,
  });
}

describe("GET /api/campaigns/[campaignSlug]/data-types/[dataTypeId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/unknown/data-types/1"
    );
    const response = await GET(request, buildParams("unknown", "1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when the data type does not belong to the resolved campaign (multi-tenant)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    // Scoped lookup (id + campaignId) returns null: id exists in another
    // campaign but Prisma's `findUnique({ where: { id, campaignId } })`
    // simply finds nothing.
    (prisma.dataType.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/999"
    );
    const response = await GET(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 400 when the dataTypeId path segment is not a valid id", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/not-a-number"
    );
    const response = await GET(
      request,
      buildParams("campaign-a", "not-a-number")
    );

    expect(response.status).toBe(400);
  });

  it("returns 200 with the data type scoped to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    const dataType = mockDataType({ id: 1, campaignId: 1 });
    (prisma.dataType.findUnique as Mock).mockResolvedValue(dataType);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(dataType);
    expect(prisma.dataType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, campaignId: 1 } })
    );
  });

  it("does not allow a campaign A head_master to read a data type via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/data-types/1"
    );
    const response = await GET(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/campaigns/[campaignSlug]/data-types/[dataTypeId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "PATCH", body: JSON.stringify({ name: "Nuovo nome" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-2", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "PATCH", body: JSON.stringify({ name: "Nuovo nome" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when the data type does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/999",
      { method: "PATCH", body: JSON.stringify({ name: "Nuovo nome" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 400 on invalid input", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1 })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "PATCH", body: JSON.stringify({ kind: "not-a-kind" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(400);
  });

  it("returns 200 and updates the data type scoped to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, name: "Vecchio nome" })
    );
    (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
    const updated = mockDataType({ id: 1, campaignId: 1, name: "Nuovo nome" });
    (prisma.dataType.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "PATCH", body: JSON.stringify({ name: "Nuovo nome" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(updated);
    expect(prisma.dataType.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });

  // "Talenti" (kind: talent) è l'unico kind che non cambia mai, in nessuna
  // delle due direzioni (T-046: sempre presente, esattamente una volta per
  // campagna, guidato da `talents`) — guard applicativo, non uno schema
  // Zod: "generic" è un `kind` valido in astratto, il rifiuto arriva dal
  // guard sulla riga esistente.
  it("returns 409 and does not update when the body attempts to change kind away from talent", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: "talent" })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "PATCH", body: JSON.stringify({ kind: "generic" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(409);
    expect(prisma.dataType.update).not.toHaveBeenCalled();
  });

  // "race" non è (più) un `kind` valido (T-047, sostituito da "assignable"):
  // il rifiuto arriva dallo schema, prima ancora del guard applicativo.
  it("returns 400 and does not update when kind is not a valid enum value, alongside other otherwise-valid fields", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: "talent" })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      {
        method: "PATCH",
        body: JSON.stringify({ name: "Nuovo nome", kind: "race" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(400);
    expect(prisma.dataType.update).not.toHaveBeenCalled();
  });

  // Un `DataType` senza `ReferenceData` figlie può cambiare kind liberamente
  // (tranne verso/da "talent"): l'invariante viene rivalidata sul kind
  // *effettivo* (quello del body), non su quello esistente.
  it("allows changing kind from assignable to generic when the data type has no reference data yet, resetting assignability/cardinality", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.assignable,
        assignability: DataTypeAssignability.always,
        cardinality: "multi",
      })
    );
    (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
    (prisma.referenceData.count as Mock).mockResolvedValue(0);
    const updated = mockDataType({
      id: 1,
      campaignId: 1,
      kind: DataTypeKind.generic,
      assignability: DataTypeAssignability.none,
      cardinality: null,
    });
    (prisma.dataType.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      {
        method: "PATCH",
        body: JSON.stringify({
          kind: "generic",
          assignability: "none",
          cardinality: null,
        }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(200);
    expect(prisma.referenceData.count).toHaveBeenCalledWith({
      where: { dataTypeId: 1 },
    });
    expect(prisma.dataType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "generic",
          assignability: "none",
          cardinality: null,
        }),
      })
    );
  });

  // Guard applicativo (T-035, estensione con kind mutabile): cambiare kind
  // dopo che la categoria ha già voci di catalogo lascerebbe i loro `flags`
  // shape-ati per il vecchio kind — bloccato a monte invece di persistere
  // dati incoerenti.
  it("returns 409 and does not update when changing kind on a data type that already has reference data", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.assignable,
        assignability: DataTypeAssignability.always,
        cardinality: "multi",
      })
    );
    (prisma.referenceData.count as Mock).mockResolvedValue(3);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      {
        method: "PATCH",
        body: JSON.stringify({
          kind: "generic",
          assignability: "none",
          cardinality: null,
        }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.details.referenceDataCount).toBe(3);
    expect(prisma.dataType.update).not.toHaveBeenCalled();
  });

  // Inviare lo stesso kind già esistente non deve far scattare il guard
  // "ha già voci di catalogo": non è un vero cambio di tipologia.
  it("does not check reference data count when kind is sent but unchanged", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.assignable,
        assignability: DataTypeAssignability.always,
        cardinality: "multi",
      })
    );
    (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
    const updated = mockDataType({
      id: 1,
      campaignId: 1,
      kind: DataTypeKind.assignable,
      name: "Fazioni",
    });
    (prisma.dataType.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      {
        method: "PATCH",
        body: JSON.stringify({ name: "Fazioni", kind: "assignable" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(200);
    expect(prisma.referenceData.count).not.toHaveBeenCalled();
  });

  it("allows updating cardinality/presentation/renderAs/name together, without kind", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      // `assignability: "always"` (T-035/T-048): la richiesta invia
      // `cardinality` esplicito — l'invariante lo richiede solo per le
      // categorie assegnabili ai PG (verificato dalla route sui valori
      // effettivi post-merge).
      mockDataType({
        id: 1,
        campaignId: 1,
        kind: "talent",
        name: "Talenti",
        assignability: "always",
      })
    );
    (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
    // `sidebarShow` non è nel body — qui si esercitano solo gli altri campi
    // aggiornabili (T-046 round 4: nessun vincolo residuo su `sidebarShow`
    // per kind: talent, vedi test dedicato più sotto).
    const updated = mockDataType({
      id: 1,
      campaignId: 1,
      kind: "talent",
      name: "Talenti speciali",
      cardinality: "multi",
      renderAs: "catalog",
      icon: "sparkles",
      sidebarOrder: 2,
      sidebarShow: true,
    });
    (prisma.dataType.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      {
        method: "PATCH",
        body: JSON.stringify({
          name: "Talenti speciali",
          cardinality: "multi",
          renderAs: "catalog",
          icon: "sparkles",
          sidebarOrder: 2,
        }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(updated);
    expect(prisma.dataType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          name: "Talenti speciali",
          cardinality: "multi",
          renderAs: "catalog",
          icon: "sparkles",
          sidebarOrder: 2,
        }),
      })
    );
    // `kind` non è stato toccato dal body: resta `undefined` nel payload
    // passato al repository (pass-through, come gli altri campi opzionali
    // non inclusi nella richiesta — Prisma ignora le chiavi `undefined`).
    expect(
      (prisma.dataType.update as Mock).mock.calls[0][0].data.kind
    ).toBeUndefined();
  });

  // T-046 round 4 (inverte il guard del round 3): "Talenti" torna un
  // `DataType` come un altro anche su questo fronte — `sidebarShow` è
  // liberamente togglabile a `true` o `false`, nessun vincolo applicativo
  // residuo.
  it.each([true, false])(
    "allows updating sidebarShow: %s on a talent-kind data type",
    async sidebarShow => {
      (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
      asHeadMaster();
      (prisma.dataType.findUnique as Mock).mockResolvedValue(
        mockDataType({
          id: 1,
          campaignId: 1,
          kind: "talent",
          name: "Talenti",
          assignability: "always",
          cardinality: "multi",
          sidebarShow: !sidebarShow,
        })
      );
      (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
      const updated = mockDataType({
        id: 1,
        campaignId: 1,
        kind: "talent",
        name: "Talenti",
        sidebarShow,
      });
      (prisma.dataType.update as Mock).mockResolvedValue(updated);

      const request = new NextRequest(
        "http://localhost/api/campaigns/campaign-a/data-types/1",
        { method: "PATCH", body: JSON.stringify({ sidebarShow }) }
      );
      const response = await PATCH(request, buildParams("campaign-a", "1"));

      expect(response.status).toBe(200);
      expect(prisma.dataType.update).toHaveBeenCalled();
    }
  );

  // T-035/T-048: invariante assignability ↔ cardinality applicata sui valori
  // *effettivi*, cioè dopo il merge tra il body e la riga esistente — non
  // solo sul body preso da solo (che `updateDataTypeSchema` da solo non può
  // validare quando tocca un solo campo).
  it("returns 400 when the body would leave cardinality non-null while assignability stays none", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      // Riga esistente: non assegnabile, nessuna cardinalità (coerente).
      mockDataType({
        id: 1,
        campaignId: 1,
        assignability: "none",
        cardinality: null,
      })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      // Il body tocca solo `cardinality`, senza riattivare `assignability`:
      // l'update lascerebbe la riga inconsistente.
      { method: "PATCH", body: JSON.stringify({ cardinality: "single" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(400);
    expect(prisma.dataType.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the body would set assignability: always while cardinality stays null", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({
        id: 1,
        campaignId: 1,
        assignability: "none",
        cardinality: null,
      })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      // Il body tocca solo `assignability`, senza impostare `cardinality`:
      // l'update lascerebbe la riga inconsistente.
      { method: "PATCH", body: JSON.stringify({ assignability: "always" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(400);
    expect(prisma.dataType.update).not.toHaveBeenCalled();
  });

  // T-047/T-048: `kind` non è modificabile, quindi solo `kind: "assignable"`
  // può effettivamente far passare `assignability` da `"masterOnly"` a un
  // valore self-assignable via PATCH (`generic` lo richiede sempre `"none"`,
  // `origins` sempre `"creationOnly"`) — qui la riga esistente è
  // `assignability: "masterOnly"`, il body la porta a `"creationOnly"`.
  it("allows flipping assignability to a self-assignable value together with an explicit cardinality (kind: assignable)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.assignable,
        cardinality: null,
        assignability: DataTypeAssignability.masterOnly,
      })
    );
    (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
    const updated = mockDataType({
      id: 1,
      campaignId: 1,
      kind: DataTypeKind.assignable,
      cardinality: "single",
      assignability: DataTypeAssignability.creationOnly,
    });
    (prisma.dataType.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      {
        method: "PATCH",
        body: JSON.stringify({
          cardinality: "single",
          assignability: "creationOnly",
        }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(200);
    expect(prisma.dataType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cardinality: "single",
          assignability: "creationOnly",
        }),
      })
    );
  });

  it("returns 409 when renaming to a name already used by another data type in the campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, name: "Vecchio nome" })
    );
    (prisma.dataType.findFirst as Mock).mockResolvedValue(
      mockDataType({ id: 2, campaignId: 1, name: "Nome occupato" })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "PATCH", body: JSON.stringify({ name: "Nome occupato" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(409);
    expect(prisma.dataType.update).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to patch a data type via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/data-types/1",
      { method: "PATCH", body: JSON.stringify({ name: "X" }) }
    );
    const response = await PATCH(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
    expect(prisma.dataType.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/campaigns/[campaignSlug]/data-types/[dataTypeId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Round 2 (T-036): esegue davvero la callback passata a
    // `prisma.$transaction`, passandole lo stesso `prisma` mockato — i test
    // sotto continuano a configurare/asserire `characterData.count` e
    // `dataType.delete` come prima, la transazione è trasparente.
    (prisma.$transaction as Mock).mockImplementation((async (
      fn: (tx: typeof prisma) => Promise<unknown>
    ) => fn(prisma)) as never);
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the data type does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/999",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 204 and deletes the data type scoped to the resolved campaign (no assigned entries: cascade of its reference data stays allowed)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1 })
    );
    (prisma.characterData.count as Mock).mockResolvedValue(0);
    (prisma.dataType.delete as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1 })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(204);
    expect(prisma.dataType.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    // Guardia di regressione sul fix TOCTOU (round 2): count e delete devono
    // restare dentro la stessa `prisma.$transaction`, non due chiamate sciolte.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // T-046: "Talenti" è obbligatorio, esattamente uno per campagna — non
  // cancellabile da nessuno, a prescindere da quante voci assegnate abbia.
  it("returns 409 and does not delete a talent-kind data type (Talenti è obbligatorio)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: "talent", name: "Talenti" })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(409);
    expect(prisma.dataType.delete).not.toHaveBeenCalled();
    expect(prisma.characterData.count).not.toHaveBeenCalled();
  });

  // T-036: bug riprodotto su PR #49 — un DataType con almeno una voce
  // assegnata a un PG non deve essere cancellabile (evita la cascata
  // silenziosa su `ReferenceData`/`CharacterData`).
  it("returns 409 and does not delete when at least one entry of the data type is assigned to a character", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1 })
    );
    (prisma.characterData.count as Mock).mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.details.assignedCount).toBe(1);
    expect(prisma.dataType.delete).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to delete a data type via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/data-types/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
    expect(prisma.dataType.delete).not.toHaveBeenCalled();
  });
});
