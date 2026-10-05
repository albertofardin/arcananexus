---
id: "004"
title: "Guardia quota associativa (Membership OR ruolo associativo idoneo)"
status: done
priority: P1
assignee: reviewer
branch: task/004-guardia-quota-associativa
trello: ""
created: 2026-07-07
updated: 2026-07-08
---

## Obiettivo

Bloccare l'accesso alle campagne agli utenti che non sono in regola con
l'associazione. La guardia passa se l'utente soddisfa **almeno una** condizione:

1. **Quota pagata** — esiste una `Membership` valida per l'anno corrente
   (`Membership` esiste già: `userId`, `year` unique, `paymentId`).
2. **Ruolo associativo idoneo** — l'utente ha un `AssociationRole` (T-1) che dà
   accesso a prescindere dalla quota (es. membri del direttivo: board, treasurer,
   president, ecc.).

## Scope

Incluso:

- Helper/guardia riusabile (in `src/lib/authorization.ts` o affine) che implementa la
  regola "quota valida OR ruolo associativo idoneo".
- Applicarla all'accesso alle campagne dove ha senso.
- Test: utente senza quota e senza ruolo → bloccato; con quota → passa; senza quota
  ma con ruolo associativo idoneo → passa.

Escluso:

- Enforcement banned (fuori Fase 1).
- Definizione flusso di pagamento della quota (solo lettura dello stato Membership).

## Criteri di accettazione

- [x] Definito e documentato **quali `AssociationRole` bypassano la quota** (da
      confermare con l'owner: default = membri del direttivo).
- [x] Guardia che blocca chi non ha né quota valida né ruolo idoneo.
- [x] Test dei tre casi (bloccato / passa per quota / passa per ruolo).
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Note / Log

- 2026-07-07 (owner): dipende da T-1 (AssociationRole) e dal modello `Membership`.
  Card Trello di origine: "Middleware verifica quota associativa". Aperto: elenco
  esatto dei ruoli che bypassano la quota.
- 2026-07-07 (dev): inizio implementazione.
- 2026-07-07 (dev): implementata la guardia in `src/lib/authorization.ts`:
  - `hasAssociationRoleBypass(role)` — puro, vero per i ruoli del direttivo.
    Ruoli idonei al bypass: `board`, `treasurer`, `vice_president`,
    `secretary`, `president`. Esclusi (non idonei di per sé): `registered`,
    `member` (il member paga comunque la quota), come da indicazione
    dell'owner.
  - `hasValidMembershipForYear(prisma, userId, year = anno corrente)` —
    esistenza di una `Membership` per `(userId, year)` via l'unique compound
    `userId_year` già presente a schema.
  - `checkAssociationQuotaAccess(prisma, userId)` — combina le due condizioni
    in OR: legge `associationRole` dell'utente, bypassa se idoneo, altrimenti
    verifica la Membership dell'anno corrente. Nessun controllo su
    `UserStatus.banned` (fuori scope T-4).
    Applicata in `src/app/(dashboard)/dashboard/[campaignSlug]/page.tsx` (home
    della campagna): se l'utente non soddisfa la guardia viene mostrata una
    `EmptyCard` "Tesseramento non in regola" con link a
    `routes.profileMembership()`, invece del contenuto della campagna. Non
    tocca le route API campaign-scoped (`characters`, `events`, ecc.): quel
    livello di enforcement è scope di T-3 (guardia ruolo di progetto), non
    ancora avviato in questo branch — nessun overlap.
    Test aggiunti:
  - `src/lib/authorization.test.ts` — unit test dei 3 casi richiesti
    (bloccato senza quota/ruolo, passa con quota, passa con ruolo idoneo) più
    edge case (utente inesistente, default anno corrente, roster completo dei
    ruoli direttivo) con `prismaMock`.
  - `src/app/(dashboard)/dashboard/[campaignSlug]/__tests__/page.test.tsx` —
    test di integrazione della pagina (notFound senza sessione/campagna,
    vista bloccata quando la guardia fallisce, vista campagna quando passa,
    guardia chiamata con l'userId corretto).
    Gate: `bun run type-check` → 0 errori; `bun run lint` → 0 errori/0 warning;
    `bun run test:run` → 362/362 test verdi (26 file). Nessun residuo aperto
    lato gate.
    Verifica: dal branch `task/004-guardia-quota-associativa`,
    `bun run type-check && bun run lint && bun run test:run`, oppure mirato
    `bun run test:run src/lib/authorization.test.ts` e
    `bun run test:run "src/app/(dashboard)/dashboard/[campaignSlug]/__tests__/page.test.tsx"`.
    Branch: `task/004-guardia-quota-associativa` (non mergiato, pronto per
    review).
- 2026-07-07 (reviewer): review NON superata — 1 blocker. NON mergiato.
  Gate ri-eseguiti nel worktree e verdi (type-check 0, lint 0, test 362/362),
  ma la guardia lascia scoperto l'accesso. Findings:
  - 🔴 BLOCKER — La guardia è applicata solo a
    `src/app/(dashboard)/dashboard/[campaignSlug]/page.tsx` (home campagna).
    Non esiste un `layout.tsx` a livello `[campaignSlug]`: le sottorotte
    `characters/`, `events/`, `settings/`, `[dataSlug]/`, `admin/` sono
    _sibling_ di `page.tsx`, non figlie di un layout, quindi in App Router NON
    eseguono la guardia. Un utente NON in regola può navigare direttamente a
    `/dashboard/<slug>/events` o `/characters` e vedere il contenuto campagna
    (es. `events/page.tsx:64` fa fetch di `/api/events?...` — dati eventi della
    campagna — senza alcun controllo quota). L'obiettivo del task ("bloccare
    l'accesso alle campagne") non è raggiunto: la guardia nasconde solo la home.
    La motivazione del dev ("l'enforcement sulle sottorotte è scope di T-3") è
    errata sull'asse quota: T-3 verifica il _ruolo di campagna_ (Grant), asse
    ortogonale alla quota. Un utente CON grant ma SENZA quota pagata sarebbe
    lasciato passare da T-3 e dovrebbe essere bloccato da T-4. Quindi T-3 non
    assorbe T-4. Fix consigliato: spostare la guardia in un
    `layout.tsx` Server Component a livello `[campaignSlug]` (che carica la
    campagna via slug e chiama `checkAssociationQuotaAccess`), così da coprire
    home + tutte le sottorotte con un unico punto; in alternativa replicarla in
    ogni sottorotta (più fragile). Il layer API campaign-scoped resta comunque
    da presidiare (quello sì lecito rimandare a T-3, ma non la copertura pagine).
  - 🟡 MINOR — `page.tsx:60` usa `auth.api.getSession` + `session.user.id`
    invece di `getSessionContext`/`getEffectiveUserId` (`src/lib/impersonation.ts`).
    Funzionalmente OK (l'impersonation scambia il cookie session_token, quindi
    `getSession` restituisce già l'utente impersonato), ma devia dal pattern
    documentato in CLAUDE.md. Allineare per coerenza.
  - 🟡 MINOR — `hasValidMembershipForYear` usa `new Date().getFullYear()` con
    orario locale del server (`authorization.ts:155`). A cavallo di Capodanno,
    con server in UTC vs timezone Europe/Rome, l'anno potrebbe divergere per
    poche ore. Edge case; valutare di ancorare al fuso del progetto.
  - 💡 SUGGERIMENTO — `checkAssociationQuotaAccess` interroga `prisma.user`/
    `prisma.membership` direttamente in `authorization.ts`. Coerente con lo
    stile esistente del file (query su `grant` già inline) e accetta `prisma`
    come primo arg, quindi accettabile; valutabile un `membership.repository`
    per `hasValidMembershipForYear`.
  - QUESTIONE PER OWNER (non blocker) — elenco ruoli bypass quota
    (`board, treasurer, vice_president, secretary, president`; esclusi
    `registered`, `member`): interpretazione ragionevole di "direttivo" e
    coerente col default del task, ma è una decisione di policy — da confermare.
  - Nota merge: non mergiato, quindi nessuna sincronizzazione con T-5 necessaria
    ora; alla ripresa il dev dovrà riallineare `authorization.ts`/`.test.ts` con
    integration se nel frattempo T-5 (isOrganizationHeadMaster) è entrato.
    Esito: status → in-progress, assignee dev. Branch lasciato al dev.
- 2026-07-07 (dev): ripresa dopo review — risolto il blocker e i due minor.
  - BLOCKER risolto: creato
    `src/app/(dashboard)/dashboard/[campaignSlug]/layout.tsx` (Server
    Component). Il layout risolve l'utente effettivo con
    `getEffectiveUserId` (impersonation-aware), carica la campagna via slug
    (`notFound()` se assente) e chiama `checkAssociationQuotaAccess` una sola
    volta: se fallisce mostra la `EmptyCard` "Tesseramento non in regola" con
    link al tesseramento al posto dei `children`, altrimenti renderizza
    `children` invariati. Essendo un layout, copre home **e tutte le
    sottorotte** (`characters/`, `events/`, `settings/`, `[dataSlug]/`,
    `admin/` e le loro sotto-pagine), che in App Router sono figlie di questo
    segmento. `page.tsx` è stato riportato alla sola responsabilità di
    caricare/renderizzare la campagna (la guardia ora vive esclusivamente nel
    layout, niente più doppio controllo sessione+quota lì).
  - MINOR risolto (pattern impersonation): il layout usa
    `getEffectiveUserId(headers)` da `src/lib/authorization.ts`
    (impersonation-aware) invece di `auth.api.getSession` +
    `session.user.id`; `page.tsx` non necessita più di alcun accesso a
    sessione/utente (rimosso).
  - MINOR risolto (fuso orario anno associativo): aggiunta
    `getCurrentAssociationYear(referenceDate?)` in `authorization.ts`, che
    ancora l'anno al fuso `Europe/Rome` (via `Intl.DateTimeFormat`) invece che
    all'ora locale/UTC del server; usata come default in
    `hasValidMembershipForYear`. Aggiunto test dedicato che verifica
    l'ancoraggio su un istante di Capodanno (31/12 23:30 UTC → anno 2026 a
    Roma, non 2025 come farebbe `Date.getUTCFullYear()`).
  - Ruoli bypass quota: lasciati invariati (`board`, `treasurer`,
    `vice_president`, `secretary`, `president`; esclusi `registered`,
    `member`) — policy confermata dall'owner, non più punto aperto.
  - Test aggiornati/aggiunti:
    - `src/lib/authorization.test.ts` — nuovo describe
      `getCurrentAssociationYear` (2 casi: ancoraggio Europe/Rome vs
      UTC/locale su Capodanno, default sull'istante corrente); i test di
      `hasValidMembershipForYear`/`checkAssociationQuotaAccess` che
      assumevano `new Date().getFullYear()` ora usano
      `getCurrentAssociationYear()`.
    - `src/app/(dashboard)/dashboard/[campaignSlug]/__tests__/layout.test.tsx`
      (nuovo) — copre esplicitamente il blocker: notFound senza utente
      effettivo, notFound senza campagna, **blocco di un marker che simula il
      contenuto di una sottorotta (`events`) quando la guardia fallisce**,
      rendering dello stesso marker quando la guardia passa, chiamata della
      guardia con l'userId effettivo (impersonation-aware).
    - `src/app/(dashboard)/dashboard/[campaignSlug]/__tests__/page.test.tsx`
      — semplificato: solo notFound su campagna assente e rendering felice,
      dato che la guardia non vive più qui.
      Gate: `bun run type-check` → 0 errori; `bun run lint` → 0 errori/0 warning;
      `bun run test:run` → 367/367 test verdi (27 file).
      Verifica: dal branch `task/004-guardia-quota-associativa`,
      `bun run type-check && bun run lint && bun run test:run`, oppure mirato
      `bun run test:run src/lib/authorization.test.ts` e
      `bun run test:run "src/app/(dashboard)/dashboard/[campaignSlug]/__tests__"`.
      Non mergiato. Pronto per una nuova review.
- 2026-07-08 (reviewer): secondo giro — i 3 rilievi del primo giro sono
  RISOLTI, ma emerge 1 nuovo blocker. NON mergiato. Gate ri-eseguiti nel
  worktree e verdi: type-check 0 errori, lint 0 errori/0 warning,
  test:run 367/367 (27 file) — numeri del dev confermati.
  Verificato risolto dal giro precedente:
  - ✅ Blocker sottorotte: creato
    `src/app/(dashboard)/dashboard/[campaignSlug]/layout.tsx` (Server
    Component). Confermato che le cartelle `characters/`, `events/`,
    `settings/`, `[dataSlug]/`, `admin/` (+ `admin/roles`, `admin/downtime`,
    `events/[eventId]`, `characters/[id]`) sono figlie di questo segmento e
    quindi coperte dal layout. Quando la guardia fallisce il layout ritorna la
    `EmptyCard` SENZA renderizzare `{children}`: i Server Component delle
    sottopagine non vengono eseguiti (nessun fetch/leak server-side). Il layer
    API campaign-scoped resta scoperto ma è esplicitamente scope T-3: coerente
    con quanto dichiarato, non blocker qui.
  - ✅ Minor impersonation: il layout usa `getEffectiveUserId(headers)`
    (via `getSessionContext`), impersonation-aware; `page.tsx` non tocca più
    la sessione. Test copre l'userId effettivo.
  - ✅ Minor fuso orario: `getCurrentAssociationYear(referenceDate?)` ancorata
    a `Europe/Rome` via `Intl.DateTimeFormat("en-CA")`, con test su Capodanno
    (31/12 23:30 UTC → 2026). Usata come default in `hasValidMembershipForYear`.
  - ✅ Ruoli bypass: `board, treasurer, vice_president, secretary, president`;
    esclusi `registered, member`. Implementato esattamente così, sensato come
    "direttivo".
  - ✅ Copertura test `layout.tsx`: notFound (no utente / no campagna), blocco
    del marker sottorotta quando la guardia fallisce, rendering quando passa,
    guardia chiamata con l'userId effettivo. Adeguata.
    Finding BLOCCANTE (nuovo):
  - 🔴 BLOCKER — `checkAssociationQuotaAccess` (`src/lib/authorization.ts:187`)
    NON prevede alcun bypass per il super-admin, e la guardia è ora l'unico gate
    di accesso alle campagne (layout `[campaignSlug]`). Il default di
    `User.associationRole` è `registered` (schema.prisma:22), che NON bypassa;
    nessun seed/codice assegna a `mattia@arcana.it` un ruolo direttivo né una
    Membership. Conseguenza: un super-admin SENZA `Membership` per l'anno
    corrente (stato di default, es. a inizio anno prima del proprio rinnovo, o
    in un ambiente fresco) viene BLOCCATO su TUTTE le campagne, incluse le
    pagine di amministrazione (`admin/roles`, `admin/downtime`). Contraddice il
    requisito di verifica ("super-admin continua a vedere il contenuto
    normalmente") e diverge dal trattamento god-mode del super-admin nel resto
    del codice (`requireSuperAdmin`, impersonation). Fix consigliato: in
    `checkAssociationQuotaAccess` aggiungere `email: true` alla `select` già
    presente e short-circuitare con `isSuperAdmin(user.email)` prima del check
    quota (fix minimo, l'utente è già caricato). Nota: è anche una decisione di
    policy — se l'owner conferma che il super-admin DEVE essere soggetto a
    quota, il codice è accettabile as-is; in tal caso declassare a non-blocker.
    Note minori / non bloccanti:
  - 🟡 `layout.tsx:37` — con utente non autenticato (`getEffectiveUserId`
    null) si chiama `notFound()` (404) invece di redirect a `/login`. Il
    `middleware.ts` intercetta già a monte gli utenti non autenticati, quindi
    è una difesa in profondità; il 404 è solo un fallback raro. Accettabile.
  - 💡 `checkAssociationQuotaAccess` interroga `prisma.user`/`prisma.membership`
    inline (coerente con lo stile di `authorization.ts`); valutabile in futuro
    un `membership.repository`. Non bloccante.
    Esito: status → in-progress, assignee dev. Merge (owner) solo dopo OK pulito.
- 2026-07-08 (owner): assegnato al reviewer per il secondo giro (blocker
  precedente risolto con layout server-side a livello `[campaignSlug]`, più i
  2 minor). Se la review è pulita, il merge in `integration/fase-1-backend` lo
  eseguo io (owner), non il reviewer — per coerenza con il processo attuale
  (nota: il `README.md` di `.task/` riporta ancora la vecchia convenzione
  "merge lo fa il reviewer", da allineare).
- 2026-07-08 (owner): decisione di policy sul blocker super-admin —
  **confermato**: il super-admin (`isSuperAdmin`, check email hardcoded in
  `src/lib/authorization.ts`) deve bypassare la guardia quota, coerentemente
  col trattamento god-mode già applicato altrove (`requireSuperAdmin`,
  impersonation). Non è accettabile che il super-admin resti bloccato fuori
  dalle proprie campagne/pagine admin per assenza di `Membership`. Applica il
  fix minimo suggerito dal reviewer: in `checkAssociationQuotaAccess`
  aggiungi `email: true` alla `select` già presente su `prisma.user` e
  short-circuita con `isSuperAdmin(user.email)` prima del check quota/ruolo
  associativo. Aggiungi un test dedicato (super-admin senza Membership e
  senza AssociationRole idoneo → passa comunque). Ri-delegato al dev.
- 2026-07-08 (dev): risolto il blocker super-admin del secondo giro di review.
  - Fix in `src/lib/authorization.ts`, `checkAssociationQuotaAccess` (~riga
    189): aggiunta `email: true` alla `select` già presente sulla query
    `prisma.user` (nessun costo aggiuntivo, l'utente è già caricato) e
    short-circuit `if (user && isSuperAdmin(user.email)) return true;` PRIMA
    del check sul bypass da `AssociationRole` e sulla `Membership`. Il
    super-admin bypassa quindi sempre la guardia, indipendentemente da
    `AssociationRole`/`Membership`, coerentemente col trattamento god-mode
    già applicato altrove (`requireSuperAdmin`, impersonation).
  - Verificato che il layout `src/app/(dashboard)/dashboard/[campaignSlug]/layout.tsx`
    chiama `checkAssociationQuotaAccess(prisma, userId)` direttamente (unico
    call-site nel repo, nessun altro punto duplica la logica): il bypass si
    propaga automaticamente a home + tutte le sottorotte (`characters/`,
    `events/`, `settings/`, `[dataSlug]/`, `admin/roles`, `admin/downtime`,
    ecc.) senza bisogno di toccare il layout.
  - Test aggiunti in `src/lib/authorization.test.ts` (describe
    `checkAssociationQuotaAccess`):
    - super-admin (`mattia@arcana.it`) senza `Membership` per l'anno corrente
      e con `associationRole: registered` (non idoneo) → guardia passa
      comunque; verificato anche che la query `membership.findUnique` non
      venga nemmeno eseguita (short-circuit sul bypass).
    - utente NON super-admin nelle stesse identiche condizioni (nessuna
      Membership, `associationRole: registered`) → resta bloccato, a
      conferma che il bypass è specifico al super-admin e non un
      allentamento generico della guardia.
  - Gate: `bun run type-check` → 0 errori; `bun run lint` → 0 errori/0
    warning; `bun run test:run` → 369/369 test verdi (27 file, +2 rispetto ai
    367 precedenti per i nuovi casi super-admin). Nessuna regressione.
  - Verifica: dal branch `task/004-guardia-quota-associativa`,
    `bun run type-check && bun run lint && bun run test:run`, oppure mirato
    `bun run test:run src/lib/authorization.test.ts`.
  - Commit: `fix(auth): bypass super-admin nella guardia quota associativa`.
  - Branch: `task/004-guardia-quota-associativa` (non mergiato). Stato →
    in-review, pronto per il terzo giro di review.
- 2026-07-08 (reviewer): terzo giro — review OK, nessun blocker, pronto per il
  merge owner. Verificato il diff di `7509164`:
  - ✅ `checkAssociationQuotaAccess` (`authorization.ts:193-206`): `email: true`
    aggiunta alla `select` già esistente (nessuna query extra, l'utente è già
    caricato) e short-circuit `if (user && isSuperAdmin(user.email)) return true;`
    posizionato PRIMA del check `hasAssociationRoleBypass` e di
    `hasValidMembershipForYear`. `isSuperAdmin` è funzione locale al file (riga
    210), nessun import da aggiungere/sbagliare. Nessun side-effect.
  - ✅ Test (`authorization.test.ts`): i due casi dichiarati sono coperti e
    assertivi — super-admin (`mattia@arcana.it`) senza Membership e con
    `associationRole: registered` → `result === true` E
    `membership.findUnique` NOT called (prova reale dello short-circuit, non
    solo "non lancia"); il caso include anche l'auto-check
    `expect(isSuperAdmin(superAdminEmail)).toBe(true)`. Utente non super-admin
    nelle stesse condizioni → `result === false` (bypass specifico al
    super-admin, non allentamento generico).
  - ✅ Gate ri-eseguiti da me nel worktree: type-check 0 errori, lint 0
    errori/0 warning, test:run 369/369 (27 file). Numeri del dev confermati.
  - ✅ Coerenza branch: unico call-site della guardia è il layout
    `[campaignSlug]`, il bypass si propaga a home + sottorotte senza toccare il
    layout; nessuna regressione rispetto ai rilievi già approvati nei giri 1-2
    (layout server-side, pattern impersonation, fuso Europe/Rome tutti intatti).
  - Esito: status lasciato `in-review`. Non mergiato dal reviewer: il merge in
    `integration/fase-1-backend` e i gate post-merge sono a carico dell'owner.
- 2026-07-08 (owner): mergiato in `integration/fase-1-backend` con `git merge
--no-ff task/004-guardia-quota-associativa` → commit `ca977d0`. Conflitto
  minimo (solo lista import in `authorization.test.ts`, in collisione con
  T-5/`isOrganizationHeadMaster` già in integration) risolto in modo fedele
  unendo entrambe le liste di import, nessuna riscrittura logica. Nessuna
  nuova migrazione Prisma (T-4 è solo codice applicativo); `bunx prisma
generate` ri-eseguito senza drift. Gate post-merge su
  `integration/fase-1-backend`: `type-check` → 0 errori, `lint` → 0
  errori/0 warning, `test:run` → 447/447 test verdi (32 file). T-4 → done.
