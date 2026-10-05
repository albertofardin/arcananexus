import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, DELETE } from "../route";
import { auth } from "@/lib/auth";
import { canManageEvents } from "@/lib/authorization";
import {
  getEventByIdScoped,
  updateEvent,
  deleteEvent,
  countPaidBookings,
} from "@/lib/repositories/event.repository";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/authorization", () => ({ canManageEvents: vi.fn() }));
vi.mock("@/lib/repositories/event.repository");

const ctx = { params: Promise.resolve({ eventId: "7" }) };
const body = {
  name: "Evento",
  description: "Descrizione",
  place: "Qui",
  dateEventStart: "2026-08-10T10:00:00.000Z",
  dateEventEnd: "2026-08-10T18:00:00.000Z",
  datePublicationStart: "2026-07-01T10:00:00.000Z",
  datePublicationEnd: "2026-08-05T10:00:00.000Z",
  price: 0,
  campaignSlug: "altra-campagna",
};
const req = (method: string, json?: object) =>
  new NextRequest("http://localhost/api/events/7", {
    method,
    body: json ? JSON.stringify(json) : undefined,
  });

describe("PATCH/DELETE /api/events/[eventId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getEventByIdScoped as Mock).mockResolvedValue({
      id: 7,
      organizationId: 1,
      campaignId: 5,
      campaign: { slug: "nuova-frontiera" },
    });
    (canManageEvents as Mock).mockResolvedValue(true);
    (updateEvent as Mock).mockResolvedValue({ id: 7 });
    (countPaidBookings as Mock).mockResolvedValue(0);
  });

  it("PATCH ignora il campaignSlug del body: la campagna non cambia", async () => {
    const response = await PATCH(req("PATCH", body), ctx);

    expect(response.status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith(
      expect.anything(),
      7,
      1,
      expect.objectContaining({ campaignId: 5 })
    );
    expect((await response.json()).campaignSlug).toBe("nuova-frontiera");
  });

  it("PATCH e DELETE: 403 senza permessi di gestione", async () => {
    (canManageEvents as Mock).mockResolvedValue(false);

    expect((await PATCH(req("PATCH", body), ctx)).status).toBe(403);
    expect((await DELETE(req("DELETE"), ctx)).status).toBe(403);
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("DELETE con iscrizioni a pagamento: 409, l'evento non si elimina", async () => {
    (countPaidBookings as Mock).mockResolvedValue(2);

    expect((await DELETE(req("DELETE"), ctx)).status).toBe(409);
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("DELETE elimina l'evento nel tenant e restituisce la campagna", async () => {
    const response = await DELETE(req("DELETE"), ctx);

    expect(deleteEvent).toHaveBeenCalledWith(expect.anything(), 7, 1);
    expect((await response.json()).campaignSlug).toBe("nuova-frontiera");
  });

  it("404 se l'evento non esiste nell'organizzazione", async () => {
    (getEventByIdScoped as Mock).mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), ctx)).status).toBe(404);
  });
});
