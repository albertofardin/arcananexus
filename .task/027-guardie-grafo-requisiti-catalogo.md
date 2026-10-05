---
id: "027"
title: "Grafo requisiti catalogo: guardia di profondità + guard di cancellazione con dipendenti espliciti"
status: done
priority: P1
assignee: owner
branch: task/027-guardie-grafo-requisiti-catalogo
base: task/016-catalogo-campagna-repo-api
trello: ""
created: 2026-07-14
updated: 2026-07-14
---

## Obiettivo

Irrobustire il grafo dei requisiti (`DataRequirement`) consegnato in T-016 (già
`done`, PR #33): oggi il check anti-ciclo non ha un tetto di profondità esplicito
e la cancellazione di una `ReferenceData` con dipendenti avviene **a cascata e in
silenzio** (nessun 409, nessun avviso). Aggiungere una guardia di profondità
deterministica e un guard di cancellazione che spieghi, nel messaggio di errore,
quali voci dipendenti bloccano la rimozione.

## Scope

Incluso:

- **Guardia di profondità esplicita** in `wouldCreateRequirementCycle`
  (`src/lib/repositories/dataRequirement.repository.ts:69-98`): il BFS attuale è
  protetto da un `Set` di visitati (termina sempre, nessun loop infinito) ma non
  ha un tetto esplicito — aggiungere una costante `MAX_REQUIREMENT_DEPTH` (es.
  `50`) e restituire un errore esplicito e deterministico se la catena di
  `requires` supera il tetto, invece di continuare a interrogare il DB un livello
  BFS alla volta senza limite dichiarato.
- **Guard di cancellazione con dipendenti espliciti**: oggi `deleteReferenceData`
  (`src/lib/repositories/referenceData.repository.ts:128-135`) e la route
  `DELETE` (`src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/route.ts:149-167`)
  non controllano dipendenti — la FK `onDelete: Cascade` su `DataRequirement`
  (`prisma/schema.prisma:258-259`) cancella silenziosamente gli archi collegati.
  Prima della delete, usare `listIncomingRequirements` (già esistente,
  `dataRequirement.repository.ts:20-29`) per trovare le `ReferenceData` che
  dipendono da questa voce; se non vuoto → **409**, body con l'elenco (`id` +
  `name`) delle voci dipendenti che bloccano la rimozione. Nessun cambio allo
  schema (`onDelete: Cascade` resta): il guard è applicativo, best-effort, in
  linea con l'approccio già scelto per il cycle check.
- Indice inverso su `requiredDefinitionId`: **già presente**
  (`@@index([requiredDefinitionId])`, `schema.prisma:263`) — solo verificare che
  resti nella migrazione corrente, nessun lavoro aggiuntivo richiesto.

Escluso:

- Riscrivere il BFS in-app come `WITH RECURSIVE` SQL: a questa scala (catalogo
  per campagna, decine/centinaia di voci) il BFS applicativo va bene così com'è,
  non è nel perimetro di questo task.
- Valutazione runtime dei requisiti all'acquisto di un talento da parte del PG
  (T-017).
- Cambiare il comportamento `onDelete` a livello di FK Prisma (si resta con
  `Cascade` + guard applicativo pre-check).

## Criteri di accettazione

- [x] Superare `MAX_REQUIREMENT_DEPTH` in una catena di `requires` → errore
      esplicito e deterministico (non un timeout, non un ciclo che continua);
      test con catena generata oltre il tetto.
- [x] I test di cycle detection esistenti (`dataRequirement.repository.test.ts:109-146`)
      restano verdi dopo l'introduzione della guardia di profondità.
- [x] `DELETE` su una `ReferenceData` con almeno una voce dipendente (`requires`
      o `blocks` in entrata) → 409; il body elenca `id` + `name` di ciascuna voce
      dipendente; test che verifica il **contenuto** del messaggio, non solo lo
      status code.
- [x] `DELETE` su una `ReferenceData` senza dipendenti → invariato (204); test di
      non regressione.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

- `files_modified`:
  - `src/lib/repositories/dataRequirement.repository.ts` — costante
    `MAX_REQUIREMENT_DEPTH`, classe `RequirementDepthExceededError`, guardia di
    profondità in `wouldCreateRequirementCycle`; nuovo tipo esportato
    `DataRequirementWithDefinition` per tipizzare correttamente l'`include:
{ definition: true }` già presente in `listIncomingRequirements`.
  - `src/lib/repositories/dataRequirement.repository.test.ts` — test per il
    superamento di `MAX_REQUIREMENT_DEPTH` (catena lineare mockata oltre il
    tetto via `mockImplementation`, verifica `rejects.toThrow(RequirementDepthExceededError)`).
  - `src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/route.ts`
    — `DELETE` chiama `listIncomingRequirements` prima della delete; se ci sono
    dipendenti risponde 409 con `details.dependents` (`id`+`name`); altrimenti
    procede invariato con `deleteReferenceData` + 204.
  - `src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/__tests__/route.test.ts`
    — aggiunto `dataRequirement.findMany` al mock di `@/lib/db`; test 409 che
    verifica il contenuto di `details.dependents`; il test 204 esistente ora
    mocka `findMany` a `[]` (non regressione).
  - `src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/route.ts`
    — fix review round 1: `POST` intercetta `RequirementDepthExceededError`
    prima del fallback generico e risponde 422 (`error.message`), invece di
    lasciarla ricadere nel 500 generico — coerente col 409 esplicito già
    prodotto dal cycle check sullo stesso path.
  - `src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/__tests__/route.test.ts`
    — nuovo test che mocka `dataRequirement.findMany` con una catena oltre
    `MAX_REQUIREMENT_DEPTH` e verifica `response.status === 422` (non 500).

- `interfaces`:
  - `export const MAX_REQUIREMENT_DEPTH = 50`
  - `export class RequirementDepthExceededError extends Error { constructor(maxDepth: number) }`
  - `export type DataRequirementWithDefinition = DataRequirement & { definition: ReferenceData }`
  - `listIncomingRequirements(prisma, requiredDefinitionId): Promise<DataRequirementWithDefinition[]>`
    (firma dei parametri invariata, tipo di ritorno corretto per riflettere
    l'`include` già esistente)

- `decisions`:
  - Guardia di profondità come eccezione dedicata (`RequirementDepthExceededError`)
    invece di restituire `true`/`false`: un limite superato non è un ciclo
    rilevato, è un'anomalia distinta. Round 1 review: la POST `requirements`
    ora la intercetta esplicitamente e risponde 422 (non più 500 generico), per
    coerenza col 409 esplicito già prodotto dal cycle check sullo stesso path
    — 422 scelto (non 409) perché non è un conflitto con dati esistenti ma un
    limite di validazione/dominio sulla richiesta corrente.
  - Guard di cancellazione implementato nella route (non nel repository
    `deleteReferenceData`), riusando `listIncomingRequirements` così com'è:
    stesso pattern già in uso nella POST di `requirements/route.ts` (repository
    compone query semplici, la route orchestra la logica applicativa e il
    codice di stato HTTP).
  - Nessuna modifica a `deleteReferenceData` né allo schema Prisma: `onDelete:
Cascade` resta, il guard è solo un pre-check applicativo best-effort come
    da scope.

## Note / Log

- 2026-07-14 (owner): nato da revisione post-T-016 (che è già `done` su
  `task/016-catalogo-campagna-repo-api`, PR #33). Non riapre T-016: è un
  hardening successivo sullo stesso codice, per questo la base è il branch T-016
  e non `main` (che non ha ancora il metamodel — T-015/016 non mergiati).
- 2026-07-14 (dev): inizio implementazione. Worktree `../core-task-027`, branch
  `task/027-guardie-grafo-requisiti-catalogo` da `task/016-catalogo-campagna-repo-api`.
- 2026-07-14 (dev): implementate guardia di profondità (repository) e guard di
  cancellazione con dipendenti (route DELETE) + test. Verificato con
  `bun run type-check` (pulito), `bun run lint` (pulito), `bun run test:run`
  (768 test, 65 file, tutti verdi). Porto a `in-review`. Verifica: da
  `../core-task-027` (branch `task/027-guardie-grafo-requisiti-catalogo`),
  rilanciare `bun run type-check && bun run lint && bun run test:run`.
- 2026-07-14 (reviewer, round 1/3): findings da correggere. 🟠 unico punto
  bloccante: `RequirementDepthExceededError` nella POST requirements ricade nel
  catch generico → 500, incoerente col cycle check (stesso path, stesso BFS) che
  risponde 409 esplicito — proposta: intercettare l'istanza e mappare a 422
  riusando `error.message`, più un test route che verifica lo status 4xx.
  💡 informativi, nessuna azione richiesta: guard di cancellazione in route (non
  in repository) è coerente col pattern esistente, nessun bypass oggi;
  `MAX_REQUIREMENT_DEPTH` hardcoded va bene così; copy "dipendono da questa" è
  imprecisa per gli archi `blocks` ma non bloccante. Sicurezza multi-tenant e
  autorizzazione: nessun problema. Torna a `dev` per il solo punto 🟠.
- 2026-07-14 (dev): corretto il punto 🟠 round 1 — `POST` di `requirements/route.ts`
  ora intercetta `RequirementDepthExceededError` prima del fallback generico e
  risponde 422 con `error.message`, invece di 500. Aggiunto test HTTP dedicato
  (catena mockata oltre `MAX_REQUIREMENT_DEPTH` → verifica `status === 422`).
  Verificato con `bun run type-check` (pulito), `bun run lint` (pulito),
  `bun run test:run` (769 test, 65 file, tutti verdi). Porto di nuovo a
  `in-review`.
- 2026-07-14 (reviewer, round 2/3): **OK pulito**. Fix verificato sul commit
  `e52c672`: `RequirementDepthExceededError` intercettata prima del fallback
  generico, 422 con messaggio, posizionamento nel catch corretto (dopo `P2002`,
  prima del 500 generico), test route verde. Scelta 422-vs-409 confermata
  corretta (422 = limite di processabilità sulla richiesta corrente, 409 =
  conflitto con archi già in DB, resta per il cycle check). Nessun finding
  residuo, ciclo dev↔reviewer chiuso al round 2/3. Cautele di integrazione
  invariate: base è `task/016-...`, non `main` (metamodel non ancora mergiato);
  nessuna migrazione nuova. Prossimo passo: qa.
- 2026-07-14 (qa): **✅ Verificato, nessun difetto bloccante.** Prove
  indipendenti sul commit `e52c672` (worktree `../core-task-027`):
  - `bun run type-check` → pulito (`tsc --noEmit`, nessun output).
  - `bun run lint` → pulito (`eslint .`, nessun output).
  - `bun run test:run` → **769 test, 65 file, tutti verdi** (conferma il
    numero dichiarato dal dev).
  - Rilancio mirato con `--reporter=verbose` dei 3 file toccati
    (`dataRequirement.repository.test.ts`,
    `reference-data/[referenceDataId]/__tests__/route.test.ts`,
    `reference-data/[referenceDataId]/requirements/__tests__/route.test.ts`)
    → 50 test, tutti verdi, letti uno per uno.
  - Letto `wouldCreateRequirementCycle`: BFS con `Set` di visitati + contatore
    `depth`, throw di `RequirementDepthExceededError` oltre
    `MAX_REQUIREMENT_DEPTH = 50`; test repository con catena lineare mockata
    (`MAX_REQUIREMENT_DEPTH + 20`) verifica
    `rejects.toThrow(RequirementDepthExceededError)` — passa.
  - **Contenuto reale del 422** (non solo status): ho scritto un test ad-hoc
    (poi rimosso, non committato) che invoca la `POST` requirements con la
    stessa catena mockata e stampa il body reale:
    `{"error":"La catena di requisiti supera la profondità massima consentita (50)"}`
    — messaggio deterministico e corretto. Nota non bloccante: né il test
    repository (`rejects.toThrow(RequirementDepthExceededError)`, verifica solo
    `instanceof`, non il testo) né il test route (verifica solo
    `status === 422`) assertano sul testo del messaggio nel body — gap di
    copertura dei test, non un difetto funzionale (verificato a mano che il
    messaggio è corretto).
  - **Contenuto reale del 409 di cancellazione**: letto
    `reference-data/[referenceDataId]/__tests__/route.test.ts:369-403` — il
    test mocka `dataRequirement.findMany` con **due dipendenti misti**
    (`type: "requires"` id 2 "Elfo" + `type: "blocks"` id 3 "Nano") e asserisce
    `json.details.dependents` uguale a `[{id:2,name:"Elfo"},{id:3,name:"Nano"}]`
    — copre esattamente l'edge case richiesto (requires+blocks in entrata
    contemporaneamente), contenuto reale verificato, non solo status. Test 204
    di non regressione (righe 350-367) verificato: `findMany` mockato a `[]`,
    delete procede, 204.
  - **Isolamento multi-tenant**: `listIncomingRequirements` interroga solo per
    `requiredDefinitionId` senza filtro esplicito su `campaignId` — a prima
    vista un rischio, ma verificato che l'invarianza "stessa campagna" è
    garantita a monte: (1) l'unico punto di creazione di `DataRequirement` è la
    `POST` di `requirements/route.ts`, che risolve `requiredDefinition` con
    `getReferenceDataByIdScoped(prisma, requiredDefinitionId, campaignId)` e
    risponde 404 se appartiene ad un'altra campagna (mai crea l'arco); (2)
    `dataTypeId` di una `ReferenceData` non è aggiornabile
    (`updateReferenceDataSchema` non lo include tra i campi editabili, letto
    `src/lib/validations/referenceData.ts`), quindi una voce non può "cambiare
    campagna" dopo la creazione. Di conseguenza ogni `DataRequirement` esistente
    collega sempre voci della stessa campagna, e il guard di cancellazione non
    può far trapelare dipendenti di un'altra campagna. Confermato anche via
    test route esistenti (`does not allow a campaign A head_master to
delete/create/read ... via campaign B's slug`), tutti verdi.
  - **Indice inverso**: confermato presente in
    `prisma/migrations/20260713221144_metamodel_dati_campagna/migration.sql:127`
    (`CREATE INDEX "DataRequirementRequiredDefinitionId" ON
"DataRequirement"("requiredDefinitionId")`), nessun lavoro aggiuntivo
    necessario, coerente con lo scope.
  - **Regressione**: suite completa 769/769 verde (include
    `multi-tenant-isolation.test.ts` e tutti i test T-016 preesistenti).
  - Checkbox dei criteri di accettazione: tutte confermate con prova diretta
    (vedi sopra), spuntate.
  - ⚠️ Non bloccante, per il dev/owner se vogliono rafforzare i test in futuro:
    aggiungere un'asserzione sul testo di `error.message`/`error` nel body 422
    (repository e/o route) invece di limitarsi a `instanceof`/status — oggi il
    comportamento è corretto (verificato a mano) ma non c'è una rete di
    regressione sul contenuto del messaggio stesso.
  - Verdetto: **in-review confermato**, pronto per merge lato owner. Nessun
    difetto deterministico trovato, nessun blocco.
- 2026-07-14 (owner): merge fast-forward di `task/027-guardie-grafo-requisiti-catalogo`
  in `task/016-catalogo-campagna-repo-api` (nessun conflitto, commit `e52c672`).
  Rivalidato post-merge: `bun run type-check` pulito, `bun run lint` pulito,
  `bun run test:run` → 769/769 verdi. Criteri `[x]`, reviewer OK pulito (round
  2/3), qa verificato con prove indipendenti → `status: done`. Nota: questo
  branch resta sotto PR #33, non ancora mergiato su `main` (in attesa
  dell'integrazione T-015/016/025 in Fase 2).
