import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getPersonalDataByUserId,
  upsertPersonalData,
} from "./personalData.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockPersonalData } from "@/test/helpers/prisma-fixtures";

describe("PersonalData Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPersonalDataByUserId", () => {
    it("should return personal data when found", async () => {
      const personalData = mockPersonalData();
      prismaMock.personalData.findUnique.mockResolvedValue(personalData);

      const result = await getPersonalDataByUserId(prismaClient, "user-1");

      expect(result).toEqual(personalData);
      expect(prismaMock.personalData.findUnique).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    it("should return null when not found", async () => {
      prismaMock.personalData.findUnique.mockResolvedValue(null);

      const result = await getPersonalDataByUserId(prismaClient, "user-999");

      expect(result).toBeNull();
    });

    it("should only ever query by the given userId", async () => {
      prismaMock.personalData.findUnique.mockResolvedValue(null);

      await getPersonalDataByUserId(prismaClient, "user-2");

      expect(prismaMock.personalData.findUnique).toHaveBeenCalledWith({
        where: { userId: "user-2" },
      });
      expect(prismaMock.personalData.findUnique).not.toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });
  });

  describe("upsertPersonalData", () => {
    const input = {
      firstName: "Mario",
      lastName: "Rossi",
      ssn: "RSSMRA80A01H501Z",
      address: "Via Roma 1, 20100 Milano",
      dateOfBirth: new Date("1980-01-01"),
      placeOfBirth: "Milano",
    };

    it("should upsert scoped to the given userId", async () => {
      const personalData = mockPersonalData(input);
      prismaMock.personalData.upsert.mockResolvedValue(personalData);

      const result = await upsertPersonalData(prismaClient, "user-1", input);

      expect(result).toEqual(personalData);
      expect(prismaMock.personalData.upsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: { userId: "user-1", ...input },
        update: { ...input },
      });
    });

    it("should create data for a user without existing personal data", async () => {
      const personalData = mockPersonalData({ userId: "user-2", ...input });
      prismaMock.personalData.upsert.mockResolvedValue(personalData);

      const result = await upsertPersonalData(prismaClient, "user-2", input);

      expect(result.userId).toBe("user-2");
      expect(prismaMock.personalData.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-2" } })
      );
    });

    it("should pass through contact and guardian fields (nullable columns, independent of the core group)", async () => {
      const inputWithContacts = {
        ...input,
        phone: "+39 333 1234567",
        nationality: "Italiana",
        guardianName: "Giuseppe Rossi",
        guardianPhone: "+39 333 7654321",
        guardianEmail: "giuseppe@example.com",
      };
      const personalData = mockPersonalData(inputWithContacts);
      prismaMock.personalData.upsert.mockResolvedValue(personalData);

      const result = await upsertPersonalData(
        prismaClient,
        "user-1",
        inputWithContacts
      );

      expect(result).toEqual(personalData);
      expect(prismaMock.personalData.upsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: { userId: "user-1", ...inputWithContacts },
        update: { ...inputWithContacts },
      });
    });
  });
});
