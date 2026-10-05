import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { mockPersonalData } from "@/test/helpers/prisma-fixtures";
// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));
// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    personalData: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));
// Import after mocks
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const sessionUser = {
  id: "user-1",
  name: "Mario Rossi",
  email: "mario@example.com",
  image: null,
  emailVerified: false,
};

describe("GET /api/profile", () => {
  beforeEach(() => {
    (auth.api.getSession as unknown as Mock).mockReset();
    (prisma.personalData.findUnique as Mock).mockReset();
    (prisma.user.findUnique as Mock)
      .mockReset()
      .mockResolvedValue({ emailNotificationsEnabled: true });
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Not authenticated");
    });

    it("should return 401 when session has no user", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: null,
      });

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Not authenticated");
    });
  });

  describe("Fetching profile", () => {
    it("should return the profile of the authenticated user", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: sessionUser,
      });
      (prisma.personalData.findUnique as Mock).mockResolvedValue(
        mockPersonalData({ userId: "user-1" })
      );

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toMatchObject({
        id: "user-1",
        name: "Mario Rossi",
        email: "mario@example.com",
      });
      expect(data.personalData).toMatchObject({
        firstName: "Mario",
        lastName: "Rossi",
      });
      expect(prisma.personalData.findUnique).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    it("should surface the emailNotificationsEnabled preference", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: sessionUser,
      });
      (prisma.personalData.findUnique as Mock).mockResolvedValue(
        mockPersonalData({ userId: "user-1" })
      );
      (prisma.user.findUnique as Mock).mockResolvedValue({
        emailNotificationsEnabled: false,
      });

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(data.user.emailNotificationsEnabled).toBe(false);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        select: { emailNotificationsEnabled: true },
      });
    });

    it("should default emailNotificationsEnabled to true when the user row is missing", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: sessionUser,
      });
      (prisma.personalData.findUnique as Mock).mockResolvedValue(
        mockPersonalData({ userId: "user-1" })
      );
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(data.user.emailNotificationsEnabled).toBe(true);
    });

    it("should return contact and guardian fields when present", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: sessionUser,
      });
      (prisma.personalData.findUnique as Mock).mockResolvedValue(
        mockPersonalData({
          userId: "user-1",
          phone: "+39 333 1234567",
          nationality: "Italiana",
          guardianName: "Giuseppe Rossi",
          guardianPhone: "+39 333 7654321",
          guardianEmail: "giuseppe@example.com",
        })
      );

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.personalData).toMatchObject({
        phone: "+39 333 1234567",
        nationality: "Italiana",
        guardianName: "Giuseppe Rossi",
        guardianPhone: "+39 333 7654321",
        guardianEmail: "giuseppe@example.com",
      });
    });

    it("should return null contact and guardian fields when not yet compiled", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: sessionUser,
      });
      (prisma.personalData.findUnique as Mock).mockResolvedValue(
        mockPersonalData({ userId: "user-1" })
      );

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(data.personalData.phone).toBeNull();
      expect(data.personalData.guardianName).toBeNull();
    });

    it("should return null personalData when it does not exist yet", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: sessionUser,
      });
      (prisma.personalData.findUnique as Mock).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.personalData).toBeNull();
    });

    it("should never leak another user's profile: always queries by the session userId", async () => {
      const otherUser = {
        ...sessionUser,
        id: "user-2",
        email: "other@example.com",
      };
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: otherUser,
      });
      (prisma.personalData.findUnique as Mock).mockResolvedValue(
        mockPersonalData({ userId: "user-2" })
      );

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(data.user.id).toBe("user-2");
      expect(prisma.personalData.findUnique).toHaveBeenCalledWith({
        where: { userId: "user-2" },
      });
      expect(prisma.personalData.findUnique).not.toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });
  });

  describe("Error Handling", () => {
    it("should return 500 on database error", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: sessionUser,
      });
      (prisma.personalData.findUnique as Mock).mockRejectedValue(
        new Error("DB down")
      );

      const request = new NextRequest("http://localhost:3000/api/profile");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Internal server error");

      consoleErrorSpy.mockRestore();
    });
  });
});
