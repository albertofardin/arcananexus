---
id: "017"
title: "Servizio dati-personaggio: assegnazione con cardinalità, requisiti soft, override master, addebito XP"
status: done
priority: P0
assignee: owner
branch: task/017-servizio-assegnazione-dati-pg
base: task/016-catalogo-campagna-repo-api
trello: ""
created: 2026-07-13
updated: 2026-07-14
---

## Obiettivo

Logica riusabile per assegnare voci di catalogo (`ReferenceData`) a un PG — in
creazione, da parte del master, o via azione approvata (downtime "apprendi talento") —
creando la riga `CharacterData`, rispettando la cardinalità del `DataType`, valutando i
requisiti in modo **soft**, registrando l'override quando il master forza, e
addebitando il costo XP tramite il ledger (T-025). È il cuore delle regole di scheda PG
e il punto in cui parte A/B (dati) e parte C (azioni) si toccano.

## Scope

Incluso:

- Servizio `assignReferenceDataToCharacter(...)` + `evaluateRequirements(character, definition)`.
- **`evaluateRequirements`** valuta due sorgenti:
  - `DataRequirement` (`requires` = deve avere / `blocks` = mutua esclusione) →
    controlla i `CharacterData` già posseduti dal PG;
  - **soglie numeriche dai `flags`** (es. `requires` livello/PX): confronta con il saldo
    XP (via servizio T-025). Ritorna requisiti mancanti e bloccanti.
- Regole di assegnazione:
  - `playerAssignable` + requisiti soddisfatti + (se `creationOnly`) siamo in creazione
    - XP sufficiente ⇒ self-assign consentito;
  - master ⇒ **sempre** consentito (override); se i requisiti non sono soddisfatti salva
    `grantedByOverride = true` + `grantedById`;
  - `cardinality = single` ⇒ **sostituisce** l'assegnazione esistente di quel `DataType`
    (decisione documentata: sostituisci); `multi` ⇒ accumula, salvo `repeatable = false`
    che vieta il duplicato della stessa definizione.
- Persistenza: crea `CharacterData` (`characterId`, `referenceDataId` = definizione,
  `dataTypeId` denormalizzato = `referenceData.dataTypeId`, `value` = specifiche scelte).
  Se il talento ha un `cost` nei `flags` ⇒ crea la relativa `XpTransaction`
  (`amount = -cost`, `reason = purchase`) via T-025, **atomica** con l'assegnazione.
- Invarianti applicative: `characterData.dataTypeId === referenceData.dataTypeId`; la
  definizione appartiene alla **stessa campagna** del personaggio.
- Test unitari del servizio (requisiti ok/mancanti/bloccanti, soglia XP, override,
  cardinalità single/multi, `repeatable`, `creationOnly`, addebito XP, cross-tenant).

Escluso:

- Route/UI creazione PG (T-018 / T-022), runner completo delle azioni downtime,
  grant XP iniziale per razza e recupero morte (→ T-025, richiamati da qui).

## Criteri di accettazione

- [x] `evaluateRequirements` ritorna requisiti mancanti/bloccanti corretti su grafo
      `requires` + `blocks` **e** su soglia XP; test.
- [x] Master assegna ignorando i requisiti → `grantedByOverride`/`grantedById` salvati;
      giocatore non può se i requisiti mancano o XP insufficiente; test.
- [x] `single` sostituisce, `multi` accumula, `repeatable=false` vieta il duplicato,
      `creationOnly` bloccato fuori creazione; test.
- [x] Assegnazione con costo crea l'`XpTransaction` atomica; rollback se una delle due
      fallisce; test.
- [x] Invarianti dataType/campagna enforced; test cross-tenant.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- `src/lib/services/characterData.service.ts` (nuovo) — servizio
  `evaluateRequirements` + `assignReferenceDataToCharacter` e le classi di
  errore dedicate.
- `src/lib/services/characterData.service.test.ts` (nuovo) — 24 test unitari.
- `src/lib/repositories/characterData.repository.ts` (nuovo) — accesso dati
  `CharacterData` (`XpTransactionClient`-friendly, componibile in
  `prisma.$transaction`).
- `src/lib/repositories/characterData.repository.test.ts` (nuovo) — 7 test.
- `src/lib/repositories/dataRequirement.repository.ts` — `listOutgoingRequirements`
  ora ritorna `DataRequirementWithRequiredDefinition[]` (tipo nuovo esportato)
  invece di `DataRequirement[]`: la query Prisma faceva già l'`include:
{ requiredDefinition: true }`, solo l'annotazione di tipo era più stretta —
  widening non-breaking (nessun consumer esistente accede a campi che prima
  mancavano nel tipo, quindi nulla si rompe; `evaluateRequirements` ora può
  leggere `edge.requiredDefinition` con i tipi).
- `src/lib/repositories/index.ts` — aggiunto `export * from
"./characterData.repository"`.
- `src/lib/repositories/README.md` — documentata `characterData.repository.ts`
  - `characterData.service.ts`.
- `.task/017-servizio-assegnazione-dati-pg.md` — questo file (stato/log).
- `src/lib/services/characterData.service.ts` (fix reviewer round 1) —
  `evaluateRequirements` ora unisce anche gli archi `blocks` **entranti**
  (`listIncomingRequirements`, T-016) a quelli uscenti, per rilevare la
  mutua esclusione in entrambe le direzioni (`requires` resta solo outgoing).
- `src/lib/services/characterData.service.test.ts` (fix reviewer round 1) —
  +2 test: `evaluateRequirements` rileva il conflitto via arco entrante, e
  `assignReferenceDataToCharacter` blocca il self-assign nello stesso scenario
  (arco `A blocks B`, PG possiede A, tenta B).
- `src/lib/services/characterData.service.test.ts` (QA) — +1 test end-to-end
  (mock Prisma stateful: catalogo `DataRequirement` fisso + ledger in memoria
  `CharacterData`/`XpTransaction`) che incrocia cardinalità, `requires` +
  `blocks` bidirezionale, soglia XP, override master e atomicità/rollback in
  un'unica sequenza narrativa. Dettagli nel Log QA.

interfaces:

- `evaluateRequirements(prisma: PrismaClient, character: Pick<Character,"id">, definition: ReferenceDataWithDataType): Promise<RequirementEvaluation>`
  con `RequirementEvaluation = { missingRequires: ReferenceData[]; blockingConflicts: ReferenceData[]; xpCost: number | null; xpAvailable: number; xpSufficient: boolean; satisfied: boolean }`.
  Non lancia mai; pre-transazionale (usa `listOutgoingRequirements`, tipizzato
  solo `PrismaClient` da T-016 — non composto dentro `prisma.$transaction`).
- `assignReferenceDataToCharacter(prisma: PrismaClient, character: Pick<Character,"id"|"campaignId">, definition: ReferenceDataWithDataType, options?: AssignReferenceDataOptions): Promise<AssignReferenceDataResult>`
  con `AssignReferenceDataOptions = { isMaster?: boolean; grantedById?: string; isCreation?: boolean; value?: Prisma.InputJsonValue | null; actionId?: number }`
  e `AssignReferenceDataResult = { characterData: CharacterData; xpTransaction: XpTransaction | null }`.
  Errori dedicati esportati: `CrossCampaignAssignmentError`,
  `PlayerAssignmentNotAllowedError`, `CreationOnlyAssignmentError`,
  `RequirementsNotSatisfiedError` (porta `.evaluation`),
  `NonRepeatableAssignmentError`; più un `Error` generico se `isMaster` è
  `true` senza `grantedById`.
- Repository nuovo (`characterData.repository.ts`, tutte `XpTransactionClient`
  = `PrismaClient | Prisma.TransactionClient`):
  `listCharacterDataForCharacter(prisma, characterId)`,
  `findCharacterDataByReferenceData(prisma, characterId, referenceDataId)`,
  `createCharacterData(prisma, data: CreateCharacterDataInput)`,
  `deleteCharacterDataByDataType(prisma, characterId, dataTypeId)`.

decisions:

- **`evaluateRequirements` resta pre-transazionale** (non prende
  `Prisma.TransactionClient`): `listOutgoingRequirements`/
  `getReferenceDataByIdScoped` (T-016) accettano solo `PrismaClient`, e
  allargarle non era nello scope di T-017. La valutazione gira prima di aprire
  la transazione di scrittura; la finestra TOCTOU fino al commit è mitigata
  (non eliminata) dal ricontrollo interno di `debitTalent` quando non c'è
  `allowOverride` — stesso trust boundary già documentato e testato in T-025.
  Testata esplicitamente con un test di "rollback sotto race" (saldo cambiato
  tra pre-check e commit → `InsufficientXpError` dentro la tx → `CharacterData`
  non persiste).
- **`creationOnly` gate solo per il self-assign, non per il master.** Lo Scope
  raggruppa `creationOnly` sotto il bullet "self-assign", mentre il bullet
  master dice "sempre consentito" senza eccezioni — il master può assegnare
  una voce `creationOnly` anche fuori creazione.
- **`repeatable = false` e la sostituzione `single` restano invarianti
  strutturali applicate SEMPRE, anche alle concessioni master.** Lo Scope li
  elenca in un bullet separato ("cardinalità"), distinto da quello dei
  requisiti che il master può forzare — interpretati come vincoli sul dato
  (quante righe può avere un PG per quella definizione/quel DataType), non
  come "requisiti" nel senso di `evaluateRequirements`. Se il reviewer dissente,
  è un cambio di una riga (spostare il check fuori dal ramo comune).
  `repeatable` letto solo sotto cardinalità `multi` (per `single` non ha senso:
  la sostituzione già garantisce al massimo una riga).
  Test dedicato: `enforces repeatable = false even for a master override grant`.
- **`grantedById` è obbligatorio quando `isMaster: true`**, validato con un
  `Error` generico (non una classe dedicata) — stesso stile di
  `xp.service.recordDeathRecovery`/`refund` per invarianti di contratto del
  chiamante (400 generico), a differenza degli errori di dominio
  (`CrossCampaignAssignmentError` ecc.) che T-018 dovrà poter distinguere per
  mappare su status HTTP diversi.
  Il master path chiama sempre `debitTalent(..., { allowOverride: true })`,
  a prescindere da `grantedByOverride` — se il master ha comunque budget
  sufficiente il risultato è identico a un addebito non forzato, quindi non
  serve un ramo separato.
- **Ritorno arricchito `{ characterData, xpTransaction }`** invece della sola
  `CharacterData`, per dare a T-018/T-019 visibilità sull'eventuale addebito
  senza dover fare un'altra query.
- **`CrossCampaignAssignmentError` è dedicata** (non un `Error` generico come
  il check cross-campagna di `recordDeathRecovery` in T-025), perché T-018 la
  dovrà mappare su 404 (non far trapelare l'esistenza di voci di altre
  campagne — stesso trattamento di `getReferenceDataByIdScoped`).

## Note / Log

- 2026-07-13 (owner): dipende da T-015 e T-016. Il servizio sarà riusato da T-018
  (creazione PG), dalla concessione manuale del master e dall'esecuzione azioni (T-019).
- 2026-07-13 (owner): redesign — crea `CharacterData` (FK `referenceDataId`), non righe
  `Data`; aggiunti addebito XP (via T-025) e i flag `repeatable`/`creationOnly`.
- 2026-07-14 (owner): dipendenza diamante — T-017 usa sia il catalogo (T-016,
  `referenceData`/`dataRequirement` repository) sia il ledger XP (T-025,
  `xp.service`). Entrambi i branch sono fratelli su `task/015` (stessa base),
  già `done`, review+QA puliti, PR aperte (#33, #34) ma non ancora mergiate in
  `main` — bloccate solo dal merge di #32 (T-015). Per §12 del README il `dev`
  aspetterebbe il merge in `main`; **decisione esplicita owner/utente**:
  sbloccare comunque, stessa eccezione già usata per #33/#34. Branch creato da
  `task/016-catalogo-campagna-repo-api` (commit `eef52ae`: merge di
  `task/025-servizio-ledger-xp` dentro, nessun conflitto reale — solo
  `repositories/index.ts`, righe non sovrapposte, auto-merge pulito). Gate
  ri-verificati sul branch unito prima di iniziare: `bun run type-check`/
  `lint` puliti, `bun run test:run` → 67 file, 795 test verdi. PR di T-017
  sarà stacked su `task/016` (#33); la descrizione noterà esplicitamente la
  dipendenza aggiuntiva da #34 (T-025), già review+QA'd separatamente — i
  reviewer di T-017 vanno concentrati sui commit dopo `eef52ae`. Da ripuntare
  su `main` dopo il merge di #32+#33+#34.
- 2026-07-14 (dev): inizio implementazione. Letti `referenceData.repository.ts`,
  `dataRequirement.repository.ts` (T-016) e `xp.service.ts`/`xpTransaction.repository.ts`
  (T-025) per riusare le firme esistenti prima di scrivere codice nuovo.
- 2026-07-14 (dev): implementati `characterData.repository.ts` (nuovo) e
  `characterData.service.ts` (`evaluateRequirements` +
  `assignReferenceDataToCharacter`); widening non-breaking del tipo di ritorno
  di `listOutgoingRequirements` (T-016) per esporre `requiredDefinition`.
  Dettagli firme/decisioni in `## Artifacts`. Verificati io stesso i 3 gate
  rileggendo l'output (non checkbox preesistenti, non ce n'erano):
  `bun run type-check` pulito, `bun run lint` pulito, `bun run test:run` → 69
  file / 826 test verdi (baseline 67/795 + 2 file/31 test nuovi, zero
  regressioni). Branch: `task/017-servizio-assegnazione-dati-pg`, verificabile
  con `git log task/016-catalogo-campagna-repo-api..task/017-servizio-assegnazione-dati-pg`.
  Nessun push/PR aperto (fuori dal mio mandato). Riporto `status: in-review`,
  `assignee: owner`.
- 2026-07-14 (owner): integrato verdetto reviewer round 1/3 — **findings da
  correggere**, non OK pulito. Gate ri-verificati dal reviewer: 69 file/826
  test verdi (confermano il dev). 🟠 **bloccante**: `evaluateRequirements`
  legge solo `listOutgoingRequirements` per i `blocks`, ma T-016 documenta i
  `blocks` come esclusione **simmetrica** — un arco `A blocks B` (uscente da
  A) non viene visto quando si valuta B, quindi un giocatore aggira la mutua
  esclusione assegnandosi B prima di A (self-assign, nessun master richiesto).
  Fix proposto dal reviewer: unire anche `listIncomingRequirements` (già
  esiste, T-016) per gli archi `blocks` entranti + test dedicato ("blocca B
  quando il PG possiede A che lo blocca via arco entrante"). 🟡 non bloccante:
  cardinalità `single` con `cost` — la sostituzione cancella la riga precedente
  senza stornare l'XP già speso, il nuovo costo viene riaddebitato per intero
  (doppio addebito cumulativo su sostituzioni ripetute); fuori scope esplicito
  di T-017, da presidiare a T-018/T-019 o chiarire con l'utente, non blocca
  questo round. 💡 non bloccanti: check cross-tenant si fida di
  `character.campaignId` fornito dal chiamante (vincolo da rispettare in
  T-018); `value ?? null` collassa `undefined`→`null` (innocuo, colonna senza
  default). Decisioni (a)/(b)/(c) del dev validate come ragionevoli, nessun
  blocco su quelle. Torna al `dev` per il fix del 🟠. Round 1/3.
- 2026-07-14 (owner): fix del 🟠 bloccante applicato direttamente. In
  `evaluateRequirements` (`characterData.service.ts`) i `blocks` ora si
  valutano in entrambe le direzioni: agli archi uscenti già esistenti
  (`listOutgoingRequirements`) si aggiungono gli archi entranti
  (`listIncomingRequirements`, T-016) filtrati per `type: blocks`, con dedup
  per id sul risultato unito. `requires` resta solo outgoing (invariato,
  corretto per costruzione — non è simmetrico). Aggiunti 2 test dedicati in
  `characterData.service.test.ts`: uno su `evaluateRequirements` (arco `A
blocks B` memorizzato uscente da A, il PG possiede A, si valuta B →
  `blockingConflicts` lo rileva via l'arco entrante) e uno end-to-end su
  `assignReferenceDataToCharacter` (stesso scenario → self-assign rigettato
  con `RequirementsNotSatisfiedError`). Gate ri-verificati: `bun run
type-check` pulito, `bun run lint` pulito, `bun run test:run` → 69 file /
  828 test verdi (baseline pre-fix 69/826, +2 nuovi, zero regressioni).
  Nessun push/PR. Riporto `status: in-review`, `assignee: owner`.
- 2026-07-14 (owner): integrato verdetto reviewer round 2/3 — **OK, ciclo
  dev↔reviewer chiuso**. Fix verificato indipendentemente: merge
  outgoing/incoming corretto (nessun falso positivo, `requires` invariato
  solo-outgoing, `blocks` filtrato esplicitamente sul lato incoming),
  simmetria confermata, dedup via `Set` sul caso raro di edge ridondanti
  bidirezionali, entrambi i nuovi test esercitano davvero lo scenario (non
  solo per nome). Gate ri-eseguiti dal reviewer: 69 file/828 test verdi. 🟡 e
  💡 del round 1 confermati non bloccanti, nessun lavoro aggiuntivo. Prossimo
  passo: QA.
- 2026-07-14 (qa): verifica indipendente. 🟠 **finding di processo
  (deterministico, non di dominio)**, trovato prima di qualunque test: il fix
  del 🟠 round 1 (merge outgoing/incoming dei `blocks`, log del 2026-07-14
  "owner") **non era mai stato committato** — `git log --all -p -- src/lib/
services/characterData.service.ts` non conteneva `listIncomingRequirements`
  in nessun commit, il fix esisteva solo come modifica non staged nella
  working directory di questo branch. Il reviewer round 2 ha quindi
  verificato il diff nella working directory, non lo stato committato del
  branch — coerente con quanto trovato, ma il rischio (perdita del fix se la
  working dir viene scartata; `git log task/016..task/017` citato nel Log del
  dev come modo per "verificare" non lo avrebbe mostrato) andava sanato
  prima di proseguire. Rimediato: commit `9964c07` ("fix(review round 1):
  unisce gli archi blocks entranti...") ricostruisce esattamente lo stato
  pre-scenario-QA (service.ts + i 2 test dedicati del round 1) e lo mette in
  git; il mio lavoro segue in un commit separato. Verifica dei 6 criteri con
  prova diretta: (1) riletti tutti i test unitari di `evaluateRequirements`
  (`requires`/`blocks` uscenti+entranti, soglia XP) — passano singolarmente;
  (2) riletti i test override master (`grantedByOverride`/`grantedById`) e i
  gate self-assign (requisiti mancanti/XP insufficiente) — passano; (3)
  riletti i test cardinalità `single`/`multi`/`repeatable=false`/
  `creationOnly` — passano, incluso il caso "repeatable=false vale anche per
  il master"; (4) riletto il test di atomicità con ledger stateful
  (rollback reale, non solo mock di `create` chiamato) — passa; (5) riletto
  il test cross-tenant (`CrossCampaignAssignmentError` prima di ogni altra
  lettura) — passa; (6) rilanciati io stesso i 3 gate sul branch (dopo aver
  committato il fix round 1): `bun run type-check` pulito, `bun run lint`
  pulito (0 errori — un warning `no-non-null-assertion` nel mio nuovo test è
  stato sistemato), `bun run test:run` → 69 file / 829 test verdi (baseline
  828 + il mio scenario). Scenario end-to-end nuovo aggiunto (non presente
  nei test esistenti, mock Prisma stateful in stile T-025): catalogo
  `DataRequirement` fisso + ledger in memoria `CharacterData`/`XpTransaction`,
  sequenza narrativa che incrocia TUTTE le regole insieme — self-assign
  "Passo Avanzato" (cardinalità `single`, `requires` soddisfatto, XP
  sufficiente) → self-assign "Dono del Master" rifiutato per XP insufficiente
  → il master forza la concessione (override, sostituisce ancora via
  `single`, addebito forzato sotto budget) → self-assign "Patto Proibito"
  rifiutato per `blocks` rilevato **solo tramite l'arco entrante**
  (verifica indipendente del fix round 1 dentro un flusso reale, non un mock
  isolato) → self-assign "Patto Minore" con race TOCTOU iniettata tra
  pre-check e commit → `InsufficientXpError` + rollback reale (nessuna riga
  orfana nei due ledger) → tentativo cross-campagna rifiutato senza effetti
  collaterali. Sanity-check del test harness: ho iniettato un bug reale in
  `evaluateRequirements` (invertita la condizione `ownedReferenceDataIds.has
(edge.definitionId)` sull'arco entrante, riproducendo esattamente il bug
  pre-fix round 1), rilanciato `vitest run characterData.service.test.ts` →
  5 test falliti (i 2 dedicati round 1 + il mio scenario end-to-end + 2
  collaterali con `TypeError` su `conflict.id` per accesso a `.definition`
  undefined nei mock di test più vecchi) — conferma che l'harness rileva
  davvero la regressione, non solo per nome del test. Ripristinato il file
  da backup e verificato `diff` byte-per-byte identico al backup prima di
  ricommittare; gate rilanciati puliti dopo il ripristino. Isolamento
  multi-tenant: verificato con prova diretta nello scenario end-to-end
  (step 5, `CrossCampaignAssignmentError`) oltre al test unitario dedicato
  già esistente — nessuna lettura (`dataRequirement.findMany`) né scrittura
  avviene per una definizione di un'altra campagna. Nessun difetto di
  dominio residuo trovato; tutti i 6 criteri spuntati con prova diretta.
  Commit locali: `9964c07` (recupero fix round 1, mai committato) e un
  secondo commit con lo scenario end-to-end + questo aggiornamento del task
  file. Nessun push/PR. Riporto `assignee: owner` (per README §6 il `done`
  spetta all'owner dopo il merge); `status` lasciato `in-review`.
- 2026-07-14 (owner): status → done (2 round di review chiusi puliti + QA
  indipendente con scenario end-to-end e sanity-check dell'harness; nota: per
  §6 del README il `done` spetta formalmente a dopo il merge — stessa
  deviazione esplicita già applicata a T-016/T-025 su istruzione diretta
  dell'utente). Push del branch + PR aperta verso `task/016-catalogo-campagna-repo-api`
  (stacked su #33), non verso `main`: stessa decisione presa per T-016/T-025,
  per evitare un diff duplicato/fuorviante finché #32 (T-015) resta aperta.
  Dipendenza aggiuntiva da `task/025-servizio-ledger-xp` (#34, mergiata dentro
  questo branch al commit `eef52ae`, già review+QA'd separatamente) dichiarata
  esplicitamente nella descrizione della PR. Da ripuntare `--base main` dopo
  il merge di #32+#33+#34. Follow-up non bloccante aperto per T-018/T-019:
  doppio addebito XP su sostituzioni ripetute di una definizione `single` con
  `cost` (nessuno storno della transazione precedente).
