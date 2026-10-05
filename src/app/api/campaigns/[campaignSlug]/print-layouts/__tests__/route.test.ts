import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { POST } from "../route";
import { PUT, DELETE } from "../[layoutId]/route";
import { POST as POST_DATA } from "../../print-data/route";
import { mockCampaign } from "@/test/helpers/prisma-fixtures";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    grant: { findUnique: vi.fn() },
    character: { findMany: vi.fn() },
    referenceData: { findMany: vi.fn() },
    printLayout: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

const template = {
  basePdf: { width: 63, height: 88, padding: [0, 0, 0, 0] },
  schemas: [
    [
      {
        name: "Nome",
        type: "text",
        position: { x: 5, y: 5 },
        width: 50,
        height: 8,
      },
    ],
  ],
};

const validBody = {
  source: "reference",
  name: "Divinità",
  template,
  sheet: "a4_portrait",
};

function asRole(role: Role | null) {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "u@x" },
  });
  (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
  (prisma.grant.findUnique as Mock).mockResolvedValue(
    role ? { userId: "user-1", campaignId: 1, role } : null
  );
}

function request(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/campaigns/campaign-a/x", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const slug = { params: Promise.resolve({ campaignSlug: "campaign-a" }) };
const withId = (layoutId: string) => ({
  params: Promise.resolve({ campaignSlug: "campaign-a", layoutId }),
});

describe("POST /api/campaigns/[campaignSlug]/print-layouts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);
    const response = await POST(request("POST", validBody), slug);
    expect(response.status).toBe(401);
  });

  it("returns 403 for a supporter (print is master-only)", async () => {
    asRole(Role.supporter);
    const response = await POST(request("POST", validBody), slug);
    expect(response.status).toBe(403);
    expect(prisma.printLayout.create).not.toHaveBeenCalled();
  });

  it("rejects a dataTypeId: card layouts are shared by every data type", async () => {
    asRole(Role.master);
    const response = await POST(
      request("POST", { ...validBody, dataTypeId: 3 }),
      slug
    );
    expect(response.status).toBe(400);
    expect(prisma.printLayout.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the template is not a blank page", async () => {
    asRole(Role.master);
    const response = await POST(
      request("POST", {
        ...validBody,
        template: { ...template, basePdf: "x" },
      }),
      slug
    );
    expect(response.status).toBe(400);
  });

  it("creates the layout scoped to the campaign", async () => {
    asRole(Role.master);
    (prisma.printLayout.create as Mock).mockResolvedValue({ id: 9 });

    const response = await POST(request("POST", validBody), slug);

    expect(response.status).toBe(201);
    expect(prisma.printLayout.create).toHaveBeenCalledWith({
      data: {
        campaignId: 1,
        source: "reference",
        name: "Divinità",
        template,
        sheet: "a4_portrait",
      },
    });
  });
});

describe("PUT/DELETE /api/campaigns/[campaignSlug]/print-layouts/[layoutId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for a layout of another campaign (cross-tenant)", async () => {
    asRole(Role.master);
    (prisma.printLayout.findUnique as Mock).mockResolvedValue(null);

    const put = await PUT(request("PUT", { name: "x" }), withId("5"));
    const del = await DELETE(request("DELETE"), withId("5"));

    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
    expect(prisma.printLayout.findUnique).toHaveBeenCalledWith({
      where: { id: 5, campaignId: 1 },
    });
    expect(prisma.printLayout.update).not.toHaveBeenCalled();
    expect(prisma.printLayout.delete).not.toHaveBeenCalled();
  });

  it("rejects a sheet spacing outside 0–50 mm", async () => {
    asRole(Role.master);
    (prisma.printLayout.findUnique as Mock).mockResolvedValue({ id: 5 });

    const tooBig = await PUT(request("PUT", { sheetGap: 51 }), withId("5"));
    const negative = await PUT(
      request("PUT", { sheetMargin: -1 }),
      withId("5")
    );

    expect(tooBig.status).toBe(400);
    expect(negative.status).toBe(400);
    expect(prisma.printLayout.update).not.toHaveBeenCalled();
  });

  it("saves the sheet spacing of a layout", async () => {
    asRole(Role.master);
    (prisma.printLayout.findUnique as Mock).mockResolvedValue({ id: 5 });
    (prisma.printLayout.update as Mock).mockResolvedValue({ id: 5 });

    const response = await PUT(
      request("PUT", { sheetGap: 0, sheetMargin: 12.5 }),
      withId("5")
    );

    expect(response.status).toBe(200);
    expect(prisma.printLayout.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({ sheetGap: 0, sheetMargin: 12.5 }),
    });
  });

  it("rejects changing the source of an existing layout", async () => {
    asRole(Role.master);
    (prisma.printLayout.findUnique as Mock).mockResolvedValue({ id: 5 });

    const response = await PUT(request("PUT", { source: "free" }), withId("5"));

    expect(response.status).toBe(400);
  });

  it("updates and deletes a layout of the campaign", async () => {
    asRole(Role.master);
    (prisma.printLayout.findUnique as Mock).mockResolvedValue({ id: 5 });
    (prisma.printLayout.update as Mock).mockResolvedValue({ id: 5 });
    (prisma.printLayout.delete as Mock).mockResolvedValue({ id: 5 });

    const put = await PUT(
      request("PUT", { name: "Nuovo", sheet: "none" }),
      withId("5")
    );
    const del = await DELETE(request("DELETE"), withId("5"));

    expect(put.status).toBe(200);
    expect(del.status).toBe(204);
    expect(prisma.printLayout.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { name: "Nuovo", sheet: "none", template: undefined },
    });
  });
});

describe("POST /api/campaigns/[campaignSlug]/print-data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for a supporter", async () => {
    asRole(Role.supporter);
    const response = await POST_DATA(
      request("POST", { source: "character", ids: [1] }),
      slug
    );
    expect(response.status).toBe(403);
  });

  it("returns character rows in the requested order, scoped to the campaign", async () => {
    asRole(Role.master);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        id: 2,
        name: "Lyra",
        type: "png",
        avatar: null,
        background: "<p>Nata a <b>Nord</b></p>",
        masterPublicNotes: null,
        user: { name: "Anna" },
        characterData: [
          { dataType: { name: "Talenti" }, referenceData: { name: "A" } },
          { dataType: { name: "Talenti" }, referenceData: { name: "B" } },
        ],
      },
      {
        id: 1,
        name: "Aldric",
        type: "pg",
        avatar: null,
        background: null,
        masterPublicNotes: null,
        user: { name: "Mario" },
        characterData: [],
      },
    ]);

    const response = await POST_DATA(
      request("POST", { source: "character", ids: [1, 2] }),
      slug
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.character.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 1, id: { in: [1, 2] } } })
    );
    expect(json.rows.map((r: { Nome: string }) => r.Nome)).toEqual([
      "Aldric",
      "Lyra",
    ]);
    expect(json.rows[1]).toMatchObject({
      Giocatore: "Anna",
      Tipo: "PNG",
      Talenti: "A, B",
      Background: "Nata a Nord",
      Avatar: "",
    });
  });
});
