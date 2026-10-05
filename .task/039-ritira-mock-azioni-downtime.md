---
id: "039"
title: "Ritira la UI mock delle Azioni Downtime, superseduta da Feature/Action (T-019/031/033)"
status: done
priority: P2
assignee: ""
branch: task/039-ritira-mock-azioni-downtime
base: task/015-schema-metamodel-dati-campagna
trello: ""
created: 2026-07-24
updated: 2026-07-24
qa: ok
---

## Obiettivo

`admin/downtime/page.tsx` + `DowntimeManager.tsx` sono una UI mock (dati
hardcoded in `page.tsx`, salvataggio finto con `console.log`+`setTimeout` in
`DowntimeManager.tsx`) che precede il sistema reale costruito da T-019
(registry `FeatureType`/`Feature`), T-031 (`admin/features`: UI di
attivazione/configurazione di una `Feature` per campagna) e T-033
(esecuzione dell'azione dichiarata dal giocatore + coda di approvazione del
master). La UI mock non è mai stata rimossa: resta linkata dal menu "Area
Master" (`BtnCampaignAdmin.tsx`) e dall'indice admin (`admin/page.tsx`),
mostra sempre le stesse 7 azioni statiche indipendentemente dalla campagna, e
non persiste nulla. Decisione già presa con l'utente (vedi Log): ritirarla,
stesso trattamento già applicato al blocco "Sezioni Campagna" mock di
`CampaignSettings.tsx` (rimosso perché superseduto da `DataTypesManager`,
T-029) — non si costruisce un nuovo repository/model per questa UI.

## Scope

Incluso:

- Rimuovere `admin/downtime/page.tsx` e `DowntimeManager.tsx` (+ eventuali
  test dedicati).
- Rimuovere la voce "Gestione Azioni Downtime" dal menu `BtnCampaignAdmin.tsx`
  e la card corrispondente in `admin/page.tsx`.
- Rimuovere `campaignAdminDowntime` da `routes.ts` se non più referenziato
  altrove dopo la rimozione.
- Verificare e aggiornare ogni altro riferimento residuo (grep per
  `DowntimeManager`, `campaignAdminDowntime`, `admin/downtime`,
  `DowntimeAction` — risultati noti al momento della stesura: `admin/
layout.tsx` e i suoi test, `admin/actions/page.tsx` e
  `ActionApprovalQueue.tsx` — questi ultimi due potrebbero contenere solo
  riferimenti in commenti, non funzionali: verificare caso per caso prima di
  toccare la logica).
- Aggiornare/rimuovere i test che coprono le rotte/voci di menu eliminate
  (es. `admin/__tests__/page.test.tsx`, `admin/__tests__/layout.test.tsx`,
  eventuale `BtnCampaignAdmin.test.tsx`).

Escluso:

- Qualunque modifica al modello dati (`FeatureType`/`Feature`/`Action`) o
  alla UI reale già esistente (`admin/features`, `admin/actions`,
  `characters/[id]/[actionType]`) — sono il sistema che sostituisce il mock,
  non vanno toccati salvo la semplice rimozione di riferimenti al mock al
  loro interno.
- Non serve una migrazione Prisma: questo task è pura rimozione di codice
  applicativo.
- **`main` non va toccato**: niente checkout/commit/push su `main`, nessuna
  PR verso `main`. Questo task, come tutto il lavoro di questa sessione,
  resta sulla catena `task/015-schema-metamodel-dati-campagna` (base branch,
  vedi frontmatter) — è lì che vivono già T-019/T-031/T-033, il sistema
  reale che sostituisce il mock.

## Criteri di accettazione

- [x] La rotta `admin/downtime` e il componente `DowntimeManager` non esistono
      più nel codice sorgente (non test).
- [x] Il menu "Area Master" e l'indice `admin/page.tsx` non mostrano più
      alcuna voce "Azioni Downtime"; un head_master che apre l'area admin
      della propria campagna non incontra più link rotti o pagine mock.
- [x] Nessun riferimento residuo a `DowntimeManager`/`campaignAdminDowntime`/
      `admin/downtime` nel codice applicativo (grep pulito); i commenti che
      citavano `DowntimeManager` solo come riferimento di pattern (es.
      `ActionApprovalQueue.tsx`) sono aggiornati o rimossi se non più
      pertinenti.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.
      (`test:run` ha 10 fallimenti pre-esistenti in `DataTypesManager.test.tsx`
      / `ReferenceDataManager.test.tsx`, non correlati a questo task e non
      toccati da queste modifiche — verificato per confronto stash/pop sulla
      base pulita, stesso conteggio identico prima e dopo. Vedi Log.)

## Artifacts

files_modified:

- src/app/(dashboard)/dashboard/[campaignSlug]/admin/downtime/page.tsx (rimosso)
- src/app/(dashboard)/\_components/DowntimeManager.tsx (rimosso)
- src/app/(dashboard)/\_components/BtnCampaignAdmin.tsx (voce menu "Gestione Azioni Downtime" rimossa + commento aggiornato)
- src/app/(dashboard)/\_components/**tests**/BtnCampaignAdmin.test.tsx (assert aggiornate, entry downtime rimossa dalle liste attese)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx (card "Azioni Downtime" rimossa dall'indice)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/page.test.tsx (assert su campaignAdminDowntime sostituita con campaignAdminActions + nuovo test negativo "non più linkata")
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/layout.tsx (commento aggiornato, non citava più admin/downtime come esempio)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/layout.test.tsx (describe label aggiornata)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/actions/page.tsx (commento: rimosso riferimento a admin/downtime/page.tsx)
- src/app/(dashboard)/\_components/ActionApprovalQueue.tsx (commento: rimosso riferimento di pattern a DowntimeManager)
- src/app/routes.ts (rimossa campaignAdminDowntime; il commento riga 35-36 su `actionType` era un esempio di functionName, non correlato al mock, lasciato invariato)

decisions:

- Base branch = punta locale di task/015-schema-metamodel-dati-campagna
  (commit 1ac2723), non origin/task/015 (che in questo momento risulta
  avanti con commit di tutt'altra provenienza, merge PR #56
  "nuova_frontiera"/T-044 — non pertinenti a questa catena secondo il brief
  ricevuto). Verificato che 1ac2723 è ancestor di origin (fast-forward),
  quindi nessun conflitto strutturale; scelto comunque 1ac2723 per
  aderenza esatta al contenuto atteso dal brief (T-035 come ultimo task
  noto, file_rilevanti tutti presenti a quel commit).
- Lavoro svolto nel worktree isolato della sessione (non nel worktree
  principale, che ha modifiche non committate non correlate a questo task
  — Caso 2/4) per non rischiare di toccarle.
- BtnCampaignAdmin: rimossa solo la entry "downtime" dal menu, senza
  aggiungere nuove entry (es. "Coda Approvazioni"/"Feature") — fuori scope
  di questo task di sola rimozione.
- admin/page.tsx: rimossa solo la card "Azioni Downtime"; il placeholder
  "Catalogo" (T-030) e le altre card reali non toccate, come da scope
  escluso.

## Note / Log

- 2026-07-24 (owner/utente): deciso di ritirare il mock invece di costruire
  un repository dedicato, coerentemente con la rimozione già fatta per
  `CampaignSettings` "Sezioni Campagna" (superseduta da `DataTypesManager`,
  T-029) — vedi conversazione di origine per l'analisi completa del gap.
- 2026-07-24 (owner): primo giro di `dev` erroneamente basato su `main`
  (branch `task/039-ritira-mock-azioni-downtime` da `main`, commit `c8d16f0`)
  — su `main` T-031/T-033 non esistono ancora (vivono solo sulla catena
  Fase 2 non mergiata), quindi il grep di riferimenti residui non ha potuto
  coprire `admin/page.tsx`/`admin/actions/page.tsx`/`ActionApprovalQueue.tsx`
  (assenti su `main`). L'utente ha corretto: tutto il lavoro di questa
  sessione resta su `task/015-schema-metamodel-dati-campagna`, mai su `main`,
  nessuna PR su `main`. Il commit `c8d16f0` va abbandonato (non mergiato, non
  pushato); il branch `task/039-ritira-mock-azioni-downtime` va ricreato da
  `task/015-schema-metamodel-dati-campagna`. Riportato a `status: todo`.
- 2026-07-24 (dev): riparto da zero. Branch `task/039-ritira-mock-azioni-downtime`
  ricreato correttamente da `task/015-schema-metamodel-dati-campagna` locale
  (commit `1ac2723`, punta ancorata su un worktree isolato per non toccare
  modifiche non committate non correlate presenti nel worktree principale).
  Inizio implementazione.
- 2026-07-24 (dev): rimossa la UI mock (`admin/downtime/page.tsx`,
  `DowntimeManager.tsx`), la voce menu in `BtnCampaignAdmin.tsx`, la card in
  `admin/page.tsx`, la rotta `campaignAdminDowntime` in `routes.ts`. Ripulito
  ogni riferimento residuo (grep `DowntimeManager|campaignAdminDowntime|
admin/downtime|DowntimeAction` ora vuoto): `admin/layout.tsx`,
  `admin/actions/page.tsx` e `ActionApprovalQueue.tsx` avevano solo commenti
  non funzionali, aggiornati. Aggiornati i test coinvolti
  (`BtnCampaignAdmin.test.tsx`, `admin/__tests__/page.test.tsx`,
  `admin/__tests__/layout.test.tsx`). `bunx prisma generate` rieseguito
  (necessario per client Prisma disallineato dallo schema di task precedenti,
  non correlato a questo task). Verde: `type-check`, `lint`; `test:run` ha 10
  fallimenti pre-esistenti in `DataTypesManager.test.tsx`/
  `ReferenceDataManager.test.tsx` (confermato via `git stash`/`pop`: stesso
  conteggio 10 falliti/1284 passati identico prima e dopo le mie modifiche,
  nessuna regressione). Branch: `task/039-ritira-mock-azioni-downtime` (base
  `task/015-schema-metamodel-dati-campagna`, commit `1ac2723`), verificabile
  con `git log task/015-schema-metamodel-dati-campagna..task/039-ritira-mock-azioni-downtime`.
  Nessun push, nessuna PR. Porto lo stato a `in-review`.
- 2026-07-24 (qa): verifica indipendente sul commit `aeafb03` (worktree
  dedicato `.claude/worktrees/agent-a3721ab7bd8696d39`), reviewer già OK
  senza findings. Esiti:
  - `bun run type-check`: verde (nessun errore).
  - `bun run lint`: verde (nessun errore).
  - `bun run test:run`: 10 falliti / 1284 passati (105 file passati, 2 file
    falliti: `DataTypesManager.test.tsx` 6/13, `ReferenceDataManager.test.tsx`
    4/10). Non mi sono fidato della dichiarazione dev/reviewer: ho verificato
    con `git diff 1ac2723 aeafb03 -- <i 4 file coinvolti>` → diff vuoto (T-039
    non li tocca), poi ho eseguito gli stessi due file test in un worktree
    temporaneo creato al solo commit base `1ac2723` (`git worktree add`,
    rimosso a fine verifica) → stessi identici 10 fallimenti con stessa causa
    (`getElementError` in `ReferenceDataManager.test.tsx:576`, bottone
    "delete" non trovato). Confermato: pre-esistenti, non regressione di T-039.
  - Grep indipendente `DowntimeManager|campaignAdminDowntime|admin/downtime|
DowntimeAction` su tutto `src` (source e test): zero risultati. Grep
    largo `-i downtime`: unici residui sono il dominio reale `Feature`
    (`downtimeLearnTalent`, T-019/T-033, legittimo) e un mock **diverso e
    fuori scope**, `CampaignSettings.tsx`/`CampaignsManager.tsx` (form
    org-level di creazione/modifica campagna, campo "Azioni Downtime
    disponibili"/sezione mock "Azioni Downtime" come limite giocatore e voce
    di esempio) — non è il mock ritirato da T-039, correttamente escluso
    dallo scope del task.
  - Letti per intero i 3 file test citati e la loro esecuzione mirata
    (`bunx vitest run` sui 3 file): 13/13 verdi. `BtnCampaignAdmin.test.tsx`
    usa `toEqual` su array esatto delle label del menu (non solo `toContain`)
    → asserzione reale, non vacua: se "Gestione Azioni Downtime" fosse ancora
    presente il test fallirebbe. `admin/__tests__/page.test.tsx` ha un test
    negativo dedicato "no longer links the retired Downtime Actions mock" con
    `expect(serialized).not.toContain("Azioni Downtime")` — verificato
    leggendo `admin/page.tsx`: nessuna `AdminSectionLink`/card verso
    "Azioni Downtime", solo Gestione Staff / Personaggi / Coda Approvazioni /
    Tipi di Dato / Catalogo (placeholder) / Feature. `layout.test.tsx` verifica
    che `CampaignAdminLayout` componga sempre `CampaignRoleGuard` con
    `requiredRole: head_master` sullo slug risolto — la guardia è generica
    per l'intero segmento `admin/*` (composizione layout Next.js, non
    enumerazione di rotte), quindi con `admin/downtime/page.tsx` cancellato
    la rotta `/dashboard/<slug>/admin/downtime` è semplicemente 404, non
    orfana/non guardata. Nessun riferimento a `admin/downtime` nel codice di
    `layout.tsx` (solo nel commento, ora aggiornato).
  - Percorso utente (statico): un head_master apre "Area Master" →
    `BtnCampaignAdmin.tsx` mostra 3 voci (Gestione Campagna, Gestione Staff,
    Gestione Personaggi); l'indice `admin/page.tsx` mostra 6 card/placeholder
    reali, nessuna verso downtime. Confermato via lettura diretta del sorgente
    e via i test sopra.
  - Verdetto: ✅ Verificato. Tutti e 4 i criteri di accettazione passano con
    prova diretta (comandi + lettura sorgente + esecuzione mirata + confronto
    indipendente base/dopo su worktree isolato). Nessun difetto trovato.
    `qa: ok` in frontmatter. Non porto `status: done` (spetta all'owner).
- 2026-07-24 (owner): merge `--no-ff` di `task/039-ritira-mock-azioni-downtime`
  in `task/015-schema-metamodel-dati-campagna` (locale, nessun push, nessuna
  PR, `main` non toccato). Nessun conflitto (auto-merge pulito, incluso su
  `ActionApprovalQueue.tsx` dove il branch T-039 e un commit locale non
  correlato di questa sessione toccavano lo stesso file in punti diversi).
  Rieseguiti `bunx prisma generate`, `bun run type-check`, `bun run lint`,
  `bun run test:run` sull'intero worktree post-merge: type-check e lint
  puliti; test 10 falliti/1292 passati, stesso conteggio e stessa causa
  (`getElementError` su `DataTypesManager.test.tsx`/
  `ReferenceDataManager.test.tsx`) già confermati pre-esistenti da dev,
  reviewer e qa — nessuna regressione post-merge. Condizione di stop (§6 del
  README) soddisfatta: criteri spuntati, test verdi (fallimenti pre-esistenti
  documentati), reviewer OK + qa verificato. Porto `status: done`.
