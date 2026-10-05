# Repository Layer

This directory contains repository functions for database operations using Prisma.

## Architecture

### Three-Tier Multi-Tenancy

- **Platform** → **Organizations** → **Campaigns**
- Organizations contain multiple campaigns
- Users can have different roles (admin/helper) per campaign via Grants

## Available Repositories

### Organization Repository

Manages LARP organizations (top-level tenants).

**Functions:**

- `getOrganizationById(prisma, id, includeCampaigns?)` - Get by ID
- `getOrganizationBySlug(prisma, slug, includeCampaigns?)` - Get by slug (for routing)
- `listOrganizations(prisma, options?)` - Paginated list with search/filters
- `getUserOrganizations(prisma, userId)` - Get user's organizations via grants
- `createOrganization(prisma, data)` - Create new organization
- `updateOrganization(prisma, id, data)` - Update organization
- `deleteOrganization(prisma, id)` - Delete organization (cascades to campaigns)

### Campaign Repository

Manages campaigns within organizations.

**Functions:**

- `getCampaignById(prisma, id, orgId?)` - Get by ID with org filtering
- `getCampaignBySlug(prisma, slug, orgSlug?)` - Get by slug (for routing)
- `listCampaigns(prisma, options)` - Paginated list with filters
- `getUserCampaigns(prisma, userId, orgId?)` - Get user's campaigns via grants
- `getCampaignWithDetails(prisma, id)` - Get campaign with all relations
- `createCampaign(prisma, data)` - Create new campaign
- `updateCampaign(prisma, id, data)` - Update campaign
- `deleteCampaign(prisma, id)` - Delete campaign (cascades to data/events)

Presentazione campagna (T-045 — logo, copertina, galleria; la descrizione
riusa `updateCampaign` sopra):

- `updateCampaignLogo(prisma, campaignId, { logo, logoKey })` - Set/clear the
  logo (dedicated `logoKey` column, `ReferenceData.fileKey` pattern)
- `updateCampaignCover(prisma, campaignId, { coverImage, coverImageKey })` -
  Set/clear the cover image
- `listCampaignImages(prisma, campaignId)` - Gallery images, ascending
  `order`
- `countCampaignImages(prisma, campaignId)` - Gallery size (used to enforce
  the 5-image cap in `authorizeCampaignGalleryUpload`, not at the DB level)
- `addCampaignImage(prisma, campaignId, { url, key, order })` - Append a
  gallery image
- `getCampaignImageById(prisma, id, campaignId?)` - Scoped lookup
  (multi-tenant: an id valid for another campaign resolves to `null`)
- `removeCampaignImage(prisma, id)` - Delete a gallery image row

### DataType Repository

Manages data type categories within campaigns.

**Functions:**

- `getDataTypeById(prisma, id, includeReferenceData?)` - Get by ID (optionally with its catalog entries)
- `listDataTypes(prisma, campaignId, includeCount?)` - List all types for campaign
- `getDataTypeByName(prisma, campaignId, name)` - Lookup by name
- `createDataType(prisma, data)` - Create new data type
- `updateDataType(prisma, id, data)` - Update data type
- `deleteDataType(prisma, id)` - Delete data type

### ReferenceData / CharacterData repositories

The flat `Data` model has been retired (T-015, `metamodel_dati_campagna`
migration) in favour of a definition/instance split:

- **`ReferenceData`** — campaign-scoped catalog entries (definitions) under a
  `DataType`, with a `flags` JSON payload validated per-`kind`.
- **`CharacterData`** — assignments of a `ReferenceData` to a PG or a user
  (polymorphic owner, `FK referenceDataId`), with master override support.

**`referenceData.repository.ts`** / **`dataRequirement.repository.ts`**
(T-016) — catalog CRUD and the `requires`/`blocks` prerequisite graph between
definitions. `listOutgoingRequirements` resolves `requiredDefinition` (used by
the assignment service below to know _which_ definitions are missing, not
just their id).

**`characterData.repository.ts`** (T-017, first arg `PrismaClient |
Prisma.TransactionClient` — same composability contract as
`xpTransaction.repository.ts`, so it can run inside the assignment service's
`prisma.$transaction`):

- `listCharacterDataForCharacter(prisma, characterId)` - every assignment a
  PG owns
- `countCharacterDataByCharacterAndReferenceData(prisma, characterId,
referenceDataId)` - how many instances of one definition this character
  already owns (the `repeatable = false` / `maxRepetitions` guard)
- `createCharacterData(prisma, data)` - insert an assignment
- `deleteCharacterDataByDataType(prisma, characterId, dataTypeId)` - wipe a
  PG's assignments for a `DataType` (the `cardinality = single` replace)
- `listOwnedCharacterDataInCampaign(prisma, campaignId, owner)` (T-020) - a
  single targeted read, not part of the assignment service above: every
  `CharacterData` a viewer owns in a campaign (by `userId` and/or
  `characterId`), shaped for `filterVisible`/`isEntryVisible` (T-026) to
  evaluate conditional visibility for the campaign sidebar/catalog sections
- `listCharacterDataForCharacterWithDetails(prisma, characterId)` (T-034) -
  every assignment of one specific PG, with `dataType`/`referenceData`
  included (grouping + display); the character sheet, which consumes this.
  **Owner-scoping is the
  caller's responsibility**: `CharacterData.visibility = visible` means
  "visible to the owner", not "visible to anyone in the campaign" (unlike
  `ReferenceData`) — call this only after confirming the viewer is the PG's
  owner or campaign staff, never for an arbitrary viewer

**`src/lib/services/characterData.service.ts`** (T-017, business rules on top
of the catalog + `CharacterData` + XP ledger repositories):

- `evaluateRequirements(prisma, character, definition)` - soft-evaluates a
  definition's `DataRequirement` graph (`requires`/`blocks` against the PG's
  owned `CharacterData`) and its `flags.cost` XP threshold (via
  `xp.service.getXpBalance`); never throws, always returns a full
  `RequirementEvaluation`
- `assignReferenceDataToCharacter(prisma, character, definition, options?)` -
  gates self-assign on `playerAssignable` + `creationOnly` (only in creation)
  - `evaluateRequirements().satisfied`; a master (`options.isMaster` +
    `grantedById`) always succeeds, marking `grantedByOverride` when the
    requirements weren't actually met. Applies the `DataType`'s cardinality
    (`single` replaces the PG's existing assignment for that `DataType`,
    `multi` accumulates unless `flags.repeatable === false`), then persists the
    `CharacterData` and, if `flags.cost` is set, the `debitTalent` XP charge in
    the same `prisma.$transaction` (rollback if either write fails). Rejects
    cross-campaign assignment (`definition.dataType.campaignId !==
character.campaignId`) before anything else.

### XpTransaction repository / XP service (T-025)

`XpTransaction` is the append-only ledger for a PG's XP (T-015); the balance
is always a **projection**, never a stored field.

**`xpTransaction.repository.ts`** (thin data access, first arg
`PrismaClient | Prisma.TransactionClient` for composability inside
`prisma.$transaction`):

- `createXpTransaction(prisma, data)` - insert a ledger row
- `findInitialGrant(prisma, characterId)` - existing `initialGrant` row, if any
- `getSettledXpSum(prisma, characterId)` - sum of transactions not tied to a
  pending `Action` (`actionId` null or `action.status = done`)
- `getPendingXpReserved(prisma, characterId)` - reserved budget: sum of
  negative amounts tied to an `Action` with `status = waitingApproval`
- `listXpTransactionsForCharacter(prisma, characterId)` - full ledger, newest first

**`src/lib/services/xp.service.ts`** (business rules on top of the repository):

- `getXpBalance(prisma, characterId)` -> `{ balance, pending, available }`
- `grantInitialXp(prisma, character, race)` - idempotent per PG
- `debitTalent(prisma, character, referenceData, options?)` - rejects with
  `InsufficientXpError` when `available < cost`, unless `options.allowOverride`
- `recordDeathRecovery(prisma, sourceCharacter, targetCharacter, amount)` -
  primitive only; the recovery quota is computed by the campaign feature
  handler (T-019), not here
- `refund(prisma, character, amount, options?)` - compensating credit

See `src/lib/services/xp.service.ts` for full signatures and JSDoc-style comments.

### PersonalData Repository

Manages the anagraphic data (`PersonalData`) linked 1:1 to a `User`.

**Functions:**

- `getPersonalDataByUserId(prisma, userId)` - Get by user id
- `upsertPersonalData(prisma, userId, data)` - Create or update (all fields required, table has no nullable columns)

### Grant Repository

Manages campaign role assignments (staff: head_master/master/supporter).

**Functions:**

- `createGrant(prisma, data)` - Assign a user to a campaign with a role
- `updateGrantRole(prisma, userId, campaignId, role)` - Change a user's role in a campaign
- `revokeGrant(prisma, userId, campaignId)` - Remove a user's campaign assignment
- `listGrantsForCampaign(prisma, campaignId)` - List all staff assignments for a campaign

### Support Repository (`support.repository.ts`)

Ticket di assistenza utente → team di sviluppo ("Supporto", T-0xx): non
campaign-scoped, non esportato dal barrel `index.ts` — stessa scelta già
fatta per `downtime.repository.ts`/`missive.repository.ts`/
`notification.repository.ts` (importare direttamente da
`@/lib/repositories/support.repository` evita i cicli descritti nei
commenti di `notification.repository.ts`, che questo repository importa per
il fan-out).

**Functions:**

- `createSupportTicket(prisma, { userId, subject, body })` - crea ticket +
  primo messaggio in una transazione, notifica (`support_new`) tutto lo
  staff (`isSviluppo` effettivo: flag DB OR email cablate)
- `listSupportTicketsForUser(prisma, userId)` - i ticket dell'utente,
  `updatedAt` desc, con conteggio messaggi e anteprima testuale dell'ultimo
- `listAllSupportTickets(prisma)` - tutti i ticket (vista staff), stessa forma
- `getSupportTicketById(prisma, ticketId)` - lookup grezzo (solo
  esistenza/stato), usato dalle route status/delete
- `getSupportTicketWithMessages(prisma, ticketId)` - dettaglio + thread
  messaggi, `isStaffAuthor` per messaggio risolto live
- `addSupportMessage(prisma, { ticketId, authorId, body, isStaffAuthor })` -
  aggiunge un messaggio, riapre un ticket risolto/chiuso, avanza
  "in_attesa" → "in_lavorazione" alla prima risposta staff, notifica
  (`support_reply`) l'altra parte
- `updateSupportTicketStatus(prisma, ticketId, status)` - solo cambio stato
- `deleteSupportTicket(prisma, ticketId)` - cancellazione definitiva (i
  messaggi cascadano via `onDelete: Cascade`)

L'autorizzazione (proprietario del ticket OPPURE staff) è sempre
responsabilità della route, mai di queste funzioni — stesso principio di
`getCharacterEditorData`.

### User Repository

Manages user records outside the auth flow, including the two flat admin groups ("direttivo" and "sviluppo", `User.isDirettivo`/`isSviluppo`).

**Functions:**

- `listAllUsersBasic(prisma)` - List all registered users (id/name/email), e.g. for staff-assignment pickers
- `getUserEmailById(prisma, userId)` - Resolve a user's email by id
- `listDirettivoMembers(prisma)` - List users with `isDirettivo: true`
- `setUserDirettivo(prisma, userId, isDirettivo)` - Set a user's `isDirettivo` flag
- `listSviluppoMembers(prisma)` - List users with `isSviluppo: true` (DB flag only; OR with the hardcoded sviluppo emails happens in `authorization.ts`)
- `setUserSviluppo(prisma, userId, isSviluppo)` - Set a user's `isSviluppo` flag
- `listUsersForAdmin(prisma, options?)` - Paginated user list with `PersonalData`/`Membership` joined, for the admin users screen; supports `search` (name/email) and `year` (membership) filters, and returns `availableYears` for the year-filter dropdown

## Usage Examples

### Basic Usage

```typescript
import { prisma } from "@/lib/db";
import { getOrganizationBySlug, getCampaignBySlug } from "@/lib/repositories";

// Get organization and campaign for routing
const org = await getOrganizationBySlug(prisma, "arcana-domine");
const campaign = await getCampaignBySlug(prisma, "campaign1", "arcana-domine");
```

### Pagination

```typescript
import { prisma } from "@/lib/db";
import { listCampaigns } from "@/lib/repositories";

const result = await listCampaigns(prisma, {
  page: 1,
  pageSize: 20,
  organizationId: org.id,
  search: "winter",
  orderBy: "name",
  orderDirection: "asc",
});

console.log(result.data); // Campaign[]
console.log(result.pagination); // { page, pageSize, total, totalPages }
```

### Visibility-Aware Queries

```typescript
import { prisma } from "@/lib/db";
import { getVisibleDataForUser } from "@/lib/repositories";

// Only returns data visible to the user based on visibility rules
const data = await getVisibleDataForUser(prisma, dataTypeId, userId);
```

### Server Actions Example

```typescript
"use server";

import { prisma } from "@/lib/db";
import { createCampaign } from "@/lib/repositories";

export async function createCampaignAction(
  orgId: number,
  name: string,
  slug: string
) {
  const campaign = await createCampaign(prisma, {
    name,
    slug,
    organizationId: orgId,
  });

  return campaign;
}
```

## Design Principles

1. **Functional Pattern**: Functions instead of classes for simplicity
2. **Dependency Injection**: Prisma client passed as parameter (testable)
3. **Type-Safe**: Full TypeScript support with Prisma-generated types
4. **Read-Heavy Focus**: Comprehensive filtering and pagination
5. **Multi-Tenant Ready**: Organization/campaign context in all queries
6. **Visibility-Aware**: Data repository respects visibility rules

## Testing

Repository functions are designed to be easily testable:

```typescript
import { mockDeep } from "jest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { getOrganizationBySlug } from "./organization.repository";

const prismaMock = mockDeep<PrismaClient>();

test("getOrganizationBySlug", async () => {
  const org = { id: 1, slug: "test", name: "Test Org" };
  prismaMock.organization.findUnique.mockResolvedValue(org);

  const result = await getOrganizationBySlug(prismaMock, "test");
  expect(result).toEqual(org);
});
```

## Notes

- All delete operations cascade appropriately (defined in Prisma schema)
- Campaign slug is unique within an organization
- Organization slug is globally unique
- Data visibility defaults to "hidden" (admin-only)
