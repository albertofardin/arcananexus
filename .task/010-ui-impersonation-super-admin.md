---
id: "010"
title: "UI Impersonation per super-admin"
status: done
priority: P2
assignee: ""
branch: task/010-ui-impersonation-super-admin
base: integration/fase-1-backend
trello: ""
created: 2026-07-09
updated: 2026-07-09
---

## Obiettivo

Portare nell'interfaccia la funzionalità di impersonation, già completa lato
backend (`/api/admin/impersonate/{start,end,status}`, `src/lib/impersonation.ts`)
ma priva di qualsiasi UI. Un super-admin deve poter impersonare un utente da
dashboard e uscirne, con un indicatore sempre visibile mentre l'impersonation è
attiva.

## Scope

Incluso:

- **Toolbar/banner globale** ("stai impersonando X — Esci"): componente client
  montato nel layout della dashboard (`src/app/(dashboard)/layout.tsx` o dentro
  `Dashboard`/`SidePanel`). Fa polling di `GET /api/admin/impersonate/status`;
  quando `isImpersonating` è true mostra una barra (stile ambrato, coerente col
  riferimento in CLAUDE.md) con nome/email dell'utente impersonato e un pulsante
  "Esci dall'impersonazione" → `POST /api/admin/impersonate/end` seguito da
  refresh/redirect.
- **Avvio impersonation** dall'elenco utenti (`UsersManager`): azione "Impersona"
  per riga → `POST /api/admin/impersonate/start { targetUserId }` → refresh.
  L'azione è visibile **solo al super-admin** e non sull'utente stesso (il backend
  già rifiuta self-impersonation e non-super-admin con 400/403).
- Gestione degli stati di errore delle chiamate (toast) e disabilitazione dei
  controlli durante la richiesta.
- Test: rendering condizionale del banner su `isImpersonating` true/false;
  visibilità dell'azione "Impersona" solo per super-admin; happy-path
  start→banner→end (con MSW).

Escluso:

- Modifiche alla logica backend di impersonation (già esistente e coperta).
- Endpoint di debug `fake` (resta com'è, non esposto in UI).
- Audit-log / storico delle impersonation (fuori scope).

## Criteri di accettazione

- [x] Da `dashboard/admin/users`, un super-admin vede l'azione "Impersona" e
      avviandola la sessione passa all'utente target (verificato: le pagine
      mostrano i dati dell'utente impersonato). — **Ri-verificato dal QA dopo
      il fix P0 (plugin `admin` Better Auth) e l'applicazione della migrazione
      su DB reale**: roundtrip HTTP con cookie jar, `Set-Cookie` di
      `better-auth.session_token` ora firmato (`token.signature`),
      `/api/auth/get-session` post-`start` riflette il target. Vedi Log
      2026-07-09 (qa, round 2).
- [x] Mentre l'impersonation è attiva è visibile un banner con l'utente
      impersonato e un pulsante per uscirne, su tutte le pagine della dashboard
      (montato nel layout della dashboard, quindi presente su ogni route sotto
      `(dashboard)`). — **Ri-verificato**: `GET /api/admin/impersonate/status`
      (da cui dipende il banner) torna `200 {isImpersonating:true,
activeUser:no-quota@ad.com, adminUser:mattia@arcana.it}` col jar
      post-`start` (prima 401). Rendering visivo del banner in browser reale
      resta non verificato da questo QA (fuori dai suoi mezzi, richiede occhio
      umano); il dato che lo alimenta è confermato corretto.
- [x] "Esci dall'impersonazione" ripristina la sessione del super-admin e il
      banner sparisce. — **Ri-verificato**: `POST
/api/admin/impersonate/end` col jar post-`start` torna `200 {success:true}`,
      il `Set-Cookie` restituito è **identico** al cookie di sessione ottenuto
      al login originale; `/api/me/capabilities` e `/api/admin/impersonate/status`
      subito dopo confermano `isSuperAdmin:true` / `isImpersonating:false`.
- [x] L'azione "Impersona" **non** è visibile a un utente non super-admin e non
      compare sulla propria riga.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/(dashboard)/layout.tsx (montaggio `ImpersonationToolbar` sopra `Dashboard`, sempre presente su tutte le route della dashboard)
- src/app/(dashboard)/\_components/UsersManager.tsx (azione "Impersona" per riga, gating super-admin + esclusione self, stato di richiesta e toast d'errore)
- src/lib/validations/impersonation.ts (aggiunto `startImpersonationResponseSchema` per validare la risposta di `/start`)
- src/lib/auth.ts (T-010 P0: aggiunto plugin `admin` di Better Auth con `adminUserIds: [SUPER_ADMIN_USER_ID]`)
- src/lib/impersonation.ts (T-010 P0: `getSessionContext` riscritta su `session.impersonatedBy` nativo + lookup `prisma.user` dell'admin; rimosse `startImpersonation`/`endImpersonation` custom, non più necessarie)
- src/app/api/admin/impersonate/start/route.ts (T-010 P0: `auth.api.impersonateUser({ returnHeaders: true })`, propaga i `Set-Cookie` firmati sulla `NextResponse`; matrice errori 401/403/400/404 invariata)
- src/app/api/admin/impersonate/end/route.ts (T-010 P0: `auth.api.stopImpersonating({ returnHeaders: true })`, stessa propagazione cookie; 400 invariato se non impersonando)
- src/app/api/admin/impersonate/status/route.ts (rimosso un `console.log` di debug residuo; nessun altro cambio, `getSessionContext` fa già tutto)
- prisma/schema.prisma (T-010 P0: campi opzionali `User.role/banned/banReason/banExpires`, `Session.impersonatedBy`, richiesti dallo schema del plugin `admin`)
- src/lib/constants.ts (T-010 P0: rimossi `ADMIN_SESSION_COOKIE`/`SESSION_MAX_AGE_SECONDS`, non più referenziati; `SESSION_COOKIE` resta, usato da `middleware.ts`)
- src/test/helpers/prisma-fixtures.ts (`mockUser` valorizza i nuovi campi opzionali di `User`, richiesto dai tipi Prisma rigenerati)
- src/app/**tests**/cross-task-integration.test.tsx (riscritto lo scenario di impersonation cross-task sul nuovo meccanismo: un'unica `getSession` con `session.impersonatedBy`, non più doppio cookie/doppia `getSession`)
- .task/010-ui-impersonation-super-admin.md (stato/log)

files_added:

- src/components/impersonation/ImpersonationToolbar.tsx (banner ambrato client, polling status, azione "Esci dall'impersonazione")
- src/components/impersonation/**tests**/ImpersonationToolbar.test.tsx (banner condizionale su `isImpersonating`, happy-path end, errore end)
- src/components/impersonation/**tests**/impersonation-flow.test.tsx (end-to-end con MSW: start da UsersManager → banner → end, stato server in-memory)
- src/lib/queries/impersonation.ts (`useQueryImpersonationStatus` con polling 15s, `startImpersonation`, `endImpersonation`)
- src/app/(dashboard)/\_components/**tests**/UsersManager.test.tsx (visibilità azione per super-admin/non-super-admin/riga propria, happy-path start, toast d'errore)
- prisma/migrations/20260709160000_add_better_auth_admin_plugin_fields/migration.sql (T-010 P0, vedi decisions per come è stata generata)
- src/lib/impersonation.test.ts (T-010 P0: test di integrazione a basso livello con una VERA istanza Better Auth in-memory, `@better-auth/memory-adapter` — cookie di sessione/impersonation realmente firmati e verificati, non mock a stringa; chiude il gap che aveva nascosto il bug)
- src/app/api/admin/impersonate/start/**tests**/route.test.ts (prima suite di test per la route: matrice 401/403/400/404, propagazione `Set-Cookie` del plugin, mapping `APIError`)
- src/app/api/admin/impersonate/end/**tests**/route.test.ts (idem per `/end`)
- src/app/api/admin/impersonate/status/**tests**/route.test.ts (idem per `/status`)

interfaces:

- "GET /api/admin/impersonate/status -> { isImpersonating, activeUser, adminUser|null }"
- "POST /api/admin/impersonate/start { targetUserId } -> { success, targetUser: { id, name, email } }"
- "POST /api/admin/impersonate/end -> { success }"
- "useQueryImpersonationStatus(): UseQueryResult<ImpersonationStatus> — poll ogni 15s, queryKey ['impersonation','status']"
- "startImpersonation(targetUserId: string): Promise<StartImpersonationResponse>"
- "endImpersonation(): Promise<void>"
- "getSessionContext(headers: Headers): Promise<ImpersonationContext | null> — invariata nella firma, riscritta internamente su session.impersonatedBy (plugin admin) invece del doppio cookie manuale"

decisions:

- "gating client via useCapabilities().isSuperAdmin (endpoint /api/me/capabilities, stesso pattern di T-011) invece di importare isSuperAdmin() direttamente lato client: authorization.ts è codice server (Prisma/auth), non va bundlato nel client."
- "dopo start/end la queryClient viene svuotata (queryClient.clear()) prima del redirect/refresh: la sessione attiva cambia identità e tutte le query cache (capabilities, elenco utenti, dati campagna...) sarebbero altrimenti incoerenti con il nuovo utente."
- "dopo lo start il redirect va alla home dashboard (routes.home()) invece di restare sulla pagina utenti, perché il target potrebbe non avere accesso ad /admin/users."
- "durante una richiesta di impersonation in corso tutti i bottoni «Impersona» della lista sono disabilitati (non solo quello cliccato), pattern già usato altrove nel componente per la paginazione."
- "T-010 P0 — adminUserIds invece di adminRoles/role: nessun campo ruolo admin introdotto nel dominio, coerente con isSuperAdmin (check hardcoded sull'email). L'id usato è quello di mattia@arcana.it sul DB di sviluppo, recuperato da .task/test-users.md (riga già verificata dalla QA, `Rl8oe4AGgcYkySapFeo2o5NFPeJy0xFO`) — NON da una query diretta: il sandbox di questo agente ha negato un tentativo di query di sola lettura verso il branch Neon di default (classificato come lettura di produzione con credenziali auto-generate), quindi l'id non è stato riverificato in questa sessione. Da confermare con l'owner prima del merge se il DB di sviluppo è cambiato nel frattempo."
- "T-010 P0 — migrazione Prisma scritta a mano (non generata da `prisma migrate dev`): questo worktree non ha DATABASE_URL/DIRECT_URL configurati in `.env` (gestiti a quanto pare tramite Neon MCP dall'owner, non presenti qui) e il sandbox nega la lettura di produzione tramite credenziali auto-generate; anche `prisma migrate diff` richiede uno shadow DB raggiungibile. La migrazione (4 ALTER TABLE additivi, tutti nullable, nessun backfill) è stata scritta seguendo esattamente il formato/naming delle migrazioni Prisma esistenti nel repo e verificata solo con `prisma generate` (che non richiede connessione DB) — **mai eseguita contro un DB reale**. L'owner deve applicarla (`bunx prisma migrate deploy` o equivalente) e verificare che `_prisma_migrations` la registri senza drift prima di considerare il task davvero chiuso."
- "T-010 P0 — route start/end: `auth.api.impersonateUser`/`stopImpersonating` chiamati direttamente (non tramite `callAuthEndpoint`/`auth.handler`) perché l'autorizzazione applicativa (isSuperAdmin, self-impersonation, target esistente) resta un controllo esplicito PRIMA della chiamata, e il plugin stesso applica `adminUserIds` come secondo cancello; i Set-Cookie restituiti da `returnHeaders: true` vengono copiati 1:1 su NextResponse via `response.headers.append('set-cookie', ...)`, senza reinterpretarli/riscriverli — punto esatto dove il bug P0 nasceva nella vecchia implementazione."
- "T-010 P0 — test di integrazione reale (src/lib/impersonation.test.ts) usa @better-auth/memory-adapter, dipendenza transitiva di better-auth (non aggiunta a package.json: un `bun add` esplicito ha risolto una versione 1.6.23 disallineata dal 1.6.11 bundlato, generando un peer-dependency mismatch — ripristinato lo stato precedente e lasciata come dipendenza transitiva implicita, con commento nel file di test che ne spiega la provenienza)."

## Note / Log

- 2026-07-09 (owner): task creato. Backend pronto (T impersonation di fase-1):
  `start` conserva il token admin in cookie `better-auth.admin_session_token` e
  sostituisce `better-auth.session_token`; `getSessionContext` legge entrambi.
- 2026-07-09 (owner): dipende praticamente da T-009 (elenco utenti reale) per
  avere `targetUserId` veri da cui partire — ordinare T-009 prima, oppure
  sviluppare in parallelo tenendo conto che l'azione vive in `UsersManager`.
- 2026-07-09 (owner): NOTA — il super-admin è un check hardcoded su email
  (`isSuperAdmin`, `mattia@arcana.it`). Il gating UI usa la stessa funzione pura
  sul `session.user.email`; la sicurezza reale resta lato API (già 403 per
  non-super-admin).
- 2026-07-09 (dev): inizio implementazione. Verificato che nessuna UI di
  impersonation esiste nel codice (nessun `ImpersonationToolbar`, nessun
  `src/components/impersonation/`): il riferimento in CLAUDE.md era
  aspirazionale/stale, non un componente da completare.
- 2026-07-09 (dev): implementati `ImpersonationToolbar` (montato in
  `(dashboard)/layout.tsx`, polling status via TanStack Query) e l'azione
  "Impersona" in `UsersManager` (gating via `useCapabilities().isSuperAdmin`,
  esclusa la propria riga). Aggiunti `src/lib/queries/impersonation.ts` e lo
  schema di risposta di `/start`. Test: banner condizionale, visibilità
  azione per ruolo/riga, happy-path e toast d'errore su entrambi i flussi,
  più un end-to-end con MSW (start→banner→end). Gate verdi: `type-check`,
  `lint`, `test:run` (596/596 test). Caveat: non verificato manualmente in
  browser il redirect reale post-`start` (che le pagine mostrino davvero i
  dati dell'utente target) né il roundtrip dei cookie `better-auth.*` in un
  ambiente vivo — coperto solo da unit/integration test con MSW, come da DoD.
  Porto il task a `in-review`.
- 2026-07-09 (dev): fix round 1 dopo review. P2: aggiunto `router.refresh()`
  dopo `router.push(routes.home())` nell'happy-path di `handleImpersonate`
  (simmetrico a `ImpersonationToolbar.handleEnd`) — senza, la Router Cache RSC
  di Next poteva servire la pagina target con dati ancora dell'admin sotto il
  banner di impersonation. P3: `canImpersonate` ora richiede esplicitamente
  `!!currentUserId` prima del confronto, così il pulsante "Impersona" non
  compare più sulla propria riga nella finestra in cui `useSession` non ha
  ancora risolto (prima il confronto con `undefined` era sempre vero).
  Aggiunto test dedicato per il caso self-row a sessione non caricata e
  asserzione su `router.refresh()` nell'happy-path esistente. Rimosso anche
  un artefatto `</content>` stale a fine file (refuso di formattazione, non
  contenuto). Gate rilanciati: `type-check`, `lint`, `test:run` verdi
  (597/597 test).
- 2026-07-09 (reviewer): VERDETTO OK con nit (round 1/3). Sicurezza solida
  (gating client = sola difesa in profondità, start server-side impone
  super-admin + no self; useCapabilities impersonation-aware → niente
  impersonation annidata; nessun leak nel banner). Un P2 (start senza
  router.refresh → Router Cache RSC stantia con identità admin) + P3 self-row →
  poi CHIUSI dal dev nel round successivo.
- 2026-07-09 (owner): mergiato in `integration/fase-1-backend` (`--no-ff`, commit
  d1d65d0). Gate post-merge (combinato con T-012) verdi: type-check 0, lint
  pulito, 604 test (51 file). RESTA in-review: i criteri 1-3 (start→pagine con
  dati del target, banner su tutte le pagine, end→ripristino) sono il roundtrip
  reale dei cookie httpOnly + Router Cache, non esercitabile dai test MSW →
  richiede una passata QA (browser o HTTP con cookie jar) prima del `done`.
- 2026-07-09 (qa): **DIFETTO DETERMINISTICO P0/P1 trovato** — l'impersonation
  è rotta a runtime reale: i cookie che `start` imposta non sono validi per
  Better Auth, quindi il super-admin che avvia un'impersonazione perde la
  propria sessione valida (non "diventa" il target) e non può nemmeno più
  terminare l'impersonazione dall'API.

  **Metodo**: branch Neon effimero (`qa-ephemeral-t010`, progetto `ad_test`
  `shiny-scene-57228836`, da `main`; eliminato a fine giro, confermato non più
  in elenco), `bun dev -p 3101` puntato al branch, login reali via
  `/api/auth/sign-in/email` con cookie jar `curl -c/-b` (nessun tool MCP Neon
  disponibile in sessione, usato `NEON_API_KEY` via Management API come nel
  giro T-009/T-011).

  **Riproduzione** (dati reali, id verificati su DB):
  1. Login `mattia@arcana.it` (super-admin) → jar salva
     `better-auth.session_token=EjrszxmseU3gzUIqW9Gfg5svjRltFpjz.bkINfxvUmIThcf%2F...`
     (formato **firmato** `token.signature`, standard Better Auth).
  2. `GET /api/me/capabilities` col jar → `200 {"isSuperAdmin":true,...}` (baseline
     corretta).
  3. `POST /api/admin/impersonate/start {"targetUserId":"2TB2fkUidcIWLTjsOuguIsTy7u8lZmyt"}`
     (id di `no-quota@ad.com`) → `200 {"success":true,"targetUser":{"email":"no-quota@ad.com",...}}`.
     `Set-Cookie` osservati:
     `better-auth.session_token=nptf9r2jk3RZQEgfWRpFsoJOMFre8qZz` e
     `better-auth.admin_session_token=af9bMJw0TFTB0QfuWcwbsszfxlxJHNtC` — **entrambi
     senza suffisso `.signature`**, a differenza del cookie di login.
  4. Col jar aggiornato: `GET /api/admin/impersonate/status` → **`401
{"error":"Non autenticato"}`** (atteso: `200 {isImpersonating:true,
activeUser:no-quota@ad.com, adminUser:mattia@arcana.it}`).
     `GET /api/me/capabilities` → **`401`** (atteso: riflettere il target,
     `isSuperAdmin:false`).
     `GET /api/auth/get-session` (endpoint reale dietro `useSession()` lato
     client) → **`null`** con `200` (atteso: sessione del target).
  5. `POST /api/admin/impersonate/end` col jar → **`400
{"error":"Nessuna impersonificazione attiva"}`** (atteso: `200
{success:true}` + ripristino sessione admin) — l'admin **non può più
     uscire dall'impersonazione tramite l'API** una volta rotta la sessione.

  **Causa** (letta in `src/lib/impersonation.ts` e
  `src/app/api/admin/impersonate/start/route.ts`): `startImpersonation` usa
  `result.targetSessionToken` = valore **grezzo** della colonna `Session.token`
  (per la sessione admin, `session.session.token` da `auth.api.getSession()`;
  per il target, `token: crypto.randomUUID()` creato ad-hoc). La route
  `start/route.ts` scrive questi valori grezzi direttamente con
  `response.cookies.set(SESSION_COOKIE, ...)`/`response.cookies.set
(ADMIN_SESSION_COOKIE, ...)`, **bypassando la firma HMAC che Better Auth
  applica sempre al cookie di sessione** (confermato che Better Auth la
  richiede: preso un cookie di sessione valido appena ottenuto da un login
  reale — `Fj7bJTUiMSN78Tnb5aJhf0Q2wgwUhKow.HweTpUyIfNQOEcv...` — e rimandato
  a `/api/auth/get-session` **senza** la parte `.signature`: risposta `null`,
  stesso comportamento del cookie di impersonation). Stesso problema si ripete
  in `getSessionContext` (`src/lib/impersonation.ts`), che ricostruisce
  manualmente l'header `cookie: better-auth.session_token=${adminToken}` per
  rivalidare l'admin — anche lì senza firma, quindi anche quella verifica
  fallirebbe indipendentemente dal primo bug.

  **Impatto**: criteri 1 e 3 falsi a runtime reale (vedi checkbox sopra);
  criterio 2 (banner) non raggiungibile in pratica perché dipende dalla stessa
  `/status` che fallisce; il super-admin che clicca "Impersona" resta con una
  sessione client-side `null` (nessun redirect automatico al login essendo il
  middleware un controllo di sola presenza cookie, non di validità — vedi
  `middleware.ts`), e non ha modo di uscire dall'impersonazione se non
  rifacendo login manualmente. **Non è un problema di isolamento multi-tenant
  né di leak dati**: è un difetto di autenticazione che rende la feature
  inutilizzabile end-to-end.

  **Gate rilanciati** su `integration/fase-1-backend` (non toccati dal bug,
  perché i test usano MSW/mock che non riproducono la firma reale dei cookie
  di Better Auth): `bun run test:run` → 604/604 verdi (51 file).

  **status → in-progress**, assignee `dev` (fix suggerito: firmare i cookie
  impostati da `start`/`end` con lo stesso meccanismo di Better Auth — es.
  passare da `auth.api.setSessionCookie`/helper equivalente invece di
  `response.cookies.set` grezzo, oppure calcolare la firma HMAC con lo stesso
  algoritmo usato internamente da Better Auth — e correggere la
  ricostruzione dell'header cookie in `getSessionContext`).

  **Non verificato** (fuori dai miei mezzi in questo giro): rendering visivo
  del banner/redirect in browser reale (richiede occhio umano); criterio 4
  (azione "Impersona" nascosta a non-super-admin/riga propria) non toccato,
  resta come verificato dal dev/reviewer solo con test unit/MSW.

  **Sicurezza confermata OK** (indipendente dal bug sopra, verificata a runtime
  reale): `POST /api/admin/impersonate/start` come utente normale
  (`no-quota@ad.com`) → `403 {"error":"Permessi insufficienti"}`; stesso
  endpoint con `targetUserId` = se stesso (super-admin) → `400 {"error":"Non
puoi impersonare te stesso"}`.

- 2026-07-09 (dev): riapertura per bug P0 trovato dalla QA su DB reale — la
  reimplementazione custom scriveva cookie di sessione non firmati, rifiutati
  da Better Auth a runtime (start/status/capabilities 401, end 400). Inizio
  migrazione al plugin nativo `admin` di Better Auth (decisione già presa con
  l'owner/utente), come da brief: `adminUserIds` con l'id del super-admin,
  migrazione Prisma additiva per i campi richiesti dal plugin, riscrittura di
  `getSessionContext`/route start-end-status su `auth.api.impersonateUser`/
  `stopImpersonating`.
- 2026-07-09 (dev): migrazione completata. `src/lib/auth.ts` monta
  `admin({ adminUserIds: [SUPER_ADMIN_USER_ID] })`; schema Prisma esteso con i
  campi richiesti dal plugin (`User.role/banned/banReason/banExpires`,
  `Session.impersonatedBy`, tutti opzionali, nessun backfill).
  `getSessionContext` non ricostruisce più l'impersonation a mano: legge
  `session.impersonatedBy` dalla sessione reale e risolve l'admin con una
  query `prisma.user` separata. Le route `start`/`end` chiamano
  `auth.api.impersonateUser`/`stopImpersonating` con `returnHeaders: true` e
  copiano i `Set-Cookie` (realmente firmati) sulla `NextResponse` — nessuna
  scrittura manuale di cookie rimasta nel codice applicativo. Contratto JSON
  esterno delle 3 route invariato (client/UI non toccati).
  Aggiunto `src/lib/impersonation.test.ts`: chiude esplicitamente il gap
  segnalato dalla QA costruendo una VERA istanza Better Auth in-memory
  (`@better-auth/memory-adapter`, transitiva di `better-auth`, niente DB
  reale) con lo stesso plugin `admin`, e verificando l'intero ciclo
  sign-in→impersonate→getSessionContext→stopImpersonating con cookie
  realmente firmati/verificati dal core di Better Auth — non più mock a
  stringa. Aggiunte anche le prime suite di test per le 3 route (`start`,
  `end`, `status`), che prima non ne avevano nessuna: matrice di errori
  401/403/400/404, propagazione dei `Set-Cookie`, mapping di `APIError`.
  Riscritto lo scenario di impersonation in `cross-task-integration.test.tsx`
  sul nuovo meccanismo a singola sessione con `impersonatedBy`.
  Due limiti/decisioni da segnalare esplicitamente all'owner (dettagli in
  Artifacts → decisions): (1) l'id del super-admin in `adminUserIds` viene da
  `.task/test-users.md` (già verificato dalla QA), non da una query diretta —
  il sandbox di questo agente ha negato un tentativo di lettura sul branch
  Neon di default, quindi va riconfermato se il DB è cambiato nel frattempo;
  (2) la migrazione Prisma è stata scritta a mano (stesso formato delle
  migrazioni esistenti) perché questo worktree non ha `DATABASE_URL`/
  `DIRECT_URL` configurati e il sandbox nega letture di produzione — **non è
  mai stata eseguita contro un DB reale**, va applicata e verificata
  dall'owner prima di considerare il bug davvero chiuso. Gate: `bunx prisma
generate` verde (non richiede connessione DB), `bun run type-check` verde,
  `bun run lint` verde, `bun run test:run` verde (617/617 test, 53 file).
  Porto il task a `in-review`; i criteri di accettazione restano quelli già
  spuntati (il contratto UI non cambia), ma la verifica end-to-end su
  browser/DB reale del bug P0 va rifatta dalla QA dopo che l'owner ha
  applicato la migrazione.
- 2026-07-09 (owner): verificato personalmente l'id super-admin lasciato aperto
  dal dev (`Rl8oe4AGgcYkySapFeo2o5NFPeJy0xFO` in `adminUserIds`, `auth.ts`):
  creato un branch Neon effimero da `main` (progetto `ad_test`), query diretta
  `SELECT id FROM "user" WHERE email='mattia@arcana.it'` → combacia esattamente,
  poi branch eliminato (confermato non più in elenco). Id confermato corretto.
- 2026-07-09 (reviewer): VERDETTO round 2/3 **OK con nit** — bug P0 genuinamente
  risolto. Propagazione cookie corretta (nessuna ricostruzione manuale, Set-Cookie
  del plugin copiati integri); `getSessionContext` senza regressioni sulla firma
  `ImpersonationContext` né sui consumatori (`getEffectiveUserId`/`getAdminUserId`
  invariati); `getAdminUserId` non consumato altrove quindi la rimozione del
  re-check email non ha impatto di sicurezza; endpoint nativi aggiuntivi del
  plugin (set-role/ban-user/...) comunque gated da `adminUserIds`; migrazione
  additiva nullable, nessun lock/downtime atteso; test `impersonation.test.ts`
  confermato genuino (istanza Better Auth in-memory reale, non mock). Cautela
  OBBLIGATORIA (non un giro dev): la migrazione va applicata al DB reale
  **insieme** al deploy del codice, altrimenti rompe il login globale (schema
  Prisma ora seleziona colonne `user.banned/role/...` inesistenti se non
  migrato) — e la QA con cookie jar che aveva trovato il P0 va rifatta dopo il
  fix. Nit non bloccanti: route debug `fake` incoerente col nuovo modello
  (pre-esistente, fuori scope); doppia fonte super-admin (email in
  `authorization.ts` vs id in `auth.ts`, già documentata).
- 2026-07-09 (owner): codice ispezionato personalmente (auth.ts, impersonation.ts,
  route start/end, impersonation.test.ts) — corrisponde esattamente al verdetto
  del reviewer, nessuna discrepanza trovata. Mergiato in
  `integration/fase-1-backend` (`--no-ff`, dopo aver committato a parte il log
  della scoperta QA del P0, non ancora committato in precedenza). Prossimo
  passo: applicare la migrazione su branch Neon effimero e far ripetere alla QA
  il roundtrip con cookie jar che aveva trovato il bug, prima del `done`.
- 2026-07-09 (qa, round 2): migrazione applicata e roundtrip P0 ri-verificato,
  entrambi PASS.
  1. Migrazione (`20260709160000_add_better_auth_admin_plugin_fields`):
     applicata su branch Neon effimero `qa-ephemeral-t010-migration` (progetto
     `ad_test`/`shiny-scene-57228836`, da `main`, via Neon Management API con
     `NEON_API_KEY`). `bunx prisma migrate status` prima dell'apply: solo questa
     migrazione risultava pendente (le altre 6 già presenti su `main`).
     `bunx prisma migrate deploy` -> applicata pulita, registrata in
     `_prisma_migrations`. Post-apply: `bunx prisma migrate status` -> "Database
     schema is up to date!"; `bunx prisma migrate diff --from-schema-datamodel
prisma/schema.prisma --to-url $DIRECT_URL --script` -> "This is an empty
     migration" (nessun drift, colonne `user.role/banned/banReason/banExpires` e
     `session.impersonatedBy` presenti e allineate). `psql` non disponibile
     nell'ambiente di questo agente: ispezione fatta via `prisma migrate diff`
     invece di `\d`, equivalente ai fini della verifica (diff vuoto = schema e DB
     coincidono esattamente).

  2. Roundtrip cookie jar (stesso metodo del round precedente: `.env.local`
     temporaneo, gitignored, rimosso a fine giro, puntato al branch effimero,
     `bun dev -p 3101`, `curl -c/-b` cookie jar reale):
  - Login `mattia@arcana.it` -> 200, jar salva un `better-auth.session_token`
    in formato firmato `token.signature`.
  - `GET /api/me/capabilities` (baseline) -> 200
    `{"isSuperAdmin":true,"isDirettivoMember":true,"headMasterCampaignSlugs":[]}`.
  - `POST /api/admin/impersonate/start
{"targetUserId":"2TB2fkUidcIWLTjsOuguIsTy7u8lZmyt"}` (no-quota@ad.com) ->
    200 `{"success":true,"targetUser":{...,"email":"no-quota@ad.com"}}`.
    `Set-Cookie` osservato per `better-auth.session_token` con suffisso
    `.signature` presente (era il sintomo esatto del bug P0, ora assente).
    Cookie del plugin nativo `better-auth.admin_session` (nome diverso dal
    vecchio custom `admin_session_token`) anch'esso firmato.
  - Col jar aggiornato: `GET /api/admin/impersonate/status` -> 200
    `{"isImpersonating":true,"activeUser":{...email:"no-quota@ad.com"},
"adminUser":{...email:"mattia@arcana.it"}}` (prima 401). `GET
/api/me/capabilities` -> 200 `{"isSuperAdmin":false,
"isDirettivoMember":false,"headMasterCampaignSlugs":[]}` (prima 401,
    riflette correttamente il target). `GET /api/auth/get-session` -> 200 con
    `user.email:"no-quota@ad.com"` e
    `session.impersonatedBy:"Rl8oe4AGgcYkySapFeo2o5NFPeJy0xFO"` (id del
    super-admin) — prima tornava `null`.
  - `POST /api/admin/impersonate/end` col jar -> 200 `{"success":true}`
    (prima 400). `Set-Cookie` di `better-auth.session_token` risultato
    identico al cookie ottenuto al login originale (sessione admin
    ripristinata esattamente, non ricreata). Dopo `end`: `GET
/api/me/capabilities` -> 200 `{"isSuperAdmin":true,...}` (ripristinato);
    `GET /api/admin/impersonate/status` -> 200
    `{"isImpersonating":false,"activeUser":{...mattia...},"adminUser":null}`.
  3. Sicurezza ri-confermata (invariata rispetto al giro precedente): `POST
/api/admin/impersonate/start` come `no-quota@ad.com` (utente normale,
     target = mattia) -> 403 `{"error":"Permessi insufficienti"}`; stesso
     endpoint da super-admin con `targetUserId` = se stesso -> 400
     `{"error":"Non puoi impersonare te stesso"}`.

  4. Cleanup: dev server fermato, `.env.local` temporaneo rimosso, branch
     Neon effimero `qa-ephemeral-t010-migration` (`br-gentle-fire-a9h0ap3i`)
     eliminato via API — confermato non più in elenco (l'elenco branch mostra
     solo `main` e `backup-pre-reset-t001`, pre-esistente).

  Gate combinati rilanciati su `integration/fase-1-backend`: `bun run
test:run` -> 624/624 verdi (55 file), nessuna regressione.

  Verdetto: bug P0 genuinamente chiuso a runtime reale, migrazione applicabile
  senza drift. Criteri 1-3 ripristinati a `[x]` con questa prova. Il rendering
  visivo del banner in un browser reale non è stato osservato in questo giro
  (fuori dai mezzi di questo QA, richiederebbe ispezione umana), ma la sua
  unica dipendenza runtime (i dati di `/status`) è ora confermata corretta ed
  è già coperta da `ImpersonationToolbar.test.tsx`. `status` lasciato
  invariato (`in-review`) come da istruzione: la chiusura a `done` spetta
  all'owner.

- 2026-07-09 (owner): QA round 2 su DB reale OK — migrazione applicata su branch
  Neon effimero (`prisma migrate deploy`, nessun drift, `_prisma_migrations`
  aggiornato), roundtrip cookie jar completo confermato (start→cookie firmato
  →status 200 con dati del target→capabilities riflette il target→end→
  ripristino admin), sicurezza riconfermata, 624/624 test verdi. Tutti i
  criteri spuntati. Ciclo dev↔reviewer chiuso in 2 round (round 1 nit UI,
  round 2 bug P0 backend via migrazione al plugin admin di Better Auth) —
  entro il tetto di 3. Condizioni §6 tutte soddisfatte. status → done.
  Follow-up tracciati (non bloccanti): route debug `fake` da ripulire
  (incoerente col nuovo modello, pre-esistente); doppia fonte super-admin
  (email in `authorization.ts` vs id in `auth.ts`) da tenere sincronizzata
  manualmente se l'identità del super-admin cambia.
