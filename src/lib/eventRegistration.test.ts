import { describe, it, expect, beforeEach, vi } from "vitest";
import { getRegistrationState } from "./eventRegistration";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

const NOW = new Date("2026-07-23T12:00:00.000Z");
const campaignEvent = {
  id: 1,
  campaignId: 5,
  datePublicationStart: new Date("2026-07-01"),
  datePublicationEnd: new Date("2026-08-01"),
};
const orgEvent = { ...campaignEvent, campaignId: null };

const completePersonalData = {
  firstName: "Mario",
  lastName: "Rossi",
  ssn: "RSSMRA80A01H501U",
  address: "Via Roma 1",
  placeOfBirth: "Roma",
  dateOfBirth: new Date("1980-01-01"),
  guardianName: null,
  guardianPhone: null,
};

const approvedCharacter = (id: number, campaignId = 5) => ({
  id,
  campaignId,
  name: `PG ${id}`,
  avatar: null,
  approvalDate: new Date("2026-01-01"),
  deathDate: null,
  parkDate: null,
});

describe("getRegistrationState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.booking.findUnique.mockResolvedValue(null);
    // quota valida per l'anno corrente
    prismaMock.user.findUnique.mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "a@b.it",
    } as never);
    prismaMock.membership.findUnique.mockResolvedValue({ id: 1 } as never);
    prismaMock.personalData.findUnique.mockResolvedValue(
      completePersonalData as never
    );
    prismaMock.character.findMany.mockResolvedValue([]);
  });

  it("evento senza campagna: bastano quota, anagrafica e finestra aperta", async () => {
    const state = await getRegistrationState(prismaClient, orgEvent, "u1", NOW);

    expect(state.canRegister).toBe(true);
    expect(state.needsCharacter).toBe(false);
    expect(prismaMock.character.findMany).not.toHaveBeenCalled();
  });

  it("evento di campagna: serve un personaggio attivo della campagna", async () => {
    prismaMock.character.findMany.mockResolvedValue([
      approvedCharacter(1),
      approvedCharacter(2, 99), // altra campagna
      { ...approvedCharacter(3), approvalDate: null }, // in review
    ] as never);

    const state = await getRegistrationState(
      prismaClient,
      campaignEvent,
      "u1",
      NOW
    );

    expect(state.characters.map(c => c.id)).toEqual([1]);
    expect(state.canRegister).toBe(true);
  });

  it("evento di campagna senza personaggi attivi: non può iscriversi", async () => {
    const state = await getRegistrationState(
      prismaClient,
      campaignEvent,
      "u1",
      NOW
    );

    expect(state.canRegister).toBe(false);
  });

  it("già iscritto: riporta il personaggio e blocca", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      character: { id: 1, name: "Gandalf" },
    } as never);

    const state = await getRegistrationState(prismaClient, orgEvent, "u1", NOW);

    expect(state.existingBooking).toEqual({ characterName: "Gandalf" });
    expect(state.canRegister).toBe(false);
  });

  it("anagrafica incompleta o senza quota: non può iscriversi", async () => {
    prismaMock.personalData.findUnique.mockResolvedValue(null);
    expect(
      (await getRegistrationState(prismaClient, orgEvent, "u1", NOW))
        .hasCompletePersonalData
    ).toBe(false);

    prismaMock.personalData.findUnique.mockResolvedValue(
      completePersonalData as never
    );
    prismaMock.membership.findUnique.mockResolvedValue(null);
    const state = await getRegistrationState(prismaClient, orgEvent, "u1", NOW);
    expect(state.hasMembership).toBe(false);
    expect(state.canRegister).toBe(false);
  });

  it("direttivo e sviluppo web senza tessera non possono iscriversi", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      isDirettivo: true,
      isSviluppo: true,
      email: "a@b.it",
    } as never);
    prismaMock.membership.findUnique.mockResolvedValue(null);

    const state = await getRegistrationState(prismaClient, orgEvent, "u1", NOW);

    expect(state.hasMembership).toBe(false);
    expect(state.canRegister).toBe(false);
  });

  it("finestra iscrizioni: prima = upcoming, dopo = closed", async () => {
    const before = new Date("2026-06-01");
    const after = new Date("2026-09-01");
    expect(
      (await getRegistrationState(prismaClient, orgEvent, "u1", before)).window
    ).toBe("upcoming");
    const closed = await getRegistrationState(
      prismaClient,
      orgEvent,
      "u1",
      after
    );
    expect(closed.window).toBe("closed");
    expect(closed.canRegister).toBe(false);
  });
});
