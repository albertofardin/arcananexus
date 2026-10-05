# Testing

Vitest-based unit / integration test suite. Playwright is **not** wired up yet — there are no E2E tests in this repo.

## Stack

- **Vitest 4** — runner, in-process, jsdom environment
- **Testing Library** (React + DOM + user-event) — component-level assertions
- **happy-dom / jsdom** — DOM environments
- **MSW 2** — HTTP request mocking for component-level tests
- **vitest-mock-extended** — typed Prisma client mocks

Config: [`vitest.config.ts`](vitest.config.ts). Global setup: [`src/test/setup.ts`](src/test/setup.ts). The `@/` alias resolves to `src/`.

## Run

```bash
bun test                 # watch
bun run test:run         # one-shot (CI)
bun run test:ui          # vitest UI
bun run test:coverage    # v8 coverage → text + html + lcov
bun run test:unit        # filters: lib/ components/ schemas/
bun run test:api         # filter:  app/api/
```

> The `test:unit` / `test:api` scripts use positional path filters that vitest matches as substrings against test file paths — they work despite missing the `src/` prefix.

## Layout

```
src/test/
├── setup.ts                 # global setup (jest-dom, MSW server, etc.)
├── mocks/
│   ├── prisma.ts            # typed Prisma mock via vitest-mock-extended
│   ├── auth.ts              # Better Auth mocks
│   └── msw-handlers.ts      # default MSW handlers
└── helpers/
    ├── prisma-fixtures.ts   # mockUser, mockOrganization, mockCampaign,
    │                        # mockCharacter, mockData, mockDataType,
    │                        # mockEvent, mockGrant, mockBooking, …
    └── test-utils.tsx       # custom render() with providers (TanStack Query, etc.)
```

Test files are co-located with the code they cover:

- Unit: `src/lib/**/*.test.ts(x)`, `src/lib/repositories/*.test.ts`, `src/lib/validations/*.test.ts`
- Components: `src/components/**/*.test.tsx`
- Routes: `src/app/api/<resource>/__tests__/route.test.ts`
- App-level: `src/app/{error,loading,not-found}.test.tsx`, `src/app/__tests__/multi-tenant-isolation.test.ts`

## Current Coverage

Run `bun run test:coverage` for an up-to-date report. As of the last run: 24 test files, ~407 tests.

Areas exercised:

- **`src/lib/`** — `auth`, `authorization`, `utils`
- **`src/lib/repositories/`** — `organization`, `campaign`, `dataType` (the `data` repository is **not** covered)
- **`src/lib/validations/`** — `event`, `membership`
- **`src/app/api/`** — `campaigns`, `events`, `memberships` route handlers
- **`src/app/`** — `error`, `loading`, `not-found` pages, multi-tenant isolation suite
- **`src/components/events/`** — list, filter toolbar, pagination, detail header/sidebar/content
- **`src/components/ui/markdown.tsx`**

Areas with no tests yet:

- `src/lib/repositories/data.repository.ts` (visibility logic)
- API routes other than the three above (organizations, characters, admin/_, impersonate/_)
- Most `src/components/` (sidebar, characters, landing, impersonation, profile, front)
- Most `src/lib/validations/` (campaign, character, organization, impersonation)
- Page components in `src/app/(dashboard)/...`

`vitest.config.ts` excludes `src/components/ui/**` (shadcn primitives) from coverage.

## Conventions

### Mocking the database

Repositories accept a `PrismaClient` as the first arg, so tests pass the typed mock from `src/test/mocks/prisma.ts`:

```ts
import { prismaMock } from "@/test/mocks/prisma";
import { getOrganizationBySlug } from "@/lib/repositories";

test("returns organization for slug", async () => {
  prismaMock.organization.findUnique.mockResolvedValueOnce(mockOrganization);
  const org = await getOrganizationBySlug(prismaMock, "arcana-domine");
  expect(org?.slug).toBe("arcana-domine");
});
```

Don't mock Prisma module-globally — pass the client in.

### Testing API route handlers

Construct a `NextRequest` directly and call the handler:

```ts
import { NextRequest } from "next/server";
import { GET } from "@/app/api/campaigns/route";

const res = await GET(new NextRequest("http://localhost/api/campaigns"));
expect(res.status).toBe(200);
```

For routes that read the session, mock `auth.api.getSession` via `src/test/mocks/auth.ts`. For routes that hit Prisma, mock `@/lib/db` to return `prismaMock`.

### Component tests

Use `render` from `src/test/helpers/test-utils.tsx` instead of Testing Library's default — it wraps children in the providers used in production (e.g. `QueryClientProvider`).

```tsx
import { render, screen } from "@/test/helpers/test-utils";
import { EventsList } from "@/components/events/events-list";

render(<EventsList events={[mockEvent]} />);
expect(screen.getByText(mockEvent.name)).toBeInTheDocument();
```

For components that fetch from the network, install handlers from `src/test/mocks/msw-handlers.ts` rather than mocking `fetch`.

### Multi-tenant isolation

`src/app/__tests__/multi-tenant-isolation.test.ts` is the canonical place for cross-tenant access tests. Add cases here when introducing a new scoped resource — every campaign-scoped query must reject a request whose context belongs to a different campaign / organization.

## Server Components

Vitest can't render React Server Components directly. For server-only code, factor business logic into plain functions and test those; render only the client components a server page composes.

## Known Issues

- One failing component test in `src/app/error.test.tsx` (text matcher mismatch). Not fixed yet.
- No CI workflow committed (`.github/workflows/` is absent). Local runs only for now.
- No Playwright / E2E layer.
