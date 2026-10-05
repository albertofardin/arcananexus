---
id: "003"
title: "Guardia ruolo di progetto sulle route campaign-scoped"
status: done
priority: P0
assignee: reviewer
branch: task/003-guardia-ruolo-progetto
trello: ""
created: 2026-07-07
updated: 2026-07-08
---

## Obiettivo

Chiudere il gap per cui gli helper di autorizzazione esistono ma non sono applicati:
oggi `requireRole`/`checkCampaignAccess` in `src/lib/authorization.ts` non sono
invocati da nessuna route se non da quelle admin. Serve una guardia che verifichi
l'appartenenza alla campagna e il ruolo dell'utente.

## Scope

Incluso:

- Applicare `requireAuth`/`requireRole`/`checkCampaignAccess` alle route
  campaign-scoped (`src/app/api/characters`, `events`, `campaigns`, `memberships`,
  e le nuove di T-2/T-5), decidendo esplicitamente per ciascuna se resta pubblica
  (catalogo) o richiede sessione/ruolo. La guardia si appoggia al **ruolo di
  campagna via `Grant`** (T-1/T-2: `head_master`/`master`/`supporter`), asse
  ortogonale alla quota associativa di T-4 — non toccare/duplicare quella logica.
- **Guardia pagine** per le sezioni che richiedono un ruolo minimo di campagna
  (almeno `settings/` e `admin/` con le sue sottorotte `admin/roles`,
  `admin/downtime` — oggi **senza alcun controllo server-side**, verificato: sono
  navigabili da chiunque abbia superato solo la guardia quota di T-4). Stesso
  approccio a `layout.tsx` Server Component già usato in T-4
  (`src/app/(dashboard)/dashboard/[campaignSlug]/layout.tsx`, che oggi verifica
  solo la quota): un guard riusabile che copre home/sottorotte del segmento
  pertinente senza duplicarsi per pagina. Bypass super-admin incluso, coerente
  con la policy god-mode già registrata in T-4 (`isSuperAdmin`).
- Test che verificano 401 senza sessione (dove richiesto) e 403 su ruolo
  insufficiente; test multi-tenant (utente di campagna A non opera su B).

Escluso:

- **Nessun controllo del `banned`**: l'utente bannato per ora non viene bloccato.
- La guardia quota associativa (T-4, già fatta — non ritoccarla).
- Hardening di endpoint esplicitamente marcati "TEMPORARY"/dummy nel codice
  esistente (es. `POST /api/characters` genera dati casuali): aggiungere la
  guardia di autenticazione/ruolo dove ha senso, ma non è richiesto
  riscrivere la logica applicativa fittizia — se emergono dubbi, segnalarli nel
  log invece di espandere lo scope.

## Criteri di accettazione

- [x] Ogni route API campaign-scoped di scrittura passa da un controllo di ruolo
      via `Grant` (`checkCampaignAccess`/`isUserCampaignAdmin`/
      `isUserCampaignHelper` o equivalente), con bypass super-admin.
- [x] Le pagine `settings/` e `admin/` (+ sottorotte) sono protette lato server
      con un guard a livello `layout.tsx`, coerente con l'approccio T-4, bypass
      super-admin incluso.
- [x] Test: 401 senza sessione (dove previsto), 403 su ruolo insufficiente, happy
      path 200 sul ruolo idoneo — sia per le route API sia per le pagine.
- [x] Test multi-tenant: accesso negato cross-campagna.
- [x] Nessun riferimento allo stato `banned` (fuori scope).
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Note / Log

- 2026-07-07 (owner): dipende da T-1 per i nomi dei ruoli. Card Trello di origine:
  "Middleware verifica ruolo di progetto" (senza il check `banned`, escluso).
- 2026-07-08 (owner): avviato dopo la chiusura di T-2/T-4. Verificato lo stato
  attuale del codice prima di delegare: `settings/page.tsx` e
  `admin/roles/page.tsx` non hanno alcun controllo server-side (chiunque superi
  la guardia quota di T-4 le vede); le route `characters`/`events` controllano
  solo la sessione, non il ruolo; `campaigns/route.ts` e
  `campaigns/[campaignId]/route.ts` (T-5) hanno già il pattern corretto
  (`isSuperAdmin` + `isOrganizationHeadMaster`/`isUserCampaignAdmin`) da usare
  come riferimento. Scope esteso su richiesta esplicita del coordinator per
  includere anche la guardia a livello pagina (non solo API), con lo stesso
  approccio `layout.tsx` di T-4. Branch: `task/003-guardia-ruolo-progetto`,
  worktree dedicato `core-task-003`, creato da `integration/fase-1-backend`
  (include già le route Grant di T-2). Delegato al dev.
- 2026-07-08 (dev): inizio implementazione.
- 2026-07-08 (dev): implementazione completata. Riepilogo route/pagine toccate
  e decisione presa per ciascuna:

  **Route API** (revisionate tutte le route campaign-scoped esistenti sotto
  `src/app/api/`; nessuna nuova route di scrittura Grant-gated da aggiungere,
  vedi motivazione per verbo):
  - `GET /api/characters` — resta senza controllo di ruolo: la query è sempre
    filtrata su `userId: session.user.id` (vedi
    `listUserCharacters`), quindi non espone mai personaggi di terzi. Un
    ruolo di campagna (head_master/master/supporter) è un privilegio di
    staff, non un prerequisito per vedere i propri personaggi. Solo sessione
    richiesta (già presente, 401 se assente). Commento inline aggiunto.
  - `POST /api/characters` — marcata "TEMPORARY: dummy character creator" nel
    codice: il `campaignId` è generato con `randomInt(1, 5)` lato server, non
    arriva dal client, quindi non esiste un `campaignId` reale su cui
    verificare un ruolo di Grant. Mantenuto solo il controllo di sessione già
    presente (401 se assente); non riscritta la logica applicativa fittizia
    (fuori scope, vedi Scope/Escluso). Commento inline aggiunto per motivare
    la decisione a futuri lettori.
  - `GET /api/events` — resta pubblica (catalogo eventi pubblicati, usato da
    booking/marketing). Il filtro `myBookings=true` richiede sessione solo
    per filtrare sull'utente corrente (dato self-scoped), non un ruolo di
    campagna: gli eventi non sono un'area di amministrazione. Commento
    inline aggiunto.
  - `GET /api/memberships` — resta self-scoped su `session.user.id`
    (quota associativa personale), concettualmente non campaign-scoped: non
    esiste un ruolo di Grant applicabile. Solo sessione richiesta (già
    presente). Commento inline aggiunto.
  - `GET/POST /api/campaigns`, `PUT/DELETE /api/campaigns/[campaignId]` — già
    corrette (T-5, in integration): `isSuperAdmin` +
    `isOrganizationHeadMaster`/`isUserCampaignAdmin`. Non toccate.
  - `GET/POST /api/campaigns/[campaignSlug]/grants`,
    `PUT/DELETE .../grants/[userId]` — già corrette (T-2, in integration):
    `requireCampaignAdminBySlug` (head_master o super-admin). Non toccate.
  - `POST/PUT/PATCH/DELETE /api/organizations/[orgId]/campaigns` — verificate:
    sono stub vuoti (`export async function POST(_request: Request) {}`,
    nessun corpo/logica). Nessuna azione: non c'è nulla da proteggere finché
    restano no-op; segnalato qui per visibilità, eventuale
    implementazione futura dovrà applicare lo stesso pattern
    `isSuperAdmin`/`isOrganizationHeadMaster`.

  **Pagine** — nuovo guard riusabile
  `[campaignSlug]/_components/CampaignRoleGuard.tsx` (Server Component,
  `getEffectiveUserId` impersonation-aware, `notFound()` se niente
  utente/campagna, blocco con `EmptyCard` "Permessi insufficienti" se il
  ruolo non basta), appoggiato al nuovo helper
  `checkCampaignRoleForUser` in `src/lib/authorization.ts` (bypass
  `isSuperAdmin` + `checkCampaignAccess`). Composto da due layout.tsx sottili:
  - `[campaignSlug]/settings/layout.tsx` — richiede `Role.head_master`.
  - `[campaignSlug]/admin/layout.tsx` — richiede `Role.head_master`, copre
    `admin/` (Globali/CampaignSettings), `admin/roles` (Gestione Staff) e
    `admin/downtime` (Azioni Downtime) con un solo guard (nessuna
    duplicazione per sottopagina). Compone correttamente con
    `[campaignSlug]/layout.tsx` (T-4, guardia quota associativa, non
    toccata): i layout annidati di App Router si sommano, quindi un utente
    deve superare prima la quota (T-4) e poi il ruolo (T-3).
  - Decisione di design: ho scelto `head_master` come ruolo minimo uniforme
    per l'intera sezione `admin/` (invece di differenziare "Globali"/
    "downtime" a `master`) per coerenza con l'unica API già esistente che le
    alimenta (`GET/POST /grants`, che richiede head_master via
    `requireCampaignAdminBySlug`): un guard più permissivo (`master`) avrebbe
    lasciato vedere la pagina `admin/roles` a un master per poi fallire con
    403 sulla API sottostante, esperienza inconsistente. Rivedibile in
    futuro se emerge un ruolo "master" con permessi di editing distinti da
    "assegnazione staff".

  **Test aggiunti**:
  - `src/lib/authorization.test.ts` — nuova describe
    `checkCampaignRoleForUser` (blocco senza grant, blocco supporter vs
    head_master richiesto, ok head_master, bypass super-admin senza query
    sul Grant, blocco utente inesistente, isolamento cross-campagna A/B).
  - `.../[campaignSlug]/_components/__tests__/CampaignRoleGuard.test.tsx` —
    `notFound()` senza sessione/campagna, blocco pulito (EmptyCard) su ruolo
    insufficiente senza leak del contenuto figlio, render dei figli su ruolo
    idoneo, uso di `getEffectiveUserId` (impersonation-aware), caso
    cross-tenant esplicito (head_master di campagna A non passa il guard
    risolto su campagna B).
  - `.../admin/__tests__/layout.test.tsx` e
    `.../settings/__tests__/layout.test.tsx` — verificano che il layout
    componga `CampaignRoleGuard` con `requiredRole: Role.head_master` e lo
    `campaignSlug` risolto dalla rotta corrente (no slug hardcoded).
  - Non toccati i test 401/403/200 già esistenti per
    `campaigns/[campaignSlug]/grants` e `campaigns/[campaignId]` (T-2/T-5,
    comportamento invariato).

  **Verifica esplicita `banned`**: `git diff` sul lavoro di T-3 contiene un
  solo riferimento a `UserStatus.banned`, in un commento JSDoc che ne
  documenta l'esclusione dallo scope (stesso pattern già usato da T-4);
  nessun controllo funzionale introdotto.

  **Esito gate**: `bun run type-check` OK (nessun errore), `bun run lint` OK
  (nessun warning/errore), `bun run test:run` OK — 41 file di test, 521 test,
  tutti verdi.

  **Commit** sul branch `task/003-guardia-ruolo-progetto` (worktree
  `core-task-003`): vedi `git log` per gli hash esatti (creati con
  conventional commits, ambito `feat(auth)`/`feat(pages)`/`test`).

  Verificabile con: `bun run type-check && bun run lint && bun run test:run`
  dal worktree `core-task-003`; per le pagine, navigare (o impersonare) un
  utente senza Grant `head_master` verso
  `/dashboard/<campaignSlug>/settings` o `/dashboard/<campaignSlug>/admin` (e
  sottorotte) e verificare il blocco "Permessi insufficienti".

  Status portato a `in-review` (assignee resta `dev`); nessun push/PR
  effettuato, come da istruzioni.

- 2026-07-08 (reviewer): review OK, pronto per merge owner. Nessun blocker.
  Diff esaminato `3c052bf..HEAD` (helper `checkCampaignRoleForUser`, guard
  `CampaignRoleGuard`, layout `settings/`+`admin/`, commenti route API, test).
  Gate ri-eseguiti nel worktree `core-task-003`: `bun run type-check` OK,
  `bun run lint` OK, `bun run test:run` OK — 41 file / 521 test verdi (numeri
  dichiarati confermati).

  Verifica criteri di accettazione:
  - `checkCampaignRoleForUser`: bypass super-admin corretto (lookup email +
    `isSuperAdmin`, evita la query sul Grant, coperto da test); delega a
    `checkCampaignAccess` (gerarchia `ROLE_RANK` corretta). Nessuna
    duplicazione impropria: il pattern email→isSuperAdmin è giustificato
    perché opera su `userId` (impersonation-aware) e non su sessione, diverso
    da `requireCampaignAdminBySlug`.
  - Composizione layout: `admin/layout.tsx` e `settings/layout.tsx` sono
    figli di `[campaignSlug]/layout.tsx` (T-4, quota). I layout annidati App
    Router si sommano → per settings/admin scattano ENTRAMBE le guardie
    (quota T-4 + ruolo T-3). Stesso pattern `getEffectiveUserId` +
    `getCampaignBySlug(ARCANA_DOMINE_SLUG)` + `EmptyCard` di T-4. Blocco
    pulito: children non renderizzati (test verifica assenza del marker).
  - Copertura test: helper (no-grant 403, supporter<head_master 403,
    head_master 200, super-admin bypass senza query Grant, utente inesistente,
    cross-tenant A/B) + guard (notFound senza utente/campagna, blocco pulito,
    render figli, args corretti, cross-tenant). Layout: compongono il guard
    con `head_master` e slug della rotta (no hardcoded). Adeguata.
  - Nessun riferimento funzionale a `UserStatus.banned`: unica occorrenza è
    un commento JSDoc che ne documenta l'esclusione. OK.

  Pareri sulle due decisioni di design:
  - "head_master uniforme su tutto admin/": OK, ragionevole e ben motivata
    (evita l'incoerenza master-vede-pagina/API-nega-403). Verificato che
    `admin/downtime` è oggi interamente MOCK (dati hardcoded nella page,
    nessun repository/API): gating a head_master è quindi innocuo ora.
    NOTA non-bloccante per l'owner: nel dominio LARP le azioni downtime sono
    tipicamente gestite dai `master`, non solo head_master. Quando
    `admin/downtime` avrà un backend reale, valutare di estrarla in un guard
    `master`-level (o spostarla fuori da `admin/`). Il dev ha già segnalato la
    stessa tensione. Nessuna azione richiesta ora.
  - "nessuna nuova guardia sulle route API base": OK, non è una scappatoia.
    Verificato: `GET /characters` è self-scoped (`where: { userId }` in
    `listUserCharacters`, mai personaggi di terzi); `GET /events` è catalogo
    pubblico; `GET /memberships` è self-scoped su `session.user.id`;
    PUT/PATCH/DELETE su characters/events/memberships sono `methodNotAllowed`
    (nessuna scrittura scoperta). Le sole route di scrittura campaign-scoped
    reali (`campaigns/*`, `grants/*`) erano già gated in T-2/T-5. Il criterio
    "ogni route di scrittura passa da controllo ruolo" è quindi soddisfatto.
    NOTA non-bloccante: `POST /characters` è dummy/TEMPORARY (crea in
    `campaignId: randomInt(1,5)`); quando verrà de-dummizzato dovrà validare
    il `campaignId` dal client + guardia ruolo/membership. Fuori scope ora
    (endpoint marcato TEMPORARY, escluso da Scope).

- 2026-07-08 (owner): mergiato in `integration/fase-1-backend` con `git merge
--no-ff task/003-guardia-ruolo-progetto` — merge pulito, **nessun
  conflitto**. Nessuna nuova migrazione Prisma (solo codice applicativo).
  Gate post-merge su `integration/fase-1-backend`: `bunx prisma generate` ok,
  `type-check` → 0 errori, `lint` → 0 errori/0 warning, `test:run` →
  521/521 test verdi (41 file). T-3 → done.

  Nota per il backlog: due punti non bloccanti segnalati dal reviewer, da
  tenere presenti quando si toccheranno quelle aree — non richiedono azione
  ora: (1) `admin/downtime` è oggi interamente mock (nessun backend), il
  gating a `head_master` andrà rivalutato quando avrà un'API reale (i
  `master` potrebbero dover gestire i downtime); (2) `POST /api/characters`
  resta dummy/TEMPORARY, quando verrà de-dummizzato andrà validato il
  `campaignId` lato server con guardia ruolo/membership.
