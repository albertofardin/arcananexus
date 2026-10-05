import { http, HttpResponse } from "msw";
import {
  mockCharacter,
  mockEvent,
  mockOrganization,
  mockCampaign,
} from "../helpers/prisma-fixtures";

export const handlers = [
  // Organizations API
  http.get("/api/organizations", () => {
    return HttpResponse.json([
      mockOrganization(),
      mockOrganization({ id: 2, name: "Second Org", slug: "second-org" }),
    ]);
  }),

  // Organization campaigns API
  http.get("/api/organizations/:orgId/campaigns", ({ params }) => {
    const orgId = Number(params.orgId);
    return HttpResponse.json([
      {
        ...mockCampaign({ organizationId: orgId }),
        dataTypes: [],
      },
    ]);
  }),

  // Events API
  http.get("/api/events", () => {
    return HttpResponse.json([
      {
        id: mockEvent().id,
        name: mockEvent().name,
        dateEventStart: mockEvent().dateEventStart,
        campaignName: "Test Campaign",
      },
    ]);
  }),

  // Characters API
  http.get("/api/characters", () => {
    const character = {
      ...mockCharacter(),
      campaignName: "Test Campaign",
      userName: "Test User",
    };

    return HttpResponse.json([character]);
  }),

  http.post("/api/characters", async () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Auth API
  http.post("/api/auth/sign-in", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    return HttpResponse.json({
      user: {
        id: "user-1",
        email: body.email,
        name: "Test User",
      },
      session: {
        token: "test-token",
      },
    });
  }),

  http.post("/api/auth/sign-out", async () => {
    return new HttpResponse(null, { status: 200 });
  }),
];
