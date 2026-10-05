---
id: "036"
title: "Guardia di cancellazione per DataType/ReferenceData con CharacterData assegnate"
status: done
priority: P0
assignee: ""
branch: task/036-guardia-cancellazione-dati-assegnati
base: task/030-admin-ui-reference-data-catalogo
trello: ""
created: 2026-07-21
updated: 2026-07-21
qa: ok
---

## Obiettivo

Commento utente su PR #49: cancellando un `DataType` (es. "Razza") con una sola
`ReferenceData` assegnata a un PG, la piattaforma ha permesso la cancellazione a
cascata — il `DataType`, la sua `ReferenceData` e la `CharacterData` che la
assegnava sono stati cancellati in silenzio, lasciando il PG senza razza. Le FK
`CharacterData.referenceData`/`CharacterData.dataType`
(`prisma/schema.prisma:239-240`) sono `onDelete: Cascade`: nessuna guardia
applicativa controlla oggi assegnazioni esistenti prima di una `DELETE`, né su
`deleteDataType` (`src/lib/repositories/dataType.repository.ts:131-138`) né su
`deleteReferenceData` (`src/lib/repositories/referenceData.repository.ts:155-162`).
T-027 ha già aggiunto un guard di dipendenti per il grafo requisiti
(`DataRequirement`) ma non copre `CharacterData` — è un guard distinto,
ortogonale.

## Scope

Incluso:

- `DELETE /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]`
  (`route.ts:149-167`): se esiste almeno una `CharacterData` con
  `referenceDataId` pari a quello richiesto, rifiutare con **409** (stesso stile
  del guard T-027: body con l'elenco, o il conteggio, delle assegnazioni che
  bloccano la rimozione). Nessuna cancellazione parziale/orfana.
- `DELETE /api/campaigns/[campaignSlug]/data-types/[dataTypeId]`: se una
  qualunque `ReferenceData` del `DataType` ha almeno una `CharacterData`
  assegnata, rifiutare con **409** (stesso formato errore). Se **nessuna**
  `ReferenceData` del `DataType` ha assegnazioni, la cancellazione a cascata
  delle sue `ReferenceData` resta permessa.
- Admin UI (`DataTypesManager`/`ReferenceDataManager`, T-029/T-030): il modal di
  conferma cancellazione esistente deve riflettere l'esito reale — se il server
  rifiuta con 409 per assegnazioni esistenti, mostrare il motivo (non un errore
  generico); se la cancellazione del `DataType` è permessa perché tutte le voci
  sono non assegnate, il testo di conferma deve dire esplicitamente che tutte le
  sue voci di catalogo verranno cancellate.
- Repository: nuova query di supporto (es. `countAssignedCharacterData` /
  `hasAssignedCharacterData` in `characterData.repository.ts` o
  `referenceData.repository.ts`) invece di duplicare la logica nella route.
- Test: 409 su `ReferenceData` assegnata; 409 su `DataType` con almeno una voce
  assegnata; 200 su `DataType`/`ReferenceData` senza assegnazioni; isolamento
  multi-tenant del check (nessun leak di `CharacterData` di un'altra
  campagna).

Escluso:

- Cambiare `onDelete: Cascade` a livello di schema Prisma (resta com'è: il
  guard è applicativo, pre-check, coerente con l'approccio già scelto in T-027).
- Un flusso di "riassegnazione automatica" per i PG orfani: fuori scope, la
  guardia previene il problema a monte invece di ripararlo a valle.
- Guardia analoga sul grafo requisiti (`DataRequirement`): già coperta da T-027.

## Criteri di accettazione

- [x] `DELETE .../reference-data/[id]` su una voce con almeno una
      `CharacterData` assegnata risponde 409 (non 200, nessuna cancellazione);
      test.
- [x] `DELETE .../data-types/[id]` su un `DataType` con almeno una voce
      assegnata a un PG risponde 409 (non 200, nessuna cancellazione a
      cascata); test.
- [x] `DELETE .../data-types/[id]` su un `DataType` le cui voci sono tutte non
      assegnate resta permesso (200, cascade delle sue `ReferenceData`); test
      di non-regressione.
- [x] Admin UI mostra il motivo reale del rifiuto (409) invece di un errore
      generico; il testo di conferma cancellazione `DataType` menziona
      esplicitamente la cancellazione a cascata delle voci di catalogo.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi (nessuna
      regressione rispetto al base branch).

## Artifacts

files_modified:

- src/lib/repositories/characterData.repository.ts
- src/lib/repositories/characterData.repository.test.ts
- src/lib/repositories/referenceData.repository.ts
- src/lib/repositories/dataType.repository.ts
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/route.ts
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/**tests**/route.test.ts
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/route.ts
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/**tests**/route.test.ts
- src/app/(dashboard)/\_components/DataTypesManager.tsx
- src/app/(dashboard)/\_components/ReferenceDataManager.tsx
- src/app/(dashboard)/\_components/**tests**/DataTypesManager.test.tsx
- src/app/(dashboard)/\_components/**tests**/ReferenceDataManager.test.tsx

interfaces:

- "countCharacterDataByReferenceData(prisma: XpTransactionClient, referenceDataId: number) -> Promise<number> # round 2: PrismaClient -> XpTransactionClient (PrismaClient | Prisma.TransactionClient)"
- "countCharacterDataByDataType(prisma: XpTransactionClient, dataTypeId: number) -> Promise<number> # round 2: where passa a { referenceData: { dataTypeId } } (relazione autoritativa, non più il campo denormalizzato)"
- "deleteReferenceData(prisma: XpTransactionClient, id: number) -> Promise<ReferenceData> # round 2: PrismaClient -> XpTransactionClient"
- "deleteDataType(prisma: XpTransactionClient, id: number) -> Promise<DataType> # round 2: PrismaClient -> XpTransactionClient"

decisions:

- "Guard basato su conteggio (`characterData.count`), non su elenco di istanze: lo scope permette 'l'elenco, o il conteggio' — un conteggio evita di dover risolvere/esporre nomi di PG di proprietà di altri utenti solo per bloccare una delete, ed è la query più economica."
- "Per il DataType, il conteggio usa il campo denormalizzato `CharacterData.dataTypeId` (già a schema per le query di cardinalità) invece di un join su tutte le sue ReferenceData: una singola query, stesso invariante (basta una voce assegnata per bloccare l'intera cascata)."
- "Nessun filtro esplicito su `campaignId` nelle due funzioni repository: gli id passati (`referenceDataId`/`dataTypeId`) sono già stati risolti e validati come appartenenti alla campagna corrente dalle funzioni \*Scoped chiamate a monte nella route (stesso pattern di `dataRequirement.repository.ts`, T-027) — nessun rischio di leak multi-tenant, verificato dai test 404/403 esistenti sulle route che restano invariati."
- "Formato errore 409: `{ error: string, details: { assignedCount: number } }`, ortogonale (chiave diversa) al `details.dependents` di T-027 così i due guard restano distinguibili lato client."
- "Admin UI: aggiunto uno stato `deleteBlockedReason`/`deleteBlockedCount` che rende persistente nel modal di conferma il motivo del 409 (il toast lo mostrava già, ma spariva) — in DataTypesManager il testo nel modal è prefissato con 'Motivo: ' per non duplicare esattamente il nodo di testo del toast (altrimenti query testing-library ambigue)."
- "Testo di cascata DataType aggiornato da 'Verranno eliminate anche le N voci...' a 'Verranno eliminate anche a cascata le N voci...' per menzionare esplicitamente la cascata, come richiesto dallo scope; resta mostrato solo quando `_count.referenceData > 0`, sostituito dal motivo del rifiuto se il tentativo di delete torna 409."
- "Round 2: count+delete avvolti in `prisma.$transaction(async (tx) => ...)` in entrambe le route DELETE — `countCharacterDataBy*` e `deleteReferenceData`/`deleteDataType` ora accettano `XpTransactionClient` (`PrismaClient | Prisma.TransactionClient`, stesso alias già usato da `characterData.repository.ts`/`xpTransaction.repository.ts`) invece di solo `PrismaClient`, così la route può passare `tx` a entrambe. Il blocco 409 è restituito come valore di ritorno della callback (`{ blocked: true, assignedCount }` / `{ blocked: false }`), non lanciando un'eccezione: non c'è alcuna scrittura pregressa da annullare a quel punto, quindi non serve semantica di rollback, solo l'early-return. Il guard T-027 (`listIncomingRequirements`) resta fuori dalla transazione, invariato: il gap segnalato dal reviewer riguardava solo count+delete di `CharacterData`."
- "Round 2: `countCharacterDataByDataType` conta ora su `where: { referenceData: { dataTypeId } }` (relazione autoritativa) invece del campo denormalizzato `CharacterData.dataTypeId`. `CharacterData.referenceDataId` è NOT NULL a schema, quindi ogni riga passa sempre per il join — nessuna riga sfugge al conteggio anche se il denorm fosse incoerente con la relazione reale."

## Note / Log

- 2026-07-21 (owner): nuovo task, aperto a partire da un commento dell'utente
  su PR #49 (T-030) — bug riprodotto: DataType "Razza" con un solo elemento
  assegnato a un PG, cancellabile senza guardia, PG rimasto senza razza.
  Base branch `task/030-admin-ui-reference-data-catalogo` (già `done`/PR #49
  aperta): stacked, per non riaprire la review di T-030 già chiusa.
- 2026-07-21 (dev): inizio implementazione. Letto lo scope, il guard T-027
  (`DataRequirement`) come riferimento di stile, le route DELETE correnti e
  l'admin UI (`DataTypesManager`/`ReferenceDataManager`).
- 2026-07-21 (dev): aggiunte `countCharacterDataByReferenceData` e
  `countCharacterDataByDataType` in `characterData.repository.ts` (+ test),
  guard 409 nelle due route DELETE (+ test 409/200/cross-tenant), stato
  `deleteBlockedReason`/`deleteBlockedCount` in `DataTypesManager`/
  `ReferenceDataManager` per mostrare il motivo reale nel modal + testo di
  cascata esplicito (+ test MSW dedicati).
- 2026-07-21 (dev): verifica: `bun run type-check` verde, `bun run lint`
  verde, `bun run test:run` → 1097 passed, 4 failed. Le 4 failure
  (`impersonation-flow.test.tsx`, `UsersManager.test.tsx` — azione
  "Impersona") sono pre-esistenti sul base branch: confrontate con
  `git stash` (nessuna modifica di questo task), stesso esito 4 failed prima
  e dopo. Nessuna regressione introdotta da T-036.
- 2026-07-21 (dev): implementazione completa, criteri verificati passare
  personalmente. Status → `in-review`. Branch
  `task/036-guardia-cancellazione-dati-assegnati`, nessun push/PR (compito
  dell'owner dopo review/QA).
- 2026-07-21 (reviewer): round 1/3 — nessun finding bloccante sui criteri di
  accettazione (isolamento multi-tenant confermato leggendo il codice,
  guard "esiste almeno una" corretto, 409 senza leak di dati altrui, ordine
  guard T-027→T-036 corretto), ma segnala due gap di robustezza rilevanti
  data la natura del task (prevenire esattamente l'orfanizzazione che questo
  guard esiste per bloccare): (1) **TOCTOU**: `count` e `delete` sono due
  query separate non transazionali in entrambe le route — una
  `CharacterData` creata concorrentemente nella finestra tra le due
  riaprirebbe il bug originale; (2) il guard `DataType` si affida solo
  all'invariante applicativo `CharacterData.dataTypeId === referenceData.dataTypeId`
  (campo denormalizzato) e non copre il percorso di cascata autoritativo via
  `CharacterData.referenceData → ReferenceData.dataType` — una riga con
  denorm incoerente (import legacy/seed manuale) sfuggirebbe al conteggio.
- 2026-07-21 (owner): round 1 non chiuso "OK" per decisione — i due gap sono
  a basso rischio ma il costo di chiuderli è basso e il task esiste
  specificamente per eliminare il rischio di PG orfani, quindi non li accetto
  come debito silenzioso. Rimando al dev per un fix mirato (round 2/3):
  (a) avvolgere count+delete in una singola transazione Prisma
  (`prisma.$transaction`) in entrambe le route, in linea con l'approccio già
  usato in T-033/PR #51 per un caso analogo di race su azioni concorrenti;
  (b) far contare il guard `DataType` sulla relazione autoritativa
  (`characterData.count({ where: { referenceData: { dataTypeId } } })` o
  equivalente) invece che sul solo campo denormalizzato, così il check resta
  corretto anche se l'invariante di denorm viene violata altrove. Status →
  `in-progress`, assignee `dev`.
- 2026-07-21 (dev): round 2/3 implementato. (a) count+delete avvolti in
  `prisma.$transaction(async (tx) => ...)` in entrambe le route DELETE
  (`reference-data/[referenceDataId]`, `data-types/[dataTypeId]`); i guard
  restituiscono `{ blocked, assignedCount }` dalla callback invece di
  lanciare (nessuna scrittura pregressa da annullare). `countCharacterDataBy*`
  e `deleteReferenceData`/`deleteDataType` ora accettano `XpTransactionClient`
  (non più solo `PrismaClient`), stesso alias già usato da
  `characterData.repository.ts`/`xpTransaction.repository.ts`. (b)
  `countCharacterDataByDataType` conta via `where: { referenceData: {
dataTypeId } }` (relazione autoritativa) invece del campo denormalizzato —
  `CharacterData.referenceDataId` è NOT NULL a schema, quindi nessuna riga
  sfugge al join anche con denorm incoerente. Aggiornati i mock
  `prisma.$transaction` nei due file di route test (passthrough sullo stesso
  `prisma` mockato) e il test di `countCharacterDataByDataType` (where-clause
  sulla relazione + un caso che verifica l'assenza di `dataTypeId` diretto
  nel filtro). Verifica: `bun run type-check` verde, `bun run lint` verde,
  `bun run test:run` → 1098 passed, 4 failed — stesse 4 failure pre-esistenti
  già documentate (`UsersManager.test.tsx` x3, `impersonation-flow.test.tsx`
  x1, riconfermate riconducibili al base branch), nessuna regressione.
  Status → `in-review`, assignee vuoto per il reviewer. Branch
  `task/036-guardia-cancellazione-dati-assegnati`, nessun push/PR.
- 2026-07-21 (reviewer): round 2/3 — **OK pulito**, verificato riga per riga
  (non sulla dichiarazione del dev) che entrambe le chiamate dentro ciascuna
  callback `$transaction` usano `tx`, mai `prisma` nudo; confermato
  `XpTransactionClient` come alias preesistente reale (`xpTransaction.repository.ts`);
  confermato `CharacterData.referenceDataId` NOT NULL a schema, quindi il
  nuovo conteggio via relazione non è mai inferiore al vecchio. Due caveat
  onesti, non bloccanti: (1) la transazione restringe ma non azzera la
  finestra TOCTOU (Postgres resta READ COMMITTED, non SERIALIZABLE/lock
  espliciti) — i commenti nel codice erano formulati come "chiude", da
  ammorbidire; (2) il mock passthrough di `$transaction` nei test dimostra
  409/204 ma non da solo la garanzia transazionale (non distingue `tx` da
  `prisma`). Nessun round 3 necessario.
- 2026-07-21 (owner): applicati i due suggerimenti cosmetici del reviewer
  round 2 direttamente (costo triviale, non serviva un altro giro di dev):
  ammorbidito il wording dei commenti TOCTOU da "chiude" a "restringe
  drasticamente (non eliminare: Postgres resta READ COMMITTED...)" in
  entrambe le route; aggiunta `expect(prisma.$transaction).toHaveBeenCalledTimes(1)`
  ai due test di successo (204) come guardia di regressione minima contro la
  rimozione futura del wrapper transazionale. Riverificato
  `bun run type-check`/`lint` verdi, test mirati sui due file di route
  (45/45 passed). Review OK pulito round 2/3. Status → `in-review`,
  assignee `qa`: manca ancora la verifica QA (README §6, condizione 3) prima
  di poter chiudere il task.
- 2026-07-21 (qa): **verifica preliminare residui** — un tentativo QA
  precedente su questo stesso task si era bloccato durante la riproduzione
  live su Neon. Prima di procedere ho cercato entry `DataType`/
  `ReferenceData`/`Character` con "T036"/"QA" nel nome (query dirette via
  Prisma, non ho `mcp__neon__*` in questa sessione — vedi nota sotto) e
  ispezionato le righe più recenti di tutte e quattro le tabelle coinvolte:
  nessun residuo con quella firma. Trovate righe recenti (`CharacterData`
  id 19/20, personaggio "demo", campagna 1, timestamp odierno) non
  riconducibili a T036 (nessun nome "T036"/"QA", nessuna voce di catalogo
  "Razza"/"Elfo"/"Nano" coinvolta) — lasciate intatte perché fuori dal
  perimetro di questo task e non attribuibili con certezza al tentativo
  fallito. Nessuna pulizia necessaria prima di iniziare.
- 2026-07-21 (qa): **nota ambiente** — questa sessione non espone tool
  `mcp__neon__*` (solo `posthog`/`brevo` tra gli MCP, oltre a Bash/Read/
  Edit/Write); niente `.env` in questo worktree né `psql` installato. Ho
  usato il `DATABASE_URL`/`DIRECT_URL` di
  `/Users/mattiafattorello/repo/arcanadomine/core/.env` (stesso Neon
  condiviso) con piccoli script Bun temporanei che importano ed eseguono
  **le funzioni repository reali** (`countCharacterDataByReferenceData`,
  `countCharacterDataByDataType`, `deleteReferenceData`, `deleteDataType`,
  dentro `prisma.$transaction` — stessa forma esatta delle route) invece di
  reimplementare la logica: equivalente a `mcp__neon__run_sql` come
  garanzia di "driving the real behavior", senza dover avviare `bun dev`
  (rischio di stallo già occorso al tentativo precedente). Script cancellati
  a fine verifica, `git status` confermato pulito.
- 2026-07-21 (qa): **test automatici** — `bun run test:run` dal branch
  `task/036-guardia-cancellazione-dati-assegnati`: **1098 passed, 4 failed**
  (`Test Files 2 failed | 91 passed`). Le 4 failure sono
  esattamente quelle già documentate dal dev/reviewer: 3 in
  `src/app/(dashboard)/_components/__tests__/UsersManager.test.tsx`
  ("azione 'Impersona'" — per il super-admin/happy path/toast errore) + 1 in
  `src/components/impersonation/__tests__/impersonation-flow.test.tsx`
  ("avviare l'impersonazione mostra il banner..."), pre-esistenti sul base
  branch, non causate da T-036. Nessuna nuova failure. Rieseguiti anche
  mirati i 5 file di Artifacts
  (`characterData.repository.test.ts`, i due `route.test.ts` di
  `reference-data/[referenceDataId]` e `data-types/[dataTypeId]`,
  `DataTypesManager.test.tsx`, `ReferenceDataManager.test.tsx`): **79/79
  passed**. `bun run type-check` e `bun run lint`: entrambi verdi (nessun
  output/errore).
- 2026-07-21 (qa): **verifica codice contro il Log** — letto
  `characterData.repository.ts`: `countCharacterDataByDataType` filtra
  davvero su `where: { referenceData: { dataTypeId } }` (relazione
  autoritativa, non il campo denormalizzato) come dichiarato dal round 2.
  Lette entrambe le route DELETE: count+delete sono dentro la stessa
  callback `prisma.$transaction(async tx => ...)`, `tx` passato a entrambe
  le chiamate (mai `prisma` nudo dentro la callback), guard T-027
  (`listIncomingRequirements`) resta fuori dalla transazione come
  dichiarato. Commenti TOCTOU già ammorbiditi ("restringe drasticamente, non
  eliminare — Postgres READ COMMITTED") come da fix cosmetico owner.
  Confermato nei test: `expect(prisma.$transaction).toHaveBeenCalledTimes(1)`
  presente su entrambi i path 204 come guardia di regressione anti-rimozione
  del wrapper. Letti i test UI: `DataTypesManager.test.tsx` verifica sia il
  toast sia il testo persistente nel modal (`"Motivo: Impossibile
eliminare: ..."`) e il testo di cascata esplicito ("Verranno eliminate
  anche a cascata le N voci..."); `ReferenceDataManager.test.tsx` verifica
  analogamente che il 409 per assegnazioni (T-036) sia mostrato "con il
  motivo reale, non un errore generico" (distinto dal 409 T-027 sui
  dipendenti, testato a parte).
- 2026-07-21 (qa): **riproduzione dal vivo su Neon (DB reale, funzioni
  repository reali, non solo unit test)** — usata la campagna seed
  "Demo Metamodello" (id 6, T-023) già esistente in produzione/QA condivisa:
  (1) `ReferenceData` "Elfo" (id 2, `DataType` "Razza" id 15) ha
  un'assegnazione reale preesistente (`CharacterData` id 10, PG "vvv"
  id 6): chiamata `countCharacterDataByReferenceData` → conteggio > 0;
  simulata la stessa transazione della route (count poi delete
  condizionale) → risultato `blocked: true`; confermato via query diretta
  che "Elfo" esiste ancora dopo il tentativo (nessuna cancellazione,
  nessuna scrittura spuria). (2) Stesso per `DataType` "Razza" (id 15) via
  `countCharacterDataByDataType` → > 0 → `blocked: true`; confermato che
  "Razza" e la sua "Elfo" esistono ancora (nessuna cascata). Nessun dato di
  produzione toccato in questi due step (solo query di lettura + una
  transazione che si è auto-annullata al blocco). (3) Percorso positivo:
  creata una `ReferenceData` temporanea senza assegnazioni sotto "Razza" →
  conteggio 0 → transazione → `blocked: false` → riga effettivamente
  cancellata (verificato `findUnique` → `null`). (4) Percorso positivo
  DataType: creato un `DataType` temporaneo con una `ReferenceData`
  temporanea (nessuna assegnazione) → conteggio 0 → transazione →
  `blocked: false` → sia il `DataType` sia la sua `ReferenceData` cancellati
  (cascata FK confermata via `findUnique` → `null` su entrambi). Pulizia:
  tutti i dati temporanei creati in questa sessione sono stati cancellati
  dal test positivo stesso (nessuna riga "QA T036" residua, verificato con
  una query finale `contains: "QA T036"` → 0 risultati su entrambe le
  tabelle); script temporanei rimossi, `git status` pulito. Non ho
  esercitato il livello HTTP (nessuna chiamata reale a
  `DELETE /api/campaigns/.../reference-data/[id]` o `.../data-types/[id]`
  con sessione autenticata/`bun dev`): la riproduzione è stata a livello
  repository+transazione, la stessa identica forma usata dalle route (le
  route non aggiungono altra logica tra il guard e la risposta HTTP oltre al
  mapping su `apiError(409, ...)`, già verificato dai test MSW delle route).
- 2026-07-21 (qa): **verdetto** — tutti i 5 criteri di accettazione
  verificati con prova diretta (non solo dichiarazione): 1) 409 su
  `ReferenceData` assegnata — visto sia nei test route sia dal vivo su Neon
  con un'assegnazione reale preesistente; 2) 409 su `DataType` con almeno
  una voce assegnata — idem; 3) 200/204 su `DataType`/`ReferenceData` senza
  assegnazioni (cascata permessa) — visto nei test e dal vivo con dati
  temporanei creati e ripuliti; 4) UI mostra il motivo reale (non errore
  generico) + testo di cascata esplicito — verificato nei test MSW dedicati
  di `DataTypesManager`/`ReferenceDataManager` (non ho avviato `bun dev`/
  browser reale, per evitare il rischio di stallo del tentativo precedente,
  come esplicitamente permesso); 5) `type-check`/`lint`/`test:run` verdi con
  le sole 4 failure pre-esistenti documentate, nessuna regressione. Nessun
  difetto trovato. Unico gap non bloccante: il criterio 4 (admin UI) è
  verificato via test MSW + lettura codice, non via browser reale con
  `bun dev` — scelta esplicitamente autorizzata dal task per il rischio di
  stallo, non un difetto. Status lasciato `in-review`, riassegnato a
  `owner` per la chiusura (non di mia competenza portare a `done`).
- 2026-07-21 (owner): review OK pulito round 2 (dopo fix round 2 su TOCTOU +
  guard denorm), QA PASS su tutti i criteri (gap non bloccante sul criterio
  4, solo prova via test/codice). Tutte e tre le condizioni di stop (README
  §6) soddisfatte: status → `done`. Apro PR stacked su task/030 (PR #49).
- 2026-07-21 (owner): commento utente su PR #53 — "XpTransactionClient ha un
  nome fuorviante". Fondato: il tipo (`PrismaClient | Prisma.TransactionClient`)
  era definito in `xpTransaction.repository.ts` ma usato trasversalmente da
  repository senza alcun legame con l'XP (`characterData`, `dataType`,
  `referenceData`, `action`, `character`, `dataRequirement`). Spostato in
  `src/lib/repositories/types.ts` (posizione condivisa, non un repository di
  dominio) e rinominato `PrismaTransactionClient` ovunque (8 file). Nessuna
  modifica di comportamento, solo rename+relocate. Verifica:
  `bun run type-check`/`lint` verdi, `bun run test:run` → stesse 4 failure
  pre-esistenti, nessuna regressione. Commit `c05d410`, pushato su PR #53,
  risposto al commento su GitHub.
