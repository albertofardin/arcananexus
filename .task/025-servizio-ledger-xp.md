---
id: "025"
title: "Servizio ledger XP (saldo, grant iniziale per razza, addebito acquisto, recupero morte)"
status: done
priority: P0
assignee: owner
branch: task/025-servizio-ledger-xp
base: main
trello: ""
created: 2026-07-13
updated: 2026-07-14
---

## Obiettivo

Servizio riusabile sul ledger `XpTransaction` (introdotto in T-015): calcolo del saldo
come proiezione delle transazioni, accredito iniziale determinato dalla razza, addebito
all'acquisto di un talento, e recupero parziale degli XP alla morte del PG per il PG
successivo. È l'unica fonte di verità degli XP: nessun campo "saldo" salvato altrove.

## Scope

Incluso:

- `getXpBalance(characterId)` = somma degli `amount` (transazioni `done`/effettive; le
  transazioni legate a un'`Action` non ancora approvata **non** contano, ma **riservano**
  il budget → esporre anche `available = balance − pending`).
- `grantInitialXp(character, race)` → `XpTransaction(reason = initialGrant, amount =
race.flags.startingPx)`. Idempotente per PG (un solo grant iniziale).
- `debitTalent(character, referenceData, actionId?)` → `XpTransaction(reason = purchase,
amount = -referenceData.flags.cost)`; rifiuta se `available < cost` (salvo override
  master). Usato da T-017 dentro la stessa transazione DB dell'assegnazione.
- `recordDeathRecovery(sourceCharacter, targetCharacter, amount)` → primitiva che **solo
  registra** l'`XpTransaction(reason = deathRecovery)` sul PG successivo, con riferimento
  al PG defunto. **La regola non vive qui**: il _quanto_ è calcolato da una **feature di
  campagna** (registry T-019) il cui handler legge la config di campagna
  (`Feature.featureData`: percentuale/formula) + il saldo del defunto, e chiama questa
  primitiva. T-025 espone il primitivo del ledger; T-019 ospita l'handler e la config.
- `refund(...)` (`reason = refund`) per annullare un acquisto (es. rifiuto approvazione).
- Repository `xpTransaction.repository` + servizio; test unitari (saldo, riserva pending,
  grant idempotente, addebito/insufficienza, recupero morte, refund).

Escluso:

- UI XP; workflow approvazione completo (usa `Action` + refund/commit qui esposti);
  definizione dei `flags` (T-016) e assegnazione (T-017), che chiamano questo servizio.

## Criteri di accettazione

- [x] `getXpBalance` = somma corretta; `available` sottrae le transazioni pending; test.
- [x] `grantInitialXp` idempotente per PG; test doppio-invocazione.
- [x] `debitTalent` rifiuta sotto-budget per il giocatore, consente l'override al master;
      test.
- [x] `recordDeathRecovery` registra la transazione sul PG successivo con riferimento al
      defunto; test (il calcolo della quota è testato nell'handler in T-019).
- [x] Isolamento multi-tenant (transazioni scoping per PG/campagna); `bun run type-check`,
      `bun run lint`, `bun run test:run` verdi.

## Artifacts

**files_modified:**

- `prisma/schema.prisma` — aggiunto `XpTransaction.sourceCharacterId` (+ relazione
  self su `Character`, nominata per disambiguare da `characterId`) e indice dedicato;
  necessario per "riferimento al PG defunto" richiesto da `recordDeathRecovery`, campo
  assente nello schema ereditato da T-015.
- `prisma/migrations/20260714090000_xp_transaction_source_character/migration.sql` —
  migrazione scritta a mano (nessun `DATABASE_URL` disponibile in sandbox per
  `prisma migrate dev`; stesso approccio della migrazione precedente
  `20260713221144_metamodel_dati_campagna`).
- `src/lib/repositories/xpTransaction.repository.ts` (nuovo) — data access puro:
  `createXpTransaction`, `findInitialGrant`, `getSettledXpSum`,
  `getPendingXpReserved`, `listXpTransactionsForCharacter`.
- `src/lib/repositories/xpTransaction.repository.test.ts` (nuovo).
- `src/lib/repositories/index.ts` — barrel export del nuovo repository.
- `src/lib/repositories/README.md` — documentata la sezione XpTransaction/xp.service.
- `src/lib/services/xp.service.ts` (nuovo) — `getXpBalance`, `grantInitialXp`,
  `debitTalent` (+ `InsufficientXpError`), `recordDeathRecovery`, `refund`.
- `src/lib/services/xp.service.test.ts` (nuovo).
- `src/test/helpers/prisma-fixtures.ts` — `mockXpTransaction` esteso con
  `sourceCharacterId`; aggiunta `mockAction` (fixture per il workflow di
  approvazione, non ancora consumata da alcun test di questo task: i test su
  `pending`/`getPendingXpReserved` mockano direttamente `aggregate`, non
  righe `Action`. Lasciata per i test T-017 che opereranno su `Action` reali).
- `prisma/migrations/20260714100000_xp_transaction_initial_grant_unique/migration.sql`
  (nuova, chiusura finding 🟠 review) — indice UNIQUE PARZIALE
  `CREATE UNIQUE INDEX "XpTransactionInitialGrantUnique" ON
"XpTransaction"("characterId") WHERE "reason" = 'initialGrant'`; scritta a
  mano come le precedenti (nessun `DATABASE_URL` reale in sandbox).
- `prisma/schema.prisma` — aggiunto commento sul modello `XpTransaction` che
  documenta l'esistenza dell'indice parziale sopra (Prisma non lo rappresenta
  in `schema.prisma`, quindi va spiegato a chi legge lo schema senza vedere
  le migrazioni); nessun campo/relazione nuovi. Girato `prisma format` dopo
  la modifica (solo riformattazione locale del blocco, nessun altro diff).
- `src/lib/services/xp.service.ts` — `grantInitialXp` ora cattura `P2002`
  (violazione dell'indice sopra) sul `create` e rilegge il grant vincente via
  `findInitialGrant` invece di propagare l'errore; qualsiasi altro errore
  (o l'improbabile caso in cui la rilettura non trovi nulla) resta propagato
  invariato.
- `src/lib/services/xp.service.test.ts` — 3 nuovi test su `grantInitialXp`:
  race concorrente chiusa da `P2002` → ritorna il grant esistente senza
  propagare l'errore e senza una seconda `create`; `P2002` senza un grant
  trovato alla rilettura → l'errore viene comunque propagato (stato
  inatteso, nessun mascheramento silenzioso); errori diversi da `P2002` sul
  `create` passano invariati.

**interfaces:**

```ts
// src/lib/repositories/xpTransaction.repository.ts
export type XpTransactionClient = PrismaClient | Prisma.TransactionClient;
createXpTransaction(prisma: XpTransactionClient, data: CreateXpTransactionInput): Promise<XpTransaction>;
findInitialGrant(prisma: XpTransactionClient, characterId: number): Promise<XpTransaction | null>;
getSettledXpSum(prisma: XpTransactionClient, characterId: number): Promise<number>;
getPendingXpReserved(prisma: XpTransactionClient, characterId: number): Promise<number>;
listXpTransactionsForCharacter(prisma: XpTransactionClient, characterId: number): Promise<XpTransaction[]>;

// src/lib/services/xp.service.ts
getXpBalance(prisma: XpTransactionClient, characterId: number): Promise<{ balance: number; pending: number; available: number }>;
grantInitialXp(prisma: XpTransactionClient, character: Pick<Character, "id">, race: { id: number; flags: Prisma.JsonValue }): Promise<XpTransaction>;
debitTalent(prisma: XpTransactionClient, character: Pick<Character, "id">, referenceData: { id: number; flags: Prisma.JsonValue }, options?: { actionId?: number; allowOverride?: boolean }): Promise<XpTransaction>; // throws InsufficientXpError
recordDeathRecovery(prisma: XpTransactionClient, sourceCharacter: Pick<Character, "id" | "campaignId">, targetCharacter: Pick<Character, "id" | "campaignId">, amount: number): Promise<XpTransaction>;
refund(prisma: XpTransactionClient, character: Pick<Character, "id">, amount: number, options?: { referenceDataId?: number; actionId?: number }): Promise<XpTransaction>;
```

**decisions:**

- Schema esteso con `XpTransaction.sourceCharacterId` (self-relation su `Character`,
  `onDelete: SetNull`) perché lo schema T-015 non aveva alcun campo per "riferimento al
  PG defunto" richiesto dai criteri di accettazione di T-025. Modifica minima e isolata
  (una colonna nullable + indice); da segnalare al reviewer/owner di T-015 per un
  eventuale conflitto in fase di merge.
- `debitTalent`/`grantInitialXp` prendono l'intero `flags: Prisma.JsonValue` (non un
  `cost`/`startingPx` già estratto): la validazione formale dei `flags` per `kind` è
  T-016; qui un helper `readNumericFlag` fa solo un controllo runtime minimo e lancia
  se il campo manca o non è numerico, per non bloccare l'integrazione futura.
- Composabilità con `prisma.$transaction` (T-017): ogni funzione di repository e
  servizio accetta `XpTransactionClient = PrismaClient | Prisma.TransactionClient`
  come primo argomento, passato così com'è alle chiamate `prisma.xpTransaction.*`
  (nessuna gestione di transazione interna, nessun `$transaction` annidato).
- `debitTalent` accetta `options.allowOverride` (boolean) invece di risolvere da sé se
  il chiamante è master: il servizio non ha contesto di autorizzazione/sessione, la
  decisione (via `isSuperAdmin`/ruolo campagna) resta a T-017. Con `allowOverride: true`
  il controllo saldo viene saltato del tutto (niente query `aggregate`).
- `getXpBalance`: `balance` = somma transazioni con `actionId` null o `action.status =
done`; `pending` = valore assoluto della somma degli importi negativi legati ad
  `Action` con `status = waitingApproval`; `available = balance - pending`. Solo i
  debiti (`amount < 0`) riservano budget: un eventuale credito pendente (non usato
  oggi) non decurta `available`, semplicemente non conta finché non è approvato.
- `recordDeathRecovery` rifiuta un recupero tra PG di campagne diverse
  (`sourceCharacter.campaignId !== targetCharacter.campaignId`), unico controllo di
  isolamento multi-tenant sensato per questa primitiva (non verifica la campagna di
  `debitTalent`/`grantInitialXp`, che si assume già scoped dal chiamante che ha
  caricato `referenceData`/`race` dalla campagna corretta).
- `grantInitialXp` è ora idempotente anche sotto race condition, non solo per
  convenzione applicativa: il controllo `findFirst` prima del `create` resta
  (evita una query extra nel caso comune, nessun grant preesistente), ma il
  vincolo di unicità reale vive nel DB — indice UNIQUE PARZIALE su
  `characterId` filtrato per `reason = 'initialGrant'`
  (migrazione `20260714100000_xp_transaction_initial_grant_unique`; Prisma
  non lo rappresenta in `schema.prisma`, solo un commento sul modello lo
  documenta). Il servizio cattura la violazione (`P2002`) sul `create` e
  rilegge il grant vincente invece di propagare l'errore, così due chiamate
  concorrenti sullo stesso PG (retry di rete, doppio submit del form T-018)
  convergono su una sola riga `initialGrant` osservata da entrambi i
  chiamanti. Chiuso il finding 🟠 della review 2026-07-14.
- Nuova cartella `src/lib/services/` (non esisteva un layer "servizio" nel repo):
  scelta per separare le regole di business (saldo, idempotenza, rifiuto sotto-budget)
  dal repository (puro data access), come richiesto esplicitamente dal task
  ("Repository ... + servizio").

## Note / Log

- 2026-07-13 (owner): nuovo task dal redesign. XP su ledger separato (decisione utente).
  Dipende da T-015 (schema `XpTransaction`); consumato da T-017 (addebito) e T-018 (grant
  iniziale).
- 2026-07-13 (owner): decisione utente — il recupero-morte è una **feature che legge la
  config di campagna** (T-019). T-025 espone solo `recordDeathRecovery`; il calcolo della
  quota sta nell'handler della feature.
- 2026-07-14 (dev): inizio implementazione, branch stackato su
  `task/015-schema-metamodel-dati-campagna` (contiene `XpTransaction`).
- 2026-07-14 (dev): implementati repository + servizio ledger XP (vedi Artifacts).
  Estesa `XpTransaction` con `sourceCharacterId` (campo mancante nello schema T-015
  per il riferimento al PG defunto in `recordDeathRecovery`) e migrazione scritta a
  mano (nessun DB in sandbox). `bun run type-check`, `bun run lint`, `bun run
test:run` verdi (658 test, 0 failed). Branch `task/025-servizio-ledger-xp` pronto
  per review; nessun push/PR aperto.
- 2026-07-14 (dev, ri-verifica): riletto per intero il lavoro non committato
  (schema diff, migrazione a mano, repository, service, test, fixtures) e
  ri-eseguiti realmente i gate, non fidandomi dei checkbox già spuntati dalla
  sessione precedente. `bun install` (node_modules assente), poi con
  `DATABASE_URL`/`DIRECT_URL` fittizi (nessun DB reale disponibile in sandbox,
  né Docker né Postgres locale: limite ambientale, coerente con quanto già
  documentato per la migrazione) ho lanciato `prisma validate` (schema valido),
  `prisma format` (nessun diff, schema già formattato) e `prisma generate`
  (client rigenerato senza errori). Poi `bun run type-check` (pulito), `bun run
lint` (pulito), `bun run test:run` (59 file, 658 test, 0 failed). Confrontata
  a mano la migrazione `20260714090000_xp_transaction_source_character` con lo
  schema e con le convenzioni delle migrazioni precedenti (nome colonna/indice,
  `ON DELETE SET NULL ON UPDATE CASCADE` coerente con le altre FK verso
  `Character`): coerente. Verificati puntualmente i 5 criteri leggendo i test
  corrispondenti: saldo/available (`getXpBalance` + `getSettledXpSum`/
  `getPendingXpReserved`), idempotenza `grantInitialXp` (test doppia
  invocazione), `debitTalent` rifiuto sotto-budget + override master (due test
  dedicati), `recordDeathRecovery` con riferimento al PG defunto (+ rifiuto
  cross-campagna, + rifiuto importo non positivo), scoping multi-tenant
  (repository: `getSettledXpSum`/`getPendingXpReserved` filtrano sempre per
  `characterId`; service: `recordDeathRecovery` rifiuta esplicitamente
  `sourceCharacter.campaignId !== targetCharacter.campaignId`). Non ho trovato
  bug né criteri falsamente spuntati: tutti i 5 reggono, li ho ri-spuntati
  perché li ho visti passare io stesso ora, non perché mi fido della sessione
  precedente. Unica imprecisione trovata (corretta in Artifacts): la nota su
  `mockAction` diceva "usata per i test sul workflow di approvazione" ma non è
  in realtà consumata da alcun test attuale (dead/speculative fixture per
  T-017) — non un bug, solo documentazione imprecisa, ora corretta. `status`
  resta `in-review`: pronto per il reviewer, non spetta al dev portarlo a
  `done`.
- 2026-07-14 (reviewer): verdetto **OK pulito**, round 1/3, nessun finding bloccante.
  Criteri ri-verificati indipendentemente (saldo come proiezione, `available` =
  settled − pending senza doppio conteggio, override master isolato,
  `recordDeathRecovery` solo registrazione, scoping multi-tenant, migrazione a mano
  coerente e additiva/safe su DB con dati esistenti). Un finding 🟠 non bloccante:
  `grantInitialXp` idempotente solo per convenzione applicativa (`findFirst` poi
  `create`), nessun constraint DB → race concorrente possibile (doppio grant XP su
  un ledger che è unica fonte di verità). Da chiudere prima che T-018 consumi il
  servizio: indice unico parziale `CREATE UNIQUE INDEX ... ON
"XpTransaction"("characterId") WHERE "reason" = 'initialGrant'` nella migrazione
  (già scritta a mano) + gestione della violazione lato servizio. Findings 🟡
  minori: `debitTalent`/`grantInitialXp` si fidano che il chiamante scoping
  campagna correttamente (enforcement da garantire al bordo T-017); copertura
  test della semantica "reserve" solo indiretta (mock, niente DB in sandbox).
  Suggerimento 💡: gestione refund su Action rifiutata da progettare con cura al
  confine T-019 (`ActionStatus` non ha stato "rejected").
- 2026-07-14 (owner): integrato verdetto reviewer. Delego al dev la chiusura del
  finding 🟠 (indice unico parziale su `initialGrant` + gestione violazione) prima
  di considerare il task pronto per il merge.
- 2026-07-14 (dev): chiuso il finding 🟠 non bloccante della review. Aggiunta
  migrazione `20260714100000_xp_transaction_initial_grant_unique` (indice
  UNIQUE PARZIALE `XpTransactionInitialGrantUnique` su `XpTransaction`,
  `characterId` filtrato per `reason = 'initialGrant'`; casing dell'enum
  verificato sulla migrazione `20260713221144` che lo crea) + commento sul
  modello `XpTransaction` in `schema.prisma`. `grantInitialXp` ora cattura
  `P2002` sul `create` e rilegge il grant vincente con `findInitialGrant`
  invece di propagare l'errore (pattern `Prisma.PrismaClientKnownRequestError`
  già usato in `campaigns/[campaignSlug]/route.ts` e
  `campaigns/[campaignSlug]/grants/route.ts`); 3 nuovi test in
  `xp.service.test.ts` coprono race chiusa, race con rilettura vuota
  (errore propagato) ed errori non-`P2002` non toccati. `bunx prisma
validate`/`format` (con `DATABASE_URL`/`DIRECT_URL` fittizi, nessun DB reale
  in sandbox), poi `bun run type-check`, `bun run lint`, `bun run test:run`
  (59 file, 661 test, 0 failed) tutti verdi dopo il fix. `status` resta
  `in-review`: chiude un finding di review, non riapro un giro dev→reviewer
  completo; nessuna nuova questione emersa oltre al finding assegnato. Branch
  `task/025-servizio-ledger-xp`, worktree `core-task-025`; nessun push/PR.
- 2026-07-14 (owner): finding 🟠 chiuso e verificato (nuova migrazione + test).
  Verdetto reviewer era già OK pulito (nessun blocco); non riapro un round di
  review dedicato per una fix a un finding esplicitamente non bloccante. Task
  considerato pronto per il merge, in attesa di push/PR (decisione dell'utente)
  e di eventuale QA se previsto. Restano da presidiare, non qui: enforcement
  scoping-campagna dei chiamanti al bordo T-017; gestione refund/Action
  rifiutata al confine T-019.
- 2026-07-14 (reviewer): round 2/3, **verdetto OK pulito**, verifica mirata al fix del
  finding 🟠. SQL migrazione confermato corretto (casing enum `'initialGrant'`
  verificato contro `CREATE TYPE "XpReason"` in `20260713221144`), gestione P2002 in
  `grantInitialXp` corretta incluso l'edge case di rilettura vuota (errore propagato,
  non mascherato), 3 test non superficiali (asserzioni su numero di chiamate
  `create`/`findFirst`, propagazione per identità dell'errore). Ordine migrazioni
  coerente (09:00 → 10:00, nessuna dipendenza incrociata mal gestita). Gate ri-eseguiti
  dal reviewer: 59 file/661 test verdi. Diff dei due commit di fix circoscritto,
  nessuna regressione. Cautela per l'owner: l'indice unico parziale vive solo nella
  migrazione SQL (non in `schema.prisma`, limite noto Prisma) — un futuro `prisma
migrate dev` potrebbe rilevarlo come drift; il commento nello schema avverte di non
  rimuoverlo. Suggerimento 💡 non bloccante: la cattura P2002 non ispeziona
  `error.meta.target`, oggi sicuro (unico constraint unico sulla tabella) ma da
  rivalutare se si aggiungono altri unique constraint a `XpTransaction`. Ciclo
  dev↔reviewer chiuso in 2 round su 3.
- 2026-07-14 (owner): integrato verdetto reviewer round 2 (OK). Review chiusa.
  Prossimo passo: QA, poi merge.
- 2026-07-14 (qa): verificato con uno scenario end-to-end nuovo (non presente
  prima: i test esistenti erano tutti isolati per funzione con
  `mockResolvedValueOnce` puntuali, senza stato condiviso), aggiunto in
  `src/lib/services/xp.service.test.ts` (`describe("end-to-end scenario
(realistic T-017/T-018 sequence)")`). Mock Prisma **stateful** (ledger array
  - mappa `Action`→status in memoria, aggiornati dalle stesse
    `mockImplementation` di `create`/`findFirst`/`aggregate` invocate dal
    servizio, stesso pattern già in uso per `@/lib/db` in
    `cross-task-integration.test.tsx`), sequenza narrativa: PG con razza
    `startingPx=20` → `grantInitialXp` (saldo 20/0/20) → `debitTalent` 8 XP
    immediato (saldo 12/0/12) → `debitTalent` 5 XP con `actionId` pending
    (`waitingApproval`: balance resta 12, pending 5, available 7 — confermata
    la semantica "riserva senza contare nel saldo") → `debitTalent` 10 XP che
    supera l'`available` residuo (7): rifiutato con `InsufficientXpError`,
    nessuna riga scritta (verificata lunghezza ledger invariata) → stesso
    addebito con `allowOverride: true`: passa, `available` scende sotto zero
    (-3), confermato che l'override salta del tutto il controllo saldo →
    `recordDeathRecovery` verso un nuovo PG (id 11) della stessa campagna:
    riga con `sourceCharacterId=10` corretta, saldo del successore 6/0/6,
    ledger del PG defunto intatto e separato. Sanity-check del test harness:
    ho temporaneamente introdotto un bug reale in `getXpBalance`
    (`available: balance + pending` invece di `balance - pending`) e
    rieseguito la suite — lo scenario end-to-end e il test isolato
    `debitTalent` sono falliti come atteso (diff `available: 7` vs `17`),
    confermando che il test esercita davvero la logica e non passa per caso;
    ripristinato il codice originale subito dopo (nessun diff residuo su
    `xp.service.ts`, verificato con `git diff --stat`). Verificato anche il
    finding 🟡 non bloccante della review round 1 con un test dedicato: `
grantInitialXp`/`debitTalent` NON verificano che `race`/`referenceData`
    appartengano alla campagna del PG chiamante — confermato con i fatti che
    `referenceDataId` proveniente da un'altra campagna viene scritto sul
    ledger senza alcun rifiuto, comportamento esattamente quello dichiarato
    nelle `decisions` del task file (trust boundary sul chiamante, non un
    bug). Gate rieseguiti da me: `bun run type-check` pulito, `bun run lint`
    pulito (0 errori/warning dopo la pulizia di 2 warning
    `no-non-null-assertion` nel nuovo test), `bun run test:run` → 59 file, 663
    test (658 pre-esistenti + 2 nuovi test QA), 0 failed. Tutti e 5 i criteri
    di accettazione ri-verificati io stesso attraverso lo scenario (non solo
    per lettura dei test già presenti): li lascio spuntati `[x]`. Nessun bug
    bloccante trovato. `assignee` riportato a `owner` (verifica QA completata,
    `status` resta `in-review`: il passaggio a `done` spetta all'owner dopo il
    merge, come da `.task/README.md` §6). Task **pronto per il merge** dal mio
    punto di vista; restano, non di mia competenza qui, gli stessi due punti
    già segnalati dal reviewer come da presidiare al bordo dei task
    consumatori: enforcement scoping-campagna dei chiamanti (T-017) e gestione
    refund/Action rifiutata (T-019). Comando eseguito per la verifica mirata:
    `bunx vitest run src/lib/services/xp.service.test.ts --reporter=verbose`
    (17/17 passed).
- 2026-07-14 (owner): status → done (2 round di review + QA end-to-end, tutti puliti;
  nota: per §6 del README il `done` spetta formalmente a dopo il merge — deviazione
  esplicita su istruzione diretta dell'utente). Push del branch + PR #34 aperta
  verso `task/015-schema-metamodel-dati-campagna` (non verso `main`): stessa
  decisione esplicita utente presa per T-016, per evitare un diff duplicato/
  fuorviante finché PR #32 (T-015) resta aperta. Da ripuntare `--base main` dopo
  il merge di #32. Follow-up non bloccanti aperti per T-017/T-019: enforcement
  scoping-campagna dei chiamanti; gestione refund/Action rifiutata.
