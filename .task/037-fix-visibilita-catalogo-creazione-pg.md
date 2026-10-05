---
id: "037"
title: "Fix: catalogo nascosto/condizionato visibile nella creazione PG"
status: done
priority: P0
assignee: ""
branch: task/037-fix-visibilita-catalogo-creazione-pg
base: task/030-admin-ui-reference-data-catalogo
trello: ""
created: 2026-07-21
updated: 2026-07-21
qa: ok
---

## Obiettivo

Commento utente su PR #49: in creazione PG, talenti e fazioni nascosti (o
condizionati) sono comunque visibili e selezionabili. La pagina
`characters/new/page.tsx` (T-022) filtra i `DataType` solo per
`playerAssignable` ma non applica mai `filterVisible` (T-026,
`src/lib/visibility/filterVisible.ts`) alle singole `ReferenceData`: usa
`listReferenceDataForCampaign` (nessun `visibilityCondition` incluso, nessun
filtro su `visibility`), a differenza di `data/[dataSlug]/page.tsx` (T-020) che
è il consumer di riferimento già corretto. Regola CLAUDE.md violata: "la
valutazione di visibilità deve girare sempre server-side, mai esporre voci
nascoste al client".

## Scope

Incluso:

- `characters/new/page.tsx`: sostituire (o affiancare) `listReferenceDataForCampaign`
  con una query che includa `visibilityCondition` per ogni `ReferenceData` (come
  `listReferenceDataForDataType`, già usata da T-020 — valutare se serve una
  variante campaign-wide con lo stesso include, per evitare N query per
  `DataType`), poi applicare `filterVisible(entries, viewer, context)` prima di
  costruire il `catalog` passato a `CharacterCreationForm` — stesso pattern di
  `data/[dataSlug]/page.tsx:79-91`.
- Costruzione di `VisibilityContext`/`VisibilityViewer` coerente con quella
  pagina: `isStaff` da `isUserCampaignHelper`/`isSuperAdmin` (qui la soglia
  "master vede tutto" già esistente, `isMasterView`, va riconciliata con
  `isStaff` — il master deve continuare a vedere l'intero catalogo, incluse le
  voci nascoste/condizionate, in coerenza col resto della UI admin),
  `ownedData` vuoto/non pertinente in creazione (nessun PG ancora esistente).
- Il grafo requisiti (`requirementGraph`) resta derivato solo dalle voci
  effettivamente visibili dopo il filtro (comportamento già presente,
  `visibleReferenceDataIds`) — non cambia, verificare solo che continui a
  escludere le voci ora correttamente nascoste.
- Test: talento/fazione con `visibility: hidden` non compare nel catalogo
  lato giocatore; con `visibilityConditionId` non soddisfatto non compare;
  master/head_master continua a vedere tutto; nessuna regressione sui test
  esistenti di `CharacterCreationForm`/`characters/new`.

Escluso:

- Cambiare il contratto di `filterVisible`/registry (T-026): riuso, non
  modifica.
- Il gate lato server della route di creazione PG (`POST .../characters`,
  T-018): se già rifiuta un `referenceDataId` non assegnabile/non esistente,
  resta com'è; questo task copre solo cosa viene _mostrato_ nel form.

## Criteri di accettazione

- [x] Un talento/fazione con `visibility: hidden` non compare nel catalogo
      mostrato a un giocatore ordinario in `characters/new`; test.
- [x] Un talento/fazione con `visibilityConditionId` la cui condizione non è
      soddisfatta dal viewer non compare; test.
- [x] Master/head_master (o super-admin) continua a vedere l'intero catalogo,
      incluse le voci nascoste/condizionate (nessuna regressione sul bypass
      staff); test.
- [x] Il grafo requisiti mostrato lato client resta limitato alle sole voci
      effettivamente visibili al viewer corrente (nessuna regressione).
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi (nessuna
      regressione rispetto al base branch).

## Artifacts

files_modified:

- src/lib/repositories/referenceData.repository.ts
- src/lib/repositories/referenceData.repository.test.ts
- src/app/(dashboard)/dashboard/[campaignSlug]/characters/new/page.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/characters/new/**tests**/page.test.tsx (nuovo)
- .task/037-fix-visibilita-catalogo-creazione-pg.md

interfaces:

- "listReferenceDataForCampaignWithVisibility(prisma: PrismaClient, campaignId: number) -> Promise<ReferenceDataWithVisibilityCondition[]>" — nuova query in `referenceData.repository.ts`, intero catalogo di campagna con `visibilityCondition` inclusa in un'unica query (niente N query per `DataType`).

decisions:

- "Aggiunta `listReferenceDataForCampaignWithVisibility` invece di modificare `listReferenceDataForCampaign` (usata da T-016/gestione catalogo, dove la condizione non serve e l'include `dataType` sì): stesso pattern di affiancamento già usato da `listReferenceDataForDataType` accanto a `listReferenceDataForCampaign`, nessuna rottura dei chiamanti esistenti."
- "`isStaff` per `filterVisible` = `isMasterView` (non `isMasterOrAbove` grezzo): la pagina usa già `isMasterView` (= isMasterOrAbove && view !== 'player') come soglia 'vede tutto'/'forza vista giocatore' per i `DataType`; riusarla anche per le singole `ReferenceData` rende l'anteprima `?view=player` coerente end-to-end (un master in anteprima giocatore non vede né DataType né ReferenceData riservati allo staff). Nel caso di default (nessun `?view=player`) `isMasterView === isMasterOrAbove` per un master/head_master/super-admin, quindi il criterio di accettazione 'master continua a vedere tutto' resta soddisfatto."
- "`character: null, ownedData: []` nel `VisibilityContext`: in creazione non esiste ancora un PG né `CharacterData` posseduta, quindi un predicato condizionale basato su `ownedData` (es. `memberOfAnyFactionOrReligion`) è correttamente non soddisfatto in questa fase — nessuna query aggiuntiva necessaria (a differenza di `data/[dataSlug]/page.tsx`, dove il PG può già esistere)."
- "`requirementGraph`/`visibleReferenceDataIds` non toccati: derivano già solo da `catalog` (costruito da `visibleReferenceData` dopo il filtro) — verificato con un test dedicato che un requisito verso un id nascosto viene escluso dal grafo."

## Note / Log

- 2026-07-21 (owner): nuovo task, aperto a partire da un commento dell'utente
  su PR #49 (T-030) — bug riprodotto: talento/fazione nascosti visibili in
  creazione PG. Causa individuata: `characters/new/page.tsx` (T-022) non
  applica mai `filterVisible` (T-026), a differenza del consumer di
  riferimento `data/[dataSlug]/page.tsx` (T-020). Base branch
  `task/030-admin-ui-reference-data-catalogo` (già `done`/PR #49 aperta):
  stacked, per non riaprire la review di T-030 già chiusa.
- 2026-07-21 (dev): inizio implementazione, letto il task file e i consumer di
  riferimento.
- 2026-07-21 (dev): implementato — nuova query
  `listReferenceDataForCampaignWithVisibility` nel repository, applicato
  `filterVisible` in `characters/new/page.tsx` con `isStaff = isMasterView`,
  `character: null`/`ownedData: []` (nessun PG in creazione). Aggiunti test:
  repository (`referenceData.repository.test.ts`) + nuova suite
  `characters/new/__tests__/page.test.tsx` (hidden, condizionale non
  soddisfatta, bypass master/super-admin, bypass negato in `?view=player`,
  grafo requisiti limitato alle voci visibili). Verifica: `bun run
type-check` verde, `bun run lint` verde, `bun run test:run` → 4 test falliti
  su 1102 (`UsersManager.test.tsx` x3, `impersonation-flow.test.tsx` x1),
  confermati pre-esistenti e identici sul base branch (stesso commento
  `git stash` + rerun), non riguardano l'area toccata da questo task. Branch:
  `task/037-fix-visibilita-catalogo-creazione-pg`, verificabile con
  `git switch task/037-fix-visibilita-catalogo-creazione-pg` +
  `bun run test:run`. Status → in-review, consegna al reviewer.
- 2026-07-21 (reviewer): round 1/3 — OK pulito. Verificati isolamento
  multi-tenant (`listReferenceDataForCampaignWithVisibility` scopata su
  `campaignId`, identico a `listReferenceDataForCampaign`), fail-closed di
  `filterVisible`/`isEntryVisible` (nessun crash su funzione sconosciuta o
  predicato che lancia), bypass master/head_master/super-admin corretto sia
  in vista default sia in `?view=player` (staff trattato come giocatore anche
  per le singole `ReferenceData`, non solo i `DataType`), `requirementGraph`
  derivato solo da voci visibili, nessuna regressione sui consumer esistenti
  di `listReferenceDataForCampaign` (invariata, affiancata). Suggerimenti non
  bloccanti (non richiesti prima di QA): (1) divergenza intenzionale di
  soglia `isStaff` tra questo consumer (`isMasterView`) e
  `data/[dataSlug]/page.tsx` (`isUserCampaignHelper`); (2) test "requirement
  graph" solo negativo, manca un caso positivo con requisito tra due voci
  entrambe visibili; (3) test condizione non soddisfatta passa per
  `ownedData: []` sempre-falso. Nessuna migrazione Prisma introdotta. Pronto
  per QA.
- 2026-07-21 (qa): **verdetto PASS** su tutti e 5 i criteri, verificati con
  prova diretta (codice + test eseguiti + riproduzione dal vivo), non solo
  lettura del Log del dev. Setup: lavorato direttamente nel worktree esistente
  `core-task-037` (branch `task/037-fix-visibilita-catalogo-creazione-pg`,
  nessun nuovo worktree creato), `.env` symlinkato temporaneamente a
  `../core/.env` (DB Neon reale, stesso pattern usato dal QA di T-030),
  rimosso a fine verifica.
  - Check statici: `bun run type-check` → nessun output/errore (verde).
    `bun run lint` → nessun output/errore (verde).
  - Test mirati: `bunx vitest run src/lib/repositories/referenceData.repository.test.ts
"src/app/(dashboard)/dashboard/[campaignSlug]/characters/new/__tests__/page.test.tsx"`
    → `Test Files 2 passed (2)`, `Tests 26 passed (26)`.
  - Suite completa: `bun run test:run` → `Test Files 2 failed | 92 passed (94)`,
    `Tests 4 failed | 1098 passed (1102)`. Fallimenti isolati e confermati
    identici a quelli dichiarati dal dev: `UsersManager.test.tsx` (3 test,
    tutti sull'azione "Impersona") + `impersonation-flow.test.tsx` (1 test).
    Confermato via `git diff task/030-admin-ui-reference-data-catalogo...HEAD
-- <questi due file>` → nessun diff: i file di test non sono toccati da
    T-037, quindi i fallimenti sono pre-esistenti/indipendenti, non
    regressioni introdotte da questo task. Criterio 5 **PASS**.
  - Letto `filterVisible`/`isEntryVisible` (`src/lib/visibility/filterVisible.ts`):
    confermato bypass staff, fail-closed su condizione non risolta/predicato
    che lancia, comportamento base `visible`/`hidden` — coerente con quanto
    dichiarato. Confermato che il test "condizione non soddisfatta" non mocka
    `memberOfAnyFactionOrReligion` (verificato con `grep` sul registry reale),
    quindi esercita il predicato vero, non uno stub.
  - **Riproduzione dal vivo** (Neon, DB QA condiviso, `bun dev` contro
    `demo-metamodello`, campagna id 6): creato temporaneamente via API admin
    (`mattia@arcana.it`) sul `DataType` "Religioni" (id 16, `playerAssignable:
true`) due `ReferenceData`: `QA T037 Setta Segreta` (`visibility: hidden`)
    e `QA T037 Fede Riservata` (`visibility: visible`, `visibilityConditionId:
1` → `memberOfAnyFactionOrReligion`, condizione reale già presente in
    campagna, non creata ad hoc). Poi: - login `giocatore.demo@ad.com` (giocatore ordinario, PG demo) →
    `GET /dashboard/demo-metamodello/characters/new`: HTML contiene "Culto
    del Sole Nascente"/"Via del Bosco Sacro" (voci `visible` preesistenti)
    ma **non** contiene "QA T037 Setta Segreta" né "QA T037 Fede
    Riservata". **PASS** criteri 1 e 2. - login `master.campaign1@ad.com` (grant `master` su `demo-metamodello`)
    → stessa pagina: contiene entrambe le voci nascoste/condizionate
    (catalogo intero). **PASS** criterio 3 (bypass master). - stesso utente master con `?view=player`: nessuna delle due voci
    compare — conferma che l'anteprima giocatore forza `isStaff: false`
    anche per le singole `ReferenceData`, non solo per i `DataType`. - login `mattia@arcana.it` (super-admin, nessun grant diretto su
    `demo-metamodello`) → stessa pagina: entrambe le voci presenti.
    **PASS** criterio 3 (bypass super-admin). - grafo requisiti (criterio 4): nessun `DataRequirement` reale disponibile
    da esercitare dal vivo in questo giro senza sporcare ulteriormente lo
    stato condiviso; verificato invece via il test dedicato "only derives
    the requirement graph from entries that remain visible after
    filtering" (passato, vedi sopra) + lettura del codice
    (`visibleReferenceDataIds` derivato da `catalog`, costruito solo da
    `visibleReferenceData` dopo `filterVisible`) — copertura sufficiente,
    non ho trovato un caso reale pronto nel seed per il solo criterio 4 dal
    vivo (gap non bloccante, annotato invece di inventare dati extra). - pulizia: `DELETE reference-data/22` e `/23` (entrambi 204), poi
    re-`GET reference-data?dataTypeId=16` confermato tornato alle sole 2
    voci seed originali (`Culto del Sole Nascente` id 4, `Via del Bosco
Sacro` id 5). DB QA condiviso lasciato pulito.
  - Suggerimenti non bloccanti del reviewer (round 1) non ri-verificati punto
    per punto (non richiesti prima di QA, confermato dal Log reviewer stesso):
    presi per buoni, nessuno di essi tocca i criteri di accettazione.
  - Verdetto finale: **PASS** su tutti e 5 i criteri, prova diretta per 1/2/3/5
    (codice + test + dal vivo), prova indiretta (test + codice, non dal vivo)
    per il criterio 4 — gap dichiarato sopra, non bloccante. Nessun difetto
    trovato. Non porto lo status a `done` (competenza owner, README §6):
    lasciato `in-review`, `qa: ok` in frontmatter, riassegnato a `owner`.
- 2026-07-21 (owner): review OK pulito round 1, QA PASS su tutti i criteri
  (gap non bloccante sul criterio 4, solo prova indiretta). Tutte e tre le
  condizioni di stop (README §6) soddisfatte: status → `done`. Apro PR
  stacked su task/030 (PR #49).
- 2026-07-21 (owner): commento utente su PR #52 — "non gestisce le
  visibilityFunction, es. talenti visibili solo se membro di una fazione?".
  Chiarito con l'utente (decisione esplicita): comportamento voluto, non un
  bug. `ownedData: []` in creazione è corretto perché non esiste ancora
  alcun `CharacterData` posseduto — un talento condizionato su
  "appartenenza a una fazione" resta nascosto nel form di creazione e si
  sblocca più avanti in gioco (azione/downtime) dopo che il PG ha già quella
  fazione, non nello stesso form. Nessuna modifica al codice. Risposto sul
  PR.
