---
id: "005"
title: "CRUD Campagne (campagna / one-shot)"
status: done
priority: P1
assignee: reviewer
branch: task/005-crud-campagne-oneshot
trello: ""
created: 2026-07-07
updated: 2026-07-07
---

## Obiettivo

Esporre le API di scrittura per le campagne (create/update/delete), oggi mancanti: il
repository Campaign ha già il CRUD ma nessuna route lo espone. Includere la
distinzione campagna normale vs one-shot (evento unico) introdotta in T-1.

## Scope

Incluso:

- Route `POST/PUT/DELETE` per le campagne, protette dal controllo di ruolo adeguato
  (admin/`head_master` di scope o super-admin per la creazione).
- Gestione del campo tipo one-shot dal T-1.
- Validazione Zod; gestione errore 409 su slug duplicato (unique
  `[organizationId, slug]` già a schema).
- Test repository (se serve estenderlo) + test API.

Escluso:

- CRUD di Organization (fuori Fase 1 salvo diversa indicazione).

## Criteri di accettazione

- [x] Create/update/delete campagna via API, con tipo campagna/one-shot.
- [x] Solo il ruolo idoneo può creare/modificare/eliminare; test.
- [x] Slug duplicato → 409 chiaro; test multi-tenant sull'isolamento slug.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Note / Log

- 2026-07-07 (owner): dipende da T-1 (tipo one-shot) e si appoggia al controllo ruolo
  di T-3. Card Trello di origine: "CRUD progetti (campagna / one-shot)".
- 2026-07-07 (dev): inizio implementazione. Setup ok (bun install, prisma generate).
- 2026-07-07 (dev): implementazione completata, passa a in-review.
  - Route aggiunte: `POST /api/campaigns` (create) e
    `PUT`/`DELETE /api/campaigns/[campaignId]` (nuovo file).
  - Ruoli: dato che alla creazione non esiste ancora un Grant sulla campagna,
    "admin/head_master di scope" per il create è stato interpretato come
    "head_master di una qualunque campagna della stessa organizzazione"
    (nuovo helper `isOrganizationHeadMaster` in `src/lib/authorization.ts`),
    oppure super-admin (`isSuperAdmin`). Per update/delete invece si richiede
    l'head_master della campagna specifica (`isUserCampaignAdmin`) o
    super-admin. Decisione da confermare in review: se preferite restringere
    il create al solo super-admin, `isOrganizationHeadMaster` va rimosso e la
    route semplificata.
  - Campo `type` (T-1) gestito in input/output di create e update
    (`campaignTypeEnum` in `src/lib/validations/campaign.ts`, propagato nel
    repository `createCampaign`/`updateCampaign`).
  - Validazione Zod al bordo: `createCampaignSchema` (name, slug con regex
    kebab-case, description, type, orgSlug opzionale) e
    `updateCampaignSchema` (stessi campi, tutti opzionali, con `.refine` che
    rifiuta un body vuoto).
  - 409 su slug duplicato: catturato l'errore Prisma `P2002` (unique
    `[organizationId, slug]`) sia in create sia in update.
  - Test aggiunti: `src/lib/authorization.test.ts` (isOrganizationHeadMaster,
    incl. isolamento cross-org), `src/lib/repositories/campaign.repository.test.ts`
    (persistenza del campo `type`), `src/app/api/campaigns/__tests__/route.test.ts`
    (POST: 401/400/404/403/201/409, cross-tenant sul controllo head_master),
    nuovo `src/app/api/campaigns/[campaignId]/__tests__/route.test.ts` (PUT/DELETE:
    401/400/404/403/200/204/409, cross-tenant su head_master di un'altra
    campagna, 405/OPTIONS).
  - Gate: `bun run type-check` 0 errori, `bun run lint` 0/0,
    `bun run test:run` verde (377/377 test, 26 file).
  - Punti aperti per la review: (1) interpretazione del ruolo "di scope" per
    il create come sopra; (2) `GET /api/campaigns/[campaignId]` non è stato
    aggiunto (fuori scope esplicito del task, solo POST/PUT/DELETE erano
    richiesti); (3) `CampaignsManager`/`useQueryCampaigns` restano su mock,
    il collegamento del frontend non era in scope di T-5.
  - Verifica: `cd core-task-005 && bun run type-check && bun run lint && bun run test:run`.
- 2026-07-07 (reviewer): review OK, nessun blocker. Sincronizzazione con integration:
  `integration/fase-1-backend` (7d3d39b) è ancora antenato di HEAD — T-4 NON è
  ancora atterrato in integration, quindi nessun conflitto su
  `authorization.ts`/`authorization.test.ts` da risolvere. `git merge integration`
  dentro task/005 = "Already up to date". Cautela per l'owner: quando T-4 verrà
  mergiato prima o dopo, le modifiche sono additive (T-4: hasAssociationRoleBypass/
  hasValidMembershipForYear/checkAssociationQuotaAccess; T-5: isOrganizationHeadMaster)
  — tenere entrambe.
  - Correttezza verificata: create/update/delete, persistenza `type` (schema enum
    CampaignType campaign/oneShot, default `campaign` a schema e in Zod), P2002→409
    su create e update, 400 su body vuoto (refine), tenant scoping corretto.
  - Autorizzazione verificata: POST = super-admin OPPURE isOrganizationHeadMaster
    (grant head_master su una campagna della stessa org, scoped per organizationId,
    nessuna leak cross-org); PUT/DELETE = super-admin OPPURE isUserCampaignAdmin
    sulla campagna specifica (findUnique su userId_campaignId, nessuna leak
    cross-campagna). Test coprono 401/400/403/404/201/200/204/409 + cross-tenant +
    405/OPTIONS. Asserzioni non indebolite.
  - Gate su branch sincronizzato: type-check 0 errori, lint 0/0, test 377/377 (26 file).
  - DA PORTARE ALL'OWNER (decisione di prodotto, non blocker): il create è concesso
    a QUALUNQUE head_master della org (piattaforma mono-org → di fatto ogni head_master
    può creare nuove campagne). Se si vuole restringere al solo super-admin, rimuovere
    isOrganizationHeadMaster e semplificare la route. Rilievi minori (non bloccanti):
    POST/PUT restituiscono la campaign grezza (con organization/timestamps/description)
    senza schema di output, a differenza di GET che filtra; DELETE su campagna con
    figli non-cascade darebbe 500 generico.
  - Mergiato in integration/fase-1-backend con --no-ff; gate ri-verificati sull'integrato.
