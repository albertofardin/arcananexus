import { describe, it, expect } from "vitest";
import { DataTypeKind } from "@prisma/client";
import {
  getFlagsSchemaForKind,
  parseReferenceDataFlags,
} from "./referenceDataFlags";

describe("referenceDataFlags (talent, T-040 category)", () => {
  it("accetta flags talento senza category (comportamento storico invariato)", () => {
    const schema = getFlagsSchemaForKind(DataTypeKind.talent);
    const result = schema.safeParse({
      cost: 5,
      repeatable: false,
      creationOnly: false,
      isDowntimeUsable: false,
      isMissivePointBonus: false,
      isDowntimePointBonus: false,
    });
    expect(result.success).toBe(true);
  });

  it("accetta flags talento con category (import Nuova Frontiera, T-040)", () => {
    const result = parseReferenceDataFlags(DataTypeKind.talent, {
      cost: 10,
      repeatable: true,
      creationOnly: false,
      category: "Classe Segreta - Cavalieri",
      isDowntimeUsable: false,
      isMissivePointBonus: false,
      isDowntimePointBonus: false,
    });
    expect(result.success).toBe(true);
    expect(
      result.success && (result.data as { category?: string }).category
    ).toBe("Classe Segreta - Cavalieri");
  });

  it("rifiuta category non stringa", () => {
    const result = parseReferenceDataFlags(DataTypeKind.talent, {
      cost: 0,
      repeatable: false,
      creationOnly: false,
      category: 42,
    });
    expect(result.success).toBe(false);
  });

  it("kind senza flag dichiarati (generic) resta un oggetto vuoto", () => {
    const result = parseReferenceDataFlags(DataTypeKind.generic, {});
    expect(result.success).toBe(true);
  });
});
