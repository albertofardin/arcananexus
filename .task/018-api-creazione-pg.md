---
id: "018"
title: "API creazione PG con selezione dati campagna e grant XP iniziale"
status: done
priority: P0
assignee: owner
branch: task/018-api-creazione-pg
base: task/017-servizio-assegnazione-dati-pg
trello: ""
created: 2026-07-13
updated: 2026-07-14
---

## Obiettivo

Endpoint per creare un `Character` scegliendo le voci di catalogo della campagna
(razza, religioni, talenti di creazione…), applicando cardinalità, requisiti e budget
XP tramite il servizio di T-017, e accreditando gli XP iniziali determinati dalla razza.

## Scope

Incluso:

- Route `POST` creazione Character (campaign-scoped) con payload: dati del PG + lista
  assegnazioni (`referenceDataId` scelti per `DataType`), validati Zod.
- **Grant XP iniziale**: se la campagna ha un `DataType` `kind = race`, alla scelta
  della razza si accredita `XpTransaction` (`reason = initialGrant`, `amount =
race.flags.startingPx`) prima di applicare i costi dei talenti di creazione. Ordine:
  crea PG → grant iniziale → assegnazioni (che addebitano il costo) — tutto atomico.
- Applica cardinalità/requisiti/`creationOnly`/budget XP via T-017; distingue
  self-service giocatore vs master (override e sforo XP consentiti solo al master).
- Autorizzazione: il giocatore crea il proprio PG dove la campagna lo consente; il master
  può creare per altri; scoping multi-tenant.
- Test API + isolamento multi-tenant.

Escluso:

- Pagina frontend (T-022); workflow di approvazione completo (si appoggia a
  `Character.approvalDate` esistente, ma il flusso non è in scope); recupero XP morte
  (T-025).

## Criteri di accettazione

- [x] `POST` crea PG + grant XP iniziale per razza + assegnazioni coerenti con
      cardinalità/requisiti/budget; il saldo XP finale è corretto; test.
- [x] Giocatore vs master (override + sforo XP) gestiti correttamente; test autorizzazione.
- [x] Creazione atomica (fallimento di un'assegnazione → nessun PG/transazione orfani); test.
- [x] Isolamento multi-tenant; `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- `src/lib/services/characterData.service.ts` — `assignReferenceDataToCharacter`/
  `evaluateRequirements` ora accettano `XpTransactionClient` (non solo `PrismaClient`):
  se ricevono un `Prisma.TransactionClient` scrivono direttamente su di esso invece di
  aprirne uno proprio (`isFullPrismaClient` rileva l'assenza di `$transaction`).
- `src/lib/repositories/character.repository.ts` — `createCharacter` accetta
  `XpTransactionClient`.
- `src/lib/repositories/dataRequirement.repository.ts` — `listOutgoingRequirements`/
  `listIncomingRequirements` accettano `XpTransactionClient`.
- `src/lib/authorization.ts` (+ test) — nuovo `isUserCampaignMaster` (ruolo `master` o
  superiore).
- `src/lib/validations/character.ts` — `characterEditableFields` esportato (riusato da
  `characterCreation.ts`).
- `src/lib/validations/characterCreation.ts` (nuovo) — `createCharacterWithCatalogSchema`
  - `characterAssignmentInputSchema`.
- `src/app/api/campaigns/[campaignSlug]/characters/route.ts` (nuovo) — `POST` creazione
  PG con catalogo; altri metodi → 405.
- `src/app/api/campaigns/[campaignSlug]/characters/__tests__/route.test.ts` (nuovo) — 19
  test: 401/400(×2)/403(×4)/404(×4)/422(×3)/409/201(×2), isolamento multi-tenant, scenario
  end-to-end (grant + assegnazioni + saldo XP finale), rollback atomico.
- `src/lib/services/characterData.service.test.ts` (+1 test) — copre il ramo "client già
  in transazione" (nessun `$transaction` innestato).

interfaces:

- `assignReferenceDataToCharacter(prisma: XpTransactionClient, character, definition, options?): Promise<AssignReferenceDataResult>`
  (era `PrismaClient`).
- `evaluateRequirements(prisma: XpTransactionClient, character, definition): Promise<RequirementEvaluation>`
  (era `PrismaClient`).
- `createCharacter(prisma: XpTransactionClient, data: CreateCharacterData)` (era `PrismaClient`).
- `listOutgoingRequirements(prisma: XpTransactionClient, definitionId): Promise<...>`,
  `listIncomingRequirements(prisma: XpTransactionClient, requiredDefinitionId): Promise<...>`
  (erano `PrismaClient`).
- `isUserCampaignMaster(prisma: PrismaClient, userId: string, campaignId: number): Promise<boolean>`.
- `createCharacterWithCatalogSchema`: `{ name, background?, avatar?, type?, printableNotes?,
hiddenNotes?, approvalDate?, deathDate?, parkDate?, userId?, assignments: { referenceDataId,
value? }[] }`, `.strict()` + `.refine` anti-duplicati su `referenceDataId`.
- `POST /api/campaigns/[campaignSlug]/characters` → `201 { character, xpGrant, assignments,
xpDebits, xpBalance }`.

decisions:

- Atomicità reale (non "best-effort"/compensating action): `assignReferenceDataToCharacter`
  è stato reso componibile in transazione (vedi `interfaces` sopra) invece di aprire una
  propria `$transaction` ad ogni chiamata, perché altrimenti Character + grant + N
  assegnazioni sarebbero state N+1 transazioni Prisma indipendenti (commit parziali
  possibili). Il comportamento storico di T-017 (apre la propria transazione se riceve un
  `PrismaClient`) resta invariato per gli altri chiamanti (master grant manuale, T-019).
- Self-service giocatore: **nessun flag di campagna dedicato esiste** per abilitare la
  creazione PG autonoma. Assunzione: riuso di `checkAssociationQuotaAccess` (stesso gate già
  applicato per l'accesso generale alla campagna in
  `(dashboard)/dashboard/[campaignSlug]/layout.tsx`, T-4) — un giocatore con quota
  associativa valida (o ruolo direttivo/super-admin) può creare il proprio PG in qualunque
  campagna acceda, senza bisogno di un `Grant`. Da confermare/rivedere con owner se serve
  invece un flag esplicito per-campagna.
- Due soglie di autorizzazione distinte, non una sola: `isUserCampaignMaster` (master o
  superiore) governa "crea per conto di un altro utente" + `isMaster: true` verso T-017
  (bypass playerAssignable/creationOnly/requisiti/budget XP); `isUserCampaignHelper`
  (supporter+, preesistente) governa i `CHARACTER_STAFF_ONLY_FIELDS` (hiddenNotes/
  approvalDate/deathDate/parkDate), stessa soglia già usata da `POST /api/characters`.
- Più di una razza selezionata nella stessa richiesta → 422 (ambiguo, quale `startingPx`
  vale). Zero razze selezionate è invece valido (nessun grant iniziale, non tutte le
  campagne hanno necessariamente un `DataType kind=race` da scegliere in creazione).
- Mappatura errori T-017/T-025 → HTTP: `CrossCampaignAssignmentError`/
  `PlayerAssignmentNotAllowedError`/`CreationOnlyAssignmentError` → 404/403/403 (gli ultimi
  due difensivi: questa route passa sempre `isCreation: true` e risolve sempre le
  definizioni scopate alla campagna); `RequirementsNotSatisfiedError`/`InsufficientXpError`
  → 422 (`details` = valutazione/saldo, per il feedback al giocatore);
  `NonRepeatableAssignmentError` → 409. Quest'ultimo è strutturalmente irraggiungibile per
  una creazione PG normale (PG appena creato, `referenceDataId` duplicati già rifiutati
  dallo Zod) — testato comunque forzando il mock, a copertura della mappatura condivisa.
- Risposta `201` (non `200`): coerente con le altre route di creazione del repo
  (`POST /api/characters`, `POST .../reference-data`).

## Note / Log

- 2026-07-13 (owner): dipende da T-017 (servizio assegnazione) e T-025 (ledger XP).
- 2026-07-13 (owner): redesign — aggiunto grant XP iniziale per razza; assegnazioni via
  `CharacterData`.
- 2026-07-14 (owner): T-018 dipende solo da T-017, che sul proprio branch contiene già
  T-015+T-016+T-025 mergiati (nessuna dipendenza diamante qui, a differenza di T-017).
  Branch creato direttamente da `task/017-servizio-assegnazione-dati-pg` (tip: `02ec60e`,
  T-017 `done`, review 2 round + QA puliti, PR #36 aperta stacked su #33 ma non ancora
  mergiata in `main`). Per §12 del README il `dev` aspetterebbe il merge in `main`;
  **decisione esplicita owner/utente**: sbloccare comunque, stessa eccezione già usata
  per #33/#34/#36. Gate ri-verificati sul branch prima di iniziare: `bun run type-check`/
  `lint` puliti, `bun run test:run` → 69 file, 829 test verdi. PR di T-018 sarà stacked
  su `task/017` (#36). Da ripuntare su `main` dopo il merge di #32+#33+#34+#36.
- 2026-07-14 (dev): inizio implementazione.
- 2026-07-14 (dev): reso `assignReferenceDataToCharacter`/`evaluateRequirements` (T-017),
  `createCharacter` e `listOutgoing/IncomingRequirements` componibili in transazione
  (accettano `XpTransactionClient`), per l'atomicità reale richiesta da T-018 (vedi
  `decisions`); aggiunto `isUserCampaignMaster` in `authorization.ts`; nuovo schema
  `createCharacterWithCatalogSchema`; implementata
  `POST /api/campaigns/[campaignSlug]/characters` con 19 test route (401/400/403/404/422/
  409/201, isolamento multi-tenant, scenario end-to-end, rollback atomico). Gate finali:
  `bun run type-check` e `bun run lint` puliti, `bun run test:run` → 70 file, 853 test
  verdi (baseline 69/829, nessuna regressione). Branch: `task/018-api-creazione-pg`
  (verificabile con `git log task/018-api-creazione-pg` e rieseguendo i 3 gate). Porto lo
  stato a `in-review`: criteri riletti/verificati (checkbox lasciate a reviewer/QA per
  §6 del README).
- 2026-07-14 (owner): integrato verdetto reviewer round 1/3 — **OK pulito**, nessun
  finding bloccante. Gate ri-verificati dal reviewer: 70 file/853 test verdi. Punto a
  rischio più alto verificato correttamente: `isFullPrismaClient` distingue
  `Prisma.TransactionClient` da `PrismaClient` anche a runtime reale (il primo è nella
  deny-list Prisma, non espone `$transaction`), non solo nei mock — atomicità reale
  confermata (una sola `prisma.$transaction`, nessun nesting). Criteri di accettazione
  tutti coperti da test che li esercitano realmente. Autorizzazione a doppia soglia
  applicata correttamente, nessun bypass. 🟡 da confermare (non bloccanti, decisioni di
  dominio non difetti di codice): (1) il gate self-service (`checkAssociationQuotaAccess`)
  è a livello piattaforma, non per-campagna — un socio con quota valida può auto-crearsi
  PG in qualunque campagna acceda, senza limite sul numero di PG; (2) `type: "png"` è
  auto-assegnabile dal giocatore (coerente con `POST /api/characters` esistente, ma da
  confermare per il dominio LARP); (3) `startingPx` mancante sulla razza → 500 anziché
  4xx (misconfigurazione, ma ora raggiungibile da input giocatore). 💡 minore: mismatch
  doc — `## Artifacts` dichiara `avatar?` nel payload ma lo schema `.strict()` non lo
  include (400 se inviato); da allineare prima del frontend T-022. Nessun lavoro
  aggiuntivo richiesto per chiudere questo round. Prossimo passo: QA.
- 2026-07-14 (qa): verifica indipendente completata, i 4 criteri sono spuntati con prova
  diretta.
  - **Gate**: rieseguiti tutti e tre da zero (non fidandomi del numero dichiarato):
    `bun run type-check` pulito, `bun run lint` pulito, `bun run test:run` → 70
    file/853 test verdi (baseline confermata identica a quella dichiarata da dev/reviewer)
    prima delle mie aggiunte; dopo le mie 4 aggiunte → 70 file/857 test verdi.
  - **Criterio 1/2 (creazione + grant + saldo, giocatore vs master)**: riletti ed
    eseguiti isolatamente i test esistenti (righe 640-697 di `route.test.ts`,
    `test:run -- characters/__tests__/route.test.ts` → 34/34 verdi prima delle mie
    aggiunte): scenario 201 con razza+talento (saldo finale 30 = 50-20) e scenario
    master-override (saldo -999, `grantedByOverride: true`) osservati passare
    realmente, non solo letti.
  - **Punto più critico (`isFullPrismaClient`)**: verificato _indipendentemente_ dal
    verdetto del reviewer leggendo i tipi Prisma generati, non fidandomi della sola
    affermazione. Confermato sia a livello di tipo (`node_modules/.prisma/client/index.d.ts:3327`
    → `Prisma.TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>`)
    sia a runtime (`node_modules/@prisma/client/runtime/library.js` contiene l'array
    `["$connect","$disconnect","$on","$transaction","$extends"]` usato per costruire il
    client passato dentro `$transaction`): `$transaction` è realmente assente dal
    `Prisma.TransactionClient`, sia nei tipi che nell'oggetto runtime — la distinzione
    `typeof client.$transaction === "function"` è corretta, non solo nei mock.
  - **Scenario end-to-end nuovo (criterio 3, atomicità)**: aggiunto un test QA non
    presente prima (`characters/__tests__/route.test.ts`, "QA: rolls back the whole
    request when a mid-chain assignment fails on missing requirements, after a
    successful costed one") che esercita razza (grant +50) → talento a costo riuscito
    (-20, saldo 30) → talento che fallisce per requisito grafo mancante (non per XP,
    a differenza del test già esistente del dev che usava solo un fallimento da budget
    insufficiente): verificato che l'intera transazione fa rollback, zero `Character`/
    `CharacterData`/`XpTransaction` orfani. Verde.
  - **Sanity-check dell'harness**: iniettato un bug reale invertendo la condizione di
    `isFullPrismaClient` in `characterData.service.ts` (`!==` al posto di `===`);
    rilanciati i test → 8 test falliti come atteso (3 in `route.test.ts` — 201/201/422
    diventati 500 — e altri in `characterData.service.test.ts`), a riprova che i test
    esercitano realmente il ramo e non sono tautologici. Ripristinato con
    `git checkout -- src/lib/services/characterData.service.ts`; `git diff --stat`
    confermato pulito (solo `route.test.ts` con le mie aggiunte, nessun residuo del bug
    iniettato).
  - **Isolamento multi-tenant (criterio 4)**: confermati con prova diretta i test
    esistenti (404 per `referenceDataId` di un'altra campagna; 403 quando il ruolo
    master di campagna 1 non si applica su campagna 2) più un mio test aggiuntivo che
    dimostra che `checkAssociationQuotaAccess` non riceve mai `campaignId` (nessun gate
    per-campagna, coerente col punto 🟡 (1) sotto).
  - **3 punti 🟡 del reviewer, confermati con prova diretta (non richiesto fix, solo
    conferma per l'owner)**: aggiunti 3 test QA dedicati, tutti verdi.
    1. Self-service a livello piattaforma non per-campagna: stesso utente senza alcun
       `Grant`, con quota associativa valida, crea un PG con successo (201) sia su
       campagna A sia su campagna B — nessun flag/gate per-campagna esiste o viene
       consultato.
    2. `type: "png"` auto-assegnabile dal giocatore: un giocatore ordinario (nessun
       `Grant`) invia `type: "png"` in creazione → 201, `character.type === "png"`
       (campo non incluso in `CHARACTER_STAFF_ONLY_FIELDS`).
    3. `startingPx` mancante sulla razza → 500 (non 4xx): una razza di catalogo con
       `flags: {}` selezionata dal giocatore → la route risponde 500 (catch-all),
       confermando che `grantInitialXp`/`readNumericFlag` lancia un `Error` generico non
       mappato a un codice HTTP specifico dalla route.
  - 💡 minore (mismatch doc `avatar`) non riverificato separatamente: è una nota
    documentale per T-022, non un comportamento a runtime da esercitare qui; nessuna
    obiezione al rinvio deciso dal reviewer.
  - Nessun difetto bloccante trovato. Tutti i test aggiunti sono stati lasciati nel
    repo (`characters/__tests__/route.test.ts`, +134 righe, +4 test) a copertura
    permanente dei punti verificati. `git diff --stat` finale: solo quel file.
  - Verdetto: ✅ tutti e 4 i criteri verificati con prova diretta (osservata, non solo
    letta). Porto `assignee` a `owner`; `status` lasciato `in-review` come da istruzioni.
- 2026-07-14 (owner): status → done (review round 1 pulita + QA indipendente con
  verifica separata del punto Prisma più critico, scenario e2e aggiuntivo, sanity-check
  dell'harness e conferma diretta dei 3 punti 🟡; nota: per §6 del README il `done`
  spetta formalmente a dopo il merge — stessa deviazione esplicita già applicata a
  T-016/T-025/T-017 su istruzione diretta dell'utente). Push del branch + PR aperta
  verso `task/017-servizio-assegnazione-dati-pg` (stacked su #36), non verso `main`:
  stessa decisione presa per i task precedenti, per evitare un diff duplicato/fuorviante
  finché #32/#33/#34/#36 restano aperte. Da ripuntare `--base main` dopo il merge di
  #32+#33+#34+#36. Follow-up non bloccanti per l'owner/utente (nessun fix di codice
  richiesto in questo task, sono decisioni di dominio confermate a runtime dal QA):
  (1) self-service creazione PG è a livello piattaforma non per-campagna, nessun limite
  sul numero di PG per utente/campagna; (2) `type: "png"` auto-assegnabile dal
  giocatore; (3) `startingPx` mancante sulla razza scelta → 500 invece di un 4xx
  pulito; (4) mismatch doc `avatar?` in Artifacts vs schema `.strict()` (400 se
  inviato) — da allineare prima di T-022 (UI creazione PG).
