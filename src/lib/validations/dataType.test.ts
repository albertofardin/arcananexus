import { describe, it, expect } from "vitest";
import {
  createDataTypeSchema,
  updateDataTypeSchema,
  dataTypeShapeInvariantSchema,
  creatableDataTypeKindEnum,
  dataTypeKindEnum,
} from "./dataType";

// T-035/T-047/T-048: `cardinality`/`assignability` sono legati al `kind` da
// un'invariante unica. Questi test esercitano l'invariante a valori
// effettivi (`dataTypeShapeInvariantSchema`, riusata anche dalla route PATCH
// sui valori post-merge) per ciascun `kind`.
describe("dataTypeShapeInvariantSchema", () => {
  it("accepts generic with assignability: none, cardinality: null", () => {
    const result = dataTypeShapeInvariantSchema.safeParse({
      kind: "generic",
      assignability: "none",
      cardinality: null,
      mandatory: false,
    });
    expect(result.success).toBe(true);
  });

  // T-0xx: `mandatory` è configurabile solo per `origins`/`assignable` — mai
  // per `generic` (mai assegnabile) né `talent` (non scelto in creazione).
  it("rejects generic with mandatory: true", () => {
    const result = dataTypeShapeInvariantSchema.safeParse({
      kind: "generic",
      assignability: "none",
      cardinality: null,
      mandatory: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects talent with mandatory: true", () => {
    const result = dataTypeShapeInvariantSchema.safeParse({
      kind: "talent",
      assignability: "always",
      cardinality: "multi",
      mandatory: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts origins/assignable with mandatory: true", () => {
    const result1 = dataTypeShapeInvariantSchema.safeParse({
      kind: "origins",
      assignability: "creationOnly",
      cardinality: "single",
      mandatory: true,
    });
    const result2 = dataTypeShapeInvariantSchema.safeParse({
      kind: "assignable",
      assignability: "always",
      cardinality: "multi",
      mandatory: true,
    });
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
  });

  it("rejects generic with assignability: always", () => {
    const result = dataTypeShapeInvariantSchema.safeParse({
      kind: "generic",
      assignability: "always",
      cardinality: "single",
    });
    expect(result.success).toBe(false);
  });

  it("accepts origins with assignability: creationOnly, cardinality: single", () => {
    const result = dataTypeShapeInvariantSchema.safeParse({
      kind: "origins",
      assignability: "creationOnly",
      cardinality: "single",
      mandatory: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects origins with cardinality: multi (fissa a single)", () => {
    const result = dataTypeShapeInvariantSchema.safeParse({
      kind: "origins",
      assignability: "creationOnly",
      cardinality: "multi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects origins with assignability: none", () => {
    const result = dataTypeShapeInvariantSchema.safeParse({
      kind: "origins",
      assignability: "none",
      cardinality: "single",
    });
    expect(result.success).toBe(false);
  });

  it("accepts assignable/talent with assignability: always/creationOnly/masterOnly and a cardinality", () => {
    for (const kind of ["assignable", "talent"] as const) {
      for (const assignability of [
        "always",
        "creationOnly",
        "masterOnly",
      ] as const) {
        const result = dataTypeShapeInvariantSchema.safeParse({
          kind,
          assignability,
          cardinality: "multi",
          mandatory: false,
        });
        expect(result.success).toBe(true);
      }
    }
  });

  it("rejects assignable/talent with assignability: none", () => {
    for (const kind of ["assignable", "talent"] as const) {
      const result = dataTypeShapeInvariantSchema.safeParse({
        kind,
        assignability: "none",
        cardinality: "multi",
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects assignable/talent with cardinality: null", () => {
    for (const kind of ["assignable", "talent"] as const) {
      const result = dataTypeShapeInvariantSchema.safeParse({
        kind,
        assignability: "masterOnly",
        cardinality: null,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("createDataTypeSchema", () => {
  it("accepts a non-assignable DataType with no cardinality (e.g. Regolamenti)", () => {
    const result = createDataTypeSchema.safeParse({
      name: "Regolamenti",
      kind: "generic",
      assignability: "none",
      cardinality: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an origins DataType with a cardinality", () => {
    const result = createDataTypeSchema.safeParse({
      name: "Razze",
      kind: "origins",
      assignability: "creationOnly",
      cardinality: "single",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an assignable DataType with assignability", () => {
    const result = createDataTypeSchema.safeParse({
      name: "Fazioni",
      kind: "assignable",
      assignability: "creationOnly",
      cardinality: "single",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an assignable DataType with assignability: none", () => {
    const result = createDataTypeSchema.safeParse({
      name: "Fazioni",
      kind: "assignable",
      assignability: "none",
      cardinality: "single",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a body omitting kind/assignability/cardinality (applicative defaults: kind generic, assignability none, cardinality null)", () => {
    const result = createDataTypeSchema.safeParse({ name: "Generico" });
    expect(result.success).toBe(true);
  });

  it("rejects assignability: always without a cardinality", () => {
    const result = createDataTypeSchema.safeParse({
      name: "Razze",
      assignability: "always",
    });
    expect(result.success).toBe(false);
  });

  it("rejects assignability: none with an explicit cardinality", () => {
    const result = createDataTypeSchema.safeParse({
      name: "Regolamenti",
      assignability: "none",
      cardinality: "single",
    });
    expect(result.success).toBe(false);
  });

  // T-046: "Talenti" è un caso speciale, sempre presente esattamente una
  // volta per campagna — mai creabile da questa route/schema.
  it("rejects kind: 'talent' (not creatable via this schema)", () => {
    const result = createDataTypeSchema.safeParse({
      name: "Talenti",
      kind: "talent",
      assignability: "always",
      cardinality: "multi",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every kind except 'talent', each with its shape richiesta", () => {
    const bodyByKind: Record<string, Record<string, unknown>> = {
      generic: {},
      origins: { assignability: "creationOnly", cardinality: "single" },
      assignable: { assignability: "creationOnly", cardinality: "single" },
    };
    const otherKinds = dataTypeKindEnum.options.filter(k => k !== "talent");
    for (const kind of otherKinds) {
      const result = createDataTypeSchema.safeParse({
        name: "X",
        kind,
        ...bodyByKind[kind],
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("creatableDataTypeKindEnum", () => {
  it("excludes 'talent' from the enum options", () => {
    expect(creatableDataTypeKindEnum.options).not.toContain("talent");
    expect(creatableDataTypeKindEnum.options.length).toBe(
      dataTypeKindEnum.options.length - 1
    );
  });
});

describe("updateDataTypeSchema", () => {
  it("rejects an empty body", () => {
    const result = updateDataTypeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  // T-047/T-048: `kind` non è nel body di update (fissato alla creazione),
  // quindi `updateDataTypeSchema` non può validare da sola l'invariante
  // kind/assignability/cardinality — lo fa la route PATCH sui valori
  // effettivi post-merge con lo stato esistente
  // (`dataTypeShapeInvariantSchema`, testato sopra).
  it("accepts a body touching only uno dei due campi collegati (route validates the merge with the existing row)", () => {
    const onlyAssignability = updateDataTypeSchema.safeParse({
      assignability: "always",
    });
    const onlyCardinality = updateDataTypeSchema.safeParse({
      cardinality: "multi",
    });
    expect(onlyAssignability.success).toBe(true);
    expect(onlyCardinality.success).toBe(true);
  });

  // `kind` è modificabile in update (tranne "talent", bloccato a livello
  // applicativo dalla route, non da questo schema — vedi `route.test.ts`),
  // ma resta escluso da `creatableDataTypeKindEnum`: non è quindi un valore
  // accettabile qui, a prescindere dallo stato esistente della riga.
  it("accepts a valid creatable kind in the body, rejects 'talent'", () => {
    const validKind = updateDataTypeSchema.safeParse({ kind: "generic" });
    const talentKind = updateDataTypeSchema.safeParse({ kind: "talent" });
    expect(validKind.success).toBe(true);
    expect(talentKind.success).toBe(false);
  });

  it("accepts assignability/cardinality together, whatever their combination (validati solo dalla route)", () => {
    const result = updateDataTypeSchema.safeParse({
      assignability: "always",
      cardinality: null,
    });
    expect(result.success).toBe(true);
  });
});
