/* eslint-disable import/order -- some imports intentionally follow vi.mock() for correct hoisting */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/impersonation", () => ({
  getSessionContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      updateUser: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
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
import { getSessionContext } from "@/lib/impersonation";
import { utapi } from "@/lib/uploadthing";

const activeUser = { id: "user-1", name: "Mario Rossi", email: "mario@x.it" };
const notImpersonating = { isImpersonating: false as const, activeUser };

const deleteRequest = (): NextRequest =>
  new NextRequest("http://localhost/api/profile/avatar", {
    method: "DELETE",
  });

describe("DELETE /api/profile/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    (auth.api.updateUser as unknown as Mock).mockResolvedValue({
      status: true,
    });
    (prisma.user.findUnique as Mock).mockResolvedValue({ image: null });
    (utapi.deleteFiles as Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    (getSessionContext as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(401);
    expect(auth.api.updateUser).not.toHaveBeenCalled();
  });

  it("clears the avatar via Better Auth and removes the previous UploadThing file", async () => {
    (prisma.user.findUnique as Mock).mockResolvedValue({
      image: "https://utfs.io/f/old-key",
    });

    const response = await DELETE(deleteRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeNull();
    expect(auth.api.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { image: null } })
    );
    expect(utapi.deleteFiles).toHaveBeenCalledWith("old-key");
  });

  it("does not try to delete an external/legacy avatar (not an UploadThing url)", async () => {
    (prisma.user.findUnique as Mock).mockResolvedValue({
      image: "https://example.com/avatar.png",
    });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    expect(utapi.deleteFiles).not.toHaveBeenCalled();
  });

  it("still succeeds when deleting the previous UploadThing file fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    (prisma.user.findUnique as Mock).mockResolvedValue({
      image: "https://utfs.io/f/old-key",
    });
    (utapi.deleteFiles as Mock).mockRejectedValue(new Error("boom"));

    const response = await DELETE(deleteRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeNull();
    consoleErrorSpy.mockRestore();
  });

  it("returns 500 on unexpected errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    (auth.api.updateUser as unknown as Mock).mockRejectedValue(
      new Error("boom")
    );

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    consoleErrorSpy.mockRestore();
  });
});
