import { describe, it, expect } from "vitest";
import { sortTalentDraftIds } from "./talentDraftOrder";
import type { TalentRequirementEdge } from "@/components/TalentList";

function edge(
  definitionId: number,
  requiredDefinitionId: number,
  type: "requires" | "blocks" = "requires",
  groupId: number | null = null
): TalentRequirementEdge {
  return {
    definitionId,
    requiredDefinitionId,
    requiredDefinitionName: `def-${requiredDefinitionId}`,
    type,
    groupId,
  };
}

describe("sortTalentDraftIds", () => {
  it("returns the draft unchanged when it has 0 or 1 items", () => {
    expect(sortTalentDraftIds([], [], new Set())).toEqual([]);
    expect(sortTalentDraftIds([5], [edge(5, 1)], new Set())).toEqual([5]);
  });

  it("reorders a chain submitted in reverse order (C requires B requires A)", () => {
    const requirements = [edge(3, 2), edge(2, 1)];
    const sorted = sortTalentDraftIds([3, 2, 1], requirements, new Set());
    expect(sorted).toEqual([1, 2, 3]);
  });

  it("treats a requirement already owned by the character as satisfied, unblocking the dependent even without its in-draft prerequisite", () => {
    const requirements = [edge(2, 1)];
    const sorted = sortTalentDraftIds([2], requirements, new Set([1]));
    expect(sorted).toEqual([2]);
  });

  it("does not block ordering on a requirement that is neither owned nor in the draft (server will reject it)", () => {
    const requirements = [edge(2, 99)];
    const sorted = sortTalentDraftIds([2, 1], requirements, new Set());
    expect(sorted).toEqual(expect.arrayContaining([1, 2]));
    expect(sorted).toHaveLength(2);
  });

  it("resolves an OR-group by placing an already-owned alternative first", () => {
    const requirements = [edge(3, 1, "requires", 1), edge(3, 2, "requires", 1)];
    const sorted = sortTalentDraftIds([3], requirements, new Set([2]));
    expect(sorted).toEqual([3]);
  });

  it("resolves an OR-group by ordering an in-draft alternative before the dependent", () => {
    const requirements = [edge(3, 1, "requires", 1), edge(3, 2, "requires", 1)];
    const sorted = sortTalentDraftIds([3, 1], requirements, new Set());
    expect(sorted).toEqual([1, 3]);
  });

  it("falls back to appending the residual in original order on a genuine in-draft cycle, instead of throwing", () => {
    const requirements = [edge(1, 2), edge(2, 1)];
    const sorted = sortTalentDraftIds([1, 2], requirements, new Set());
    expect(sorted).toEqual([1, 2]);
  });

  it("ignores blocks edges entirely (they are not an ordering concern)", () => {
    const requirements = [edge(2, 1, "blocks")];
    const sorted = sortTalentDraftIds([2, 1], requirements, new Set());
    expect(sorted).toEqual(expect.arrayContaining([1, 2]));
  });
});
