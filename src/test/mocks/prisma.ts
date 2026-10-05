import { PrismaClient } from "@prisma/client";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";

// Deep-mocked Prisma client: every model/method is a properly typed vitest
// mock (`.mockResolvedValue`, `.mockImplementation`, etc. are inferred from
// the real Prisma method signatures), so repository tests don't need `as any`
// casts to configure return values.
// Runtime behaviour is unchanged from the previous manual `vi.fn()` mocks.

// Prisma's generated `groupBy` argument types (`having`) build a
// self-referential conditional type (`GetHavingFields`) that TypeScript
// cannot resolve while this project runs with `strictNullChecks: false`
// (see https://github.com/prisma/prisma/issues/10203). No test in this repo
// exercises `groupBy`, so we present a `groupBy`-free view of each model
// delegate when *configuring* mocks (`prismaMock`), which sidesteps the
// circular type without touching runtime behaviour: the underlying mock
// still has a `groupBy` vi.fn(), we just don't type it.
type OmitGroupBy<T> = {
  [K in keyof T]: T[K] extends { groupBy: unknown }
    ? Omit<T[K], "groupBy">
    : T[K];
};

const deepMock = mockDeep<PrismaClient>();

export const prismaMock: DeepMockProxy<OmitGroupBy<PrismaClient>> =
  deepMock as unknown as DeepMockProxy<OmitGroupBy<PrismaClient>>;

// Same underlying mock, typed as a real `PrismaClient`. Repository/route
// functions take `prisma: PrismaClient` as their first argument; pass
// `prismaClient` (not `prismaMock`) at those call sites. Use `prismaMock`
// above to configure return values and assert calls.
export const prismaClient: PrismaClient = deepMock as unknown as PrismaClient;

export type MockPrismaClient = typeof prismaMock;
