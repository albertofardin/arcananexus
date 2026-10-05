---
id: "008"
title: "Fix conflitto routing Next.js: [campaignId] vs [campaignSlug] sotto /api/campaigns"
status: done
priority: P0
assignee: reviewer
branch: task/008-fix-routing-campaignid-campaignslug
trello: ""
created: 2026-07-08
updated: 2026-07-08
---

## Obiettivo

`bun dev` non si avvia più su `integration/fase-1-backend`: Next.js rifiuta la
route tree con l'errore

```
Error: You cannot use different slug names for the same dynamic path
('campaignId' !== 'campaignSlug').
```

Causa: `src/app/api/campaigns/[campaignId]/route.ts` (T-5, PUT/DELETE campagna
per id) e `src/app/api/campaigns/[campaignSlug]/grants/...` (T-2, gestione
grant per slug) coesistono come due cartelle-segmento dinamiche diverse allo
stesso livello sotto `/api/campaigns/`. App Router richiede **un solo nome di
parametro** per ogni posizione dinamica dell'albero delle route: due branch
sviluppati in isolamento (T-2 e T-5) hanno introdotto nomi diversi senza che
nessuna delle due review lo cogliesse (i gate `type-check`/`lint`/`test:run`
non lo intercettano — i test unitari chiamano gli handler direttamente, non
passano dal route collector di Next; **anche `bun run build` non lo intercetta**,
solo `next dev`/`bun dev` lo fa a runtime nel dev server — verificato
riproducendo entrambi in locale).

**Impatto**: bloccante per QUALUNQUE sviluppo/test locale (incluso l'intero
giro di QA manuale appena preparato con i seed data) e a rischio concreto anche
in produzione (ambiguità di routing non è solo un fastidio di dev server).
Priorità P0, va risolto prima di qualunque altro lavoro su questo branch.

## Decisione di design (owner)

Le due route NON sono equivalenti: `[campaignId]` (T-5) fa lookup per ID
numerico (`Number.parseInt` + `getCampaignById`), `[campaignSlug]` (T-2) fa
lookup per slug (`getCampaignBySlug`). Ho verificato che la route `[campaignId]`
(PUT/DELETE) **non ha nessun chiamante nel frontend** oggi (grep su tutto
`src/`: solo `/api/campaigns` (POST/GET, lista) e
`/api/campaigns/[campaignSlug]/grants` sono effettivamente `fetch`-ati da
`CampaignRolesManager`/`rolesAssignmentsSync`; `CampaignsManager` lato UI
resta su mock, nota già di T-3/T-5).

Decisione: **standardizzare su `campaignSlug`**, coerente con il resto
dell'app (ogni altra route/pagina campaign-scoped è slug-based:
`dashboard/[campaignSlug]/...`, `campaigns/[campaignSlug]/grants`). Converti
la route CRUD di T-5 da "per id" a "per slug":

- Sposta `src/app/api/campaigns/[campaignId]/route.ts` (PUT/DELETE) dentro la
  cartella `src/app/api/campaigns/[campaignSlug]/route.ts` (sibling di
  `grants/`, stesso segmento dinamico condiviso — è esattamente il pattern che
  risolve il conflitto: un solo nome di parametro, più route.ts a livelli
  diversi sotto di esso).
- Nel handler, sostituisci `resolveCampaignId`/`getCampaignById` con una
  risoluzione via `getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG)`
  (stesso pattern usato altrove, es. nei layout `[campaignSlug]`). Il resto
  della logica (autorizzazione `isSuperAdmin`/`isUserCampaignAdmin`, Zod
  `updateCampaignSchema`, gestione errori P2002, DELETE) resta invariato,
  cambia solo come si risolve la campagna di partenza.
  Poiché **nessun chiamante reale esiste ancora**, non c'è nessun contratto
  esterno da preservare: è un cambio sicuro, non un breaking change percepito.
- Aggiorna i test in `src/app/api/campaigns/[campaignId]/__tests__/route.test.ts`
  (spostali/adattali sotto `[campaignSlug]/__tests__/` insieme al resto),
  sostituendo i case basati su id con case basati su slug (incluso il 400 su
  slug non esistente/malformato, al posto del 400 su id non numerico).

Se in fase di implementazione emerge che questa scelta ha un impatto che non
avevo previsto (es. un consumer non-UI che dipende dall'id), fermati e
segnalalo invece di improvvisare un'alternativa.

## Scope

Incluso:

- Il fix di routing sopra descritto (unico segmento dinamico `[campaignSlug]`
  sotto `/api/campaigns/`).
- Aggiornamento/spostamento dei test della route.
- Verifica che `bun dev` si avvii pulito (non solo `bun run build` — **non è
  sufficiente**, riproduce l'errore solo in dev mode, vedi sopra) e che sia
  raggiungibile almeno `GET /api/campaigns` senza errori di routing.
- Gate verdi: `bun run type-check`, `bun run lint`, `bun run test:run`.

Escluso:

- Qualunque altra funzionalità/refactor non necessario a risolvere il
  conflitto (niente riscritture opportunistiche).
- Wiring del frontend `CampaignsManager` alle API reali (gap noto, separato,
  non è scope di questo fix).

## Criteri di accettazione

- [x] `bun dev` si avvia senza l'errore "You cannot use different slug names
      for the same dynamic path" (verificalo avviando davvero il dev server,
      es. `bun dev` in background + un `curl localhost:3000/api/campaigns` o
      equivalente, non solo leggendo il codice).
- [x] `bun run build` resta verde (già lo era prima, non deve regredire).
- [x] PUT/DELETE campagna funzionano tramite slug (`/api/campaigns/<slug>`),
      stessa autorizzazione e stessa gestione errori di prima.
- [x] Test aggiornati/spostati, tutti verdi.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Note / Log

- 2026-07-08 (owner): scoperto durante la preparazione dei seed data per il
  giro di QA manuale (task separato, non numerato in `.task/`, delegato al dev
  su questo stesso worktree/branch di integrazione — vedi
  `.task/qa-report-fase-1-backend.md` sezione "Persone di test &amp;
  credenziali" per il contesto che ha portato alla scoperta). Riprodotto
  personalmente: `bun run build` verde, `bun dev` fallisce con l'errore sopra.
  Creato branch/worktree dedicato `task/008-fix-routing-campaignid-campaignslug`
  da `integration/fase-1-backend` (tip `58d517d`, include già il seed e i test
  cross-task del qa). Decisione di design presa e motivata sopra. Delegato al
  dev. **Bloccante per il push**: non deve essere possibile mergiare/pushare
  `integration/fase-1-backend` verso `main` finché questo non è risolto.

- 2026-07-08 (dev): implementata la decisione di design dell'owner.
  - Spostato `src/app/api/campaigns/[campaignId]/route.ts` (PUT/DELETE) dentro
    `src/app/api/campaigns/[campaignSlug]/route.ts`, sibling di `grants/`.
    Sostituita la risoluzione per id (`resolveCampaignId` + `getCampaignById`)
    con `getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG)`, stesso
    idioma usato in `dashboard/[campaignSlug]/layout.tsx`. Autorizzazione
    (`isSuperAdmin`/`isUserCampaignAdmin`), validazione Zod
    (`updateCampaignSchema`) e gestione errori (404 su campagna non trovata,
    409 su P2002) invariate; cambia solo come si arriva a `campaignId`
    internamente (ora preso da `existing.id` dopo il lookup per slug).
  - Spostati/adattati i test da `[campaignId]/__tests__/route.test.ts` a
    `[campaignSlug]/__tests__/route.test.ts`: il case "400 su id non
    numerico" è diventato "404 su slug inesistente" (comportamento reale di
    `getCampaignBySlug`, che ritorna `null` per qualunque slug non trovato —
    non c'è un caso "malformato" distinto da gestire come 400, a differenza
    del vecchio parsing numerico).
  - Grep di conferma: nessun altro riferimento nel repo a
    `campaigns/[campaignId]` o a `resolveCampaignId`/`getCampaignById` fuori
    dal repository (`getCampaignById` resta nel repository, non è stata
    toccata: è generica e ha un suo test dedicato, nessun altro consumer la
    usa oggi oltre al suo stesso test — lasciata invariata, fuori scope).
  - **Verifica reale `bun dev`** (non solo lettura codice): avviato in
    background con `bun dev > /tmp/task008-dev.log 2>&1 &`. Output pulito,
    nessun errore di routing:
    ` ▲ Next.js 16.2.6 (Turbopack)
    - Local: http://localhost:3000
    - Network: http://192.168.0.9:3000
    - Environments: .env
      ✓ Ready in 267ms
      `Grep su tutto il log di`"cannot use different"`→ nessun match (prima
del fix l'errore compariva subito all'avvio). Richieste`curl`reali:`PUT /api/campaigns/prova`→ 401 (non autenticato, atteso),`DELETE
      /api/campaigns/prova`→ 401 (atteso),`GET /api/campaigns/prova`→ 405
(metodo non consentito, atteso: la route espone solo PUT/DELETE/OPTIONS).
Questo conferma che l'App Router risolve correttamente il path fino agli
handler (altrimenti l'avvio stesso sarebbe fallito).`GET
      /api/campaigns`ha risposto 500 per`DATABASE_URL` assente/vuoto in
      questo worktree (nessun Postgres locale configurato) — è un gap di
      ambiente del worktree di sviluppo, non un errore di routing (nessun
      "cannot use different slug names" nel log; la richiesta arriva
      correttamente all'handler e fallisce solo sulla query Prisma).
      Processo dev killato a fine verifica.
  - `bun run build`: verde, resta invariato rispetto a prima del fix (route
    tree mostra correttamente un solo segmento `/api/campaigns/[campaignSlug]`
    e i suoi sotto-path `grants`/`grants/[userId]`).
  - Gate: `bun run type-check` verde (nessun errore), `bun run lint` verde
    (nessun errore/warning), `bun run test:run` verde — 42 file di test, 546
    test passati (inclusi i test spostati/adattati sotto `[campaignSlug]`).
  - Commit creato su `task/008-fix-routing-campaignid-campaignslug`:
    `d59a83a fix(api): risolvi conflitto routing campaignId/campaignSlug sotto
/api/campaigns`. Nessun push.
  - Nessun impatto imprevisto: conferma la premessa dell'owner (nessun
    chiamante reale della vecchia route per id in tutto `src/`). Nessuna
    deviazione dalla decisione di design registrata.
  - Verifica: `git switch task/008-fix-routing-campaignid-campaignslug`,
    `bun dev` (deve partire pulito), `bun run build`/`type-check`/`lint`/
    `test:run` (tutti verdi).
- 2026-07-08 (reviewer): **review OK, pronto per merge owner** (fix P0). Diff
  `58d517d..HEAD`: solo rename `[campaignId]` → `[campaignSlug]` di `route.ts` +
  `__tests__/route.test.ts`, nessun refactor opportunistico. Fedele alla
  decisione di design dell'owner, zero deviazioni.
  - Handler corretto: `resolveCampaign` usa
    `getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG)` (org
    `arcana-domine`), stesso idioma di `grants/route.ts`. Autorizzazione
    (`isSuperAdmin`/`isUserCampaignAdmin` via `existing.id`), Zod
    `updateCampaignSchema`, ordine 401→404→403→400→409/500 e `DELETE`
    (204/404/403/500) tutti invariati e coerenti.
  - Test: coprono ancora 401/403/404/400(body)/409/200 su PUT e
    401/404/403/204 su DELETE. Il vecchio "400 id non numerico" è stato rimosso
    (non "convertito"): il branch di parsing numerico che lo generava non esiste
    più, quindi non è testabile; il 404 esisteva già come case separato. Questo
    spiega 547→546 (net -1), nessuna regressione di copertura — il 400 resta
    coperto per la causa residua legittima (body non valido). Nessun 400
    legittimo silenziosamente degradato a 404.
  - Residui: cartella `[campaignId]` eliminata, nessun `resolveCampaignId`,
    `getCampaignById` resta solo nel repository + suo test + README (nessun
    consumer route), fuori scope come dichiarato.
  - **Verifica indipendente `bun dev`** (non citazione del dev): avviato in
    background nel worktree → `✓ Ready in 511ms`, log pulito. Forzata la
    compilazione delle route con richieste reali: `PUT /api/campaigns/prova`
    → 401, `DELETE` → 401, `GET` → 405, `GET .../prova/grants` → 401.
    `grep -ci "cannot use different"` sul log dev → 0. Nessun `Error` nel log.
    Processo killato.
  - Gate ri-eseguiti dal reviewer: `bun run type-check` verde, `bun run lint`
    verde, `bun run test:run` verde (42 file, 546 test), `bun run build` verde
    (route tree: unico segmento `/api/campaigns/[campaignSlug]` + `grants`).
  - Non eseguo il merge: lascio `status: in-review`, l'owner integra su
    `integration/fase-1-backend`. Sblocca il push P0.

- 2026-07-08 (owner): mergiato in `integration/fase-1-backend` con `git merge
--no-ff task/008-fix-routing-campaignid-campaignslug` → commit `65d967c`.
  Nessun conflitto (git ha riconosciuto il
  rename `[campaignId]` → `[campaignSlug]` automaticamente). Post-merge ho
  verificato IO STESSO, di nuovo, l'avvio reale di `bun dev` (terza verifica
  indipendente dopo dev e reviewer): `.next` ripulita, avvio pulito in 517ms,
  `grep -ci "cannot use different" <log>` → 0. `bun run build` verde con un
  solo segmento `/api/campaigns/[campaignSlug]` in route tree. Gate:
  `type-check` 0, `lint` 0, `test:run` 546/546 (42 file). T-8 → done.
  **Blocker P0 risolto: `integration/fase-1-backend` è di nuovo utilizzabile
  in locale (`bun dev`) e non blocca più push/QA manuale per questo motivo.**
