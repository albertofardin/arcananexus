<p align="center">
  <img width="450" src="./public/email/logo.png" alt="Arcana Domine">
</p>

# Arcana Domine — LARP Platform

- **Live Demo:** [arcanadomine.netlify.app/dashboard](https://arcanadomine.netlify.app/dashboard)

A multi-tenant Next.js platform for managing LARP organizations, their campaigns, events, characters, bookings, and players. Originally built for Arcana Domine; the schema and routing are generic and can host any LARP community.

The user-facing UI is in **Italian**.

## Project Overview

The platform serves four distinct experiences from a single codebase:

1. **Public site** — landing page, organization/campaign discovery
2. **Player dashboard** — characters, bookings, memberships, in-character messaging
3. **Org / campaign admin** — manage events, pricing, members, characters
4. **Super-admin tools** — cross-organization operations and user impersonation

### Multi-tenancy

```
Platform
└── Organizations         (e.g. "Arcana Domine")
    └── Campaigns         (e.g. "Medieval Chronicles")
        └── Events, Characters, Data, Bookings, …
```

- Users are global (single sign-in across all tenants).
- Routes are slug-based: `/dashboard/org/{orgSlug}/[{campaignSlug}/...]`.
- Roles are granted per scope via the `Grant` model: `admin` or `helper`, attached to a campaign (or an org-wide grant). Super-admin is a hardcoded email check, not a DB role.

## Tech Stack

| Area            | Choice                             |
| --------------- | ---------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack) |
| Language        | TypeScript (strict)                |
| Runtime         | Node ≥ 24                          |
| Package manager | **Bun** (do not use npm/pnpm)      |
| Database        | PostgreSQL + Prisma 6              |
| Auth            | Better Auth (email/password)       |
| UI              | React 19, Tailwind 3, Radix        |
| Forms           | React Hook Form + Zod 4            |
| Data fetching   | TanStack Query v5                  |
| Tests           | Vitest 4, Testing Library, MSW     |

## Setup

### Prerequisites

- **Node.js ≥ 24** (use the version pinned in `.nvmrc`)
- **Bun** — install via `curl -fsSL https://bun.sh/install | bash`
- **PostgreSQL** — any 15+ instance. [Neon](https://neon.tech) free tier works well.

### Install

```bash
bun install

# Configure environment
cp .template_env .env
# then fill in:
#   DATABASE_URL=postgres://…       (pooled connection)
#   DIRECT_URL=postgres://…         (direct connection, for migrations)
#   BETTER_AUTH_SECRET=…            (any long random string, at least 32 characters)
#   BETTER_AUTH_URL=http://localhost:3000

# Database
bunx prisma generate
bunx prisma migrate dev
bunx prisma db seed

# Run
bun dev
```

The dev server starts on `http://localhost:3000`. The seed creates an initial admin user and a sample organization + campaign — see `prisma/seed.ts` for credentials.

## Common Commands

```bash
# Development
bun dev                  # next dev (Turbopack)
bun run build
bun start

# Code quality
bun run lint             # eslint .
bun run lint:fix
bun run format           # prettier --write
bun run format:check
bun run type-check       # tsc --noEmit

# Tests (see TESTING.md for details)
bun test                 # watch
bun run test:run         # CI / one-shot
bun run test:ui          # vitest UI
bun run test:coverage

# Database
bunx prisma generate
bunx prisma migrate dev --name <name>
bunx prisma db push
bunx prisma db seed
bunx prisma studio       # data browser
```

## Project Structure

```
src/
├── app/                   # Next.js App Router
│   ├── (front)/           # public site
│   ├── (dashboard)/       # auth-protected dashboard
│   │   └── dashboard/
│   │       ├── org/[orgSlug]/[campaignSlug]/...
│   │       └── profile/, manage/, …
│   ├── login/
│   └── api/               # auth, campaigns, events, characters,
│                          # memberships, organizations, admin/*
├── components/            # ui/, characters/, events/, sidebar/,
│                          # landing/, front/, header/, impersonation/
├── hooks/
├── lib/
│   ├── auth.ts, auth-client.ts
│   ├── authorization.ts   # role/permission helpers
│   ├── impersonation.ts   # super-admin impersonation
│   ├── repositories/      # data access layer (typed, testable)
│   └── validations/       # Zod schemas
└── test/                  # vitest setup, mocks, helpers
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
middleware.ts              # session-cookie auth guard
```

`@/` resolves to `src/`.

## Storybook

The project uses Storybook as a component development environment and design system playground.

Storybook is useful because it allows you to:

- Develop UI components in isolation without running the entire application
- Preview states, variants, and edge cases of components
- Document the design system and reusable UI patterns
- Speed up collaboration between developers and designers
- Test components visually during development
- Create a shared UI reference for the entire platform

Start Storybook to `http://localhost:6006` using:

```bash
npm run storybook
o
bun run storybook
```

## Database Schema (high level)

See `prisma/schema.prisma` for the full source of truth. Major areas:

- **Auth (Better Auth)**: `User`, `Session`, `Account`, `Verification`
- **Tenancy**: `Organization`, `Campaign`, `Grant` (role per scope)
- **Profile**: `PersonalData`, `Membership`
- **Campaign content**: `Event`, `EventPrice`, `SocialLink`, `Character`, `DataType`, `Data`, `VisibilityCondition`
- **Bookings & payments**: `Booking`, `Payment`, `Coupon`
- **Messaging & actions**: `Message`, `Action`, `FeatureType`, `Feature`

### Custom campaign data

Each campaign defines its own `DataType` categories (Religions, Cities, Feats, …) and populates them with `Data` rows. Entries can be `visible` or `hidden`, and hidden entries can carry a `VisibilityCondition` whose `functionName` is resolved server-side.

> **Security:** visibility filtering must always run on the server. Never ship hidden entries to the client and filter there — they would be inspectable in the network tab.

## Authentication & Authorization

- **Better Auth** with the Prisma adapter; session is stored in a cookie (`better-auth.session_token`).
- `middleware.ts` redirects unauthenticated requests to `/login?redirectTo=…`.
- Permissions are checked via `Grant` rows + helpers in `src/lib/authorization.ts` (e.g. `isSuperAdmin(email)`).

### Impersonation

A super-admin can impersonate any user from the sidebar profile menu. The original admin session is parked in a second cookie (`better-auth.admin_session_token`) while the active session becomes the target user's. An amber toolbar in the dashboard layout shows the impersonation state and lets the admin exit. Endpoints live under `src/app/api/admin/impersonate/`.

## Repositories

Database access goes through small typed functions in `src/lib/repositories/` (organization, campaign, dataType, data). They accept a `PrismaClient` as the first argument so tests can pass a mocked client. See `src/lib/repositories/README.md` for the full inventory.

## Testing

- Vitest config: `vitest.config.ts`; setup in `src/test/setup.ts`.
- Mocks: `src/test/mocks/{prisma,auth,msw-handlers}.ts`.
- Tests are co-located with the code they cover; route tests live in `src/app/api/<resource>/__tests__/`.
- Multi-tenant isolation is exercised in `src/app/__tests__/multi-tenant-isolation.test.ts`.

`TESTING.md` has the strategy, current coverage, and per-area progress.

## Release

Netlify only builds production from `main` when `HEAD` is tagged with a semver tag (`scripts/should-deploy.sh` gates the build; branch deploys and labeled preview PRs run regardless).

To ship what's on `main`:

```bash
git checkout main && git pull
npm version patch   # or: minor / major — bumps package.json and creates a vX.Y.Z commit + tag
git push --follow-tags
```

The pushed tag triggers the Netlify production build.

## Contributing

When you touch code:

1. **Filter by tenant.** Any campaign-scoped query needs `campaignId` (or a slug → campaign lookup).
2. **Validate at the edge.** Every API route uses a Zod schema in `src/lib/validations/`.
3. **Use repositories.** Add new queries to `src/lib/repositories/` (with tests) instead of calling Prisma from a route or component.

This is a test for `staging` branch. 5. **Server Components by default.** Add `"use client"` only when the component actually needs hooks, events, or browser APIs. 6. **Match the UI language.** Italian for user-visible strings.

## License

Proprietary — all rights reserved.
