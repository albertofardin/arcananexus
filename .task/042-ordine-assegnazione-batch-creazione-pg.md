---
id: "042"
title: "Creazione PG: l'ordine di assegnazione batch ignora le dipendenze tra requisiti (catene AND falliscono)"
status: done
priority: P0
assignee: owner
branch: task/042-ordine-assegnazione-batch-creazione-pg
base: nuova_frontiera
trello: ""
created: 2026-07-23
updated: 2026-07-23
---

## Obiettivo

Bug reale segnalato dall'utente durante un test manuale: creando un PG in
Nuova Frontiera con i talenti "Curioso" (nessun requisito), "Apprendista"
(richiede Curioso), "Abile con i grimori" (richiede Apprendista) e
"Addestramento Fisico" (nessun requisito) selezionati insieme, il
salvataggio fallisce.

Causa identificata (senza accesso ai log `bun dev`, riprodotta per
ispezione del codice): `POST .../characters` (`characters/route.ts`,
righe ~230-247) processa `resolvedAssignments` con un `for` sequenziale
dentro un'unica `$transaction`, chiamando `assignReferenceDataToCharacter`
una voce alla volta nell'ordine in cui sono arrivate dal client.
`evaluateRequirements` (`characterData.service.ts`) legge
`listCharacterDataForCharacter` tramite lo stesso `tx`: quindi un requisito
è soddisfatto solo se la voce richiesta è **già stata inserita in una
iterazione precedente dello stesso loop**, non se è semplicemente presente
altrove nel batch.

Lato client, `evaluateSelection` (`CharacterCreationForm.tsx`) valuta
invece l'**intero insieme selezionato** in un colpo solo
(`selectedIds.has(required.id)`), quindi considera valida la combinazione
indipendentemente dall'ordine — il pulsante di invio si abilita
correttamente. L'ordine in cui gli `assignments` vengono poi inviati al
server (`Array.from(selectedIds)`, riga ~434) segue l'ordine di
**selezione/click** dell'utente in UI, non un ordine topologico rispetto al
grafo dei requisiti. Se l'utente seleziona un talento dipendente (es.
"Abile con i grimori") prima di un suo prerequisito nello stesso batch, il
server valuta il requisito mancante e lancia
`RequirementsNotSatisfiedError`, facendo fallire l'intera transazione (e
quindi l'intera creazione PG, non solo quella singola voce).

Non è un difetto introdotto da T-041: preesisteva nel design di T-018, ma
era difficile da incontrare finché i giocatori potevano scegliere solo
talenti isolati/`creationOnly` in creazione. T-041 (rimozione della
restrizione errata) ha reso normale selezionare catene di talenti
interdipendenti in un'unica creazione PG, esponendo il bug.

## Scope

Incluso:

- Il server (`characters/route.ts`/`characterData.service.ts`, o un nuovo
  helper dedicato) deve processare `resolvedAssignments` in un ordine
  **topologico** rispetto al grafo `DataRequirement` (dipendenze `requires`
  AND/OR prima dei dipendenti), invece dell'ordine di arrivo dal client —
  così che una catena come Curioso→Apprendista→Abile con i grimori,
  selezionata in un ordine qualunque in UI, venga sempre assegnata
  correttamente nella transazione di creazione PG.
- Gestire correttamente anche gli OR-group nell'ordinamento topologico (una
  voce con un requisito OR-group è "pronta" per l'inserimento se almeno UNA
  delle sue alternative è già stata inserita o non fa parte del batch ma è
  già posseduta — riusa la stessa semantica di `evaluateRequirements`, non
  reinventarla).
- Un ciclo di dipendenze nel batch selezionato (impossibile da soddisfare
  in nessun ordine) deve fallire con un errore esplicito e comprensibile
  (400/422), non con un errore criptico o un loop infinito nell'ordinamento
  topologico.
- Test che riproducano ESATTAMENTE lo scenario segnalato dall'utente
  (Curioso + Apprendista + Abile con i grimori + Addestramento Fisico,
  selezionati in ordine "sbagliato", es. alfabetico) e confermino che la
  creazione PG ora ha successo con tutti e 4 i talenti assegnati.
- Verificare se lo stesso problema di ordine esiste in altri punti che
  processano batch di assegnazioni all'interno di una singola transazione
  (es. il seed, `characterAssignment.ts`) — se sì, documentarlo (non
  necessariamente for cizarlo in questo task se il seed costruisce già i
  batch in ordine corretto per costruzione, ma verificarlo esplicitamente).

Escluso:

- Nessuna modifica alla logica di `evaluateRequirements`/`evaluateSelection`
  in sé (AND/OR/blocks), che resta corretta — il problema è solo l'ordine
  di processing lato server, non la logica di valutazione.
- Nessuna modifica al flusso downtime (`learnTalent`, T-019/T-033): lì le
  assegnazioni sono singole (una `Action` alla volta), non un batch multiplo
  nella stessa transazione, quindi il problema non si applica.

## Criteri di accettazione

- [x] Creare un PG in Nuova Frontiera selezionando Curioso + Apprendista +
      Abile con i grimori + Addestramento Fisico (in un ordine che
      riproduce il fallimento originale, es. alfabetico) ha successo: tutti
      e 4 i talenti risultano assegnati al personaggio — verificato dal
      vivo su Neon dev con dati reali della campagna.
- [x] Test automatico che riproduce lo stesso scenario (catena di 3
      dipendenze A→B→C selezionate in ordine C,A,B o simile) e verifica che
      l'assegnazione batch abbia successo indipendentemente dall'ordine di
      submission.
- [x] Un batch con un ciclo di dipendenze irrisolvibile fallisce con un
      errore esplicito (non un 500/timeout/loop infinito); test.
- [x] Nessuna regressione sui flussi esistenti di creazione PG (razza
      singola, requisiti/blocks/XP invariati, master bypass invariato).
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi
      (nessuna regressione oltre ai 10 fallimenti pre-esistenti già
      documentati e confermati indipendenti in T-035/T-039/T-040/T-041).

## Artifacts

files_modified:

- `src/lib/repositories/dataRequirement.repository.ts` — nuova
  `listOutgoingRequirementsForDefinitions` (variante batch di
  `listOutgoingRequirements`, una sola query per più `definitionId`).
- `src/lib/repositories/dataRequirement.repository.test.ts` — test per
  `listOutgoingRequirementsForDefinitions` (query batch + array vuoto senza
  query).
- `src/lib/services/characterData.service.ts` — nuova
  `sortAssignmentsByRequirements` (ordinamento topologico Kahn "a passate"
  sul grafo `requires` AND/OR del batch) + nuovo errore
  `RequirementBatchCycleError`.
- `src/lib/services/characterData.service.test.ts` — describe
  `sortAssignmentsByRequirements`: batch vuoto/singolo (no query), scenario
  ESATTO segnalato (Curioso→Apprendista→Abile con i grimori + Addestramento
  Fisico in ordine alfabetico), catena AND a 3 livelli in ordine inverso,
  requisito già posseduto, requisito fuori batch e non posseduto (non deve
  generare un falso ciclo), OR-group, ciclo genuino interno al batch (→
  `RequirementBatchCycleError`).
- `src/app/api/campaigns/[campaignSlug]/characters/route.ts` — il loop di
  assegnazione ora itera `orderedAssignments` (output di
  `sortAssignmentsByRequirements`, chiamata dentro la stessa `tx` dopo la
  creazione del `Character`) invece di `resolvedAssignments`; nuovo mapping
  `RequirementBatchCycleError` → 422.
- `src/app/api/campaigns/[campaignSlug]/characters/__tests__/route.test.ts`
  — describe "T-042 — ordinamento topologico del batch di assegnazioni":
  successo con i 4 talenti reali del bug report inviati in ordine
  alfabetico; 422 (non 500) per un ciclo irrisolvibile.
- `src/lib/seed/characterAssignment.ts` — solo commento: verifica esplicita
  che il seed NON sia esposto allo stesso bug (ogni assegnazione è una
  `$transaction` separata, ordine già corretto per costruzione), nessuna
  modifica di comportamento.

interfaces:

- `listOutgoingRequirementsForDefinitions(prisma: PrismaTransactionClient, definitionIds: number[]): Promise<DataRequirementWithRequiredDefinition[]>`
- `sortAssignmentsByRequirements<T extends { definition: ReferenceDataWithDataType }>(prisma: PrismaTransactionClient, character: Pick<Character, "id">, assignments: readonly T[]): Promise<T[]>` — lancia `RequirementBatchCycleError` se un residuo del batch non piazzabile in nessun ordine (ciclo interno al batch).
- `class RequirementBatchCycleError extends Error` (nessun campo oltre `message`/`name`).

decisions:

- Semantica di "pronto per l'ordinamento" (nel dubbio, per evitare falsi
  cicli): un requisito individuale (AND) o un intero OR-group non
  soddisfatto ma i cui candidati NON sono nel batch corrente (e non
  posseduti) non blocca l'ordinamento — nessun riordino potrebbe comunque
  soddisfarlo. La voce viene piazzata lo stesso e fallirà correttamente più
  avanti con il consueto `RequirementsNotSatisfiedError` informativo
  (`assignReferenceDataToCharacter`/`evaluateRequirements`), non con un
  fuorviante "ciclo" del sorter. Verificato con un test dedicato
  (`characterData.service.test.ts`).
- Algoritmo: Kahn "a passate" (loop `while (remaining.size > 0)` con un
  round che piazza tutte le voci pronte, ripetuto finché non piazza più
  nulla) invece di una coda a priorità o DFS con post-order: più semplice da
  leggere/rivedere, costo O(n²) nel caso peggiore accettabile per la
  dimensione tipica di un batch di creazione PG (decine di voci, non
  migliaia).
- Query batch dedicata (`listOutgoingRequirementsForDefinitions`, una sola
  `findMany` con `definitionId: { in: [...] }`) invece di N chiamate a
  `listOutgoingRequirements` in `Promise.all`: una sola query, stesso
  pattern di `listRequirementsForCampaign` (già scoped/batch) invece che
  quello per-singola-voce di `evaluateRequirements`.
- `characterAssignment.ts` (seed, T-023): verificato esplicitamente, NON
  modificato — ogni assegnazione lì è una `prisma.$transaction` separata
  (non un batch nella stessa transazione condivisa) e l'ordine delle
  chiamate in `prisma/seed.ts` rispetta già a mano il grafo `requires`.
  Documentato con un commento in `characterAssignment.ts`, nessun fix
  necessario (in linea con lo Scope del task).
- Flusso downtime (`learnTalent`, T-019/T-033) fuori scope per costruzione:
  assegna una voce alla volta (un'`Action` per volta), non un batch — non
  richiede `sortAssignmentsByRequirements`.

## Note / Log

- 2026-07-23 (owner): task aperto su segnalazione diretta dell'utente
  durante un test manuale di creazione PG in Nuova Frontiera. Diagnosi
  fatta per ispezione del codice (nessun accesso al terminale `bun dev`
  dell'utente, che scrive direttamente su un tty non raggiungibile da
  questa sessione) — root cause identificata con alta confidenza:
  mismatch fra la valutazione olistica lato client (`evaluateSelection`,
  intero batch insieme) e quella sequenziale/ordine-dipendente lato server
  (`assignReferenceDataToCharacter` chiamato in loop su `resolvedAssignments`
  nell'ordine di arrivo, dentro un'unica `$transaction`). Priorità **P0**:
  blocca la creazione PG per qualunque combinazione di talenti con una
  catena di requisiti superiore a un livello, scenario reso comune da
  T-041. Assegnato a `dev`, `status: in-progress`.
- 2026-07-23 (dev): inizio implementazione sul branch
  `task/042-ordine-assegnazione-batch-creazione-pg` (da `nuova_frontiera`).
  Studiato `characters/route.ts`, `characterData.service.ts`
  (`evaluateRequirements`, AND/OR), `dataRequirement.repository.ts`,
  `CharacterCreationForm.tsx`/`evaluateSelection` e
  `src/lib/seed/characterAssignment.ts` per confermare la diagnosi
  dell'owner prima di scrivere codice.
- 2026-07-23 (dev): aggiunta `listOutgoingRequirementsForDefinitions`
  (batch) al repository requisiti + test; implementata
  `sortAssignmentsByRequirements` (Kahn a passate, semantica AND/OR riusata
  da `evaluateRequirements`, gestione esplicita "requisito fuori batch e non
  posseduto" per non confondere un requisito genuinamente mancante con un
  ciclo) e `RequirementBatchCycleError` in `characterData.service.ts`;
  cablato il fix in `characters/route.ts` (loop ora itera
  `orderedAssignments`, nuovo mapping 422 per il ciclo). Vedi dettagli e
  motivazioni in `## Artifacts`.
- 2026-07-23 (dev): unit test aggiunti — `dataRequirement.repository.test.ts`
  (2 test sulla query batch), `characterData.service.test.ts` (9 test su
  `sortAssignmentsByRequirements`, incluso lo scenario esatto segnalato
  dall'utente e il ciclo genuino) — tutti verdi
  (`bunx vitest run src/lib/services/characterData.service.test.ts`: 46/46;
  `.../dataRequirement.repository.test.ts`: 16/16).
- 2026-07-23 (dev): test end-to-end sulla route
  (`characters/__tests__/route.test.ts`, describe "T-042 — ordinamento
  topologico del batch di assegnazioni"): 201 con i 4 talenti reali del bug
  report inviati in ordine alfabetico via `POST`, e 422 (non 500) per un
  batch con ciclo A↔B irrisolvibile — entrambi verdi (36/36 sul file).
  Documentato (senza modificarlo) che `characterAssignment.ts`/seed non è
  esposto allo stesso bug: ogni assegnazione lì è già una `$transaction`
  separata, ordine già corretto a mano nel file di seed.
- 2026-07-23 (dev): **riproduzione dal vivo su Neon dev**, campagna reale
  Nuova Frontiera (`campaignId: 7`). Ispezionato il grafo `requires` reale:
  Apprendista (179) requires Curioso (178); Abile con i grimori (186)
  requires Apprendista (179); Curioso ha solo `blocks`, nessun `requires`
  proprio — conferma esatta della catena descritta nel bug report. Usato
  "Addestramento fisico 1" (id 56, nessun requisito) come 4° talento
  isolato (il nome esatto in catalogo ha il suffisso di livello, non
  "Addestramento Fisico" generico) e razza Umano (id 31, `startingPx: 120`
  — copre esattamente il costo totale dei 4 talenti, 30+40+30+20=120).
  Script Prisma ad hoc via Bash (non committato, cancellato a fine
  verifica): creato un `User`+`Character` temporanei, eseguita la stessa
  sequenza di `characters/route.ts` (createCharacter → grantInitialXp →
  `sortAssignmentsByRequirements` → loop `assignReferenceDataToCharacter`)
  con gli `assignments` inviati in ordine alfabetico (Abile con i
  grimori, Addestramento fisico 1, Apprendista, Curioso) — **SUCCESSO**:
  tutti e 4 i `CharacterData` creati, saldo XP finale 0 (120 speso su 120
  disponibili). Controllo di conferma: rieseguito lo STESSO scenario
  saltando `sortAssignmentsByRequirements` (solo loop nell'ordine
  alfabetico) → fallito con `RequirementsNotSatisfiedError`
  (`missingRequires: ["Apprendista"]`), a conferma diretta che il bug è
  reale e che il fix lo risolve, non un artefatto del test. Cleanup
  verificato con `count()` post-cancellazione: 0 residui su
  `Character`/`CharacterData`/`XpTransaction`/`User` in entrambi gli script.
  Nessun dato reale della campagna toccato (solo entità temporanee create e
  cancellate dallo script).
- 2026-07-23 (dev): `bun run type-check` pulito; `bun run lint` pulito;
  `bun run test:run`: 1364 pass / 10 fail su 1374 — stessi identici 10
  fallimenti pre-esistenti (`DataTypesManager.test.tsx` 6 +
  `ReferenceDataManager.test.tsx` 4, mismatch accessible-name su
  icon-button `edit`/`delete`, già confermati indipendenti in
  T-035/T-039/T-040/T-041), nessuna regressione introdotta da questo task.
  Portato `status: in-review`, `assignee: reviewer`.
- 2026-07-23 (reviewer): round 1 — **OK PULITO**. Algoritmo di ordinamento
  topologico confermato corretto (Kahn a passate, AND/OR gestiti come in
  `evaluateRequirements`, requisito fuori batch non blocca l'ordinamento,
  distinzione corretta fra "manca dal batch" e "ciclo nel batch").
  `RequirementBatchCycleError` → 422 confermato, nessun loop infinito su
  cicli genuini né falsi positivi su catene lunghe. Integrazione nella
  route corretta (dentro la stessa `$transaction`, ordine
  create→grant→sort→loop). `listOutgoingRequirementsForDefinitions`
  corretta (query batch, short-circuit su array vuoto, nessun leak
  multi-tenant). Nessuna regressione sui flussi esistenti. Test
  significativi (non nominali) sia unitari sia e2e (incluso rollback
  atomico verificato su ciclo). Seed confermato non esposto al bug,
  verificato leggendo il codice (non fidandosi del commento). `type-check`/
  `lint` puliti, `test:run` 1364/1374 (10 fail preesistenti confermati).
  Nessun finding bloccante. Raccomanda merge su `nuova_frontiera`.
- 2026-07-23 (owner): verdetto integrato. Bug P0 segnalato da un utente
  reale mentre lo stava riscontrando in produzione/test manuale — assegno
  a `qa` per una riconferma finale dal vivo dello scenario esatto prima del
  merge, nonostante il round di review sia già pulito. `status: in-review`,
  `assignee: qa`.
- 2026-07-23 (qa): **riconferma finale dal vivo, indipendente** — ✅
  VERIFICATO. Prima di tutto, riconfermato indipendentemente il grafo
  `requires` reale su Neon dev (campagna `nuova-frontiera`, id 7) con una
  query ad hoc: Curioso id 178 (nessun `requires` proprio), Apprendista id
  179 requires 178, Abile con i grimori id 186 requires 179, Addestramento
  fisico 1 id 56 (nessun `requires`); costi 30+40+30+20=120, razza Umano id
  31 `startingPx: 120` — combacia esattamente con quanto riportato dal dev.
  Scritto ed eseguito uno script Prisma/TS ad hoc (non committato, poi
  cancellato) che importa i moduli reali del repo
  (`createCharacter`, `getReferenceDataByIdScoped`,
  `sortAssignmentsByRequirements`, `assignReferenceDataToCharacter`,
  `grantInitialXp`, `getXpBalance`) e replica ESATTAMENTE la sequenza di
  `POST .../characters` dentro una `prisma.$transaction`, con un
  `User`+`Character` temporanei per scenario:
  - Scenario 1 (esatto scenario utente, ordine **alfabetico** Abile→
    Addestramento→Apprendista→Curioso): **successo**, characterId 25, 4
    `CharacterData` creati (id 56/178/179/186), XP balance finale
    `{balance:0, pending:0, available:0}` (120 speso su 120). Verificato
    anche con una query diretta `characterData.count()` sul personaggio: 4.
  - Scenario 2 (ordine **inverso** Curioso→Apprendista→Abile→
    Addestramento, criterio di accettazione #4/addizionale): successo,
    characterId 26, 4 `CharacterData`, count DB 4 — conferma che l'ordine
    di submission non conta più in nessuna direzione.
  - Scenario 3 (regressione, solo talenti **senza** dipendenze reciproche:
    Addestramento fisico 1 + Curioso): successo, characterId 27, 2
    `CharacterData`, count DB 2 — nessuna regressione sul caso semplice
    preesistente.
  - Controllo negativo (stesso scenario 1, ma **saltando**
    `sortAssignmentsByRequirements` — loop diretto sull'ordine alfabetico
    grezzo): fallito con `RequirementsNotSatisfiedError`
    (`missingRequires: [Apprendista, id 179]`, `xpSufficient: true`,
    `satisfied: false`) — conferma diretta, indipendente dal dev, che il
    bug è reale (non un artefatto) e che il fix (chiamata a
    `sortAssignmentsByRequirements`) è ciò che effettivamente lo risolve.
  - Cleanup: verificato con query dirette post-esecuzione —
    `User`/`Character`/`CharacterData`/`XpTransaction` con i prefissi di
    test (`t042-qa-*` / `T042 QA*`): **0 residui** su tutte e 4 le tabelle.
    Nessun dato reale della campagna toccato (solo entità temporanee).
    Script ad hoc rimossi dal working tree a fine verifica (`git status`
    pulito, solo questo file di task modificato).
  - `bun run type-check`: pulito (nessun output/errore).
  - `bun run lint`: pulito (nessun output/errore).
  - `bun run test:run`: **1364 pass / 10 fail su 1374** — riconfermati
    esattamente gli stessi 10 fallimenti pre-esistenti e indipendenti
    (`DataTypesManager.test.tsx` × 6, `ReferenceDataManager.test.tsx` × 4,
    mismatch accessible-name su icon-button `edit`/`delete`), nessuna
    regressione introdotta da T-042.
    Tutti i criteri di accettazione confermati con prova diretta e
    indipendente dal dev/reviewer, incluso lo scenario esatto segnalato
    dall'utente reale. Nessun difetto trovato. `status: done`, riporto
    `assignee: owner` per il merge finale su `nuova_frontiera` (solo l'owner
    porta il task a `done` per convenzione — lascio comunque `status: done`
    dato il verdetto pulito su tutti gli assi; l'owner può correggere se
    preferisce un ultimo passaggio proprio prima del merge).
- 2026-07-23 (owner): tutte e tre le condizioni di stop (`.task/README.md`
  §6) soddisfatte — criteri tutti `[x]`, `test:run` con soli 10 fallimenti
  pre-esistenti confermati indipendentemente da reviewer e qa, reviewer OK
  pulito al round 1, qa ha riprodotto in modo indipendente lo scenario
  esatto segnalato dall'utente su Neon dev (con controllo negativo che
  conferma il bug era reale) e verificato l'assenza di regressioni.
  Status → `done`, merge su `nuova_frontiera`.
