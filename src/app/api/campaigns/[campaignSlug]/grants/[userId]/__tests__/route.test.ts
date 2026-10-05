import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { PATCH, DELETE } from "../route";
import { mockCampaign, mockUser } from "@/test/helpers/prisma-fixtures";
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
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const buildParams = (campaignSlug: string, userId: string) => ({
  params: Promise.resolve({ campaignSlug, userId }),
});

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const campaignB = {
  ...mockCampaign({ id: 2, slug: "campaign-b" }),
  organization: { slug: "arcana-domine" },
};

describe("PATCH /api/campaigns/[campaignSlug]/grants/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "master" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(401);
  });

  it("returns 400 on invalid role", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.head_master,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "not-a-role" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(400);
  });

  it("updates the role scoped to the resolved campaign id", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.head_master,
    });
    (prisma.grant.count as Mock).mockResolvedValue(2);
    (prisma.grant.update as Mock).mockResolvedValue({
      userId: "user-2",
      campaignId: 1,
      role: Role.supporter,
      user: mockUser({ id: "user-2" }),
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "supporter" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "user-2"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ userId: "user-2", role: "supporter" });
    expect(prisma.grant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_campaignId: { userId: "user-2", campaignId: 1 } },
        data: { role: "supporter" },
      })
    );
  });

  it("does not allow a campaign master to update roles (master is read-only)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.master,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "supporter" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(403);
    expect(prisma.grant.update).not.toHaveBeenCalled();
  });

  it("does not allow demoting the last head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock)
      .mockResolvedValueOnce({
        userId: "user-1",
        campaignId: 1,
        role: Role.head_master,
      })
      .mockResolvedValueOnce({
        userId: "user-2",
        campaignId: 1,
        role: Role.head_master,
      });
    (prisma.grant.count as Mock).mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "master" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(409);
    expect(prisma.grant.update).not.toHaveBeenCalled();
  });

  it("allows demoting a head_master when another one remains", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock)
      .mockResolvedValueOnce({
        userId: "user-1",
        campaignId: 1,
        role: Role.head_master,
      })
      .mockResolvedValueOnce({
        userId: "user-2",
        campaignId: 1,
        role: Role.head_master,
      });
    (prisma.grant.count as Mock).mockResolvedValue(2);
    (prisma.grant.update as Mock).mockResolvedValue({
      userId: "user-2",
      campaignId: 1,
      role: Role.master,
      user: mockUser({ id: "user-2" }),
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "master" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(200);
  });

  it("returns 403 for a hardcoded sviluppo email without an admin grant on the campaign (nessun bypass generico)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "super-1", email: "mattia@arcana.it" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValueOnce(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "master" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(403);
    expect(prisma.grant.update).not.toHaveBeenCalled();
  });

  it("blocks demoting the last head_master with no deroga, even for a hardcoded sviluppo email who IS also that campaign's head_master", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "super-1", email: "mattia@arcana.it" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock)
      .mockResolvedValueOnce({
        userId: "super-1",
        campaignId: 1,
        role: Role.head_master,
      })
      .mockResolvedValueOnce({
        userId: "super-1",
        campaignId: 1,
        role: Role.head_master,
      });
    (prisma.grant.count as Mock).mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/super-1",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "master" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "super-1"));

    expect(response.status).toBe(409);
    expect(prisma.grant.update).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to change roles on campaign B (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/grants/user-2",
      {
        method: "PATCH",
        body: JSON.stringify({ role: "supporter" }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-b", "user-2"));

    expect(response.status).toBe(403);
    expect(prisma.grant.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/campaigns/[campaignSlug]/grants/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "DELETE",
      }
    );
    const response = await DELETE(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(401);
  });

  it("revokes the grant scoped to the resolved campaign id", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.head_master,
    });
    (prisma.grant.count as Mock).mockResolvedValue(2);
    (prisma.grant.delete as Mock).mockResolvedValue({
      userId: "user-2",
      campaignId: 1,
      role: Role.supporter,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      {
        method: "DELETE",
      }
    );
    const response = await DELETE(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(204);
    expect(prisma.grant.delete).toHaveBeenCalledWith({
      where: { userId_campaignId: { userId: "user-2", campaignId: 1 } },
    });
  });

  it("does not allow a campaign master to remove a grant (master is read-only)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.master,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(403);
    expect(prisma.grant.delete).not.toHaveBeenCalled();
  });

  it("does not allow removing the last head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock)
      .mockResolvedValueOnce({
        userId: "user-1",
        campaignId: 1,
        role: Role.head_master,
      })
      .mockResolvedValueOnce({
        userId: "user-2",
        campaignId: 1,
        role: Role.head_master,
      });
    (prisma.grant.count as Mock).mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(409);
    expect(prisma.grant.delete).not.toHaveBeenCalled();
  });

  it("allows removing a head_master when another one remains", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock)
      .mockResolvedValueOnce({
        userId: "user-1",
        campaignId: 1,
        role: Role.head_master,
      })
      .mockResolvedValueOnce({
        userId: "user-2",
        campaignId: 1,
        role: Role.head_master,
      });
    (prisma.grant.count as Mock).mockResolvedValue(2);
    (prisma.grant.delete as Mock).mockResolvedValue({
      userId: "user-2",
      campaignId: 1,
      role: Role.head_master,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants/user-2",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "user-2"));

    expect(response.status).toBe(204);
  });

  it("does not allow a campaign A head_master to revoke grants on campaign B (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/grants/user-2",
      {
        method: "DELETE",
      }
    );
    const response = await DELETE(request, buildParams("campaign-b", "user-2"));

    expect(response.status).toBe(403);
    expect(prisma.grant.delete).not.toHaveBeenCalled();
  });
});
