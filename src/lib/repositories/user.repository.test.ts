import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  findEmailByUsername,
  listAllUsersBasic,
  listDirettivoMembers,
  setUserDirettivo,
  listSviluppoMembers,
  setUserSviluppo,
  listUsersForAdmin,
} from "./user.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockUser } from "@/test/helpers/prisma-fixtures";

describe("User Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findEmailByUsername", () => {
    it("should return the email for a matching username", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        email: "alice@example.com",
      } as never);

      const result = await findEmailByUsername(prismaClient, "alice");

      expect(result).toBe("alice@example.com");
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { name: "alice" },
        select: { email: true },
      });
    });

    it("should return null when no user matches the username", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await findEmailByUsername(prismaClient, "nobody");

      expect(result).toBeNull();
    });
  });

  describe("listAllUsersBasic", () => {
    it("should return only basic fields, ordered by name", async () => {
      const users = [
        { id: "user-1", name: "Alice", email: "alice@example.com" },
        { id: "user-2", name: "Bob", email: "bob@example.com" },
      ];
      prismaMock.user.findMany.mockResolvedValue(users as never);

      const result = await listAllUsersBasic(prismaClient);

      expect(result).toEqual(users);
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        select: { id: true, name: true, email: true, image: true },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("listDirettivoMembers", () => {
    it("should filter users by the isDirettivo flag", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await listDirettivoMembers(prismaClient);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { isDirettivo: true },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          isDirettivo: true,
        },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("setUserDirettivo", () => {
    it("should update the isDirettivo flag for the given user", async () => {
      const user = mockUser({ isDirettivo: true });
      prismaMock.user.update.mockResolvedValue(user);

      const result = await setUserDirettivo(prismaClient, "user-1", true);

      expect(result).toEqual(user);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { isDirettivo: true },
      });
    });

    it("should throw when the user does not exist", async () => {
      prismaMock.user.update.mockRejectedValue(new Error("Record not found"));

      await expect(
        setUserDirettivo(prismaClient, "missing", true)
      ).rejects.toThrow("Record not found");
    });
  });

  describe("listSviluppoMembers", () => {
    it("should filter users by the isSviluppo flag", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await listSviluppoMembers(prismaClient);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { isSviluppo: true },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          isSviluppo: true,
        },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("setUserSviluppo", () => {
    it("should update the isSviluppo flag for the given user", async () => {
      const user = mockUser({ isSviluppo: false });
      prismaMock.user.update.mockResolvedValue(user);

      const result = await setUserSviluppo(prismaClient, "user-1", false);

      expect(result).toEqual(user);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { isSviluppo: false },
      });
    });
  });

  describe("listUsersForAdmin", () => {
    const baseUserRow = {
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      image: null,
      createdAt: new Date("2024-01-01"),
      PersonalData: null,
      Membership: [] as { year: number }[],
    };

    it("returns users flattened with personalData/membershipYears, plus total and availableYears", async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          ...baseUserRow,
          PersonalData: {
            firstName: "Alice",
            lastName: "Rossi",
            ssn: "RSSMRA80A01H501Z",
            address: "Via Roma 1",
            dateOfBirth: new Date("1990-01-01"),
            placeOfBirth: "Roma",
          },
          Membership: [{ year: 2025 }, { year: 2024 }],
        },
      ] as never);
      prismaMock.user.count.mockResolvedValue(1);
      prismaMock.membership.findMany.mockResolvedValue([
        { year: 2025 },
        { year: 2024 },
      ] as never);

      const result = await listUsersForAdmin(prismaClient);

      expect(result).toEqual({
        users: [
          {
            id: "user-1",
            name: "Alice",
            email: "alice@example.com",
            image: null,
            createdAt: new Date("2024-01-01"),
            personalData: {
              firstName: "Alice",
              lastName: "Rossi",
              ssn: "RSSMRA80A01H501Z",
              address: "Via Roma 1",
              dateOfBirth: new Date("1990-01-01"),
              placeOfBirth: "Roma",
            },
            membershipYears: [2025, 2024],
          },
        ],
        total: 1,
        availableYears: [2025, 2024],
      });
    });

    it("returns personalData: null for a user who never filled in their profile", async () => {
      prismaMock.user.findMany.mockResolvedValue([baseUserRow] as never);
      prismaMock.user.count.mockResolvedValue(1);
      prismaMock.membership.findMany.mockResolvedValue([] as never);

      const result = await listUsersForAdmin(prismaClient);

      expect(result.users[0]).toEqual({
        id: "user-1",
        name: "Alice",
        email: "alice@example.com",
        image: null,
        createdAt: new Date("2024-01-01"),
        personalData: null,
        membershipYears: [],
      });
    });

    it("applies search (name/email, case-insensitive) and pagination to the where clause", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);
      prismaMock.membership.findMany.mockResolvedValue([]);

      await listUsersForAdmin(prismaClient, {
        search: "ali",
        page: 2,
        pageSize: 10,
      });

      const expectedWhere = {
        OR: [
          { name: { contains: "ali", mode: "insensitive" } },
          { email: { contains: "ali", mode: "insensitive" } },
        ],
      };
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          skip: 10,
          take: 10,
        })
      );
      expect(prismaMock.user.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it("filters to users with a Membership for the given year", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);
      prismaMock.membership.findMany.mockResolvedValue([]);

      await listUsersForAdmin(prismaClient, { year: 2025 });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { Membership: { some: { year: 2025 } } },
        })
      );
    });
  });
});
