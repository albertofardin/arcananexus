import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../staff/route";
import { auth } from "@/lib/auth";
import {
  canManageEvents,
  checkAssociationQuotaAccess,
} from "@/lib/authorization";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import { getGrant } from "@/lib/repositories/grant.repository";
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
vi.mock("@/lib/repositories/grant.repository");
vi.mock("@/lib/repositories/booking.repository");
vi.mock("@/lib/repositories/notification.repository");

const ctx = { params: Promise.resolve({ eventId: "7" }) };
const req = (json: object) =>
  new NextRequest("http://localhost/api/events/7/staff", {
    method: "POST",
    body: JSON.stringify(json),
  });

describe("POST /api/events/[eventId]/staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getEventByIdScoped as Mock).mockResolvedValue({ id: 7, campaignId: 5 });
    (canManageEvents as Mock).mockResolvedValue(true);
    (getGrant as Mock).mockResolvedValue({ id: 1 });
    (getBookingForUser as Mock).mockResolvedValue(null);
    (checkAssociationQuotaAccess as Mock).mockResolvedValue(true);
  });

  it("iscrive gratuitamente il membro dello staff", async () => {
    expect((await POST(req({ userId: "p1", notify: true }), ctx)).status).toBe(
      201
    );
    expect(createFreeBooking).toHaveBeenCalledWith(expect.anything(), {
      eventId: 7,
      userId: "p1",
      addedByStaff: true,
    });
    expect(createNotification).toHaveBeenCalledWith(expect.anything(), {
      userId: "p1",
      campaignId: 5,
      type: "event_booking",
      entityId: 7,
    });
  });

  it("non notifica se il checkbox è disattivato", async () => {
    expect((await POST(req({ userId: "p1" }), ctx)).status).toBe(201);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("non notifica il master che iscrive sé stesso", async () => {
    expect((await POST(req({ userId: "u1", notify: true }), ctx)).status).toBe(
      201
    );
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("400 se l'utente non fa parte dello staff della campagna", async () => {
    (getGrant as Mock).mockResolvedValue(null);
    expect((await POST(req({ userId: "p1" }), ctx)).status).toBe(400);
    expect(createFreeBooking).not.toHaveBeenCalled();
  });

  it("409 se l'utente è già iscritto", async () => {
    (getBookingForUser as Mock).mockResolvedValue({ id: 1 });
    expect((await POST(req({ userId: "p1" }), ctx)).status).toBe(409);
    expect(createFreeBooking).not.toHaveBeenCalled();
  });

  it("400 se l'utente non è tesserato all'associazione", async () => {
    (checkAssociationQuotaAccess as Mock).mockResolvedValue(false);
    expect((await POST(req({ userId: "p1" }), ctx)).status).toBe(400);
    expect(createFreeBooking).not.toHaveBeenCalled();
  });
});
