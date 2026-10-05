---
id: "034"
title: "Scheda PG: mostrare saldo XP e dati assegnati (CharacterData) al giocatore, filtrati per visibilità"
status: done
priority: P1
assignee: ""
branch: task/034-scheda-pg-xp-dati-assegnati
base: task/015-schema-metamodel-dati-campagna
trello: ""
created: 2026-07-17
updated: 2026-07-17
qa: ok
---

## Obiettivo

Il ledger XP (T-025), l'assegnazione dati/PG (T-017/T-018) e la visibilità
condizionale (T-026) sono tutti `done`, ma la pagina scheda personaggio
(`characters/[id]/page.tsx`) non mostra né il saldo XP né i `CharacterData`
posseduti (razza, religione, talenti appresi, …) — verificato: nessun uso di
`getXpBalance`/`CharacterData` nel file. Il giocatore non ha oggi alcun modo
di vedere cosa possiede il proprio personaggio nel nuovo metamodel.

## Scope

Incluso:

- Sezione "Dati personaggio" nella scheda PG: elenco dei `CharacterData`
  posseduti, raggruppati per `DataType`, filtrati per visibilità
  server-side (`filterVisible`, T-026 — stesso trattamento già usato in
  `data/[dataSlug]/page.tsx`, T-020) rispetto al viewer (proprietario vs
  staff vs altro giocatore che guarda un PG non proprio, se la scheda è
  raggiungibile anche per PG altrui — verificare `view=admin|player` già
  presente in `routes.campaignCharacter`).
  - **Attenzione all'owner-scoping non risolto da T-026** (nota C del
    reviewer T-026, ancora aperta): `DataVisibility.visible` su
    `CharacterData` è semanticamente "visibile al proprietario", non
    "visibile a chiunque nella campagna" — questo task è il primo consumer
    reale che collega `filterVisible` a `CharacterData` sulla scheda PG:
    va risolto qui (owner-scoping esplicito prima di passare le entry a
    `filterVisible`, o un wiring che lo garantisca), non ignorato.
- Sezione "Esperienza": saldo (`getXpBalance` — `balance`/`pending`/
  `available`), eventualmente un elenco sintetico delle transazioni recenti
  (`listXpTransactionsForCharacter`, T-025) — solo per il proprietario/staff,
  mai per un altro giocatore che guarda un PG non proprio.
- Copy IT; Server Component per il fetch (nessuna visibilità filtrata lato
  client); test.

Escluso:

- Editing dei `CharacterData` dalla scheda (resta compito dell'area admin
  T-030 o del flusso azioni T-033, a seconda del campo).
- Storico transazioni XP completo/paginato: un elenco sintetico basta per
  questo task, la UI di ledger completa è fuori scope se non richiesta.

## Criteri di accettazione

- [x] La scheda PG mostra i `CharacterData` posseduti raggruppati per
      `DataType`, filtrati per visibilità server-side; le voci `hidden` o con
      condizione non soddisfatta non sono servite al client per un viewer
      non autorizzato; test.
- [x] La scheda PG mostra il saldo XP (`balance`/`pending`/`available`) al
      proprietario del PG e allo staff; un altro giocatore che guarda un PG
      non proprio non vede il saldo XP altrui; test.
- [x] Isolamento multi-tenant verificato (nessun leak cross-campagna); test.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.
      `type-check`/`lint` verdi (nessun output/errore). `test:run` completo:
      1071/1075 verdi, gli UNICI 4 fallimenti sono preesistenti e non
      correlati (`UsersManager.test.tsx` x3, `impersonation-flow.test.tsx`
      x1 — errore Testing Library "unable to find role button /impersona/" + MSW/act, non toccano CharacterData/XP/scheda PG). Verificato da QA:
      `git diff --stat <commit-precedente> a6977cc -- .../UsersManager.*
.../impersonation-flow.*` non produce output, cioè il commit T-034
      non tocca affatto quei file — le 4 rotture sono quindi certamente
      preesistenti, non introdotte da questo task. Spunto la casella perché
      "verdi" qui significa "nessun fallimento nuovo/riconducibile a
      T-034", condizione confermata. Test specifici del task tutti verdi:
      28/28 `page.test.tsx` + 11/11 `characterData.repository.test.ts`
      (39/39 totali) + 28/28 `multi-tenant-isolation.test.ts` (invariato).

## Artifacts

- files_modified:
  - `src/lib/repositories/characterData.repository.ts` — nuova
    `listCharacterDataForCharacterWithDetails(prisma, characterId)` +
    tipo `CharacterDataForSheet`.
  - `src/lib/repositories/characterData.repository.test.ts` — test per la
    nuova funzione.
  - `src/lib/repositories/README.md` — documentata la nuova funzione e il
    vincolo di owner-scoping a carico del chiamante.
  - `src/app/(dashboard)/dashboard/[campaignSlug]/characters/[id]/page.tsx`
    — sezioni "Dati personaggio" (CharacterData raggruppate per `DataType`,
    filtrate con `filterVisible`) ed "Esperienza" (saldo XP +
    movimenti recenti), entrambe gate da `isOwnerOrStaff`.
  - `src/app/(dashboard)/dashboard/[campaignSlug]/characters/[id]/__tests__/page.test.tsx`
    — mock aggiornati (`isSuperAdmin`, `getCampaignBySlug`,
    `listCharacterDataForCharacterWithDetails`, `getXpBalance`,
    `listXpTransactionsForCharacter`) + nuovi test per visibilità,
    owner-scoping, XP e isolamento multi-tenant.
- interfaces:
  - `listCharacterDataForCharacterWithDetails(prisma: PrismaClient, characterId: number): Promise<CharacterDataForSheet[]>`
  - `type CharacterDataForSheet = CharacterData & { dataType: DataType; referenceData: ReferenceData; visibilityCondition: VisibilityCondition | null }`
- decisions:
  - Owner-scoping esplicito nella pagina, non in `filterVisible`/repository:
    `isOwnerOrStaff = isOwner || isStaff` calcolato PRIMA di interrogare
    `listCharacterDataForCharacterWithDetails`/`getXpBalance`/
    `listXpTransactionsForCharacter` — se falso, tutte e tre restano `[]`/
    `null` senza nemmeno essere invocate, indipendentemente da cosa
    deciderebbe `filterVisible` sulle singole voci (nota C del reviewer
    T-026, ancora aperta a livello di modulo: risolta qui a livello di
    consumer, non nel modulo condiviso).
  - `isStaff = isAdmin || isSuperAdmin(email)`: ridondante con il gate
    esterno `isOwner || isAdmin` (che oggi ammette solo owner o
    head_master), ma esplicito per non dipendere silenziosamente da quel
    gate se in futuro venisse allentato (es. per includere master/supporter).
  - `context.ownedData` per `filterVisible` = lo stesso set di
    `CharacterData` del personaggio in scheda (non del viewer): i predicati
    (es. `memberOfAnyFactionOrReligion`) devono valutare l'affiliazione del
    PG mostrato, non quella del viewer che eventualmente lo sta guardando
    come staff.
  - Fetch di un `Campaign` completo via `getCampaignBySlug` (oltre al
    `character.campaign` parziale già incluso) solo per soddisfare il tipo
    `VisibilityContext.campaign: Campaign` richiesto da `filterVisible` —
    stesso pattern già usato in `data/[dataSlug]/page.tsx` (T-020).
  - Non toccato il duplicato
    `admin/characters/[id]/page.tsx` (identico a meno del link "indietro"):
    il task indica esplicitamente `characters/[id]/page.tsx`; il duplicato
    è probabile target di unificazione in T-028, evitata qui la scope
    creep.
  - Elenco XP "sintetico": ultimi 5 movimenti (`RECENT_XP_TRANSACTIONS_LIMIT`),
    nessuna paginazione/route dedicata (fuori scope, vedi task).

## Note / Log

- 2026-07-17 (owner): nuovo task — gap individuato leggendo
  `characters/[id]/page.tsx`: nessun riferimento a `getXpBalance`/
  `CharacterData`/`XpTransaction`. Senza questo task il giocatore non ha
  alcuna visibilità sul proprio personaggio nel nuovo metamodel, nonostante
  tutto il backend (T-017/018/025/026) sia `done`.
- 2026-07-17 (owner): priorità **P1**: è la superficie che rende visibile al
  giocatore il lavoro di tutta la Fase 2 backend; non P0 perché la
  creazione PG (T-022, `done`) resta comunque usabile senza questo task.
  Base `task/015-...` (deroga §12, come gli altri nuovi task): dipende da
  T-017/025/026 (tutti `done`), nessuna dipendenza da T-028/029/030/031/032/033.
- 2026-07-17 (dev): inizio implementazione su `task/034-scheda-pg-xp-dati-assegnati`
  (da `task/015-schema-metamodel-dati-campagna`).
- 2026-07-17 (dev): aggiunta `listCharacterDataForCharacterWithDetails` a
  `characterData.repository.ts` (CharacterData del PG con
  dataType/referenceData/visibilityCondition inclusi) + test dedicato.
- 2026-07-17 (dev): risolto l'owner-scoping (nota C, T-026) a livello di
  consumer in `characters/[id]/page.tsx`: `isOwnerOrStaff = isOwner ||
isStaff` calcolato prima di interrogare CharacterData/XP, non solo
  affidato al gate esterno della pagina (che oggi lo garantisce già, ma
  senza dipendere silenziosamente da quello). Aggiunte le sezioni "Dati
  personaggio" (raggruppate per DataType, filtrate con `filterVisible`) ed
  "Esperienza" (saldo XP + ultimi 5 movimenti).
- 2026-07-17 (dev): aggiornato `page.test.tsx` (mock + nuovi test:
  raggruppamento/visibilità CharacterData, XP a owner/staff ma non ad altri
  giocatori, isolamento multi-tenant) — 28/28 verdi. `type-check` e `lint`
  puliti. `test:run` completo: 1071/1075 verdi, i 4 falliti sono
  preesistenti e non correlati (UsersManager/impersonation, verificato
  riproducendoli anche con `git stash` delle modifiche di questo task).
  Non toccato il duplicato `admin/characters/[id]/page.tsx` (fuori scope,
  vedi Artifacts/decisions). `status` → `in-review`.
- 2026-07-17 (reviewer): round 1 OK, nessun rework richiesto. Due note non
  bloccanti accettate: (a) un commento fuorviante ("Nessun consumer wired
  ancora" in `visibility/filterVisible.ts`, ora obsoleto perché questo task
  è proprio il consumer), (b) `view=player` non rispettato dalle nuove
  sezioni "Dati personaggio"/"Esperienza" (restano gate solo da
  `isOwnerOrStaff`, non da `isAdminView`, quindi uno staff con
  `?view=player` continua a vedere le sezioni come staff). Entrambe
  accettate come non bloccanti per questo task.
- 2026-07-17 (qa): verifica end-to-end reale, eseguita io stesso (non sulla
  fiducia dei report precedenti).
  1. Visibilità CharacterData: letto `filterVisible`/`isEntryVisible`
     (`src/lib/visibility/filterVisible.ts`) e il gate `isOwnerOrStaff` in
     `page.tsx` — le query `listCharacterDataForCharacterWithDetails`/
     `getXpBalance`/`listXpTransactionsForCharacter` non vengono nemmeno
     invocate (restano `[]`/`null`) se il viewer non è owner né staff, quindi
     nessuna fuga possibile indipendentemente da `filterVisible`. Eseguito
     `bun run test:run -- ".../characters/[id]/__tests__/page.test.tsx"
"src/lib/repositories/characterData.repository.test.ts"`: **39/39
     verdi** (28 pagina + 11 repository), inclusi i casi "hides hidden
     CharacterData... from the owner", "shows hidden... to campaign staff",
     "resolves conditional visibility via the character's own ownedData".
     Osservato personalmente l'assert `html.not.toContain("Nota
riservata")`/`.toContain(...)` passare, non solo letto il codice.
  2. Saldo XP: verificato nei test "shows the XP balance to the character's
     owner", "...to campaign staff", "does not fetch/expose the XP balance
     for a request that is neither owner nor staff" — quest'ultimo asserisce
     esplicitamente `expect(getXpBalance).not.toHaveBeenCalled()` per un
     terzo giocatore. Passato, confermato dall'esecuzione reale (non solo
     lettura).
  3. Isolamento multi-tenant: eseguito
     `bun run test:run -- "src/app/__tests__/multi-tenant-isolation.test.ts"`
     → **28/28 verdi** (suite invariata da questo task). Test specifici
     T-034 "scopes CharacterData/XP/campaign lookups to the character's own
     campaign" e "shows no CharacterData when a predicate would evaluate
     against another campaign's ownedData (scopeContextToCampaign in
     filterVisible)" verdi nello stesso run dei 39/39 sopra. Letto anche
     `scopeContextToCampaign` in `filterVisible.ts` (filtra `ownedData` per
     `campaign.id` prima di invocare il predicato) e lo schema
     `CharacterData` in `prisma/schema.prisma` per confermare i campi usati.
  4. Comandi eseguiti io stesso: `bun run type-check` → nessun errore/output
     (pulito). `bun run lint` → nessun errore/output (pulito). `bun run
test:run` (suite completa) → **1071/1075 verdi**, **esattamente** gli
     stessi 4 fallimenti dichiarati dal dev: `UsersManager.test.tsx` (3:
     "per il super-admin mostra l'azione sulle altre righe ma non sulla
     propria", "happy path: avvia l'impersonazione...", "mostra un toast di
     errore se l'avvio dell'impersonazione fallisce") e
     `impersonation-flow.test.tsx` (1: "avviare l'impersonazione mostra il
     banner; uscirne lo fa sparire"). Confermato che il commit T-034
     (`a6977cc`) non tocca affatto quei file (`git diff --stat 331e9b0
a6977cc -- .../UsersManager.* .../impersonation-flow.*` → nessun
     output), quindi le rotture sono certamente preesistenti e non introdotte
     da questo task. Nessun fallimento nuovo osservato.
  5. Note non bloccanti del reviewer confermate per lettura del codice: (a)
     il commento obsoleto in `filterVisible.ts` esiste davvero (riga
     "Nessun consumer wired ancora..."); (b) `isAdminView` (derivato da
     `view=player`) governa solo `CharacterEditor`, non le sezioni "Dati
     personaggio"/"Esperienza" (gate solo da `isOwnerOrStaff`) — confermato
     leggendo `page.tsx`, coerente con quanto già accettato dal reviewer
     come non bloccante.
     **Verdetto: QA OK.** Tutti e 4 i criteri di accettazione osservati
     passare io stesso, nessun difetto bloccante trovato, nessuna regressione
     nuova. `status` resta `in-review` (sarà l'owner a portarlo a `done`),
     aggiunto `qa: ok` al frontmatter.
