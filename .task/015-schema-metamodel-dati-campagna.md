---
id: "015"
title: "Schema metamodel dati campagna (DataType/ReferenceData/CharacterData/requisiti/XP)"
status: done
priority: P0
assignee: dev
branch: task/015-schema-metamodel-dati-campagna
base: main
trello: ""
created: 2026-07-13
updated: 2026-07-14
---

## Obiettivo

Estendere lo schema Prisma per supportare la tassonomia generica di campagna
(categorie + catalogo definito a runtime dal GM), le assegnazioni ai PG con override
del master, il grafo prerequisiti tra voci di catalogo, il ledger XP e l'aggancio
azione→evento. È la **foundation** di tutta la Fase 2: ogni altro task dipende da
questa migrazione. Nasce dal design validato in chat con l'utente: **split
definizione/istanza** (`ReferenceData` = catalogo, `CharacterData` = assegnazione),
`kind` predeterminati lato backend, flag dichiarativi in `Json` validati per-`kind`
via Zod, e **XP su ledger separato** (non dentro i dati del PG).

## Scope

Incluso:

- **`DataType`** (categoria per-campagna, si estende): `+ kind DataTypeKind @default(generic)`
  (discriminante semantico predeterminato lato backend — l'engine trova "il tipo razza",
  "il tipo talento" senza match sul `name`), `+ description String?`,
  `+ cardinality DataCardinality @default(multi)` (single = una razza / multi = più
  religioni — regola **della categoria per campagna**, è qui che vive il req cardinalità),
  `+ playerAssignable Boolean @default(false)`, metadata di presentazione
  `+ showInSidebar Boolean @default(false)`, `+ sidebarOrder Int?`, `+ icon String?`,
  `+ renderAs DataTypeRender @default(catalog)` (catalog | documents).
- **`ReferenceData`** (NUOVO — voce di catalogo / definizione, campaign-scoped via
  `dataTypeId`): `id`, `dataTypeId`, `name`, `description String?`,
  `flags Json?` (flag dichiarativi della definizione: `cost`, `repeatable`,
  `creationOnly`, `startingPx` per le razze, … — validati per-`kind` via Zod, vedi
  T-016), `visibility DataVisibility @default(hidden)`, `visibilityConditionId Int?`
  (talento nascosto/condizionato — vedi T-026), `fileUrl String?` (URL documento per i
  `DataType` `renderAs = documents`; usato da T-021/UploadThing), `externalId String?`
  (import legacy, T-024). Relazioni: `dataType`, `visibilityCondition`,
  `instances CharacterData[]`, requisiti come sorgente/target.
- **`CharacterData`** (NUOVO — istanza / assegnazione a un PG o utente): `id`,
  `characterId Int?`, `userId String?` (owner polimorfo: PG **o** utente, come faceva
  `Data`), `referenceDataId Int` (**FK vera** verso la definizione), `dataTypeId Int`
  (denormalizzato = `referenceData.dataTypeId`, per le query di cardinalità),
  `value Json?` (specifiche scelte dell'istanza: opzione selezionata, maestro, rank…),
  `visibility DataVisibility @default(hidden)`, `visibilityConditionId Int?`,
  `grantedById String?`, `grantedByOverride Boolean @default(false)`, `actionId Int?`
  (transazione/azione che l'ha generata), `externalId String?`, `createdAt DateTime @default(now())`.
- **`DataRequirement`** (NUOVO — grafo requisiti tra **definizioni**): `definitionId` →
  `ReferenceData`, `requiredDefinitionId` → `ReferenceData`, `type RequirementType`,
  `@@unique([definitionId, requiredDefinitionId, type])`. (I requisiti "livello/PX" non
  passano da qui: sono soglie numeriche in `flags`, valutate a runtime — vedi T-017.)
- **`XpTransaction`** (NUOVO — ledger XP, fonte di verità del saldo; il saldo è una
  proiezione = somma, **non** un campo salvato): `id`, `characterId Int`,
  `amount Int` (con segno: + grant, − acquisto, + recupero), `reason XpReason`,
  `referenceDataId Int?` (talento coinvolto, se c'è), `actionId Int?`,
  `createdAt DateTime @default(now())`. Relazione a `Character`.
- **`Action`**: `+ eventId Int?` (relazione opzionale a `Event`), `creationDate` con
  `@default(now())`.
- **Ritiro del modello `Data` piatto**: `Data` viene sostituito da
  `ReferenceData` + `CharacterData`. Aggiornare le relazioni `User.Data` /
  `Character.data`, la relazione `VisibilityCondition ↔ Data` (ora verso `ReferenceData`
  e `CharacterData`), e i repository/test esistenti `data.repository.*` (vanno rifatti in
  T-016/T-017). Nessun dato vivo da migrare (feature non ancora costruita) → migrazione
  additiva salvo il drop del modello vuoto.
- **Enum nuovi**: `DataTypeKind { generic race talent religion faction document }`,
  `DataCardinality { single multi }`, `RequirementType { requires blocks }`,
  `DataTypeRender { catalog documents }`, `XpReason { initialGrant purchase refund deathRecovery adjustment }`.
- Migrazione Prisma, `prisma generate`, aggiornamento di `repositories/types.ts` e delle
  firme dove i tipi cambiano.

Escluso:

- Logica (enforcement cardinalità, valutazione requisiti, override, addebito/saldo XP,
  valutazione visibilità condizionale) → T-016/T-017/T-025/T-026.
- API/UI, upload/storage documenti, seed.

## Criteri di accettazione

- [x] `bunx prisma migrate dev --name metamodel_dati_campagna` produce la migrazione;
      `bunx prisma validate` OK.
- [x] `DataType.kind` + gli altri campi/relazioni/enum presenti; `ReferenceData`,
      `CharacterData`, `DataRequirement`, `XpTransaction` creati; `bunx prisma generate`
      aggiorna i tipi.
- [x] `CharacterData.referenceData` (FK) e `CharacterData.dataType`, `ReferenceData`↔
      `DataRequirement` (sorgente/target), `XpTransaction`↔`Character`, `Action`↔`Event`
      opzionale compilano.
- [x] Il modello `Data` è rimosso e nessun riferimento residuo rompe il build;
      `VisibilityCondition` collega `ReferenceData`/`CharacterData`.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi (repo `data`/
      `dataType` adeguati o messi a stub in attesa di T-016).

## Artifacts

files_modified:

- prisma/schema.prisma
- prisma/migrations/20260713221144_metamodel_dati_campagna/migration.sql (nuova)
- src/lib/repositories/dataType.repository.ts
- src/lib/repositories/dataType.repository.test.ts
- src/lib/repositories/data.repository.ts (rimosso)
- src/lib/repositories/data.repository.test.ts (rimosso)
- src/lib/repositories/index.ts
- src/lib/repositories/types.ts
- src/lib/repositories/README.md
- src/test/helpers/prisma-fixtures.ts
- src/app/**tests**/multi-tenant-isolation.test.ts

interfaces:

- "getDataTypeById(prisma, id, includeReferenceData = false)" — rinominato il 3° parametro
  (era `includeData`) e l'`include` da `campaignData` a `referenceData` (relazione rinominata
  su `DataType` dopo lo split `ReferenceData`/`CharacterData`).
- "listDataTypes(prisma, campaignId, includeCount)" — `_count.select` ora su `referenceData`
  invece di `campaignData`.
- Nuovi model Prisma: `ReferenceData`, `CharacterData`, `DataRequirement`, `XpTransaction`;
  `DataType` esteso con `kind/description/cardinality/playerAssignable/showInSidebar/
sidebarOrder/icon/renderAs`; `Action` esteso con `eventId` (relazione opzionale a `Event`,
  cascata assenti: onDelete default) e `creationDate @default(now())`.
- Nuove fixture: `mockReferenceData`, `mockCharacterData`, `mockXpTransaction` (+
  `createMockReferenceData`/`createMockCharacterData`) in `src/test/helpers/prisma-fixtures.ts`;
  `mockDataType` estesa con i nuovi campi (default: `kind=generic`, `cardinality=multi`,
  `renderAs=catalog`); `mockData`/`createMockData` rimosse.

decisions:

- Modello `Data` rimosso e `data.repository.ts`/`data.repository.test.ts` eliminati (non
  stubbati con logica finta): l'unico consumer era il repository stesso + i test; non c'è
  nessun call site applicativo. Costruire un repository "stub" su `CharacterData` avrebbe
  anticipato scelte di design che spettano a T-016 (catalogo `ReferenceData`) e T-017
  (servizio assegnazione `CharacterData`), quindi ho preferito rimuovere invece di
  inventare un'API provvisoria da riscrivere subito dopo. Segnalato in `index.ts` con un
  commento che punta a T-016/T-017.
- `dataType.repository.ts` aggiornato solo per compilare contro le relazioni rinominate
  (`campaignData` → `referenceData`); non ho aggiunto CRUD per i nuovi campi di `DataType`
  (kind, cardinality, sidebar, ecc.) né per `ReferenceData`/`CharacterData`: è scope di
  T-016/T-017, non di questo task (schema-only).
- `CharacterData` ha **due FK verso `DataType`** in pratica una sola relazione diretta
  (`dataTypeId`, denormalizzata da `referenceData.dataTypeId`) più quella indiretta via
  `referenceDataId → ReferenceData → dataTypeId`; entrambe con `onDelete: Cascade`. Nessun
  problema di cicli in PostgreSQL (a differenza di SQL Server) — verificato con la
  migrazione applicata con successo.
- Relazione `User → CharacterData.grantedById` nominata esplicitamente
  (`@relation("CharacterDataGrantedBy")`) perché `User` ha già una relazione verso
  `CharacterData` come owner (`userId`); serviva disambiguare le due FK.
- `multi-tenant-isolation.test.ts` portato da `prismaMock.data`/`mockData` a
  `prismaMock.characterData`/`mockCharacterData` 1:1 (stessa semantica dei test, solo il
  model sottostante è cambiato) — nessuna logica di test persa.

## Note / Log

- 2026-07-13 (owner): foundation Fase 2. Decisioni dal design: cardinalità
  per-campagna, requisiti **soft** con override master, `functionName` = registry
  dev (niente codice utente → modello `Function` resta commentato).
- 2026-07-13 (owner): **redesign dopo confronto con l'utente**. Abbandonato l'EAV
  unico (`Data` + `sourceDataId`): si passa allo **split** `ReferenceData` (catalogo) /
  `CharacterData` (istanza) con FK reale definizione→istanza; `kind` predeterminato lato
  backend come discriminante; flag dichiarativi in `Json` validati per-`kind` via **Zod**
  (niente JSON-Schema autoriale / niente `ajv`); **XP spostato su ledger separato**
  (`XpTransaction`). Cardinalità resta su `DataType`. Aggiunti T-025 (servizio XP) e
  T-026 (visibilità condizionale).
- 2026-07-14 (dev): inizio implementazione su branch `task/015-schema-metamodel-dati-campagna` da `origin/integration/fase-2-backend`.
- 2026-07-14 (dev): migrazione `metamodel_dati_campagna` applicata (Neon dev DB), `prisma generate` OK; rimosso `data.repository.*`, adattato `dataType.repository.*`/fixture/test multi-tenant. `bun run type-check`, `bun run lint`, `bun run test:run` (637 test, 57 file) tutti verdi. Branch pronto per review — passo a `in-review`.
- 2026-07-14 (reviewer): verdetto **OK** (round 1/3), nessun finding bloccante. Ri-verificati validate/type-check/lint/test:run (637/637 verdi). Note advisory non bloccanti per T-016/T-017: invariante `CharacterData.dataTypeId === referenceData.dataTypeId` non enforced a livello DB (da garantire nel service T-017, idealmente stessa transazione); assenza di CHECK sull'owner polimorfo (characterId XOR userId); indice composito `(characterId, dataTypeId)` utile quando arriva T-017; cancellazione di una `ReferenceData` fa hard-delete a cascata delle `CharacterData` collegate — da confermare col prodotto in T-016.
- 2026-07-14 (owner): review integrata, verdetto OK. Apro PR verso `integration/fase-2-backend` invece del merge locale (richiesta esplicita dell'utente per questo giro di sviluppo). Lo stato resta `in-review`/PR aperta: passerà a `done` dopo il merge effettivo su GitHub.
- 2026-07-14 (owner): PR #32 (base auto-retargettata su `main`) review completata, thread di commento risolto. Segno `done` **prima** del merge su richiesta esplicita dell'utente, per evitare che il task risulti `in-review` su `main` a merge avvenuto.
- 2026-07-14 (owner): `integration/fase-2-backend` risultava già mergiato in `main` e cancellato su GitHub (PR #31). Aggiornato `base:` di tutti i task 015-026 (+ README §12) a `main`, su indicazione dell'utente. La PR di questo task punta quindi a `main`.
