---
id: "050"
title: "Sostituire VisibilityCondition con requirement types (visibleWith/grants)"
status: in-review
priority: P1
assignee: dev
branch: task/050-sostituire-visibility-condition-con-requirement-types
base: main
trello: ""
created: 2026-09-18
updated: 2026-09-18
---

## Obiettivo

Eliminare il sistema `VisibilityCondition` (tabella + registry hardcoded di
predicati, mai configurabile da UI) e sostituirlo con due nuovi tipi di arco
nella tabella `DataRequirement` già esistente: `visibleWith` (visibilità
condizionata al possesso di una voce bersaglio) e `grants` (assegnazione
automatica gratuita a cascata). Piano di dettaglio approvato:
`/Users/albertofardin/.claude/plans/playful-petting-eagle.md`.

## Scope

Incluso: schema Prisma, migrazione, repository requisiti (anti-ciclo
generalizzato), valutazione visibilità (`src/lib/visibility/*`), cascata
`grants` in `characterData.service.ts`, validazione Zod + route API
requisiti, editor frontend unificato su 4 tipi, rimozione file del vecchio
sistema, aggiornamento seed, test.

Escluso: qualunque decisione di design non già presa nel piano (vedi sezione
"Decisioni prese con l'utente" nel piano).

## Criteri di accettazione

- [x] Migrazione Prisma applicata (`VisibilityCondition` rimosso, enum
      `RequirementType` esteso con `visibleWith`/`grants`)
- [x] `wouldCreateRequirementCycle` generalizzata con parametro `type`
- [x] Visibilità catalogo talenti valutata via archi `visibleWith` (no
      registry)
- [x] `assignReferenceDataToCharacter` applica cascata `grants` ricorsiva,
      gratuita, con anti-ciclo runtime (skip + log, mai crash)
- [x] Editor requisiti frontend offre 4 tipi con target selector coerente
- [x] `bun run type-check` pulito
- [x] `bun run lint` pulito
- [x] `bun run test:run` verde

## Artifacts

files_modified:

- prisma/schema.prisma
- prisma/seed.ts
- src/lib/repositories/dataRequirement.repository.ts
- src/lib/repositories/dataRequirement.repository.test.ts
- src/lib/repositories/referenceData.repository.ts
- src/lib/repositories/characterData.repository.ts
- src/lib/repositories/types.ts
- src/lib/visibility/types.ts
- src/lib/visibility/filterVisible.ts
- src/lib/visibility/filterVisible.test.ts
- src/lib/visibility/index.ts
- src/lib/services/characterData.service.ts
- src/lib/services/characterTalents.service.ts
- src/lib/validations/dataRequirement.ts
- src/lib/validations/referenceData.ts
- src/lib/labels/referenceData.ts
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/route.ts
- src/components/DataManager/RequirementTargetSelect.tsx
- src/components/DataManager/RequirementsSection.tsx
- src/components/DataManager/DraftRequirementsEditor.tsx
- src/components/DataManager/useEntryForm.ts
- src/components/DataManager/types.ts
- src/components/DataManager/ModalEditDataCatalog.tsx
- src/components/DataManager/ModalEditDataTalent.tsx
- src/components/DataManager/ManagerData.tsx
- src/components/DataManager/ManagerDataTalents.tsx
- src/components/TalentList/TalentList.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/characters/new/page.tsx
- src/test/helpers/prisma-fixtures.ts
- prisma/migrations/20260918142103_replace_visibility_condition_with_requirement_types/migration.sql
- (rimossi) src/lib/visibility/registry.ts, predicates.ts, registry.test.ts, predicates.test.ts
- (rimossi) src/lib/repositories/visibilityCondition.repository.ts (+ .test.ts)
- (rimossa) src/app/api/campaigns/[campaignSlug]/visibility-conditions/ (route + test)
- - ~25 file di test aggiornati per rimuovere riferimenti residui a visibilityConditionId/visibilityCondition (vedi `git diff --stat` sul branch)

interfaces:

- "wouldCreateRequirementCycle(prisma, definitionId, requiredDefinitionId, type: RequirementType) -> Promise<boolean>" (nuovo 4° parametro obbligatorio, generalizzato da requires-only)
- "isEntryVisible<T>(viewer, entry: {id, visibility}, context: VisibilityContext & {visibilityConditions?: Map<number, VisibilityConditionEdge[]>}) -> boolean" (VisibilityGated non porta più visibilityConditionId, richiede id)
- "assignReferenceDataToCharacter(prisma, character, definition, options: AssignReferenceDataOptions & {isGranted?: boolean}, _grantChain: Set<number> = new Set()) -> Promise<AssignReferenceDataResult>" (5° parametro interno per anti-ciclo runtime della cascata grants)

decisions:

- "ManagerData.tsx non risolve più visibleWith (solo characterTalents.service.ts lo fa, come da piano): il catalogo generico 'Talenti' fuori dal flusso apprendimento talenti ora nasconde sempre le voci hidden condizionate, anche se il piano non lo segnala esplicitamente come regressione — comportamento più restrittivo, mai un leak"
- "Filtrato esplicitamente a requires/blocks anche in ManagerData.tsx (talentRequirements/CSV) e characters/new/page.tsx (requirementGraph anteprima creazione), non solo in characterTalents.service.ts: stesso motivo dato dal piano per TalentList, scoperto durante il type-check (TalentRequirementEdge/RequirementEdgeRef/CatalogRequirementEdge restano a 2 soli tipi)"
- "talentRequirementEdgeSchema (validations/characterTalents.ts) non riusa più requirementTypeEnum (ora 4 valori): ristretto esplicitamente a z.enum(['requires','blocks']), la risposta di GET .../talents non emette mai visibleWith/grants"
- "Corretto un bug pre-esistente e indipendente in prisma/seed.ts (demoCharacterXpBalance.balance -> .available, XpBalance non ha mai avuto un campo .balance) perché bloccava la verifica 'bunx prisma db seed' richiesta da questo task"
- "3 test ormai impossibili da soddisfare rimossi invece di riscritti a vuoto: 2 test P2003-su-visibilityConditionId (route reference-data POST/PATCH, il campo non esiste più quindi lo schema Zod .strict() rifiuta a 400 prima di arrivare al DB) e 1 test 'resolves conditional visibility via ownedData' in characters/[id] page (characterEditor.service.ts non risolve più condizioni, la voce hidden non può più tornare visibile lì)"

## Note / Log

- 2026-09-18 (dev): inizio implementazione su branch task/050-sostituire-visibility-condition-con-requirement-types, piano approvato in playful-petting-eagle.md.
- 2026-09-18 (dev): migrazione Prisma applicata (replace_visibility_condition_with_requirement_types) e client rigenerato su DB dev Neon.
- 2026-09-18 (dev): implementate tutte le sezioni del piano (repository anti-ciclo, visibilità visibleWith, cascata grants, validazioni/route, editor frontend a 4 tipi, seed con esempio visibleWith OR-group + grants). Corretto un bug pre-esistente non correlato in seed.ts (.balance -> .available) che bloccava `bunx prisma db seed`. Bloccatore residuo pre-esistente e non correlato: il seed "Nuova Frontiera" fallisce su `UnknownFeatureFunctionError` per la funzione feature "talents" (registry downtime, nulla a che vedere con VisibilityCondition) — segnalato all'owner, non toccato.
- 2026-09-18 (dev): `bun run type-check`, `bun run lint`, `bun run test:run` (2034 test) verdi su tutto il repo. Portato a `in-review`.
