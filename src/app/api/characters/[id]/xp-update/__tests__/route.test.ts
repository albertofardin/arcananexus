/* eslint-disable import/order -- some imports intentionally follow vi.mock() for correct hoisting */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { mockCharacter } from "@/test/helpers/prisma-fixtures";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    character: { findUnique: vi.fn() },
    grant: { findUnique: vi.fn() },
    xpTransaction: { create: vi.fn() },
  },
}));

import { POST } from "../route";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const buildRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/characters/1/xp-update", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const contextFor = (id: string) => ({ params: Promise.resolve({ id }) });

const authAs = (userId: string, email = "master@arcana.it") =>
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email, name: "Master" },
  });

describe("POST /api/characters/[id]/xp-update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(buildRequest({ amount: 5 }), contextFor("1"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    authAs("user-1");

    const response = await POST(buildRequest({ amount: 5 }), contextFor("abc"));

    expect(response.status).toBe(400);
  });

  it("returns 400 when amount is zero", async () => {
    authAs("user-1");

    const response = await POST(buildRequest({ amount: 0 }), contextFor("1"));

    expect(response.status).toBe(400);
    expect(prisma.character.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the character does not exist", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(buildRequest({ amount: 5 }), contextFor("1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the requester is not campaign master (owner is not enough)", async () => {
    authAs("owner-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1, userId: "owner-1" })
    );
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(buildRequest({ amount: 5 }), contextFor("1"));

    expect(response.status).toBe(403);
    expect(prisma.xpTransaction.create).not.toHaveBeenCalled();
  });

  it("creates an update XpTransaction attributed to the master when authorized", async () => {
    authAs("master-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1 })
    );
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "master-1",
      campaignId: 1,
      role: "master",
    });
    (prisma.xpTransaction.create as Mock).mockResolvedValue({
      id: 1,
      characterId: 1,
      amount: 5,
      reason: "update",
      updatedById: "master-1",
    });

    const response = await POST(buildRequest({ amount: 5 }), contextFor("1"));

    expect(response.status).toBe(201);
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        amount: 5,
        reason: "update",
        note: null,
        updatedById: "master-1",
      },
    });
  });

  it("allows a negative amount", async () => {
    authAs("master-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1 })
    );
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "master-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.xpTransaction.create as Mock).mockResolvedValue({
      id: 2,
      characterId: 1,
      amount: -5,
      reason: "update",
      updatedById: "master-1",
    });

    const response = await POST(buildRequest({ amount: -5 }), contextFor("1"));

    expect(response.status).toBe(201);
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        amount: -5,
        reason: "update",
        note: null,
        updatedById: "master-1",
      },
    });
  });
});
