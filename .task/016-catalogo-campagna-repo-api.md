---
id: "016"
title: "Catalogo di campagna: repository + API (DataType, ReferenceData, requisiti, flag per-kind)"
status: done
priority: P0
assignee: owner
branch: task/016-catalogo-campagna-repo-api
base: main
trello: ""
created: 2026-07-13
updated: 2026-07-14
---

## Obiettivo

Permettere a head_master / master (o super-admin) di creare e gestire le categorie
(`DataType`, con `kind`/cardinalità/presentazione) e le voci di catalogo
(`ReferenceData`, con i flag dichiarativi), incluso il grafo dei requisiti tra voci
(prerequisiti/esclusioni dei talenti). È il layer di scrittura del metamodel di T-015.

## Scope

Incluso:

- Repository (rifacimento di `dataType.repository` / `data.repository` → nuovo
  `referenceData.repository`): CRUD `DataType` con i nuovi campi
  (`kind`, `cardinality`, presentazione, `renderAs`), CRUD `ReferenceData`, CRUD
  `DataRequirement`.
- **Validazione dei `flags` per-`kind`**: schemi **Zod** definiti lato backend, uno per
  `kind` (es. `talent` → `{ cost:int≥0, repeatable:bool, creationOnly:bool }`,
  `race` → `{ startingPx:int≥0 }`). `ReferenceData.flags` è validato contro lo schema Zod
  del `kind` del suo `DataType`. **Niente JSON-Schema autoriale / niente `ajv`** (i `kind`
  sono fissi lato codice → gli schemi sono codice).
- Route API protette: solo head_master della campagna o super-admin per la scrittura;
  scoping multi-tenant via `campaignId`/slug.
- Validazione Zod all'edge; 409 su conflitti; **invarianti**: un `DataRequirement`
  collega solo `ReferenceData` della **stessa campagna**; check base anti-ciclo su
  `requires` (best-effort); `flags` coerenti col `kind`.
- Test repository + API + isolamento multi-tenant.

Escluso:

- Assegnazione ai PG (T-017), servizio/saldo XP (T-025), valutazione visibilità
  condizionale (T-026), UI sidebar (T-020), documenti/upload (T-021).

## Criteri di accettazione

- [x] CRUD `DataType` e `ReferenceData` via API con controllo ruolo; test
      401/403/404/200/409.
- [x] `flags` validati per-`kind` (Zod): `flags` incoerenti col `kind` → 422; test per
      almeno `talent` e `race`.
- [x] CRUD requisiti (requires/blocks); rifiuto se le due voci non sono della stessa
      campagna; test.
- [x] Isolamento multi-tenant verificato (no leak cross-campagna/cross-org); test in
      linea con `src/app/__tests__/multi-tenant-isolation.test.ts`.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/lib/repositories/referenceData.repository.ts
- src/lib/repositories/referenceData.repository.test.ts
- src/lib/repositories/dataRequirement.repository.ts
- src/lib/repositories/dataRequirement.repository.test.ts
- src/lib/repositories/dataType.repository.ts (esteso: kind/cardinality/presentazione, getDataTypeByIdScoped)
- src/lib/repositories/dataType.repository.test.ts
- src/lib/repositories/index.ts (export referenceData.repository, dataRequirement.repository)
- src/lib/repositories/types.ts (CreateReferenceDataInput, UpdateReferenceDataInput, CreateDataRequirementInput, DataType input estesi)
- src/lib/validations/dataType.ts
- src/lib/validations/referenceData.ts
- src/lib/validations/referenceDataFlags.ts (schemi Zod per-kind: talent/race con flag obbligatori, generic/religion/faction/document con oggetto vuoto)
- src/lib/validations/dataRequirement.ts
- src/app/api/campaigns/[campaignSlug]/data-types/route.ts (GET/POST)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/route.ts (GET/PATCH/DELETE)
- src/app/api/campaigns/[campaignSlug]/data-types/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/reference-data/route.ts (GET/POST)
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/route.ts (GET/PATCH/DELETE)
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/route.ts (GET/POST)
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/[requirementId]/route.ts (DELETE)
- src/app/api/campaigns/[campaignSlug]/reference-data/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/[requirementId]/**tests**/route.test.ts (nuovo)
- src/lib/validations/dataType.ts (round 2: `kind` rimosso da `dataTypeEditableFields`/`updateDataTypeSchema`, resta solo in `createDataTypeSchema`)
- src/lib/repositories/types.ts (round 2: `kind` rimosso da `UpdateDataTypeInput`)
- src/lib/repositories/dataType.repository.ts (round 2: `updateDataType` non scrive più `kind`)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/route.ts (round 2: commento immutabilità `kind` su PATCH)
- src/lib/repositories/dataType.repository.test.ts (round 2: aggiornate le asserzioni di `updateDataType` senza `kind`)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/**tests**/route.test.ts (round 2: 3 nuovi test immutabilità `kind` su PATCH)

interfaces:

- "getDataTypeByIdScoped(prisma, id, campaignId, includeReferenceData?) -> DataType | null"
- "getReferenceDataByIdScoped(prisma, id, campaignId) -> ReferenceDataWithDataType | null"
- "parseReferenceDataFlags(kind: DataTypeKind, flags: unknown) -> SafeParseReturnType (Zod, uno schema per kind)"
- "wouldCreateRequirementCycle(prisma, definitionId, requiredDefinitionId) -> boolean (BFS best-effort sui soli archi `requires`)"
- "createDataRequirement / deleteDataRequirement / listOutgoingRequirements / listIncomingRequirements"

decisions:

- "controllo ruolo di scrittura riusa `requireCampaignAdminBySlug` esistente (head_master via Grant, o super-admin via isSuperAdmin) — nessun nuovo helper di authorization introdotto"
- "id di un'altra campagna trattato come 404 (non 403) su tutte le route scoped, per non far trapelare l'esistenza cross-tenant — pattern già in uso su grants"
- "`DataRequirement` non ha update: le route espongono solo create/list/delete (l'arco è atomico — cambiare tipo/target è cancella+ricrea), CRUD interpretato come C-R-D per questo sotto-modello"
- "flags per-kind: cast esplicito `flagsResult.data as Prisma.InputJsonValue` nelle route (POST/PATCH reference-data) — `ZodTypeAny.data` resta tipato `unknown` in questa versione di zod, il cast è verificato dallo schema Zod a runtime"
- "getReferenceDataById/getReferenceDataByIdScoped ritipati a `ReferenceDataWithDataType` (dataType sempre incluso nella query): il tipo dichiarato `ReferenceData` semplice non combaciava con l'`include` reale — bug di tipizzazione preesistente nel lavoro non committato, corretto in questa sessione"
- "round 2: `kind` reso immutabile in update su `DataType`, simmetrico a `dataTypeId` già immutabile su `ReferenceData` — rimosso da `dataTypeEditableFields` (rimane solo in `createDataTypeSchema`) e da `UpdateDataTypeInput`, invece di validarlo-e-scartarlo lato route; body PATCH con `kind` è rifiutato 400 dallo `.strict()` di `updateDataTypeSchema` (stesso comportamento già in uso per `dataTypeId` su reference-data), non ignorato silenziosamente"

## Note / Log

- 2026-07-13 (owner): dipende da T-015 (schema). Riusa il pattern repository-first e
  la validazione all'edge del repo.
- 2026-07-13 (owner): redesign — catalogo = `ReferenceData` (non più righe `Data` con
  `characterId` null); flag validati per-`kind` via Zod.
- 2026-07-14 (dev): ripreso lavoro non committato di una sessione precedente (repository
  ReferenceData/DataRequirement/DataType esteso, validazioni Zod, route API catalogo +
  requisiti). Verificato coerente con Scope/Criteri.
- 2026-07-14 (dev): trovati e corretti 3 errori di tipizzazione in `bun run type-check`
  (return type di `getReferenceDataById(Scoped)` non includeva la relation `dataType`
  effettivamente caricata; `flags` validato via Zod `unknown` non assegnabile a
  `Prisma.InputJsonValue` nelle route POST/PATCH di `reference-data`). Nessun altro
  problema di correttezza rilevato nella review di repository/validazioni/route
  esistenti (scoping campaignId, invariante stessa-campagna sui requisiti, anti-ciclo,
  404 su cross-tenant, 409 su nome duplicato — tutti coerenti con lo Scope).
- 2026-07-14 (dev): scritti i test API mancanti (6 file `__tests__/route.test.ts`, 93
  test) per tutte le route di data-types/reference-data/requirements: 401/403/404/200/
  409/422, isolamento multi-tenant (head_master di campagna A non può leggere/scrivere
  su campagna B), flags→422 per `talent` e `race`, anti-ciclo requisiti, unique
  constraint (P2002)→409 su requisiti duplicati.
- 2026-07-14 (dev): gate verdi — `bun run type-check` (0 errori), `bun run lint` (0
  warning/errori), `bun run test:run` (65 file, 758 test, tutti verdi; da 59/665 prima
  di questa sessione). `bun run format:check` segnala 33 file con problemi di
  formattazione preesistenti sul branch base (confermato via `git stash` + format:check
  su main-equivalente) e non toccati da questo task: non è uno dei tre gate richiesti
  dai criteri di accettazione, documentato qui per trasparenza, non bloccante.
- 2026-07-14 (dev): status → in-review. Tutti i criteri osservati passare in prima
  persona in questa sessione (via `bun run test:run` verde + lettura diretta dei nuovi
  test). Nessun blocco aperto; prossimo passo è la review.
- 2026-07-14 (reviewer): round 1/3, **findings da correggere**. 🟠 bloccante: `kind`
  è mutabile via PATCH `data-types/[dataTypeId]` (`updateDataTypeSchema` lo include,
  `updateDataType` lo scrive), il che rompe l'invariante di Scope "`flags` coerenti
  col `kind`" — un head_master può cambiare `kind` di una categoria che ha già
  `ReferenceData` figlie con `flags` shape-ati per il vecchio `kind`, lasciando stato
  incoerente silente che T-017/T-025 leggeranno con la forma sbagliata. Proposta:
  rendere `kind` immutabile in update (simmetrico a `dataTypeId` già immutabile su
  `ReferenceData`, stessa logica). Resto della review pulito: autorizzazione
  (`requireCampaignAdminBySlug`, 401/404/403 coerenti), scoping multi-tenant (404 su
  cross-tenant ovunque), anti-ciclo BFS multi-hop testato, cast `flags` verificato
  sicuro (Zod `.strict()` a monte), 65 file/758 test coerenti coi criteri. Note non
  bloccanti per l'owner: 🟡 Obiettivo cita "head_master / master (o super-admin)" ma
  l'implementazione gatea solo `head_master` — da confermare se `master` deve poter
  gestire il catalogo, non è un buco di sicurezza; 💡 `visibilityConditionId`
  inesistente su create/update reference-data non gestito → 500 (P2003) invece di
  400/404, solo UX; 💡 nessun check che impedisca `A requires B` e `A blocks B`
  contemporaneamente (invariante "best-effort" per Scope); 💡 `kind`/`cardinality`/
  `renderAs` opzionali in create → POST senza `kind` crea silenziosamente `generic`.
- 2026-07-14 (owner): integrato verdetto reviewer, status → in-progress, criterio
  "flags coerenti col kind" ri-aperto (l'immutabilità di `kind` è parte di
  quell'invarianza). Delego al dev la fix (kind immutabile in update, con test) prima
  del round 2 di review. Le note 🟡/💡 restano per follow-up, non bloccano.
- 2026-07-14 (dev): round 2, fix del finding 🟠 bloccante — `kind` reso immutabile in
  update su `DataType`: rimosso da `dataTypeEditableFields`/`updateDataTypeSchema`
  (`validations/dataType.ts`, resta solo in `createDataTypeSchema`), da
  `UpdateDataTypeInput` (`repositories/types.ts`) e dal payload scritto da
  `updateDataType` (`dataType.repository.ts`); body PATCH con `kind` → 400 via lo
  `.strict()` esistente (stesso comportamento già in uso per `dataTypeId` su
  reference-data, nessun ignore silenzioso). Aggiornate 2 asserzioni in
  `dataType.repository.test.ts` (non si aspettano più `kind: undefined` nel payload di
  update) e aggiunti 3 test in `data-types/[dataTypeId]/__tests__/route.test.ts`: PATCH
  con solo `kind` → 400 + `update` non chiamato; PATCH con `kind` insieme ad altri campi
  validi → 400 + `update` non chiamato; PATCH con
  cardinality/renderAs/icon/sidebarOrder/showInSidebar/name (senza `kind`) → 200,
  verificato che il payload passato al repository non contenga `kind`. Gate verdi:
  `bun run type-check` (0 errori), `bun run lint` (0 warning/errori), `bun run test:run`
  (65 file, 761 test, tutti verdi — 758 + 3 nuovi). Criterio "flags coerenti col kind"
  ri-spuntato dopo aver visto i nuovi test passare. Nessuna altra modifica fuori scope
  (note 🟡/💡 del reviewer non toccate, restano per l'owner). Finding chiuso, status →
  in-review, pronto per il round 2 di review.
- 2026-07-14 (reviewer): round 2/3, **verdetto OK pulito**. Fix verificata nel codice
  (non solo dichiarata): `kind` fuori da `dataTypeEditableFields`/`updateDataTypeSchema`
  → PATCH con `kind` rifiutato 400 via `.strict()` (non ignorato silenziosamente),
  `UpdateDataTypeInput` e `updateDataType` coerenti, `createDataTypeSchema` continua ad
  accettarlo in creazione. I 3 nuovi test coprono lo scenario giusto (kind valido da
  solo → 400; kind + altri campi validi → 400 senza update parziale; altri campi senza
  kind → 200 con payload verificato privo di `kind`). Diff circoscritto (`git show
db0f991 --stat`: 7 file, tutti pertinenti), nessuna regressione su ReferenceData/
  DataRequirement/route già approvate al round 1. Gate ri-eseguiti dal reviewer: 65
  file/761 test verdi, type-check e lint puliti. Note 🟡/💡 del round 1 restano aperte
  come follow-up non bloccanti (non toccate da questa fix). Task chiuso dal punto di
  vista review: pronto per QA/merge.
- 2026-07-14 (owner): integrato verdetto reviewer round 2 (OK pulito). Review chiusa in
  2 round su 3. Prossimo passo: QA, poi merge.
- 2026-07-14 (qa): verifica indipendente, **nessun difetto bloccante trovato**. Letto
  il codice di repository (`referenceData.repository.ts`, `dataRequirement.repository.ts`,
  `dataType.repository.ts`), validazioni (`referenceDataFlags.ts`,
  `referenceData.ts`, `dataRequirement.ts`) e tutte le 8 route API. Baseline
  `bun run test:run`: 65 file/761 test verdi (osservato prima di aggiungere test).
  Scritti 5 nuovi test mirati agli edge case non coperti (osservati passare
  personalmente, poi `bun run test:run` di nuovo verde: 65 file/766 test;
  `bun run type-check` 0 errori; `bun run lint` 0 warning/errori):
  1. `reference-data/__tests__/route.test.ts`: POST con `flags` extra su un `kind`
     a schema vuoto (`generic`) → **422** confermato (schema `.strict()` rifiuta,
     non ignora silenziosamente) + happy-path simmetrico senza flags → 201.
  2. `reference-data/__tests__/route.test.ts` e
     `reference-data/[referenceDataId]/__tests__/route.test.ts`: `visibilityConditionId`
     inesistente su POST e su PATCH → **confermato 500 non gestito** (nessun catch
     `P2003` nella route, a differenza di `grants/route.ts` che lo gestisce
     esplicitamente — verificato con `grep -rn "P2003" src/` prima di scrivere il
     test). Comportamento reale = quello sospettato dal reviewer (nota 💡 non
     bloccante, confermata coi fatti, non fixata come da istruzioni).
  3. `requirements/__tests__/route.test.ts`: `A requires B` e `A blocks B` sulla
     stessa coppia **coesistono** (entrambe le POST → 201) — confermato che
     l'unique constraint su `(definitionId, requiredDefinitionId, type)` non
     impedisce la coesistenza dei due tipi, coerente con la nota 💡 del reviewer
     ("best-effort" per Scope).
     Verificato anche senza scrivere nuovi test (lettura diretta, giudicato già
     sufficientemente coperto): ciclo indiretto multi-hop reale A→B→C→A già testato a
     livello repository (`dataRequirement.repository.test.ts`, "should detect a
     multi-hop cycle"), non solo A→B→A; isolamento multi-tenant e distinzione
     403 (ruolo insufficiente in campagna propria, via `requireCampaignAdminBySlug` →
     campagna risolta ma nessun Grant) vs 404 (id di categoria/voce di un'altra
     campagna, via `getDataTypeByIdScoped`/`getReferenceDataByIdScoped` con
     `campaignId` nel `where`) presenti e coerenti su **ogni** combinazione
     route×metodo (GET/POST su data-types e reference-data, GET/PATCH/DELETE sui
     singoli id, GET/POST sui requisiti, DELETE sul requisito singolo — confermato
     leggendo tutti e 6 i file `__tests__/route.test.ts` e i relativi contatori di
     `it(...)`). Riverificata anche la nota 🟡 del reviewer: `isUserCampaignAdmin`
     in `authorization.ts` chiama `checkCampaignAccess(..., Role.head_master)` con
     `ROLE_RANK[grant.role] >= ROLE_RANK[requiredRole]` — dato che `head_master` è il
     rango più alto (3 > 2 di `master`), solo `head_master` (o super-admin) passa;
     `master` **non** può gestire il catalogo nonostante l'Obiettivo lo citi — confermato
     che non è un buco di sicurezza (permessi negati correttamente), resta una domanda
     di prodotto per l'owner, non un difetto. Nessun bug che violi i criteri di
     accettazione: le 5 checkbox restano `[x]`, osservate passare in prima persona in
     questa sessione (non solo ereditate da dev/reviewer). Verdetto: **pronto per il
     merge**, nessun ulteriore giro dev/review necessario. I 3 punti 💡/🟡 del
     reviewer restano follow-up non bloccanti, ora confermati con evidenza diretta
     invece che solo sospettati.
- 2026-07-14 (owner): status → done (2 round di review + QA, tutti puliti; nota:
  per §6 del README il `done` spetta formalmente a dopo il merge — deviazione
  esplicita su istruzione diretta dell'utente, che ha chiesto di marcare done e
  aprire la PR in questo momento). Push del branch e apertura PR verso `main` in
  corso. Follow-up non bloccanti aperti per futuri task/owner: ruolo `master` non
  gatea il catalogo nonostante l'Obiettivo lo citi (da confermare se voluto);
  `visibilityConditionId` inesistente → 500 non gestito (P2003) su reference-data;
  `A requires B` + `A blocks B` possono coesistere; `kind` opzionale in create.
- 2026-07-14 (owner): push del branch + PR #33 aperta verso
  `task/015-schema-metamodel-dati-campagna` (non verso `main`): decisione esplicita
  utente per evitare un diff duplicato/fuorviante finché PR #32 (T-015) resta aperta
  — vedi `.task/README.md` §12 (gating dev su PR aperte, niente stacked PR di
  default salvo decisione esplicita). Da ripuntare `--base main` dopo il merge di
  #32.
