---
id: "006"
title: "Profilo utente: visualizzazione e modifica"
status: done
priority: P1
assignee: reviewer
branch: task/006-profilo-utente-view-edit
trello: ""
created: 2026-07-07
updated: 2026-07-07T14:18
---

## Obiettivo

Permettere all'utente di leggere e aggiornare i propri dati di profilo. `User`
(Better Auth) e `PersonalData` esistono già a schema; serve l'API.

## Scope

Incluso:

- Endpoint per leggere il profilo dell'utente autenticato e aggiornarne i campi
  (nome, email, password, avatar), passando da Better Auth dove opportuno per
  email/password.
- Validazione Zod; un utente può leggere/modificare **solo** il proprio profilo.
- Test.

Escluso:

- Verifica email e reset password (non decisi per la Fase 1; eventuale task a parte).

## Criteri di accettazione

- [x] GET profilo dell'utente autenticato.
- [x] Update di nome / email / password / avatar con validazione.
- [x] Un utente non può leggere/modificare il profilo di un altro; test.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi (vedi nota
      sotto sui problemi pre-esistenti non introdotti da questo task).

## Note / Log

- 2026-07-07 (owner): indipendente dagli altri task. Card Trello di origine:
  "Profilo utente: visualizzazione e modifica".
- 2026-07-07 (dev): inizio implementazione su branch `task/006-profilo-utente-view-edit`
  (worktree separato in `../core-task-006` per non toccare le modifiche non
  committate di T-1 su `prisma/schema.prisma`, presenti nel worktree condiviso).
- 2026-07-07 (dev): implementati gli endpoint e portato lo stato a `in-review`.
  Dettagli:
  - `GET /api/profile` — profilo dell'utente in sessione (`user` da Better
    Auth + `personalData` dal repository, `null` se non ancora compilata).
    La UI esistente (`(dashboard)/dashboard/profile/page.tsx`, già su `main`)
    consuma già questo endpoint.
  - `PUT /api/profile/update` — aggiorna nome/avatar (`auth.api.updateUser`),
    email (`auth.api.changeEmail`, solo se cambiata) e dati anagrafici
    (repository `upsertPersonalData`, richiede tutti i campi insieme o
    nessuno). Contratto compatibile con la UI esistente, che invia sempre
    l'intero form (i campi anagrafici vuoti vengono trattati come "non
    inviati", non come errore).
  - `POST /api/profile/password` — cambio password via
    `auth.api.changePassword` (nuovo endpoint, non ancora agganciato alla UI
    che ha il pulsante disabilitato "Funzionalità in arrivo").
  - `src/lib/auth.ts`: abilitato `user.changeEmail` con
    `updateEmailWithoutVerification: true` (nessun flusso di verifica email
    in Fase 1, fuori scope per questo task).
  - Nuovo repository `src/lib/repositories/personalData.repository.ts`
    (`getPersonalDataByUserId`, `upsertPersonalData`) + tipi in
    `repositories/types.ts` + voce in `repositories/README.md`.
  - Nuovo `src/lib/validations/profile.ts` (Zod) per GET/PUT/password.
  - Isolamento multi-tenant: nessun endpoint accetta uno `userId`/target
    esterno, opera sempre su `session.user.id`; i test verificano sia che le
    query siano sempre scoped al proprio id, sia che un `userId` malevolo nel
    body venga ignorato.
  - Test aggiunti: `src/lib/repositories/personalData.repository.test.ts`,
    `src/app/api/profile/__tests__/route.test.ts`,
    `src/app/api/profile/update/__tests__/route.test.ts`,
    `src/app/api/profile/password/__tests__/route.test.ts` (31 test totali).
  - Verifica: `bun run test:run` → 374/374 verdi (era 343 su `main`).
    `bun run type-check` e `bun run lint` mostrano solo errori **preesistenti
    su `main`** (stesso identico pattern `as Mock`/`import/order` già presente
    in `characters`, `events`, `memberships` route test e nei repository test
    con `prismaMock`) — confermato confrontando l'output prima/dopo le
    modifiche su un worktree pulito. Nessun file toccato da questo task
    introduce nuove categorie di errore; i file sorgente nuovi
    (route handler, repository, validations) sono puliti su entrambi i
    comandi.
  - Come verificare: dal branch, `bun install && bunx prisma generate`, poi
    `bun run test:run` (o mirato: `bunx vitest run src/app/api/profile
src/lib/repositories/personalData.repository.test.ts`).
- 2026-07-07 (reviewer): review su commit 61f20ab. IDOR ben coperto (userId
  sempre da sessione, test presenti), repositories-first e Zod al bordo
  rispettati, 31 test verdi. RIMANDATO al dev per 3 major:
  (1) `/api/profile/password` chiama `auth.api.changePassword` server-side,
  bypassando il rate-limit HTTP di Better Auth -> brute-force di
  `currentPassword` possibile (escalation da sessione dirottata);
  (2) `changeEmail` non richiede la password corrente e, con
  `updateEmailWithoutVerification`, cambia l'email di login all'istante:
  un admin in impersonation (o una sessione dirottata) può riscrivere
  silenziosamente l'email dell'utente. Valutare re-auth password e/o blocco
  in impersonation (le route usano `auth.api.getSession`, non
  `getSessionContext`);
  (3) su email già in uso Better Auth ritorna `{status:true}` SENZA cambiare
  nulla: la route risponde comunque `success:true` e `upsertPersonalData`
  scrive la nuova email in `PersonalData` -> divergenza da `User.email` e
  successo fuorviante. Il test "email already in use" mocka un reject che non
  riflette il comportamento reale di Better Auth.
  Note minori: update multi-step non atomico; utenti con `emailVerified:true`
  ricevono 400 sul cambio email; `updateEmailWithoutVerification` è globale
  (nota, non blocco); type-check/lint rossi ma per debt preesistente
  repo-wide (i nuovi file seguono lo stesso pattern prismaMock).
- 2026-07-07 (dev): correzione post-review, sullo stesso branch (worktree
  `../core-task-006`). Applicati i 3 MAJOR e i minori indicati dalla review.
  Dettagli:
  - **MAJOR #1 (rate-limit bypassato su `/api/profile/password`)**: aggiunto
    `src/lib/auth.ts` → `callAuthEndpoint(request, path, body)`, che
    instrada l'operazione attraverso `auth.handler` (lo stesso router HTTP
    usato dal catch-all `api/auth/[...all]`) invece di chiamare
    `auth.api.changePassword`/`changeEmail`/`verifyPassword` direttamente:
    solo passando dal router si applica il rate-limit nativo di Better Auth
    (3 richieste/10s per IP su `/change-password` e `/change-email`; ho
    aggiunto la stessa regola per `/verify-password` via
    `rateLimit.customRules`, non coperta dalle regole di default). Il
    rate-limit è ora abilitato esplicitamente (`rateLimit.enabled: true`)
    invece di dipendere implicitamente da `NODE_ENV`. Usato in
    `password/route.ts` e nel ramo di cambio email di `update/route.ts`.
    Aggiunto `readAuthEndpointResponse` per uniformare gli errori a
    `APIError` (stesso pattern di gestione errori già in uso). Nuovi test
    su `src/lib/auth.test.ts` (`callAuthEndpoint`/`readAuthEndpointResponse`,
    con `vi.spyOn(auth, 'handler')`).
  - **MAJOR #2 (impersonation + email senza re-auth)**: entrambe le route
    ora usano `getSessionContext(request.headers)` invece di
    `auth.api.getSession` (che onora anche il cookie admin). Il cambio
    password è **sempre** bloccato (403) durante un'impersonificazione; il
    cambio email è bloccato allo stesso modo **solo quando viene
    effettivamente richiesto** (email diversa da quella attiva) — nome,
    avatar e dati anagrafici restano modificabili da un admin che sta
    impersonando, per non rompere il supporto legittimo. Il cambio email
    richiede ora `currentPassword`, verificata via `/verify-password`
    (anch'essa instradata tramite `callAuthEndpoint`) **prima** di chiamare
    `/change-email`. Nota: la UI attuale (`(dashboard)/dashboard/profile/page.tsx`)
    non raccoglie ancora `currentPassword` (il pulsante password è già
    "Funzionalità in arrivo", fuori scope) — un cambio email dalla UI
    esistente ora fallisce con 400 finché non verrà aggiunto un campo
    dedicato; documentato qui come follow-up, non silenziato.
  - **MAJOR #3 (email denormalizzata su PersonalData)**: rimosso il campo
    `email` da `PersonalData` (`prisma/schema.prisma`, era già presente
    prima di T-6 ma usato solo da questo feature) — `User.email` resta
    l'unica fonte di verità. Aggiornati `UpsertPersonalDataInput`
    (`repositories/types.ts`), il repository, i fixture di test
    (`prisma-fixtures.ts`) e i test. Scritta a mano la migrazione
    `prisma/migrations/20260707120000_personal_data_drop_email/migration.sql`
    (`ALTER TABLE "PersonalData" DROP COLUMN "email"`) e rigenerato il
    client con `bunx prisma generate` — **non** verificata con
    `prisma migrate dev`/`db push` contro un DB reale: questo worktree non
    ha `DIRECT_URL` in `.env` e l'accesso diretto al DB condiviso è
    comunque limitato in questo ambiente (stesso vincolo già loggato su
    T-1). Da validare su un branch Neon effimero prima del merge. Corretto
    anche il test in `update/__tests__/route.test.ts` che mockava un
    `reject` irrealistico per "email già in uso": Better Auth risponde
    `{status:true}` senza lanciare in quel caso (anti-enumeration); il test
    ora verifica che la route ritorni comunque 200.
  - **MINOR (`image: ""` azzera l'avatar)**: `emptyStringToUndefined`
    applicato anche a `name`/`image` in `updateProfileSchema`. Per non
    rompere la funzione "Rimuovi immagine" già funzionante in
    `profile/page.tsx` (che inviava `image: ""` per azzerare l'avatar),
    quel flusso ora invia `image: null` (valore esplicito, distinto da
    "non inviato"): aggiornati `FormData.image` a `string | null`, il
    nuovo handler `removeAvatar` e i due usi di `src={form.image}` con
    `?? undefined`.
  - **MINOR (update non atomico)**: le operazioni sensibili
    (verifica password + cambio email) vengono eseguite **prima** di
    nome/avatar e dati anagrafici, così se falliscono (caso più probabile,
    es. password sbagliata) non è ancora stato scritto nulla. Non è stata
    introdotta una transazione reale: Better Auth e il repository
    `PersonalData` restano due scritture indipendenti, quindi un fallimento
    dopo il cambio email (es. `auth.api.updateUser` che fallisce per un
    motivo imprevisto) può ancora lasciare uno stato parziale — accettato
    come rischio residuo e documentato, non risolvibile senza una
    transazione condivisa tra i due sistemi (fuori scope).
  - Ignorati come da indicazione: validazione formato `ssn`, caso
    `emailVerified: true` (il flusso "email verificata → invia conferma"
    di Better Auth resta fuori scope, invariato da T-6).
  - Test: aggiornati/aggiunti su `src/lib/auth.test.ts`,
    `src/app/api/profile/password/__tests__/route.test.ts` (riscritto:
    mock di `callAuthEndpoint`/`readAuthEndpointResponse` +
    `getSessionContext`, nuovo test 403 impersonation),
    `src/app/api/profile/update/__tests__/route.test.ts` (riscritto:
    stesso schema di mock, nuovi test su impersonation, conferma password
    per cambio email, ordine verify→change-email, niente scrittura parziale
    su fallimento, niente `email` nel payload di `PersonalData`, avatar
    null vs stringa vuota, forwarding del `set-cookie`),
    `src/lib/repositories/personalData.repository.test.ts` e
    `prisma-fixtures.ts` (rimosso `email` da input/fixture).
  - Verifica: `bun run test:run` → 387/387 verdi (era 374 prima di questa
    correzione). `bun run type-check` → 216 errori, tutti preesistenti e
    non nei file toccati da questo task (erano 235 prima: la riscrittura
    dei test di `password`/`update` ha eliminato la maggior parte dei cast
    `as Mock` contro tipi reali di Better Auth citati nella review
    precedente; ne restano 2 in `update/__tests__/route.test.ts` per
    `auth.api.updateUser as Mock`, stesso pattern preesistente altrove nel
    repo). `bun run lint` → nessun errore nei file toccati da questo task
    (l'unico errore in `src/lib/auth.test.ts` è preesistente, riga
    invariata dalla versione originale). `bunx prisma generate` eseguito
    con successo; `bunx prisma validate`/`migrate dev` non eseguibili in
    questo worktree (manca `DIRECT_URL`, DB reale non raggiungibile).
  - Come verificare: dal branch (worktree `../core-task-006`),
    `bun install && bunx prisma generate`, poi `bun run type-check`,
    `bun run lint`, `bun run test:run` (o mirato:
    `bunx vitest run src/app/api/profile src/lib/repositories/personalData.repository.test.ts src/lib/auth.test.ts`).
    Prima del merge: applicare la migrazione
    `20260707120000_personal_data_drop_email` su un DB reale (branch Neon
    effimero) e ri-verificare `bunx prisma migrate dev`/`db push`.
- 2026-07-07T10:50 (reviewer): review dei fix post-review + tentativo di merge in
  `integration/fase-1-backend` (dopo T-1 e T-7). **I 3 MAJOR sono risolti
  correttamente**: (1) rate-limit — le operazioni sensibili passano ora da
  `callAuthEndpoint` → `auth.handler` (router HTTP di Better Auth), con
  `rateLimit.enabled: true` + regola custom su `/verify-password`; (2)
  impersonation — password sempre bloccata (403) durante impersonificazione,
  cambio email bloccato quando richiesto e con conferma `currentPassword`
  verificata via `/verify-password` prima di `/change-email`, il tutto via
  `getSessionContext`; le route operano solo su `context.activeUser.id`, nessun
  `userId` esterno accettato (isolamento OK); (3) denormalizzazione — `email`
  rimossa da `PersonalData`, `User.email` unica fonte di verità, migrazione
  `DROP COLUMN "email"` corretta. **Il merge NON è stato completato: blocker.**
  Motivo bloccante:
  - **[BLOCKER produzione] `src/lib/auth.ts:96`** — in `readAuthEndpointResponse`,
    `new APIError(response.status, data)` passa un `number` dove `APIError`
    (`@better-auth/core`) richiede uno `Status` **stringa** (es. `"BAD_REQUEST"`):
    `error TS2345`. Non è indotto dal merge (auth.ts è toccato solo da T-6,
    APIError viene da better-auth invariato); era mascherato dai ~216 errori
    type-check pre-esistenti sul branch T-6, ma sul branch di integrazione — dove
    T-7 ha portato il type-check a **0 errori** — diventa una regressione visibile
    e rompe il gate `bun run type-check`. Va corretto in produzione (es. mappare
    lo status numerico alla chiave stringa attesa, o `APIError.fromStatus`, o
    costruire l'errore in altro modo). Fuori dal mandato del reviewer correggere
    codice sorgente di produzione → rimandato al dev.
    Inoltre, dopo il merge con T-7 (che ha ristrutturato l'infrastruttura mock),
    questi file di test di T-6 non compilano più e vanno adeguati (test-only,
    indotti dalla nuova infra T-7 — non bloccanti di per sé ma da sistemare insieme
    al blocker sopra):
  - `src/lib/repositories/personalData.repository.test.ts` (5× TS2345): passa
    `prismaMock` dove ora serve `prismaClient` (split introdotto da T-7 in
    `src/test/mocks/prisma.ts`). Nota: T-7 rende `prismaMock` la vista
    `DeepMockProxy<OmitGroupBy<PrismaClient>>` per configurare/asserire, e
    `prismaClient` (tipato `PrismaClient`) da passare alle funzioni SUT.
  - `src/app/api/profile/__tests__/route.test.ts` (7× TS2352) e
    `src/app/api/profile/update/__tests__/route.test.ts` (2× TS2352): cast
    `(auth.api.X as Mock)` non più tollerati; usare `as unknown as Mock` (stesso
    pattern che T-7 ha già applicato in `memberships`/`characters`/`events`).
    Il `personalData: createMockModel()` aggiunto da T-6 a `src/test/mocks/prisma.ts`
    non serve più: il `mockDeep<PrismaClient>()` di T-7 copre `personalData`
    automaticamente.
    Azione richiesta al dev: **rebased/mergiare `integration/fase-1-backend` in
    `task/006`** (per ereditare l'infra mock di T-7 e i campi fixture di T-1),
    correggere il blocker di produzione in `auth.ts`, adeguare i 3 file di test
    sopra, e riportare `type-check`/`lint`/`test:run` verdi. Poi tornare in
    `in-review`. NB: la migrazione di T-6 va rinominata con timestamp successivo a
    quella di T-1 (collisione `20260707120000`): in integrazione era stata
    provvisoriamente rinominata `20260707130000_personal_data_drop_email`, ma il
    merge è stato annullato, quindi la cartella su questo branch è ancora
    `20260707120000_personal_data_drop_email` → rinominarla a
    `20260707130000_personal_data_drop_email`.
- 2026-07-07 (dev): ripresa dopo bounce reviewer, eseguo la checklist: merge di
  `integration/fase-1-backend`, fix blocker `auth.ts`, adeguamento test all'infra
  T-7, rename migrazione, riverifica dei 3 major post-merge e gate.
- 2026-07-07T14:10 (dev): completata la checklist del reviewer, riportato lo
  stato a `in-review`. Dettagli:
  - **Merge** di `integration/fase-1-backend` in `task/006` (commit
    `Merge branch 'integration/fase-1-backend' into
task/006-profilo-utente-view-edit`). Conflitti risolti: - `.task/006-profilo-utente-view-edit.md`: tenuta la versione HEAD
    (completa) del Log, reintegrata solo la voce di review round-1 (su
    commit `61f20ab`) presente sullo stub di `integration` ma mancante su
    questo branch — inserita nell'ordine cronologico corretto, prima della
    voce "correzione post-review". - `src/test/mocks/prisma.ts`: presa per intero la versione di
    `integration` (infra T-7: `prismaMock` = vista
    `DeepMockProxy<OmitGroupBy<PrismaClient>>` per configurare/asserire,
    `prismaClient` tipato `PrismaClient` per i SUT). Il vecchio
    `personalData: createMockModel()` di T-6 è sparito con la sostituzione
    (ridondante: `mockDeep<PrismaClient>()` copre `personalData` da solo). - `src/test/helpers/prisma-fixtures.ts`: uniti gli import (aggiunti
    `AssociationRole`, `UserStatus`, `CampaignType` di T-1, mantenuto
    `PersonalData` di T-6), `mockUser` ora con `associationRole`/`status`
    (T-1), `mockCampaign` con `type` (T-1); `PersonalData` resta senza
    `email` (major T-6 #3, invariato). - `src/lib/auth.test.ts`: preso per intero HEAD (verificato con `diff`
    che è un superset di `integration` — stessa fix `as unknown as
Record<string, unknown>` più i test di `callAuthEndpoint`/
    `readAuthEndpointResponse` aggiunti da T-6, assenti su `integration`
    perché T-6 non era ancora mergiato). - `bun install` (nessuna modifica) + `bunx prisma generate` OK.
  - **Fix blocker produzione `src/lib/auth.ts`**: `readAuthEndpointResponse`
    passava `response.status` (tipo `number` generico) come primo argomento
    di `APIError`, che richiede un literal status ("BAD_REQUEST"/404/...);
    da qui il `TS2345` segnalato dal reviewer. Corretto con una mappa
    locale `API_ERROR_STATUS_KEYS` (status numerico → chiave stringa per i
    codici che gli endpoint usati da questo file possono restituire:
    400/401/403/404/409/422/429/500) e passando comunque il numero reale
    come `statusCode` esplicito (4° argomento del costruttore, quello che i
    route handler leggono via `error.statusCode`): nessun cast non sicuro,
    e lo status HTTP reale non va perso nemmeno per un codice non presente
    in mappa (fallback `INTERNAL_SERVER_ERROR` come chiave, `statusCode`
    comunque corretto).
  - **Adeguamento test all'infra T-7**:
    - `src/lib/repositories/personalData.repository.test.ts`: importato
      anche `prismaClient`, passato al posto di `prismaMock` in tutte le
      chiamate alle funzioni SUT (`getPersonalDataByUserId`,
      `upsertPersonalData`); `prismaMock` resta usato solo per configurare
      i return value e asserire le chiamate.
    - `src/app/api/profile/__tests__/route.test.ts`: le 7 occorrenze di
      `(auth.api.getSession as Mock)` diventano
      `(auth.api.getSession as unknown as Mock)`.
    - `src/app/api/profile/update/__tests__/route.test.ts`: le 2 occorrenze
      di `(auth.api.updateUser as Mock)` diventano
      `(auth.api.updateUser as unknown as Mock)`.
    - Il `personalData: createMockModel()` di T-6 in
      `src/test/mocks/prisma.ts` era già sparito con la sostituzione
      dell'intero file (vedi merge sopra), nessuna azione aggiuntiva
      necessaria.
  - **Rename migrazione**: `git mv
prisma/migrations/20260707120000_personal_data_drop_email
prisma/migrations/20260707130000_personal_data_drop_email` (timestamp
    successivo a `20260707120000_schema_ruoli_associativi_campagna_oneshot`
    di T-1, niente più collisione). Contenuto SQL invariato, nessun
    riferimento interno al nome della cartella da aggiornare. `bunx prisma
validate`/`migrate dev` non eseguibili in questo worktree (manca
    `DIRECT_URL`, stesso vincolo già loggato più volte su T-1/T-6) — da
    validare su un branch Neon effimero prima del merge in `integration`.
  - **Riverifica dei 3 major post-merge**: tutti ancora corretti, nessuna
    regressione portata dal merge.
    - MAJOR #1 (rate-limit): `password/route.ts` e il ramo di cambio email
      di `update/route.ts` passano ancora da `callAuthEndpoint` →
      `auth.handler`, con `rateLimit.enabled: true` e regola custom su
      `/verify-password` in `src/lib/auth.ts`.
    - MAJOR #2 (impersonation + re-auth email): entrambe le route usano
      ancora `getSessionContext`; password sempre bloccata (403) in
      impersonation, cambio email bloccato quando richiesto e con
      `currentPassword` verificata via `/verify-password` prima di
      `/change-email`.
    - MAJOR #3 (email denormalizzata): `PersonalData` in
      `prisma/schema.prisma` resta senza colonna `email` dopo il merge;
      `User.email` unica fonte di verità.
  - **Gate**: `bun run type-check` → 0 errori. `bun run lint` → 0/0.
    `bun run test:run` → 387/387 verdi (invariato rispetto a prima del
    merge/fix, nessun test rotto né rimosso).
  - Come verificare: dal branch (worktree `../core-task-006`),
    `bun install && bunx prisma generate`, poi `bun run type-check &&
bun run lint && bun run test:run`.
  - **Non mergiato** in `integration/fase-1-backend`/`main`: al merge
    pensa il reviewer. Prima del merge finale resta da validare la
    migrazione rinominata su un branch Neon effimero (`DIRECT_URL`
    mancante in questo worktree).
- 2026-07-07 (reviewer): review round-2 OK + MERGE in
  `integration/fase-1-backend` (`--no-ff`). **I 3 MAJOR del round-1 sono
  realmente chiusi e coperti da test**, non solo dichiarati:
  - MAJOR #1 (rate-limit): `password/route.ts` e il ramo email di
    `update/route.ts` instradano `/change-password`, `/verify-password`,
    `/change-email` via `callAuthEndpoint` → `auth.handler` (router HTTP di
    Better Auth), con `rateLimit.enabled: true` + regola custom
    `/verify-password` in `src/lib/auth.ts`. I test asseriscono il routing
    (`callAuthEndpoint` chiamato / non chiamato) e nessun uso di `auth.api.*`
    diretto per le operazioni sensibili.
  - MAJOR #2 (impersonation + re-auth email): entrambe le route usano
    `getSessionContext(request.headers)`. Password: **sempre** 403 in
    impersonation (test `password/route.test.ts:79`). Email: 403 in
    impersonation quando richiesta (`update/route.test.ts:105`, verifica
    che `callAuthEndpoint` NON venga chiamato) + `currentPassword`
    obbligatoria, verificata via `/verify-password` **prima** di
    `/change-email` (test ordine a `update/route.test.ts:271`). Nome/avatar
    restano modificabili in impersonation (supporto legittimo). Le route
    operano solo su `context.activeUser.id`, nessun `userId` esterno
    accettato (isolamento IDOR confermato).
  - MAJOR #3 (email denormalizzata): `email` rimossa da `PersonalData`
    (schema + repo + `UpsertPersonalDataInput` + fixtures). Test
    `update/route.test.ts:405-406` asserisce che il payload upsert
    (`create`/`update`) NON contenga `email`. Il test "email già in uso"
    ora riflette il comportamento REALE di Better Auth (anti-enumeration:
    `{status:true}` senza throw → route risponde 200), non più un reject
    mockato irrealistico. `User.email` unica fonte di verità: nessuna
    divergenza possibile.
  - **Blocker produzione round-1 (`auth.ts` `APIError`) risolto**:
    verificata la firma reale di `APIError`
    (`better-call`: `(status?, body?, headers?, statusCode?)`); il fix usa
    `API_ERROR_STATUS_KEYS` (number→chiave stringa tipata come
    `ConstructorParameters<typeof APIError>[0]`) e passa lo status HTTP
    reale come 4° arg `statusCode`: type-safe, status reale preservato per
    `error.statusCode` nei route handler. Adeguamento test all'infra T-7
    (`prismaClient` vs `prismaMock`, `as unknown as Mock`) completo.
  - **Migrazione `20260707130000_personal_data_drop_email`**: SQL rivista
    staticamente e CORRETTA — `DROP COLUMN "email"` valido perché la colonna
    è creata da `20250219132349_init_backoffice_model` (`"email" TEXT NOT
NULL`), nessun indice/constraint dedicato su `email` (solo `userId` ha
    unique/index/FK) → nessuna perdita dati oltre alla colonna denormalizzata
    voluta. Timestamp `130000` posteriore a `120000` di T-1 (nessuna
    collisione, ordine corretto). **CONDIZIONE PRE-MERGE-FINALE SU `main`**:
    validazione RUNTIME (`prisma migrate reset` su DB fresco) NON eseguibile
    qui (manca `DIRECT_URL`) — da eseguire dal coordinator/utente su branch
    Neon effimero prima del merge su `main`, come per T-1. Non blocca
    l'integrazione dato che la SQL è staticamente corretta.
  - **Sync T-5**: durante la review integration è avanzata (T-5 mergiato,
    `d528c85`). Mergiato `integration/fase-1-backend` in `task/006`:
    `src/lib/repositories/types.ts` auto-merged pulito (T-5
    `CampaignType`/`UpdateCampaignInput` + T-6 `UpsertPersonalDataInput`
    coesistono), nessun conflitto manuale. Nessuna sovrapposizione con
    `authorization.ts` (non toccato da T-6).
  - **Gate sull'integrato**: `bun run type-check` → 0 errori;
    `bun run lint` → 0/0; `bun run test:run` → 421/421 verdi (387 T-6 + 34
    T-5). Merge `--no-ff` in `integration/fase-1-backend`. Board portato a
    `status: done`.
