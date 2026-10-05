---
id: "041"
title: "Talenti: rimuovi restrizione errata in creazione PG, attiva downtime learnTalent, nascondi sezioni oggetti Nuova Frontiera"
status: done
priority: P1
assignee: ""
branch: task/041-talenti-creazione-modifica-pg
base: nuova_frontiera
trello: ""
created: 2026-07-23
updated: 2026-07-23
---

## Obiettivo

T-035 ha introdotto `TalentApprovalRequiredError` partendo da un'assunzione
sbagliata: che un giocatore ordinario potesse selezionare in creazione PG
**solo** i talenti con `flags.creationOnly: true`, e che tutti gli altri
dovessero passare necessariamente dalla coda di approvazione downtime.
L'utente (owner reale del prodotto) ha chiarito che l'intento è l'opposto:
in creazione PG un giocatore deve poter scegliere **qualunque talento non
bloccato** (soggetto alla normale valutazione di requisiti AND/OR/blocks e
budget XP, invariata) — esattamente come già accade per Razza/Fazione/
Religione. Il gate va rimosso.

Il significato originale (pre-T-035) di `creationOnly` resta corretto e va
preservato: un talento `creationOnly: true` può essere ottenuto **solo** in
creazione, mai in seguito via downtime (`CreationOnlyAssignmentError`,
gate pre-esistente `creationOnly && !isCreation`) — questo è un asse
ortogonale, non toccato da questo task.

La "fase di modifica del personaggio" richiesta dall'utente non è un nuovo
pannello UI (chiarito in conversazione): il meccanismo per assegnare un
talento aggiuntivo dopo la creazione esiste già (`downtimeLearnTalent`,
T-019/T-033, handler `learnTalent.ts`, coda di approvazione). Per la
campagna Nuova Frontiera (T-040) semplicemente non è stata attivata (nessuna
`Feature` che punta a `downtimeLearnTalent` in quella campagna) — l'utente
lo ha esplicitamente definito una dimenticanza, da correggere aggiungendo
l'attivazione al seed dedicato.

Incluso anche, richiesta separata ma nello stesso giro: nascondere dalla
sidebar della campagna Nuova Frontiera le 8 sezioni oggetti seedate da
T-040 (Ingredienti, Oggetti, Oggetti Incantati, Droghe, Malattie, Tonici da
Battaglia, Oggetti Speciali, Maledizioni) — erano state seedate con
`showInSidebar: true`, l'utente le vuole nascoste dalla navigazione.

## Scope

Incluso:

- **Rimuovere `TalentApprovalRequiredError`** (o comunque il suo punto di
  attivazione nel ramo self-assign di `assignReferenceDataToCharacter`,
  `characterData.service.ts`) introdotto da T-035: un giocatore ordinario
  deve poter selezionare in creazione PG (`isCreation: true`) qualunque
  talento della categoria "Talenti", non solo quelli `creationOnly: true`.
  Nessun'altra guardia va toccata (requisiti AND/OR/blocks, budget XP,
  `NotAssignableDataTypeError` su `cardinality: null` restano invariati e
  si applicano come sempre).
- **`characters/new/page.tsx`** (filtro per player sui talenti, circa righe
  148-153): rimuovere il filtro che mostra solo i talenti
  `creationOnly: true` al giocatore ordinario — "Talenti" deve comportarsi
  come qualunque altra categoria assegnabile (tutti gli item della
  categoria visibili/selezionabili, subordinati solo alla valutazione
  requisiti/XP già esistente in `CharacterCreationForm.tsx`).
- **Verificare `CreationOnlyAssignmentError`** (gate pre-esistente,
  `creationOnly && !isCreation`, precedente a T-035): confermare che sia
  ancora presente e funzionante, con test — un talento `creationOnly:true`
  deve restare non ottenibile via `downtimeLearnTalent` dopo la creazione.
- **Aggiornare/rimuovere i test T-035** che presupponevano il comportamento
  ora rimosso (es. `rdTalentNeedsApproval`/asserzioni su
  `TalentApprovalRequiredError` in `characterData.service.test.ts`,
  `characters/__tests__/route.test.ts`,
  `characters/new/__tests__/page.test.tsx`) — sostituirli con test che
  confermano il comportamento corretto (talento non-creationOnly
  selezionabile e assegnabile in creazione da un giocatore ordinario).
- **Attivare `downtimeLearnTalent` per Nuova Frontiera**: aggiungere in
  `prisma/seed-nuova-frontiera/index.ts` la creazione di una `Feature` che
  punta al `FeatureType`/`functionName` `downtimeLearnTalent` (già
  platform-wide, seedato una volta da T-019 — verificare come
  `prisma/seed.ts` lo attiva per la campagna demo esistente e riusare lo
  stesso pattern, stesso stile delle 10 `Feature` downtime già create da
  T-040 in quel file). Idempotente come il resto del seed.
- **Nascondere le 8 sezioni oggetti dalla sidebar**: `showInSidebar: false`
  per gli 8 `DataType` (Ingredienti, Oggetti, Oggetti Incantati, Droghe,
  Malattie, Tonici da Battaglia, Oggetti Speciali, Maledizioni) in
  `prisma/seed-nuova-frontiera/index.ts` (righe ~405-432). **Attenzione**:
  la campagna Nuova Frontiera è già seedata dal vivo su Neon dev — la
  funzione di seed (`ensureDataType`-style) potrebbe non aggiornare
  `showInSidebar` su righe già esistenti (verifica il comportamento reale
  prima di assumere che baste cambiare il sorgente). Se non aggiorna,
  serve anche una query diretta mirata (`UPDATE "DataType" SET
"showInSidebar" = false WHERE name IN (...) AND campaignId = <id
Nuova Frontiera>`) sul DB Neon di sviluppo condiviso — verifica prima con
  una `SELECT`, documenta cosa stai per fare, poi esegui (stesso approccio
  già usato per la pulizia dati di T-040).

Escluso:

- Nessun nuovo pannello UI per assegnare dati a un PG già esistente (la
  richiesta di "modifica personaggio" è risolta dall'attivazione della
  Feature `downtimeLearnTalent` già esistente, chiarito con l'utente).
- Nessuna modifica alla capacità del master (già corretta: bypassa
  qualunque gate self-assign, invariato da T-017).
- Nessuna modifica alla logica di valutazione requisiti/XP
  (`evaluateRequirements`/`evaluateSelection`), invariata.
- Nessuna modifica al significato o al gate di `creationOnly` per il
  percorso downtime (resta come pre-T-035).

## Criteri di accettazione

- [x] Un giocatore ordinario, in creazione PG, può selezionare qualunque
      talento della categoria "Talenti" (non solo `creationOnly: true`),
      soggetto solo alla valutazione standard requisiti/XP — test su
      `characterData.service.test.ts` e su `characters/__tests__/route.test.ts`
      (assegnazione non-creationOnly accettata per un giocatore ordinario
      in creazione).
- [x] `TalentApprovalRequiredError` rimosso dal servizio; nessun residuo di
      codice morto o test che ne presuppongano l'esistenza.
- [x] `CreationOnlyAssignmentError` (comportamento originale pre-T-035)
      resta intatto e testato: un talento `creationOnly:true` è rifiutato
      se richiesto via downtime (`isCreation: false`) dopo la creazione.
- [x] `characters/new/page.tsx`: il catalogo di creazione mostra tutti i
      talenti al giocatore ordinario, non solo quelli `creationOnly`; test.
- [x] Dopo il seed di Nuova Frontiera (ri-eseguito o già applicato dal
      vivo), esiste una `Feature` attiva che punta a `downtimeLearnTalent`
      per quella campagna — verificato dal vivo su Neon dev.
- [x] Dopo il seed di Nuova Frontiera, le 8 `DataType` oggetti hanno
      `showInSidebar: false` — verificato dal vivo su Neon dev (query
      diretta, non solo lettura del codice sorgente del seed).
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi
      (nessuna regressione oltre ai 10 fallimenti pre-esistenti già
      documentati e confermati indipendenti in T-035/T-039/T-040).

## Artifacts

files_modified:

- `src/lib/services/characterData.service.ts` — rimossa la classe
  `TalentApprovalRequiredError` e il gate `isCreation && kind === talent &&
!creationOnly` in `assignReferenceDataToCharacter`; rimosso l'import
  inutilizzato `DataTypeKind`. `CreationOnlyAssignmentError` e il suo gate
  (`creationOnly && !isCreation`) invariati.
- `src/lib/services/characterData.service.test.ts` — rimosso l'import di
  `TalentApprovalRequiredError`; i due test che si aspettavano un 422 per un
  talento non-`creationOnly` in creazione ora si aspettano un'assegnazione
  riuscita; commenti storici aggiornati.
- `src/app/api/campaigns/[campaignSlug]/characters/route.ts` — rimosso
  l'import e il branch `catch` per `TalentApprovalRequiredError`.
- `src/app/api/campaigns/[campaignSlug]/characters/__tests__/route.test.ts`
  — fixture `rdTalentNeedsApproval` rinominata `rdNonCreationOnlyTalent`
  (usata in altri 2 test già esistenti su budget XP/requisiti, invariati);
  i due test che si aspettavano 422/gate master-bypass ora si aspettano
  entrambi 201 (player e master).
- `src/app/api/campaigns/[campaignSlug]/characters/[characterId]/actions/route.ts`
  — rimosso l'import e il branch `catch` per `TalentApprovalRequiredError`
  (difensivo, mai raggiunto da questo handler anche prima).
- `src/app/api/campaigns/[campaignSlug]/characters/[characterId]/actions/__tests__/route.test.ts`
  — solo commento aggiornato (nessuna asserzione toccava l'errore rimosso).
- `src/app/(dashboard)/dashboard/[campaignSlug]/characters/new/page.tsx` —
  rimosso il filtro che nascondeva i talenti non-`creationOnly` al player;
  rimossi `DataTypeKind` (import) e `readBooleanFlag` (funzione locale),
  entrambi diventati dead code.
- `src/app/(dashboard)/dashboard/[campaignSlug]/characters/new/__tests__/page.test.tsx`
  — describe rinominato, i 3 test ora si aspettano entrambi i talenti
  visibili in tutte le viste (player, master, `?view=player`).
- `src/lib/validations/characterCreation.ts` — solo commento aggiornato
  (nessun codice funzionale, lo schema non validava mai quel gate).
- `prisma/seed.ts` — solo commento aggiornato sul significato di
  `creationOnly` per "Talenti".
- `prisma/seed-nuova-frontiera/index.ts` — aggiunto un blocco dedicato
  (idempotente, stesso pattern del loop `DOWNTIME_CATEGORIES` sopra) che
  attiva la `Feature` `downtimeLearnTalent` per la campagna; cambiato
  `showInSidebar: true` → `false` per le 8 `DataType` oggetti
  (Ingredienti/Oggetti/Oggetti Incantati/Droghe/Malattie/Tonici da
  Battaglia/Oggetti Speciali/Maledizioni).
- **Round 2 (fix gap qa)**: `prisma/seed-nuova-frontiera/index.ts` (riga
  ~283) — `playerAssignable: false` → `true` per il `DataType` "Talenti"
  (coerente con Razza/Fazione/Divinità nello stesso file, e con lo stesso
  trattamento già applicato al seed demo da T-035/round 3 in `prisma/seed.ts`).
  Nessun altro file toccato in questo round: verificato via grep che nessun
  test unitario referenzia il seed Nuova Frontiera o assume
  `Talenti.playerAssignable: false` specificamente per quella campagna (solo
  fixture generiche in `characterData.service.test.ts`, `route.test.ts`,
  ecc., indipendenti dal seed).

interfaces:

- Nessuna firma pubblica cambiata: `assignReferenceDataToCharacter` mantiene
  la stessa signature (`AssignReferenceDataOptions` invariata); rimossa solo
  l'`export class TalentApprovalRequiredError extends Error`.

decisions:

- Round 2: correzione dati/config mirata, nessuna nuova logica applicativa —
  `assignReferenceDataToCharacter`/`executeFeatureAction` invariati (il gate
  `playerAssignable` esisteva già pre-T-041, corretto solo il valore seedato
  per Nuova Frontiera). `UPDATE` diretto su Neon dev fatto con `updateMany`
  scoped su `campaignId` + `name: "Talenti"` (1 riga, id 29), stesso pattern
  prudente di `showInSidebar` (round 1): `SELECT` di verifica prima
  (`playerAssignable:false`), poi update, poi riverifica (`true`).
- `seed.ts` (campagna demo) non crea alcuna `Feature` per-campagna (solo il
  registry `FeatureType`, platform-wide) — il brief del task presupponeva
  un pattern lì da riusare, ma verificato che non esiste: il pattern
  idempotente riusato è invece quello già presente 10 volte in
  `seed-nuova-frontiera/index.ts` stesso (loop `DOWNTIME_CATEGORIES`),
  replicato per il solo `functionName: "downtimeLearnTalent"` (non fa parte
  di quelle 10 categorie CSV-driven, non ha una riga dedicata in
  `table_azioni_downtime`).
- Nessun tool Neon MCP disponibile in questa sessione (stesso vincolo già
  documentato in T-040): verifica/`UPDATE` `showInSidebar` fatti con uno
  script Prisma ad hoc via Bash (non committato, cancellato a fine
  operazione), stesso approccio già usato in T-040/round 2. `SELECT` prima
  (8/8 righe `showInSidebar: true`) e dopo (8/8 `false`) l'`UPDATE` mirato
  (`campaignId` di Nuova Frontiera + `name IN (...)`).
- `ensureDataType` (helper interno del seed) crea solo se la riga manca, non
  aggiorna righe esistenti — confermato leggendo il codice e poi
  empiricamente (ri-eseguito il seed dopo il cambio `showInSidebar` nel
  sorgente: le 8 righe già seedate sono rimaste `true`, da cui la necessità
  dell'`UPDATE` diretto).
- Rinominata la fixture di test `rdTalentNeedsApproval` →
  `rdNonCreationOnlyTalent` in `route.test.ts`: il vecchio nome descriveva
  il comportamento rimosso (richiedeva approvazione), fuorviante da tenere
  ora che l'assegnazione riesce.

## Note / Log

- 2026-07-23 (owner): task aperto su richiesta esplicita dell'utente.
  Chiarimento raccolto in conversazione: il gate `TalentApprovalRequiredError`
  di T-035 era basato su un'assunzione sbagliata sul significato di
  `creationOnly` (letto come "solo i creationOnly sono scegliibili in
  creazione", quando invece è l'opposto: "i creationOnly sono scegliibili
  SOLO in creazione, mai dopo" — gli altri talenti restano scegliibili sia
  in creazione sia via downtime, senza restrizioni aggiuntive). La "fase di
  modifica personaggio" richiesta non è un nuovo pannello (l'utente ha
  corretto la propria domanda con "errore mio" dopo la mia domanda di
  chiarimento): il meccanismo `downtimeLearnTalent` esiste già, andava solo
  attivato per Nuova Frontiera. Bundle con la richiesta di nascondere le 8
  sezioni oggetti dalla sidebar, stesso giro di lavoro su T-040. Assegnato a
  `dev`, `status: todo`. Branch da creare direttamente nel worktree
  principale (non isolato): il seed Nuova Frontiera richiede i CSV
  untracked che vivono solo lì.
- 2026-07-23 (dev): inizio implementazione, branch `task/041-talenti-creazione-modifica-pg`
  creato da `nuova_frontiera` direttamente nel worktree principale.
- 2026-07-23 (dev): rimosso `TalentApprovalRequiredError` (classe + gate) da
  `characterData.service.ts`; `CreationOnlyAssignmentError` verificato
  intatto (test pre-esistente "rejects a self-assign of a creationOnly
  entry outside character creation" ancora verde, invariato). Rimossi tutti
  i punti di consumo dell'errore (2 route handler + import), il filtro
  talenti in `characters/new/page.tsx`, e aggiornati i test T-035 in tutti
  e 4 i file elencati nello scope (servizio, route characters, route
  actions, page test) con test che confermano il comportamento corretto
  (talento non-creationOnly assegnabile in creazione da player e master).
  Vedi `## Artifacts` per il dettaglio file per file.
- 2026-07-23 (dev): attivata `downtimeLearnTalent` per Nuova Frontiera in
  `prisma/seed-nuova-frontiera/index.ts` (blocco idempotente dedicato,
  stesso pattern del loop `DOWNTIME_CATEGORIES`) — verificato che
  `prisma/seed.ts` non ha in realtà alcun pattern di attivazione Feature
  per-campagna da riusare (solo `FeatureType` platform-wide), riusato
  invece il pattern già presente nello stesso file target. Eseguito
  `bun run seed:nuova-frontiera` dal vivo: idempotente su tutto il resto,
  ha creato la sola `Feature` mancante (`id: 13`, verificato via query
  Prisma ad hoc — nessun tool Neon MCP disponibile in questa sessione).
- 2026-07-23 (dev): `showInSidebar: false` per le 8 `DataType` oggetti nel
  sorgente del seed; confermato con `SELECT` dal vivo che le 8 righe già
  seedate su Neon dev restavano `showInSidebar: true` dopo il re-seed
  (`ensureDataType` non aggiorna righe esistenti, solo verificato anche a
  codice) — eseguito un `UPDATE` mirato (`campaignId` Nuova Frontiera +
  `name IN (...)`, 8 righe) con uno script Prisma ad hoc via Bash (non
  committato, cancellato a fine operazione, stesso approccio di T-040/
  round 2). Riverificato con una seconda `SELECT`: tutte e 8 a `false`.
- 2026-07-23 (dev): `bun run type-check` pulito, `bun run lint` pulito,
  `bun run test:run`: 1353 pass / 10 fail su 1363 — stessi identici 10
  fallimenti pre-esistenti già documentati e confermati indipendenti in
  T-039/T-040 (mismatch accessible-name su icon-button `edit`/`delete` in
  `DataTypesManager.test.tsx` 6 + `ReferenceDataManager.test.tsx` 4),
  nessuna regressione. Tutti i criteri di accettazione verificati e
  spuntati. Portato a `status: in-review`, `assignee: reviewer`.
- 2026-07-23 (reviewer): round 1 — **OK PULITO**. Rimozione di
  `TalentApprovalRequiredError` completa e senza residui (grep su tutto
  `src/`); `CreationOnlyAssignmentError` (asse ortogonale) confermato
  intatto e distinto, non scambiato. `characters/new/page.tsx` corretto:
  rimosso solo il filtro talenti-specifico, guardie strutturali
  (`cardinality`/`playerAssignable`/requisiti/XP) invariate. Test T-035
  invertiti correttamente (non cancellati): copertura preservata su tutti
  e 4 i file coinvolti. Attivazione `downtimeLearnTalent` verificata dal
  vivo su Neon dev (`Feature id:13`, `campaignId:7`, `functionName`
  corretto) — confermata anche l'affermazione del dev che `prisma/seed.ts`
  non crea Feature per-campagna (solo FeatureType platform-wide). 8 sezioni
  oggetti verificate `showInSidebar:false` dal vivo (id 31-38), verificata
  anche l'assenza di DataType omonimi in altre campagne (nessun rischio di
  update cross-tenant). `type-check`/`lint` puliti, `test:run` 1353/1363
  (10 fail preesistenti confermati, file non toccati da questo task).
  Nessun finding. Raccomanda merge su `nuova_frontiera` e chiusura task.
- 2026-07-23 (owner): verdetto integrato. Data la natura del cambiamento
  (rimozione di una restrizione di sicurezza appena introdotta, impatta il
  flusso reale di creazione PG), assegno comunque a `qa` per un passaggio
  end-to-end indipendente prima di `done` — stesso standard già applicato
  a T-035/T-039/T-040 per cambi rilevanti. `status: in-review`,
  `assignee: qa`.
- 2026-07-23 (qa): verifica end-to-end dal vivo, dati temporanei con cleanup
  verificato (stesso pattern T-039/T-040), campagna scratch `qa-041-scratch`
  (id 11→12, entrambe cancellate) per l'esercizio generico del servizio, poi
  campagna reale Nuova Frontiera (id 7) per l'esercizio del downtime.
  **Diff `58e34ab` confermato coerente con Artifacts**: rimozione pulita di
  `TalentApprovalRequiredError` (classe + gate + 2 import route + gate UI in
  `characters/new/page.tsx`), nessun residuo (`grep` su `src/`, solo un
  commento storico in `characterData.service.test.ts:542`, non codice
  eseguito); `CreationOnlyAssignmentError` e il suo gate (`creationOnly &&
!isCreation`) intatti, riga per riga identici al pre-T-041.
  **Test 1 (servizio, live, scratch)**: `assignReferenceDataToCharacter` con
  `isMaster:false, isCreation:true` su un talento `creationOnly:false` senza
  requisiti → **ACCETTATO** (id CharacterData 31). Su un talento
  `creationOnly:false` con un `requires` non posseduto → **RIFIUTATO con
  `RequirementsNotSatisfiedError`** (non più `TalentApprovalRequiredError`,
  che non esiste più). Confermato criterio 1.
  **Test 2 (CreationOnlyAssignmentError, live, scratch)**: stesso talento
  `creationOnly:true`, `isCreation:false` (downtime) → **RIFIUTATO con
  `CreationOnlyAssignmentError`** (id 32 mai creato); lo stesso talento con
  `isCreation:true` (creazione) → **ACCETTATO** (id 32). Confermato
  criterio 3, invariato.
  **Feature id:13 (Nuova Frontiera)**: riconfermato dal vivo via query
  Prisma diretta — `campaignId:7`, `featureType.functionName:
"downtimeLearnTalent"`, `actionSchema` con `referenceDataId` richiesto.
  Confermato criterio 5.
  **8 DataType (id 31-38)**: riconfermate `showInSidebar:false` dal vivo (8/8);
  riverificato anche lato **query reale del repository** (non solo lettura
  DB diretta): `listCampaignsByOrgSlug` (usata da `GET /api/campaigns` per
  la sidebar) restituisce per Nuova Frontiera solo 5 `dataTypes`
  (Razza/Fazione/Divinità/Talenti/Dicerie), `dataTypeCount:13` (5 visibili +
  8 nascoste) — le 8 sezioni oggetti confermate assenti dall'elenco
  effettivamente esposto alla sidebar, non solo dal record DB. Confermato
  criterio 6.
  **`bun run type-check`**: pulito. **`bun run lint`**: pulito.
  **`bun run test:run`**: 1353 pass / 10 fail su 1363 — stessi identici 10
  fallimenti pre-esistenti (`DataTypesManager.test.tsx` 6 +
  `ReferenceDataManager.test.tsx` 4, mismatch accessible-name su icon-button
  `edit`/`delete`), nessuna regressione. Rieseguiti mirati anche
  `characters/__tests__/route.test.ts` + `characterData.service.test.ts` +
  `characters/new/__tests__/page.test.tsx`: 86/86 verdi. Confermato
  criterio 7 (e, di riflesso, criterio 2 e 4 — nessun residuo di codice/test
  T-035 superato).
  **⚠️ Difetto reale trovato (punto 3 delle istruzioni QA, "esercitare
  l'intero flusso downtime")**: ho esercitato dal vivo il flusso completo
  richiesto — `executeFeatureAction` con la `Feature id:13` reale, un
  `Character` temporaneo nella campagna **reale** Nuova Frontiera (id 7,
  cancellato a fine test) e una `ReferenceData` temporanea
  (`creationOnly:false`) sotto il vero `DataType` "Talenti" (id 29,
  cancellata a fine test). **Risultato: RIFIUTATO con
  `PlayerAssignmentNotAllowedError`**, sia per il self-assign diretto in
  creazione (`isCreation:true`) sia per il flusso downtime `learnTalent`
  (`executeFeatureAction`) — non per requisiti/XP, ma perché il `DataType`
  "Talenti" di Nuova Frontiera ha **`playerAssignable: false`** (verificato
  via query diretta: id 29, `playerAssignable:false`, a differenza di
  Razza/Fazione/Divinità che sono tutte `playerAssignable:true`). Questo
  flag non è stato toccato da T-041 (introdotto da T-040, commit `3c4914c`,
  `git log -L` conferma nessuna modifica successiva su quella riga) — non è
  quindi un difetto del diff `58e34ab` in sé, ma una conseguenza pratica non
  verificata prima di chiudere: **l'obiettivo di business dichiarato in
  Obiettivo/Scope di T-041 ("un giocatore ordinario deve poter scegliere
  qualunque talento non bloccato... esattamente come già accade per
  Razza/Fazione/Religione") non è raggiunto per la campagna reale Nuova
  Frontiera**, né in creazione PG né via downtime: un giocatore ordinario
  non può selezionare/apprendere ALCUN talento in quella campagna oggi,
  esattamente come prima di T-041 (l'unico modo per assegnare un talento a
  un PG in Nuova Frontiera resta la concessione master, `isMaster:true`, che
  bypassa comunque `playerAssignable`). Di conseguenza l'attivazione della
  `Feature downtimeLearnTalent` per Nuova Frontiera (bullet esplicito dello
  Scope di T-041) è al momento un'attivazione senza effetto pratico per i
  giocatori: la coda di approvazione non verrà mai raggiunta da un
  self-assign giocatore, perché il gate a monte (`playerAssignable`) blocca
  prima.
  Riproduzione: script Prisma ad hoc (non committato, cancellato — stesso
  pattern T-039/T-040) contro campagna id 7 reale — `Feature.findUniqueOrThrow({id:13})`
  - `ReferenceData.create` temporanea sotto `dataTypeId:29` + `Character`
    temporaneo → `assignReferenceDataToCharacter(..., {isMaster:false,
isCreation:true})` e poi `executeFeatureAction({functionName:
"downtimeLearnTalent", ...})`: entrambi lanciano
    `PlayerAssignmentNotAllowedError: "Questa voce di catalogo non è
assegnabile dal giocatore."`. Cleanup verificato (character/referenceData/
    user temporanei cancellati, nessun residuo).
    **Verdetto**: i 7 criteri di accettazione **letterali** del task sono
    tutti soddisfatti con prova (li lascio spuntati, verificati dal vivo).
    Non riporto però il task a `done`: il punto 3 delle istruzioni di verifica
    esplicitamente richiesto ("prova a esercitare l'intero flusso downtime...
    confermando che il flusso di approvazione funzioni") **non passa** per la
    campagna target reale — non per un bug nel codice toccato da questo
    commit, ma perché manca (fuori da questo diff, ma dentro lo spirito dello
    Scope "Attivare `downtimeLearnTalent` per Nuova Frontiera") l'allineamento
    di `DataType.playerAssignable` per "Talenti" in
    `seed-nuova-frontiera/index.ts` (riga 283, `playerAssignable: false`,
    mai rivista da T-040 a oggi). Rimando a `dev`/`owner` per decidere se: (a)
    flippare `playerAssignable: true` per "Talenti" in Nuova Frontiera (in
    sorgente + `UPDATE` mirato su Neon dev, stesso pattern già usato per
    `showInSidebar`), coerente con "esattamente come Razza/Fazione/Religione"
    — oppure (b) confermare che in Nuova Frontiera i talenti restano
    concedibili solo dal master (in tal caso l'attivazione della Feature
    `downtimeLearnTalent` andrebbe rivista/documentata come intenzionalmente
    inerte per i giocatori, e l'Obiettivo del task andrebbe corretto di
    conseguenza). `status: in-progress`, `assignee: dev`.
- 2026-07-23 (owner): scelta (a) confermata — l'utente ha chiesto
  esplicitamente in conversazione che il giocatore possa selezionare "tutti
  i talenti non bloccati" in creazione. `Talenti` in Nuova Frontiera deve
  avere `playerAssignable: true` (coerente con Razza/Fazione/Religione,
  stesso trattamento già applicato al seed demo da T-035). Compito per
  `dev`: correggere `prisma/seed-nuova-frontiera/index.ts` riga ~283
  (`playerAssignable: true`) + `UPDATE` mirato su Neon dev sulla riga
  "Talenti" già seedata in Nuova Frontiera (stesso approccio prudente già
  usato per `showInSidebar`: `SELECT` prima, documenta, poi esegui).
  Riverificare dal vivo che il flusso downtime `learnTalent` funzioni
  end-to-end per un talento non-creationOnly su quella campagna reale dopo
  il fix. `status: in-progress`, `assignee: dev` (già impostato da qa).
- 2026-07-23 (dev): round 2, fix del gap segnalato da qa. Cambiato
  `playerAssignable: false` → `true` per "Talenti" in
  `prisma/seed-nuova-frontiera/index.ts` (riga ~283). Confermato via `grep`
  che nessun test/consumer nel repo assume `Talenti.playerAssignable: false`
  specifico di Nuova Frontiera (solo fixture generiche indipendenti dal
  seed) — nessun altro file da aggiornare.
  Verificato dal vivo su Neon dev (campagna reale id 7, `DataType` Talenti
  id 29): `SELECT` prima mostra `playerAssignable:false` (coerente con quanto
  trovato da qa); eseguito un `updateMany` mirato (`campaignId:7 AND name:
"Talenti"`, script Prisma ad hoc via Bash, non committato, cancellato a
  fine operazione — stesso pattern già usato per `showInSidebar` in round 1)
  → 1 riga aggiornata; `SELECT` di riverifica conferma `playerAssignable:true`,
  `cardinality:multi` (invariante rispettata).
  Riverifica end-to-end dal vivo (stesso pattern T-039/T-040/qa round 1,
  dati temporanei scoped e ripuliti, campagna **reale** Nuova Frontiera id 7,
  nessuna campagna scratch necessaria in questo giro):
  usato un talento reale non-`creationOnly` senza requisiti (`Avanguardia`,
  id 49, sotto il vero `DataType` Talenti id 29) e la `Feature` reale id 13
  (`downtimeLearnTalent`, `campaignId:7`).
  **Test 1** — `assignReferenceDataToCharacter(prisma, character, definition,
{ isMaster:false, isCreation:true })` su un `Character` temporaneo nuovo →
  **ACCETTATO** (`CharacterData` id 33), nessun `PlayerAssignmentNotAllowedError`.
  **Test 2** — `executeFeatureAction({ functionName: "downtimeLearnTalent",
... })` (stessa `Feature id:13`) su un secondo `Character` temporaneo
  esistente → **ACCETTATO** (`Action` id 11 in `waitingApproval`,
  `CharacterData` id 34), nessun errore. Entrambi i flussi richiesti dal qa
  (self-assign creazione + downtime `learnTalent`) confermati funzionanti
  end-to-end sulla campagna reale dopo il fix.
  Cleanup: `CharacterData`/`XpTransaction`/`Action`/`Character`/`User`
  temporanei cancellati; riverificato con una query successiva che non
  restassero residui (un batch di 2 `User` orfani da un tentativo di script
  fallito in precedenza — errore di validazione Prisma su `type: "PG"` invece
  dell'enum `CharacterType.pg`, mai arrivato a creare `Character` — è stato
  individuato e ripulito con una query dedicata: 0 residui confermati alla
  fine). Nessuna modifica al talento reale id 49 o ad altri dati permanenti
  della campagna.
  `bun run type-check`: pulito. `bun run lint`: pulito. `bun run test:run`:
  1353 pass / 10 fail su 1363 — stessi identici 10 fallimenti pre-esistenti
  (`DataTypesManager.test.tsx` 6 + `ReferenceDataManager.test.tsx` 4,
  mismatch accessible-name su icon-button `edit`/`delete`), nessuna
  regressione introdotta da questo round.
  Portato `status: in-review`, `assignee: qa` (fix di dati/config, non
  logica applicativa nuova — non serve un nuovo giro di `reviewer`, torna
  direttamente a `qa` per la riverifica finale del criterio 3 già segnalato).
- 2026-07-23 (qa): **riverifica finale indipendente del round 2** (commit
  `b0ac77a`). Tutti i 5 punti richiesti verificati con prova diretta,
  indipendentemente dalle affermazioni del dev.
  **1) Stato Neon dev**: query Prisma diretta (script ad hoc, non committato,
  cancellato a fine verifica) su `DataType.findUnique({id:29})` →
  `{campaignId:7, name:"Talenti", playerAssignable:true, cardinality:"multi",
showInSidebar:true}`. Confermato anche che Razza/Fazione/Divinità (id
  26/27/28) sono tutte `playerAssignable:true`, coerenti. `Feature id:13`
  riconfermata (`campaignId:7`, `functionName:"downtimeLearnTalent"`).
  **2) End-to-end reale, riprodotto io stesso** (non riletto dal log del dev):
  script Prisma ad hoc contro la campagna **reale** Nuova Frontiera (id 7),
  2 `Character`/`User` temporanei creati e cancellati a fine test (cascade +
  delete espliciti, verificato con conteggi `count()` post-cleanup: 0 residui
  su characters/users/referenceData e sui record puntuali per id).
  **Test 1** — self-assign in creazione (`isCreation:true`) di un talento
  reale non-creationOnly, cost 0 (`Avanguardia`, id 49, sotto il vero
  `DataType` Talenti id 29) → **ACCETTATO** (`CharacterData` id 35).
  **Test 2** — downtime `learnTalent` **via `executeFeatureAction` reale**
  (non chiamata diretta al servizio: ho invocato l'intero registry
  feature-handler, `functionName:"downtimeLearnTalent"`, con la `Feature`
  reale id 13) su un secondo talento reale non-creationOnly, cost 0
  (`Istruzione`, id 50) → **ACCETTATO**, `Action` id 12 creata in
  `waitingApproval`, `CharacterData` id 36. Entrambi i flussi richiesti dal
  giro precedente (self-assign creazione + downtime `learnTalent`)
  confermati funzionanti end-to-end sulla campagna reale.
  **3) Nessuna regressione collaterale**, verificata con 3 test aggiuntivi
  nello stesso giro:
  — **Requisiti/XP invariati**: un talento reale con `cost:20`
  (`Addestramento fisico 1`, id 56) assegnato in creazione a un PG nuovo con
  saldo XP 0 → **RIFIUTATO con `RequirementsNotSatisfiedError`** (non
  bypassato dal flip di `playerAssignable`).
  — **`creationOnly` ancora bloccato via downtime**: nessun talento reale di
  Nuova Frontiera ha `creationOnly:true` (verificato: 0/238 righe sotto
  `dataTypeId:29`), quindi ho creato una `ReferenceData` temporanea
  (`creationOnly:true, cost:0`) sotto il vero `DataType` Talenti per
  esercitare il gate — **RIFIUTATA con `CreationOnlyAssignmentError`** sia
  via chiamata diretta al servizio (`isCreation:false`) sia via
  `executeFeatureAction` (`downtimeLearnTalent`) reale; lo stesso item con
  `isCreation:true` → **ACCETTATO** (controllo positivo). `ReferenceData`
  temporanea cancellata a fine test, 0 residui.
  — **Il flip non ha sbloccato altro**: `Dicerie` (id 30, altro `DataType`
  di Nuova Frontiera con `playerAssignable:false`, non toccato da questo
  task) resta **RIFIUTATO con `PlayerAssignmentNotAllowedError`** per il
  self-assign in creazione — conferma che la correzione è stata scoped
  correttamente al solo "Talenti", non un flip generale.
  **4) Quality gate**: `bun run type-check` pulito. `bun run lint` pulito.
  `bun run test:run`: **1353 pass / 10 fail su 1363** — stessi identici 10
  fallimenti pre-esistenti (`DataTypesManager.test.tsx` 6 +
  `ReferenceDataManager.test.tsx` 4, mismatch accessible-name su
  icon-button `edit`/`delete`, confermati anche nell'output completo di
  questo giro, nessun file toccato da T-041 tra i falliti), nessuna
  regressione. Rieseguiti mirati anche `characterData.service.test.ts` +
  `characters/__tests__/route.test.ts` +
  `characters/new/__tests__/page.test.tsx`: **86/86 verdi**. `grep` su
  `src/` conferma zero residui di `TalentApprovalRequiredError` (solo un
  commento storico in `characterData.service.test.ts:542`).
  **5) Criteri di accettazione**: tutti e 7 riconfermati validi con prova
  diretta di questo giro (non solo per lettura del log precedente) — restano
  spuntati.
  **Verdetto: nessun problema residuo.** Il gap pratico trovato nel giro
  precedente (talenti bloccati a monte da `playerAssignable:false` per
  Nuova Frontiera, sia in creazione sia via downtime) è risolto e verificato
  in modo indipendente: un giocatore ordinario può ora selezionare/apprendere
  un talento reale non-creationOnly di Nuova Frontiera sia in creazione PG
  sia via downtime `learnTalent`, con tutte le altre guardie (requisiti/XP,
  `creationOnly`, `playerAssignable` su altri `DataType`) intatte. Le
  condizioni QA sono soddisfatte. `status: in-review` invariato (solo
  l'owner porta il task a `done`), `assignee: owner`.
- 2026-07-23 (owner): tutte e tre le condizioni di stop (`.task/README.md`
  §6) soddisfatte — criteri di accettazione tutti `[x]`, `test:run` con
  soli 10 fallimenti pre-esistenti confermati indipendentemente da
  reviewer e qa (2 giri), reviewer OK pulito al round 1, qa ha trovato e
  fatto risolvere un gap pratico reale (`Talenti.playerAssignable: false`
  in Nuova Frontiera vanificava lo scopo del task) prima di dare
  l'approvazione finale, con riverifica end-to-end indipendente su dati
  reali della campagna. Status → `done`.
