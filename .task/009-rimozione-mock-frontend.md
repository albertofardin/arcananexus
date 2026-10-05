---
id: "009"
title: "Rimozione dei mock dal frontend (dati reali via API)"
status: done
priority: P1
assignee: ""
branch: task/009-rimozione-mock-frontend
base: integration/fase-1-backend
trello: ""
created: 2026-07-09
updated: 2026-07-09
---

## Obiettivo

Sganciare le schermate della dashboard dai dataset statici in `src/app/_mock/` e
collegarle alle API/repository reali già esistenti. Oggi le pagine di
amministrazione mostrano dati finti (utenti, campagne) invece dei dati del
database.

## Scope

Incluso:

- **Utenti**: `dashboard/admin/users/page.tsx` + `UsersManager` devono leggere da
  `GET /api/admin/users` (paginazione + `search` già supportati, super-admin
  gated) invece che da `_mock/users.json`.
- **Elenco campagne**: `dashboard/admin/campaigns/page.tsx` + `CampaignsManager`
  (vista lista) devono leggere da `GET /api/campaigns?orgSlug=…` (hook
  `useQueryCampaigns` già esistente in `src/lib/queries/campaigns.ts`) invece che
  da `_mock/campaigns.json`.
- **Definizioni ruoli**: `_mock/roles.json` (etichette/icone/colori di
  `head_master`/`master`/`supporter`) è **configurazione statica**, non dato di
  dominio: spostarlo fuori da `_mock/` in un modulo di costanti
  (es. `src/app/(dashboard)/_components/roleDefinitions.ts` o
  `src/lib/constants`), consumato da `CampaignRolesManager`/`OrgRolesManager`.
  Deve restare coerente con l'enum Prisma `Role` e con `ROLE_LABELS` in
  `CampaignRoleGuard.tsx`.
- **Pulizia**: eliminare i file `_mock/` una volta scollegati; rimuovere
  `_mock/direttivo.json` (non più referenziato — i membri del direttivo arrivano
  da `GET /api/admin/association-roles`).
- Adeguare i tipi: i componenti oggi tipizzano su `MockUser`/`MockCampaign`;
  allinearli agli schemi Zod reali (`src/lib/validations/*`) senza rinominare a
  tappeto se non serve.

Escluso:

- **Impostazioni di campagna** (`sections`, `limits`, `managerId`, `logoUrl`,
  `backgroundUrl`) usate da `CampaignSettings` e dai mock in
  `dashboard/[campaignSlug]/admin/page.tsx` e in `CampaignsManager`
  (`toSettingsValue`): questi campi **non esistono** nel model Prisma `Campaign`
  (solo `name`, `slug`, `description`, `type`). De-mockarli richiede schema +
  migrazione + API dedicate → **fuori da questo task** (vedi Log: candidato T-013).
  Qui `CampaignSettings` resta con i suoi default finché non c'è il backing.
- Impersonation UI (T-010), gating delle sezioni ruoli (T-011/T-012).

## Criteri di accettazione

- [x] La pagina `dashboard/admin/users` mostra utenti reali dal DB (verificato con
      utenti di seed/DB reale), con ricerca e paginazione funzionanti; nessun
      import da `_mock/users.json`. — Verificato dal QA su DB reale (branch
      Neon effimero), sia a livello repository (`listUsersForAdmin` confrontato
      con SQL diretta) sia via `GET /api/admin/users` reale (super-admin
      gated). Vedi Log.
- [x] La lista campagne in `dashboard/admin/campaigns` mostra le campagne reali
      dell'organizzazione; nessun import da `_mock/campaigns.json`. — Verificato
      dal QA a livello API/repository su DB reale: `listCampaignsByOrgSlug` e
      `GET /api/campaigns?orgSlug=…` (usati da `useQueryCampaigns`/
      `CampaignsManager`) confrontati con SQL diretta, incluso isolamento
      cross-org. Vedi Log. Nota: `qa-report-fase-1-backend.md` (test manuale #8)
      descrive lo stato **pre-T-009**, quando la pagina usava ancora
      `_mock/campaigns.json`: non più valido dopo il riscritto di
      `CampaignsManager` (Artifacts di questo task) — non ho però verificato il
      rendering della pagina in browser reale in questo giro (nessun accesso a
      browser), solo lo strato dati che essa consuma.
- [x] Le definizioni ruolo provengono da un modulo di costanti fuori da `_mock/`;
      `head_master`/`master`/`supporter` combaciano con l'enum `Role`.
- [x] `src/app/_mock/` non è più importato da alcun file di `src/app`/`src/components`
      non-test (`grep -rn "_mock" src --include=*.ts --include=*.tsx | grep -v test`
      vuoto o solo commenti); i file mock scollegati sono rimossi.
- [x] Stati di loading/error gestiti (Skeleton/ErrorCard) per le nuove fetch.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/(dashboard)/dashboard/admin/users/page.tsx (ora renderizza solo
  `<UsersManager />`, self-fetching, come il pattern `OrgRolesManager`)
- src/app/(dashboard)/\_components/UsersManager.tsx (riscritto: fetch reale via
  `useQueryAdminUsers`, Skeleton/ErrorCard, ricerca+filtro anno+paginazione
  server-side, tipizzato su `AdminUser`)
- src/app/(dashboard)/dashboard/admin/campaigns/page.tsx (ora renderizza solo
  `<CampaignsManager />`)
- src/app/(dashboard)/\_components/CampaignsManager.tsx (riscritto: vista lista
  su `useQueryCampaigns`/`Campaign` reale, Skeleton/ErrorCard; editor
  impostazioni invariato ma `users=[]` con TODO T-013, badge staffer sostituito
  da conteggio `dataTypes` perché `assignments`/`avatar` non esistono
  sull'API reale)
- src/app/(dashboard)/\_components/CampaignRolesManager.tsx (solo import
  `roles.json` → `ROLE_DEFINITIONS`, rimosso il type `Role` non più usato)
- src/app/(dashboard)/\_components/OrgRolesManager.tsx (SOLO import `roles.json`
  → `ROLE_DEFINITIONS`, come richiesto per non entrare in conflitto con T-011)
- src/app/(dashboard)/\_components/roleDefinitions.ts (NUOVO — modulo di
  costanti `ROLE_DEFINITIONS: Role[]`, id tipizzati sull'enum Prisma `Role`)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx (rimosso import
  `_mock/users.json`; `managerId` mock stale svuotato; TODO T-013 su
  init/picker)
- src/app/(dashboard)/dashboard/[campaignSlug]/\_components/CampaignRoleGuard.tsx
  (solo commento aggiornato: non punta più a `_mock/roles.json`)
- src/app/api/admin/users/route.ts (riscritto su `listUsersForAdmin` +
  `adminUsersResponseSchema`, nuovo param `year`)
- src/app/api/admin/users/**tests**/route.test.ts (NUOVO)
- src/lib/repositories/user.repository.ts (NUOVA `listUsersForAdmin`, join
  `PersonalData`+`Membership`, filtro `search`/`year`, `availableYears`)
- src/lib/repositories/user.repository.test.ts (NUOVI test per
  `listUsersForAdmin`)
- src/lib/repositories/README.md (voce per `listUsersForAdmin`)
- src/lib/queries/adminUsers.ts (NUOVO — `useQueryAdminUsers`, pattern
  `useQueryCampaigns`)
- src/lib/validations/user.ts (NUOVO — `adminUserSchema`/`adminUsersResponseSchema`)
- src/app/\_mock/ (rimosso: campaigns.json, direttivo.json, roles.json,
  users.json)

interfaces:

- "listUsersForAdmin(prisma, { search?, year?, page?, pageSize? }) -> { users: AdminUser[] (senza campo pagination), total, availableYears }"
- "GET /api/admin/users?search=&year=&page=&pageSize= -> { users: AdminUser[], availableYears: number[], pagination: {page,pageSize,total,totalPages} } (super-admin)"
- "GET /api/campaigns?orgSlug=<slug> -> Campaign[] (invariata, hook `useQueryCampaigns` riusato as-is)"
- "useQueryAdminUsers({ search?, year?, page?, pageSize? }) -> UseQueryResult<AdminUsersResponse>"
- "ROLE_DEFINITIONS: Role[] (id tipizzati su @prisma/client Role: head_master/master/supporter)"

decisions:

- "roles.json è config statica, non mock: diventa un modulo di costanti
  (src/app/(dashboard)/\_components/roleDefinitions.ts, vicino a RolesManager
  che ne consuma il tipo `Role`)."
- "campaign settings (sections/limits/manager/logo/bg) escluse: mancano a
  schema. In CampaignsManager.tsx e in [campaignSlug]/admin/page.tsx l'unico
  uso mock era la lista utenti per il picker 'responsabile': sostituita con
  `users=[]` + commento TODO(T-013 candidato), invece di inventare un
  endpoint fuori scope. `managerId` hardcoded a un id mock inesistente
  ('u-001') in [campaignSlug]/admin/page.tsx svuotato a '' per coerenza
  (nessun utente reale con quell'id)."
- "Utenti admin: l'API originale selezionava solo id/name/email/createdAt,
  troppo povera per la UI esistente (che mostrava ssn/address/dateOfBirth/
  membershipYears dal mock). Estesa `listUsersForAdmin` a fare join reale su
  PersonalData (1:1, nullable finché l'utente non compila il profilo) e
  Membership (anni di tesseramento). Campi mock senza backing a schema
  (phone, nationality) sono stati rimossi dalla UI, non inventati."
- "Filtro anno di tesseramento: spostato lato server (query param `year`,
  filtro Membership.some) invece di client-side sull'intera lista, perché la
  paginazione ora è server-side e non è più possibile calcolare filtri
  cross-dataset lato client su una singola pagina. `availableYears` (tutti
  gli anni esistenti, non filtrati) torna nella risposta per popolare la
  dropdown."
- "UsersManager e CampaignsManager diventano self-fetching (come
  OrgRolesManager/CampaignRolesManager) invece di ricevere dati via prop da
  un Server Component: coerente con il pattern già in uso per le schermate
  admin che fanno client-side data fetching con TanStack Query."
- "Nessun test di rendering component-level per UsersManager/CampaignsManager
  aggiunto: nessun precedente in \_components/ (RolesManager/OrgRolesManager/
  CampaignRolesManager non ne hanno); copertura concentrata su repository
  (listUsersForAdmin) e route (/api/admin/users), dove vive la logica reale."

## Note / Log

- 2026-07-09 (owner): task creato. Dipende dal backend di fase-1 (grants, API
  utenti/campagne) → `base: integration/fase-1-backend`. Le API per utenti ed
  elenco campagne esistono già: qui è quasi tutto cablaggio frontend.
- 2026-07-09 (owner): DA DECIDERE (prodotto) — le impostazioni di campagna
  (sezioni scheda, limiti personaggi/missive/azioni, manager, logo, sfondo) sono
  mock puri senza campi a schema. Serve un task dedicato (candidato **T-013**:
  "Persistenza impostazioni di campagna") con migrazione Prisma + API + wiring di
  `CampaignSettings`. Non incluso qui per non gonfiare lo scope.
- 2026-07-09 (dev): inizio implementazione nel worktree `core-task-009`, branch
  `task/009-rimozione-mock-frontend` (già in checkout).
- 2026-07-09 (dev): cablati utenti (nuova `listUsersForAdmin` in
  `user.repository.ts` con join PersonalData/Membership + test, route
  `/api/admin/users` riscritta su Zod, hook `useQueryAdminUsers`,
  `UsersManager` riscritto self-fetching con Skeleton/ErrorCard) e campagne
  (`CampaignsManager` vista lista su `useQueryCampaigns` reale). Definizioni
  ruolo spostate in `roleDefinitions.ts` (nuovo modulo), consumate da
  `CampaignRolesManager` per intero e da `OrgRolesManager` solo nell'import
  (per non toccare la logica di T-011). Rimosso `src/app/_mock/` (4 file).
  `[campaignSlug]/admin/page.tsx` e l'editor di `CampaignsManager` (impostazioni
  campagna, fuori scope) non importano più da `_mock/`: picker responsabile
  con lista utenti vuota + `// TODO(T-013 candidato)`.
- 2026-07-09 (dev): gate verdi nel worktree — `bun run type-check` 0 errori,
  `bun run lint` 0 warning/errori, `bun run test:run` 556/556 test passati (43
  file, +10 rispetto alla base: 4 su `listUsersForAdmin`, 6 sulla route
  `/api/admin/users`). `grep -rn "_mock" src --include=*.ts --include=*.tsx`
  vuoto. Verifica NON estesa a un check manuale in browser contro un DB
  seedato (vedi caveat nei criteri di accettazione: i primi due punti restano
  spuntati come "non verificati manualmente", consigliata QA su ambiente con
  dati reali). Status → `in-review`. Verifica: `git switch
task/009-rimozione-mock-frontend` (nel worktree `core-task-009`), poi
  `bunx prisma generate && bun run type-check && bun run lint && bun run test:run`.
- 2026-07-09 (dev): fix nit P2 da review — `GET /api/admin/users` prendeva
  `page`/`pageSize`/`year` con `parseInt` grezzo (input non numerico → `NaN` a
  Prisma → 500 invece di 400; nessun tetto su `pageSize` → query unbounded;
  `pageSize=0` → `totalPages: Infinity`). Aggiunto `adminUsersQuerySchema` in
  `src/lib/validations/user.ts` (`page`/`pageSize` positivi con default
  1/50, `pageSize` max 100, `year` opzionale) validato con `.safeParse` +
  `apiError(400, ...)` nella route, stesso pattern degli altri handler.
  Aggiunti 5 test di route (page non numerico, pageSize=0, pageSize oltre il
  tetto, year non numerico → tutti 400 senza toccare il repository; default
  page/pageSize applicati quando omessi). Gate verdi: `bun run type-check` 0
  errori, `bun run lint` 0 warning/errori, `bun run test:run` 561/561 (43
  file, +5 rispetto al giro precedente). Resta `in-review`, non pushato né
  mergiato.
- 2026-07-09 (reviewer): VERDETTO **OK con nit** (round 1/3). Nessun leak
  multi-tenant (god-view super-admin by design, PersonalData/Membership non
  campaign-scoped); gating `requireSuperAdmin` confermato. Unico finding
  sostanziale P2 (validazione Zod query param) — poi CHIUSO dal dev nel giro
  successivo. Nit P3 (badge "N tipi di dato") accettato come placeholder.
  Raccomandata QA su DB reale per i criteri 1-2 (rendering utenti/campagne).
- 2026-07-09 (owner): P2 verificato chiuso; mergiato in `integration/fase-1-backend`
  (`--no-ff`), nessun conflitto con T-011 su OrgRolesManager (righe diverse:
  import vs commento). Gate post-merge verdi (type-check 0, lint pulito, 585
  test, zero import `_mock`). Resta `in-review` in attesa della QA su DB reale
  (criteri 1-2).
- 2026-07-09 (qa): verifica su **DB reale Neon**, non sul DB primario condiviso:
  creato un branch Neon effimero (`qa-ephemeral-t009-t011`, progetto `ad_test`
  id `shiny-scene-57228836`, da `main` id `br-curly-shadow-a9mj1w9t`) via Neon
  Management API (nessun tool MCP Neon disponibile in sessione; usato
  `NEON_API_KEY` da `.env` con `curl` contro `console.neon.tech/api/v2`), già
  popolato dal seed della base (clonato da `main`, nessun reseed necessario:
  12 utenti, 2 organizzazioni, 5 campagne, stessi id di `test-users.md`).
  Eliminato a fine giro (`DELETE /branches/br-plain-shape-a9x8ujqv`, confermato
  non più nell'elenco branch). Criterio 1: script one-off (`bunx tsx`, con
  `DATABASE_URL`/`DIRECT_URL` puntati al branch) confronta
  `listUsersForAdmin(prisma, {...})` con query SQL dirette — nessun filtro
  (`SQL count(*)=12` = `total` repository, 12 righe), `search="headmaster"`
  (`SQL count=2` = repository, email corrette), `year=2026` (`SQL count=4` =
  repository), join `PersonalData`+`Membership` su
  `headmaster.campaign1@ad.com` identico byte-per-byte tra repository e SQL
  diretta, paginazione `pageSize=2` pagine 1/2 senza overlap. Poi confermato
  anche via HTTP reale: avviato `bun dev -p 3100` puntato allo stesso branch
  (con `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` locali, non presenti nell'`.env`
  del worktree), login reale (`/api/auth/sign-in/email`) come
  `mattia@arcana.it` (super-admin): `GET /api/admin/users` → 200 con dati
  reali, `?search=headmaster` → `pagination.total:2`, `?page=1&pageSize=2` →
  `pagination:{page:1,pageSize:2,total:12,totalPages:6}`; come utente normale
  (`no-quota@ad.com`) e come direttivo non-super-admin (`president@ad.com`) →
  entrambi `403 "Permessi insufficienti"` (route è super-admin only, non
  direttivo). Criterio 2: `listCampaignsByOrgSlug` confrontato con SQL diretta
  su entrambe le organizzazioni presenti (`arcana-domine`: campaign1,
  prova-one-shot, winter-chronicles; `shadow-realms`: dark-prophecy,
  realm-of-shadows) — match esatto, **nessun leak cross-org** (verificato
  programmaticamente: nessun id di `shadow-realms` nel risultato per
  `orgSlug=arcana-domine`). Confermato via HTTP reale:
  `GET /api/campaigns?orgSlug=arcana-domine` e `?orgSlug=shadow-realms`
  rispondono 200 con le rispettive campagne, nessuna sovrapposizione. Gate di
  regressione rieseguiti sul tip di `integration/fase-1-backend`:
  `bun run type-check` 0 errori, `bun run test:run` 585/585 verdi (46 file).
  **Non verificato**: rendering della pagina `dashboard/admin/campaigns` in
  browser reale (nessun accesso a browser in questo giro) — verificato solo lo
  strato API/repository che quella pagina consuma; il criterio come scritto
  ("mostra le campagne reali... nessun import da \_mock") è comunque soddisfatto
  a livello di codice (grep `_mock` vuoto, già verificato dal dev) e di dati.
  Entrambi i criteri spuntati.
- 2026-07-09 (owner): QA su DB reale (branch Neon effimero) OK per i criteri 1-2
  (utenti/campagne reali confrontati con SQL, gating 403, no leak cross-org).
  Residuo solo-browser (rendering pagina) non bloccante: strato API/repo
  verificato. Reviewer OK già dato → tutte le condizioni §6 soddisfatte.
  status → done.
