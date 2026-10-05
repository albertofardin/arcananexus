---
id: "002"
title: "Repository + API Grant: assegnazione ruoli (aggancio RolesManager)"
status: done
priority: P0
assignee: reviewer
branch: task/002-grant-repository-api-assegnazioni-ruoli
trello: ""
created: 2026-07-07
updated: 2026-07-08
---

## Obiettivo

Dare un backend reale alla gestione ruoli/membri, oggi assente. Il frontend
`RolesManager` è già costruito ma lavora su dati mock (`src/app/_mock/*.json`) con
salvataggio finto (`console.log` + `setTimeout`). Serve il repository + le API per
assegnare, modificare e rimuovere i ruoli, sia a livello **campagna** (staff) sia a
livello **direttivo** (associazione).

## Scope

Incluso:

- Nuovo `src/lib/repositories/grant.repository.ts`: `createGrant`, `updateGrantRole`,
  `revokeGrant`, `listGrantsForCampaign` (accettano `PrismaClient` come primo arg).
- Route API per: assegnare un utente a una campagna con un ruolo, cambiarne il ruolo,
  rimuoverlo. Più le assegnazioni del **direttivo** (ruolo associativo, vedi T-1).
- Schema Zod in `src/lib/validations/` per gli input.
- Solo utenti già registrati (nessun flusso di invito via email).
- Cablare `RolesManager` (`handleSave` attualmente mock) alle nuove API.
- Test repository (`prismaMock`) + test API con casi cross-tenant.

Escluso:

- Enforcement banned (T-1 lascia solo il dato).
- Le guardie di accesso (T-3/T-4).

## Criteri di accettazione

- [x] Repository `grant.repository.ts` con create/update/revoke/list + test.
- [x] API che creano/modificano/rimuovono assegnazioni di ruolo per campagna e per
      direttivo, con validazione Zod (400 su input invalido).
- [x] Solo un admin/`head_master` della campagna (o super-admin) può modificare le
      assegnazioni di quella campagna; test cross-tenant che lo dimostrano (admin di
      campagna A non tocca i grant di B).
- [x] `RolesManager` salva davvero su backend (niente più mock) e ricarica lo stato.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Note / Log

- 2026-07-07 (owner): dipende da T-1 (enum ruoli). Card Trello di origine: 4/5/6
  (rimuovi/invita/cambia ruolo) accorpate in un unico task su richiesta utente.
- 2026-07-07 (dev): inizio implementazione. Setup ambiente (bun install +
  prisma generate) fatto. Piano: `grant.repository.ts` (create/update/revoke/list)
  - nuovo `user.repository.ts` (utenti base + membri direttivo) + query
    `listCampaignsWithGrants` in `campaign.repository.ts`; route
    `/api/campaigns/[campaignSlug]/grants` (+ `/[userId]`) per lo staff di
    campagna e `/api/admin/association-roles` (+ `/[userId]`) per il direttivo;
    Zod in `src/lib/validations/grant.ts` e `associationRole.ts`; autorizzazione
    inline nelle route (helper `requireCampaignAdminBySlug` in
    `authorization.ts`, `requireSuperAdmin` per il direttivo — assunzione: senza
    un concetto di "admin di organizzazione" oltre il super-admin, l'assegnazione
    dei ruoli associativi resta riservata al super-admin); RolesManager riceve
    un prop `onSave` reale al posto del mock.
- 2026-07-08 (owner): il log sopra si interrompe a metà frase e il lavoro
  risulta interamente non committato nel worktree (10 file modificati + 8 file
  nuovi non tracciati) — sintomo di sessione interrotta, non di blocco tecnico.
  Le spunte dei criteri di accettazione sono state lasciate a `[x]` ma **non
  vanno considerate affidabili**: nessuna prova che i gate siano stati
  eseguiti né che l'implementazione sia davvero completa. Riporto lo status a
  `in-progress` e ri-delego al dev: riverificare ogni criterio contro il
  codice reale, completare eventuali parti mancanti, far girare
  `bun run type-check` / `bun run lint` / `bun run test:run`, poi committare.
  Priorità P0 per mettere in salvo il lavoro a rischio.
- 2026-07-08 (dev): riverificato il lavoro non committato contro ogni criterio,
  senza fidarmi delle spunte lasciate dalla sessione precedente. Esito: **il
  codice era effettivamente completo e corretto**, nessuna parte mancante
  trovata. In dettaglio:
  - `grant.repository.ts` (create/update/revoke/list, primo arg `PrismaClient`)
    - `user.repository.ts` (ruoli associativi del direttivo) presenti con test
      `prismaMock` completi, incluso scoping per campagna/organizzazione.
  - Route `/api/campaigns/[campaignSlug]/grants` (+ `/[userId]`) e
    `/api/admin/association-roles` (+ `/[userId]`) presenti, con validazione
    Zod (400 su input non valido) e autorizzazione via
    `requireCampaignAdminBySlug` (head_master della campagna o super-admin)
    / `requireSuperAdmin` per il direttivo. Test per ogni route con casi
    401/403/404/400 e cross-tenant espliciti (head_master di campagna A non
    autorizzato a leggere/creare/modificare/rimuovere grant di campagna B).
  - `RolesManager` riceve `onSave` reale (niente più `console.log`/mock);
    `CampaignRolesManager` e `OrgRolesManager` (nuovi) caricano via TanStack
    Query e salvano tramite `rolesAssignmentsSync.ts` (diff
    create/update/delete), poi fanno `refetch()`. Le pagine
    `/dashboard/[campaignSlug]/admin/roles` e `/dashboard/admin/roles` montano
    questi componenti al posto della lettura da `src/app/_mock/*.json`.
  - Unica correzione applicata in questa sessione: pulizia formattazione
    Prettier su `authorization.ts`/`authorization.test.ts` (introdotta dalle
    modifiche della sessione precedente, non segnalata da `lint` perché
    eslint non controlla la formattazione). Nessuna logica toccata.
  - Gate eseguiti con `bun`: `bun run type-check` → 0 errori;
    `bun run lint` → 0 problemi; `bun run test:run` → **401 test passati su
    401, 31 file di test, 0 falliti**.
  - Lavoro committato sul branch `task/002-grant-repository-api-assegnazioni-ruoli`
    in 4 commit incrementali (repository layer, authorization+validations,
    route API, aggancio frontend). Nessun push, nessun merge.
  - Debito pre-esistente notato ma fuori scope (non toccato): alcuni file
    Markdown/TS non correlati a questo task falliscono `bun run format:check`
    (prettier), incluso `src/lib/repositories/campaign.repository.ts` per due
    funzioni pre-esistenti non legate ai criteri di questo task. `format:check`
    non è uno dei gate richiesti da questo task (`type-check`/`lint`/`test:run`)
    e non era comunque verde su `main` prima di T-2; segnalo per una eventuale
    bonifica dedicata, non l'ho inseguito qui.
  - Porto lo status a `in-review`, assignee resta `dev` in attesa di
    riassegnazione al reviewer da parte dell'owner. Spunte dei criteri di
    accettazione confermate tutte vere e verificate personalmente (non solo
    ereditate dalla sessione precedente).
- 2026-07-08 (reviewer): review OK, nessun blocker. Gate ri-eseguiti (401/401
  test, 0 type-check, 0 lint) confermano i numeri del dev. Isolamento
  multi-tenant verificato a tre livelli (repository, helper
  `requireCampaignAdminBySlug`, route). 2 note non bloccanti (retry
  `rolesAssignmentsSync` su 409 parziale; pattern sessione in
  `requireCampaignAdminBySlug` coerente col resto del file). Assunzione
  "ruoli direttivo solo super-admin" giudicata ragionevole, non blocker —
  segnalata come possibile estensione futura via `isOrganizationHeadMaster`
  (T-5). Nessun merge eseguito dal reviewer.
- 2026-07-08 (owner): mergiato in `integration/fase-1-backend` con `git merge
--no-ff task/002-grant-repository-api-assegnazioni-ruoli` → commit
  `f7864e0`. Conflitti testuali (attesi, segnalati dal reviewer) in
  `authorization.ts`/`.test.ts` (liste import in collisione con T-4/T-5),
  `repositories/{index,types}.ts` e `repositories/README.md` (export/tipi/doc
  aggiunti in punti diversi dello stesso file) e
  `campaign.repository.test.ts` (import `CampaignType` vs `Role`): tutti
  risolti per concatenazione/unione fedele, nessuna riscrittura logica.
  Nessuna nuova migrazione Prisma. Gate post-merge su
  `integration/fase-1-backend`: `bunx prisma generate` ok, `type-check` → 0
  errori, `lint` → 0 errori/0 warning, `test:run` → 505/505 test verdi (38
  file). T-2 → done.
