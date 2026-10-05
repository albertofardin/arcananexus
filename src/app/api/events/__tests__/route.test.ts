import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { mockEvent, mockCampaign } from "@/test/helpers/prisma-fixtures";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// Mock the auth module - create mock inline to avoid hoisting issues
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock prisma - create mock inline to avoid hoisting issues
vi.mock("@/lib/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// GET consulta i permessi solo per mostrare le bozze a chi gestisce eventi.
vi.mock("@/lib/authorization", () => ({
  hasAdminSectionAccess: vi.fn().mockResolvedValue(false),
  canManageEvents: vi.fn(),
}));
vi.mock("@/lib/repositories/grant.repository", () => ({
  getMasterCampaignIds: vi.fn().mockResolvedValue([]),
}));

describe("GET /api/events", () => {
  beforeEach(() => {
    (prisma.event.findMany as Mock).mockReset();
    (prisma.event.count as Mock).mockReset();
    (auth.api.getSession as unknown as Mock).mockReset();
  });

  describe("Query Parameter Validation", () => {
    it("should return all events when orgSlug is not provided", async () => {
      const mockEvents = [
        {
          ...mockEvent(),
          campaign: {
            ...mockCampaign(),
            organization: { slug: "org-1" },
          },
          _count: { bookings: 0 },
        },
        {
          ...mockEvent(),
          campaign: {
            ...mockCampaign(),
            organization: { slug: "org-2" },
          },
          _count: { bookings: 0 },
        },
      ];

      (prisma.event.findMany as Mock).mockResolvedValue(mockEvents);
      (prisma.event.count as Mock).mockResolvedValue(2);

      const request = new NextRequest("http://localhost:3000/api/events");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events).toHaveLength(2);
      expect(data.pagination.totalCount).toBe(2);
    });
  });

  describe("Basic Filtering", () => {
    it("should fetch events filtered by organization slug", async () => {
      const mockEvents = [
        {
          ...mockEvent(),
          campaign: {
            ...mockCampaign(),
            organization: { slug: "test-org" },
          },
          _count: { bookings: 0 },
        },
      ];

      (prisma.event.findMany as Mock).mockResolvedValue(mockEvents);
      (prisma.event.count as Mock).mockResolvedValue(1);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events).toHaveLength(1);
      expect(data.pagination.totalCount).toBe(1);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization: { slug: "test-org" },
          }),
        })
      );
    });

    it("should filter events by campaign slug when provided", async () => {
      const mockEvents = [
        {
          ...mockEvent(),
          campaign: {
            ...mockCampaign({ slug: "test-campaign" }),
          },
          _count: { bookings: 0 },
        },
      ];

      (prisma.event.findMany as Mock).mockResolvedValue(mockEvents);
      (prisma.event.count as Mock).mockResolvedValue(1);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&campaignSlug=test-campaign"
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization: { slug: "test-org" },
            campaign: { slug: "test-campaign" },
          }),
        })
      );
    });

    it("should only return published events", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ visibility: "visible" }],
          }),
        })
      );
    });
  });

  describe("Date Range Filtering", () => {
    it("should filter events by start date", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&startDate=2025-01-01"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: expect.objectContaining({
              gte: new Date("2025-01-01"),
            }),
          }),
        })
      );
    });

    it("should filter events by end date", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&endDate=2025-12-31"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: expect.objectContaining({
              lte: new Date("2025-12-31"),
            }),
          }),
        })
      );
    });

    it("should filter events by date range", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&startDate=2025-01-01&endDate=2025-12-31"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: expect.objectContaining({
              gte: new Date("2025-01-01"),
              lte: new Date("2025-12-31"),
            }),
          }),
        })
      );
    });
  });

  describe("Status Filtering", () => {
    it("should pass a valid status through to the repository", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&status=open"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            datePublicationEnd: { gte: expect.any(Date) },
          }),
        })
      );
    });

    it("should ignore an invalid status value", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&status=not-a-status"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            datePublicationEnd: expect.anything(),
          }),
        })
      );
    });
  });

  describe("User Bookings Filtering", () => {
    it("should filter events by user bookings when authenticated", async () => {
      const mockSession = {
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        session: { token: "test-token" },
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue(mockSession);

      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&myBookings=true"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bookings: {
              some: {
                userId: "user-123",
              },
            },
          }),
        })
      );
    });

    it("should not filter by bookings when myBookings is false", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&myBookings=false"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            bookings: expect.anything(),
          }),
        })
      );
    });

    it("should not filter by bookings when user is not authenticated", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&myBookings=true"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            bookings: expect.anything(),
          }),
        })
      );
    });
  });

  describe("Pagination", () => {
    it("should paginate results with default page size of 12", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 12,
        })
      );
    });

    it("should handle page parameter correctly", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&page=3"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 24, // (3 - 1) * 12
          take: 12,
        })
      );
    });

    it("should handle custom page size", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&pageSize=20"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        })
      );
    });

    it("should calculate pagination metadata correctly", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(37);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&page=2&pageSize=12"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.pagination).toEqual({
        page: 2,
        pageSize: 12,
        totalCount: 37,
        totalPages: 4, // Math.ceil(37 / 12)
      });
    });
  });

  describe("Response Format", () => {
    it("should return events with campaign name and booking count", async () => {
      const mockEvents = [
        {
          ...mockEvent({ id: 1, name: "Test Event" }),
          campaign: {
            name: "Test Campaign",
            slug: "test-campaign",
          },
          _count: { bookings: 2 },
        },
      ];

      (prisma.event.findMany as Mock).mockResolvedValue(mockEvents);
      (prisma.event.count as Mock).mockResolvedValue(1);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.events[0]).toMatchObject({
        id: 1,
        name: "Test Event",
        campaignName: "Test Campaign",
        bookingCount: 2,
      });
    });

    it("should order events by dateEventStart descending by default", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            dateEventStart: "desc",
          },
        })
      );
    });

    it('should order events ascending when ?sort=asc (dashboard "upcoming events" widget)', async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org&sort=asc"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            dateEventStart: "asc",
          },
        })
      );
    });

    it("should include campaign and booking count in the response", async () => {
      (prisma.event.findMany as Mock).mockResolvedValue([]);
      (prisma.event.count as Mock).mockResolvedValue(0);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=test-org"
      );

      await GET(request);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            campaign: expect.objectContaining({
              select: expect.objectContaining({
                name: true,
                slug: true,
              }),
            }),
            _count: expect.objectContaining({
              select: expect.objectContaining({
                bookings: true,
              }),
            }),
          }),
        })
      );
    });
  });

  describe("Multi-tenant Isolation", () => {
    it("should enforce organization isolation", async () => {
      const org1Events = [
        {
          ...mockEvent({ id: 1 }),
          campaign: {
            ...mockCampaign(),
            organization: { slug: "org-1" },
          },
          _count: { bookings: 0 },
        },
      ];

      (prisma.event.findMany as Mock).mockResolvedValue(org1Events);
      (prisma.event.count as Mock).mockResolvedValue(1);

      const request = new NextRequest(
        "http://localhost:3000/api/events?orgSlug=org-1"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.events).toHaveLength(1);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization: { slug: "org-1" },
          }),
        })
      );
    });
  });
});
