import { describe, it, expect } from "vitest";
import {
  buildFeatureDataPayload,
  buildInitialFormValues,
  isSimpleObjectSchema,
  parseFeatureDataJson,
  stringifyFeatureData,
} from "@/components/FeaturesManager/features";

// Esempio di schema "oggetto piatto" con un solo campo numerico (forma
// storica del vecchio `deathXpRecoveryFeatureSchema`, T-019, ora fusa in
// `progressFeatureSchema` — qui serve solo come fixture di forma per
// gli helper generici sotto, non deve seguire lo schema reale attuale).
const deathXpRecoverySchema = {
  type: "object",
  properties: {
    recoveryPercentage: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["recoveryPercentage"],
  additionalProperties: false,
};

// Schema reale del handler `talents`: nessuna configurazione.
const emptyObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

describe("isSimpleObjectSchema", () => {
  it("accepts an object schema with only primitive leaf properties", () => {
    expect(isSimpleObjectSchema(deathXpRecoverySchema)).toBe(true);
  });

  it("accepts an object schema with no properties (nessuna configurazione)", () => {
    expect(isSimpleObjectSchema(emptyObjectSchema)).toBe(true);
  });

  it("rejects a non-object schema", () => {
    expect(isSimpleObjectSchema({ type: "array" })).toBe(false);
    expect(isSimpleObjectSchema(null)).toBe(false);
    expect(isSimpleObjectSchema(undefined)).toBe(false);
    expect(isSimpleObjectSchema("nope")).toBe(false);
  });

  it("rejects an object schema with a nested object property", () => {
    expect(
      isSimpleObjectSchema({
        type: "object",
        properties: { nested: { type: "object", properties: {} } },
      })
    ).toBe(false);
  });

  it("rejects an object schema with an array property", () => {
    expect(
      isSimpleObjectSchema({
        type: "object",
        properties: { tags: { type: "array" } },
      })
    ).toBe(false);
  });
});

describe("buildInitialFormValues", () => {
  it("seeds an empty string for a number field with no existing data (activation)", () => {
    expect(buildInitialFormValues(deathXpRecoverySchema, undefined)).toEqual({
      recoveryPercentage: "",
    });
  });

  it("stringifies existing numeric featureData for edit", () => {
    expect(
      buildInitialFormValues(deathXpRecoverySchema, {
        recoveryPercentage: 50,
      })
    ).toEqual({ recoveryPercentage: "50" });
  });

  it("returns an empty object for a schema with no properties", () => {
    expect(buildInitialFormValues(emptyObjectSchema, {})).toEqual({});
  });

  it("defaults a boolean field to false when absent", () => {
    const schema = {
      type: "object",
      properties: { enabled: { type: "boolean" } },
    };
    expect(buildInitialFormValues(schema, undefined)).toEqual({
      enabled: false,
    });
    expect(buildInitialFormValues(schema, { enabled: true })).toEqual({
      enabled: true,
    });
  });
});

describe("buildFeatureDataPayload", () => {
  it("converts a numeric form value to a number", () => {
    expect(
      buildFeatureDataPayload(deathXpRecoverySchema, {
        recoveryPercentage: "50",
      })
    ).toEqual({ recoveryPercentage: 50 });
  });

  it("omits an empty numeric field instead of sending 0/NaN", () => {
    expect(
      buildFeatureDataPayload(deathXpRecoverySchema, {
        recoveryPercentage: "",
      })
    ).toEqual({});
  });

  it("returns an empty object for a schema with no properties", () => {
    expect(buildFeatureDataPayload(emptyObjectSchema, {})).toEqual({});
  });

  it("coerces a boolean field", () => {
    const schema = {
      type: "object",
      properties: { enabled: { type: "boolean" } },
    };
    expect(buildFeatureDataPayload(schema, { enabled: true })).toEqual({
      enabled: true,
    });
    expect(buildFeatureDataPayload(schema, {})).toEqual({ enabled: false });
  });
});

describe("stringifyFeatureData / parseFeatureDataJson", () => {
  it("round-trips through the raw JSON fallback editor", () => {
    const data = { recoveryPercentage: 50 };
    const text = stringifyFeatureData(data);
    const parsed = parseFeatureDataJson(text);
    expect(parsed).toEqual({ ok: true, data });
  });

  it("defaults to an empty object when featureData is null/undefined", () => {
    expect(stringifyFeatureData(undefined)).toBe("{}");
    expect(stringifyFeatureData(null)).toBe("{}");
  });

  it("reports a readable error for invalid JSON", () => {
    const result = parseFeatureDataJson("{not valid json");
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toContain("JSON non valido");
    }
  });
});
