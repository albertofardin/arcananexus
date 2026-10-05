import { describe, it, expect } from "vitest";
import { createDataRequirementSchema } from "./dataRequirement";

describe("createDataRequirementSchema", () => {
  it("accetta un groupId su un requisito di tipo requires", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "requires",
      groupId: 1,
    });

    expect(result.success).toBe(true);
  });

  it("accetta un requires senza groupId (comportamento storico, AND)", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "requires",
    });

    expect(result.success).toBe(true);
  });

  it("accetta un blocks senza groupId", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "blocks",
    });

    expect(result.success).toBe(true);
  });

  it("rifiuta un groupId su un requisito di tipo blocks (T-039 criterio #3)", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "blocks",
      groupId: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.groupId).toBeDefined();
    }
  });

  it("rifiuta un groupId non positivo", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "requires",
      groupId: 0,
    });

    expect(result.success).toBe(false);
  });

  it("accetta un groupId su un requisito di tipo visibleWith (stessa semantica OR di requires)", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "visibleWith",
      groupId: 1,
    });

    expect(result.success).toBe(true);
  });

  it("accetta un visibleWith senza groupId (AND)", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "visibleWith",
    });

    expect(result.success).toBe(true);
  });

  it("accetta un grants senza groupId", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "grants",
    });

    expect(result.success).toBe(true);
  });

  it("rifiuta un groupId su un requisito di tipo grants", () => {
    const result = createDataRequirementSchema.safeParse({
      requiredDefinitionId: 2,
      type: "grants",
      groupId: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.groupId).toBeDefined();
    }
  });
});
