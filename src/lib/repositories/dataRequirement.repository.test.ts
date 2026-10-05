import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  listOutgoingRequirements,
  listOutgoingRequirementsForDefinitions,
  listIncomingRequirements,
  listRequirementsForCampaign,
  getDataRequirementById,
  createDataRequirement,
  deleteDataRequirement,
  wouldCreateRequirementCycle,
  MAX_REQUIREMENT_DEPTH,
  RequirementDepthExceededError,
} from "./dataRequirement.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

const mockRequirement = (overrides = {}) => ({
  id: 1,
  definitionId: 1,
  requiredDefinitionId: 2,
  type: "requires" as const,
  groupId: null,
  ...overrides,
});

describe("DataRequirement Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listOutgoingRequirements", () => {
    it("should list requirements defined by a definition", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      await listOutgoingRequirements(prismaClient, 1);

      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledWith({
        where: { definitionId: 1 },
        include: { requiredDefinition: { include: { dataType: true } } },
        orderBy: { id: "asc" },
      });
    });
  });

  describe("listOutgoingRequirementsForDefinitions", () => {
    it("should list requirements defined by any of several definitions in one query", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      await listOutgoingRequirementsForDefinitions(prismaClient, [1, 2, 3]);

      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledWith({
        where: { definitionId: { in: [1, 2, 3] } },
        include: { requiredDefinition: { include: { dataType: true } } },
        orderBy: { id: "asc" },
      });
    });

    it("should return an empty array without querying when given no ids", async () => {
      const result = await listOutgoingRequirementsForDefinitions(
        prismaClient,
        []
      );

      expect(result).toEqual([]);
      expect(prismaMock.dataRequirement.findMany).not.toHaveBeenCalled();
    });
  });

  describe("listIncomingRequirements", () => {
    it("should list requirements that target a definition", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      await listIncomingRequirements(prismaClient, 2);

      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledWith({
        where: { requiredDefinitionId: 2 },
        include: { definition: { include: { dataType: true } } },
        orderBy: { id: "asc" },
      });
    });
  });

  describe("listRequirementsForCampaign", () => {
    it("should list the flat requirement graph scoped to a campaign", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      await listRequirementsForCampaign(prismaClient, 7);

      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledWith({
        where: { definition: { dataType: { campaignId: 7 } } },
        select: {
          id: true,
          definitionId: true,
          requiredDefinitionId: true,
          type: true,
          groupId: true,
        },
        orderBy: { id: "asc" },
      });
    });
  });

  describe("getDataRequirementById", () => {
    it("should return the requirement when found", async () => {
      const requirement = mockRequirement();
      prismaMock.dataRequirement.findUnique.mockResolvedValue(requirement);

      const result = await getDataRequirementById(prismaClient, 1);

      expect(result).toEqual(requirement);
      expect(prismaMock.dataRequirement.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should return null when not found", async () => {
      prismaMock.dataRequirement.findUnique.mockResolvedValue(null);

      const result = await getDataRequirementById(prismaClient, 999);

      expect(result).toBeNull();
    });
  });

  describe("createDataRequirement", () => {
    it("should create a requirement edge", async () => {
      const input = {
        definitionId: 1,
        requiredDefinitionId: 2,
        type: "requires" as const,
      };
      const created = mockRequirement(input);
      prismaMock.dataRequirement.create.mockResolvedValue(created);

      const result = await createDataRequirement(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.dataRequirement.create).toHaveBeenCalledWith({
        data: { ...input, groupId: null },
      });
    });

    it("should pass groupId through when creating an OR-group edge", async () => {
      const input = {
        definitionId: 1,
        requiredDefinitionId: 2,
        type: "requires" as const,
        groupId: 5,
      };
      const created = mockRequirement(input);
      prismaMock.dataRequirement.create.mockResolvedValue(created);

      const result = await createDataRequirement(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.dataRequirement.create).toHaveBeenCalledWith({
        data: input,
      });
    });
  });

  describe("deleteDataRequirement", () => {
    it("should delete a requirement edge by id", async () => {
      const requirement = mockRequirement();
      prismaMock.dataRequirement.delete.mockResolvedValue(requirement);

      const result = await deleteDataRequirement(prismaClient, 1);

      expect(result).toEqual(requirement);
      expect(prismaMock.dataRequirement.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  describe("wouldCreateRequirementCycle", () => {
    it("should detect a direct self-requirement as a cycle", async () => {
      const result = await wouldCreateRequirementCycle(
        prismaClient,
        1,
        1,
        "requires"
      );

      expect(result).toBe(true);
      expect(prismaMock.dataRequirement.findMany).not.toHaveBeenCalled();
    });

    it("should detect an indirect cycle (A requires B, B already requires A)", async () => {
      // Adding A -> B when B already requires A (directly) closes a cycle.
      prismaMock.dataRequirement.findMany.mockResolvedValueOnce([
        { requiredDefinitionId: 1 },
      ] as never);

      const result = await wouldCreateRequirementCycle(
        prismaClient,
        1,
        2,
        "requires"
      );

      expect(result).toBe(true);
      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledWith({
        where: { definitionId: { in: [2] }, type: "requires" },
        select: { requiredDefinitionId: true },
      });
    });

    it("should detect a multi-hop cycle (A -> B -> C -> A)", async () => {
      // Adding A -> B: B requires C, C requires A.
      prismaMock.dataRequirement.findMany
        .mockResolvedValueOnce([{ requiredDefinitionId: 3 }] as never)
        .mockResolvedValueOnce([{ requiredDefinitionId: 1 }] as never);

      const result = await wouldCreateRequirementCycle(
        prismaClient,
        1,
        2,
        "requires"
      );

      expect(result).toBe(true);
      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledTimes(2);
    });

    it("should return false when no cycle would be created", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      const result = await wouldCreateRequirementCycle(
        prismaClient,
        1,
        2,
        "requires"
      );

      expect(result).toBe(false);
    });

    it("should only follow requires edges, not blocks", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      await wouldCreateRequirementCycle(prismaClient, 1, 2, "requires");

      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "requires" }),
        })
      );
    });

    it("should traverse the grants graph independently when type is grants", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      await wouldCreateRequirementCycle(prismaClient, 1, 2, "grants");

      expect(prismaMock.dataRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "grants" }),
        })
      );
    });

    it("should throw RequirementDepthExceededError instead of looping forever past MAX_REQUIREMENT_DEPTH", async () => {
      // Catena lineare 2 -> 3 -> 4 -> ... ben oltre il tetto, che non richiude
      // mai su 1: senza una guardia di profondità esplicita il BFS
      // continuerebbe a interrogare il DB un livello alla volta senza limite
      // dichiarato.
      const chainLength = MAX_REQUIREMENT_DEPTH + 20;
      prismaMock.dataRequirement.findMany.mockImplementation((async ({
        where,
      }: {
        where: { definitionId: { in: number[] } };
      }) => {
        const id = where.definitionId.in[0];
        return id < chainLength ? [{ requiredDefinitionId: id + 1 }] : [];
      }) as never);

      await expect(
        wouldCreateRequirementCycle(prismaClient, 1, 2, "requires")
      ).rejects.toThrow(RequirementDepthExceededError);
    });
  });
});
