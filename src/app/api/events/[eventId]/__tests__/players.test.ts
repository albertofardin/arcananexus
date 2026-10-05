import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../players/route";
import { auth } from "@/lib/auth";
import {
  canManageEvents,
  checkAssociationQuotaAccess,
} from "@/lib/authorization";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import {
  createFreeBooking,
  getBookingForUser,
} from "@/lib/repositories/booking.repository";
import { createNotification } from "@/lib/repositories/notification.repository";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/authorization", () => ({
  canManageEvents: vi.fn(),
  checkAssociationQuotaAccess: vi.fn(),
}));
vi.mock("@/lib/repositories/event.repository");
vi.mock("@/lib/repositories/character.repository");
vi.mock("@/lib/repositories/booking.repository");
vi.mock("@/lib/repositories/notification.repository");

const ctx = { params: Promise.resolve({ eventId: "7" }) };
const req = (json: object) =>
  new NextRequest("http://localhost/api/events/7/players", {
    method: "POST",
    body: JSON.stringify(json),
  });
const character = {
  id: 3,
  userId: "p1",
  type: "pg",
  approvalDate: new Date("2026-01-01"),
  deathDate: null,
  parkDate: null,
};

describe("POST /api/events/[eventId]/players", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getEventByIdScoped as Mock).mockResolvedValue({ id: 7, campaignId: 5 });
    (canManageEvents as Mock).mockResolvedValue(true);
    (getCharacterInCampaign as Mock).mockResolvedValue(character);
    (getBookingForUser as Mock).mockResolvedValue(null);
    (checkAssociationQuotaAccess as Mock).mockResolvedValue(true);
  });

  it("iscrive gratuitamente il giocatore con il suo personaggio", async () => {
    expect(
      (await POST(req({ characterId: 3, notify: true }), ctx)).status
    ).toBe(201);
    expect(getCharacterInCampaign).toHaveBeenCalledWith(
      expect.anything(),
      3,
      5
    );
    expect(createFreeBooking).toHaveBeenCalledWith(expect.anything(), {
      eventId: 7,
      userId: "p1",
      characterId: 3,
    });
    expect(createNotification).toHaveBeenCalledWith(expect.anything(), {
      userId: "p1",
      campaignId: 5,
      type: "event_booking",
      entityId: 7,
    });
  });

  it("non notifica se il checkbox è disattivato", async () => {
    expect((await POST(req({ characterId: 3 }), ctx)).status).toBe(201);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("403 senza permessi di gestione", async () => {
    (canManageEvents as Mock).mockResolvedValue(false);
    expect((await POST(req({ characterId: 3 }), ctx)).status).toBe(403);
    expect(createFreeBooking).not.toHaveBeenCalled();
  });

  it("400 se il personaggio non è della campagna, PNG o non approvato", async () => {
    (getCharacterInCampaign as Mock).mockResolvedValue(null);
    expect((await POST(req({ characterId: 3 }), ctx)).status).toBe(400);
    (getCharacterInCampaign as Mock).mockResolvedValue({
      ...character,
      type: "png",
    });
    expect((await POST(req({ characterId: 3 }), ctx)).status).toBe(400);
    (getCharacterInCampaign as Mock).mockResolvedValue({
      ...character,
      approvalDate: null,
    });
    expect((await POST(req({ characterId: 3 }), ctx)).status).toBe(400);
  });

  it("409 se il giocatore è già iscritto", async () => {
    (getBookingForUser as Mock).mockResolvedValue({ id: 1 });
    expect((await POST(req({ characterId: 3 }), ctx)).status).toBe(409);
    expect(createFreeBooking).not.toHaveBeenCalled();
  });

  it("400 se il giocatore non è tesserato all'associazione", async () => {
    (checkAssociationQuotaAccess as Mock).mockResolvedValue(false);
    expect((await POST(req({ characterId: 3 }), ctx)).status).toBe(400);
    expect(createFreeBooking).not.toHaveBeenCalled();
  });
});
