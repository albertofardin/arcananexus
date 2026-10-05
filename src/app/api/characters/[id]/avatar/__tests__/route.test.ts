/* eslint-disable import/order -- some imports intentionally follow vi.mock() for correct hoisting */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { mockCharacter, mockUser } from "@/test/helpers/prisma-fixtures";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/uploadthing", () => ({
  utapi: {
    deleteFiles: vi.fn(),
  },
}));

import { DELETE } from "../route";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { utapi } from "@/lib/uploadthing";

const buildUpdatedRow = () => ({
  ...mockCharacter(),
  campaign: {
    name: "Test Campaign",
    slug: "test-campaign",
    organization: { slug: "test-org" },
  },
  user: { name: mockUser().name },
});

const contextFor = (id: string) => ({ params: Promise.resolve({ id }) });

const authAs = (userId: string) =>
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: "u@x", name: "U" },
  });

const ownershipRow = {
  id: 1,
  userId: "user-1",
  campaignId: 1,
  avatar: null,
  campaign: { slug: "test-campaign" },
};

const deleteRequest = (): NextRequest =>
  new NextRequest("http://localhost/api/characters/1/avatar", {
    method: "DELETE",
  });

describe("DELETE /api/characters/[id]/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (utapi.deleteFiles as Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    authAs("user-1");

    const response = await DELETE(deleteRequest(), contextFor("abc"));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the character does not exist", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user is neither owner nor campaign staff", async () => {
    authAs("intruder");
    (prisma.character.findUnique as Mock).mockResolvedValue(ownershipRow);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(403);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("clears the avatar and removes the previous UploadThing file", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      ...ownershipRow,
      avatar: "https://utfs.io/f/old-key",
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);
    (prisma.character.update as Mock).mockResolvedValue(buildUpdatedRow());

    const response = await DELETE(deleteRequest(), contextFor("1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeNull();
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ avatar: null }),
      })
    );
    expect(utapi.deleteFiles).toHaveBeenCalledWith("old-key");
  });

  it("does not try to delete an external avatar (not an UploadThing url)", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      ...ownershipRow,
      avatar: "https://example.com/avatar.png",
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);
    (prisma.character.update as Mock).mockResolvedValue(buildUpdatedRow());

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(200);
    expect(utapi.deleteFiles).not.toHaveBeenCalled();
  });

  it("still succeeds when deleting the previous UploadThing file fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      ...ownershipRow,
      avatar: "https://utfs.io/f/old-key",
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);
    (prisma.character.update as Mock).mockResolvedValue(buildUpdatedRow());
    (utapi.deleteFiles as Mock).mockRejectedValue(new Error("boom"));

    const response = await DELETE(deleteRequest(), contextFor("1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
