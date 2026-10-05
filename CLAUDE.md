# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project

Multi-tenant LARP campaign management platform ("Arcana Domine") — Organizations → Campaigns → (Events, Characters, Bookings, Data, Memberships, Messages). UI is Italian.

## Tech Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript** strict
- **Bun** (use `bun` / `bunx`, not `npm`/`npx`)
- **PostgreSQL** + **Prisma 6**
- **Better Auth** (email/password, Prisma adapter)
- **TanStack Query** v5 (client cache for dashboard)
- **Tailwind 3** + Radix (componenti base in `src/components/_core/`)
- **React Hook Form** + **Zod 4**
- **Vitest 4** + Testing Library + MSW + happy-dom/jsdom
- Node ≥ 24

## Commands

```bash
# dev
bun install
bun dev                  # next dev (Turbopack)
bun run build
bun start

# quality
bun run lint             # eslint .
bun run lint:fix
bun run format           # prettier --write
bun run format:check
bun run type-check       # tsc --noEmit

# tests
bun test                 # watch
bun run test:run         # once
bun run test:ui          # vitest UI
bun run test:coverage
bun run test:unit        # lib/, components/, schemas/
bun run test:api         # app/api/

# prisma
bunx prisma generate     # always run after schema changes / fresh checkout
bunx prisma migrate dev --name <name>
bunx prisma db push
bunx prisma db seed
bunx prisma format
bunx prisma validate
bunx prisma studio
```

## Environment

Copy `.template_env` → `.env`. Required vars: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. There is no `.env.example`.

## Project Layout

```
src/
├── app/                                # App Router
│   ├── (front)/                        # public site
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # org selector
│   │   │   ├── profile/payments/
│   │   │   └── org/[orgSlug]/
│   │   │       ├── page.tsx
│   │   │       ├── admin/(/users)
│   │   │       ├── events/[eventId]/
│   │   │       ├── memberships/
│   │   │       └── [campaignSlug]/
│   │   │           ├── page.tsx
│   │   │           ├── settings/
│   │   │           ├── characters/[id]/[actionType]/
│   │   │           ├── events/[eventId]/
│   │   │           └── [dataSlug]/
│   │   └── manage/
│   ├── login/
│   ├── api/
│   │   ├── auth/[...all]/              # Better Auth
│   │   ├── admin/
│   │   │   ├── users/
│   │   │   └── impersonate/{start,end,status,fake}/
│   │   ├── campaigns/  characters/  events/  memberships/
│   │   └── organizations/(/[orgId]/campaigns)
│   ├── __tests__/                      # multi-tenant isolation tests
│   ├── error.tsx  loading.tsx  not-found.tsx  layout.tsx
├── components/
│   ├── _core/                          # componenti base (Btn, Modal, Field*, …)
│   ├── characters/  events/  sidebar/  landing/
│   ├── front/  header/  impersonation/  profile/
│   └── logo.tsx
├── hooks/                              # use-mobile, use-toast
├── lib/
│   ├── auth.ts  auth-client.ts         # Better Auth (server/client)
│   ├── authorization.ts                # isSuperAdmin, role checks
│   ├── impersonation.ts                # admin impersonation context
│   ├── db.ts                           # Prisma client singleton
│   ├── repositories/                   # data access layer (see README there)
│   └── validations/                    # Zod schemas per entity
├── test/                               # setup.ts, mocks/, helpers/
prisma/
├── schema.prisma                       # single-file schema
├── migrations/                         # 3 migrations through 20251123140603_extended_model
└── seed.ts
prisma.config.ts                        # schema path + seed command (replaces package.json#prisma)
middleware.ts                           # session-cookie redirect
```

Path alias: `@/*` → `src/*` (`tsconfig.json`).

## Data Model (Prisma)

Single-file schema at `prisma/schema.prisma`. Key models:

- **Auth (Better Auth)**: `User`, `Session`, `Account`, `Verification`
- **Tenancy**: `Organization` (slug-routed) → `Campaign` (slug-routed) → everything else. `Grant` assigns `Role` (admin/helper) per user per scope. There is no `superadmin` role enum value — super-admin is a hardcoded email check (`mattia@arcana.it`) in `src/lib/authorization.ts` (`isSuperAdmin`).
- **Profile**: `PersonalData`, `Membership`
- **Campaign content**: `Event`, `SocialLink`, `EventPrice`, `Character` (`CharacterType`: PG/PNG), `DataType`, `Data` (with `DataVisibility` and `VisibilityCondition` referencing a server-side `functionName`)
- **Booking/payments**: `Booking`, `Payment`, `Coupon`
- **Messaging/actions**: `Message` (`MessageStatus`), `Action` (`ActionStatus`), `FeatureType` + `Feature` (campaign-specific function mappings: downtime, missive, etc.)

Note: the `Data` model is a single table (id, name, dataTypeId, visibility, character/user FKs, optional `visibilityConditionId`). The hybrid `DataEntry`/`CharacterDataValue` design referenced in older docs is **not** the current implementation.

## Authentication & Authorization

- Better Auth configured in `src/lib/auth.ts`; client SDK in `src/lib/auth-client.ts` (`signIn`, `signUp`, `signOut`, `getSession`).
- Auth catch-all: `src/app/api/auth/[...all]/route.ts`.
- `middleware.ts` redirects to `/login?redirectTo=<url>` if `better-auth.session_token` cookie is missing. **No matcher is configured**, so it currently runs for every path; routes that should be public must allow it explicitly or you must add a matcher.
- Authorization helpers live in `src/lib/authorization.ts` (`isSuperAdmin(email)` + role/grant checks).

### Impersonation (super-admin only)

- Endpoints under `src/app/api/admin/impersonate/`: `start`, `end`, `status`, `fake` (debug).
- `start` swaps the active session: original admin token is preserved in cookie `better-auth.admin_session_token`; `better-auth.session_token` is replaced with the target user's session token.
- `getSessionContext(headers)` in `src/lib/impersonation.ts` reads both cookies and returns `{ activeUser, adminUser, isImpersonating }`. Always go through this when a route needs to know whether impersonation is active.
- The amber `ImpersonationToolbar` in `(dashboard)/layout.tsx` polls `/api/admin/impersonate/status`.

## Patterns / Conventions

- **Repositories first** — `src/lib/repositories/*` accept `PrismaClient` as the first arg (good for tests). Don't call `prisma.*` directly from route handlers/components when a repository function exists. See `src/lib/repositories/README.md`.
- **Validation at the edge** — every API route uses a Zod schema from `src/lib/validations/`.
- **Server Components by default** — `"use client"` only for interactivity; auth/data fetching stays on the server.
- **TanStack Query** — `(dashboard)/layout.tsx` provides the `QueryClientProvider`. Use it for client-driven dashboard fetches.
- **Tenant scoping** — every campaign-scoped query must filter by `campaignId` (or via slug → campaign lookup). Multi-tenant isolation is covered by tests in `src/app/__tests__/multi-tenant-isolation.test.ts`.
- **Visibility evaluation must run server-side.** `Data.visibilityConditionId` resolves to a function name; never expose hidden entries to the client and filter there.
- **Italian copy** in user-facing UI (`Qualcosa è andato storto`, `Esci`, etc.). Match existing tone when adding strings.

## Testing

- Config: `vitest.config.ts` (paths via `vite-tsconfig-paths`); setup: `src/test/setup.ts`; mocks: `src/test/mocks/{prisma,auth,msw-handlers}.ts`; helpers: `src/test/helpers/`.
- Co-located `*.test.ts(x)` next to source; route tests live in `src/app/api/<resource>/__tests__/`.
- See `TESTING.md` (root) for the testing strategy and current coverage map.

## Gotchas

- `next.config.ts` is currently empty — `typedRoutes` is **not** enabled; `as any` casts on `router.push` are intentional until it's turned on.
- Path aliases changed when the repo moved to `src/`. Old imports from `@/components/...` resolving to root `components/` are gone — `@/*` now points at `src/*`.
- `.vscode/` is gitignored. Local editor settings are not shared.
- `prisma generate` must be re-run after every schema change before TypeScript types update.
- When adding a route handler, prefer the existing repository functions; if you need a new query, add it to the appropriate repository (with a test) instead of calling Prisma in the handler.
