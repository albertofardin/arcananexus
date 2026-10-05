---
id: "019"
title: "Registry funzioni feature + catalogo FeatureType + config Feature per campagna"
status: done
priority: P1
assignee: qa
branch: task/019-registry-feature-config-campagna
base: task/018-api-creazione-pg
trello: ""
created: 2026-07-13
updated: 2026-07-16
---

## Obiettivo

Definire quali azioni intra/inter-evento (downtime, missive, …) sono disponibili
per una campagna e a quale funzione server-side mappano, tramite un **registry dev
sicuro** (`functionName` → handler tipizzato; nessun codice scritto dall'utente).

## Scope

Incluso:

- Registry in `src/lib/features/` che mappa `functionName` → handler tipizzato con
  input predefinito `{ character, feature, actionData, campaign }` e output
  = mutazioni + log su `Action`. Almeno un handler d'esempio (es. downtime
  "apprendi talento" che invoca il servizio T-017 — quindi crea `CharacterData` +
  `XpTransaction` di addebito — dietro un'`Action` `waitingApproval` che li rende
  effettivi solo all'approvazione). Secondo handler d'esempio: **recupero XP alla morte**,
  che legge la config di campagna (`Feature.featureData`: percentuale/formula) + il saldo
  del PG defunto e chiama `recordDeathRecovery` del ledger (T-025).
- `FeatureType` catalog seedable: `featureName`, `functionName`, `actionSchema` /
  `featureSchema` (Zod → JSON) validati all'edge.
- API per configurare le `Feature` disponibili per campagna (head_master): quale
  `FeatureType`, `featureData`; scoping multi-tenant; controllo ruolo.
- Test registry + API.

Escluso:

- UI di esecuzione azioni; runner completo del downtime (qui solo scaffold +
  handler d'esempio + logging).

## Criteri di accettazione

- [x] Registry tipizzato con lookup per `functionName`; `functionName` sconosciuto →
      errore gestito (no crash); test.
- [x] head_master configura le `Feature` per campagna via API; test ruolo + tenant.
- [x] `actionData` validato contro l'`actionSchema` del `FeatureType`; test.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/lib/features/types.ts (nuovo)
- src/lib/features/registry.ts (nuovo)
- src/lib/features/index.ts (nuovo — entry point: import side-effect degli handler + re-export)
- src/lib/features/registry.test.ts (nuovo)
- src/lib/features/handlers/learnTalent.ts (nuovo)
- src/lib/features/handlers/learnTalent.test.ts (nuovo)
- src/lib/features/handlers/deathXpRecovery.ts (nuovo)
- src/lib/features/handlers/deathXpRecovery.test.ts (nuovo)
- src/lib/repositories/action.repository.ts (nuovo)
- src/lib/repositories/action.repository.test.ts (nuovo)
- src/lib/repositories/featureType.repository.ts (nuovo)
- src/lib/repositories/featureType.repository.test.ts (nuovo)
- src/lib/repositories/feature.repository.ts (nuovo)
- src/lib/repositories/feature.repository.test.ts (nuovo)
- src/lib/repositories/character.repository.ts (+ getCharacterInCampaign)
- src/lib/repositories/character.repository.test.ts (+ test getCharacterInCampaign)
- src/lib/repositories/index.ts (+ export action/featureType/feature repository)
- src/lib/validations/feature.ts (nuovo — createFeatureSchema/updateFeatureSchema)
- src/app/api/campaigns/[campaignSlug]/features/route.ts (nuovo — GET/POST)
- src/app/api/campaigns/[campaignSlug]/features/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/features/[featureId]/route.ts (nuovo — GET/PATCH/DELETE)
- src/app/api/campaigns/[campaignSlug]/features/[featureId]/**tests**/route.test.ts (nuovo)
- prisma/seed.ts (+ sezione "Feature types catalog": seeda un `FeatureType` per ogni handler registrato)
- src/test/helpers/prisma-fixtures.ts (+ mockFeatureType, mockFeature)

interfaces:

- "registerFeatureHandler<TActionData>(definition: FeatureHandlerDefinition<TActionData>) -> void"
- "getFeatureHandler(functionName: string) -> FeatureHandlerDefinition<unknown> — throws UnknownFeatureFunctionError se sconosciuto"
- "listRegisteredFeatureHandlers() -> FeatureHandlerDefinition<unknown>[]"
- "executeFeatureAction(prisma: PrismaClient, input: ExecuteFeatureActionInput) -> Promise<FeatureHandlerResult> — valida actionData contro actionSchema (ActionDataValidationError se non conforme), poi invoca l'handler risolto"
- "learnTalentFeatureHandler: functionName='downtimeLearnTalent' — crea Action(waitingApproval) + CharacterData + XpTransaction via assignReferenceDataToCharacter(actionId), rifiuta con ReferenceDataNotFoundError/NotATalentError"
- "deathXpRecoveryFeatureHandler: functionName='deathXpRecovery' — legge Feature.featureData.recoveryPercentage, calcola amount = floor(available \* pct/100) sul PG defunto, crea Action(done) + (se amount>0) XpTransaction via recordDeathRecovery; rifiuta con DeceasedCharacterNotFoundError/CharacterNotDeceasedError"
- "getCharacterInCampaign(prisma, characterId, campaignId) -> Character | null — scoping diretto per campaignId (senza slug)"
- "createAction(prisma: XpTransactionClient, data: CreateActionInput) -> Promise<Action>"
- "listFeatureTypes/getFeatureTypeById/getFeatureTypeByFunctionName/createFeatureType(prisma, ...) — catalogo FeatureType, platform-wide (nessun campaignId)"
- "listFeaturesForCampaign/getFeatureByIdScoped/createFeature/updateFeature/deleteFeature(prisma, ...) — Feature scopate a campagna"
- "GET/POST /api/campaigns/[campaignSlug]/features — head_master/super-admin; POST valida featureData contro il featureSchema reale (via getFeatureHandler(featureType.functionName)), non contro il JSON in FeatureType.featureSchema"
- "GET/PATCH/DELETE /api/campaigns/[campaignSlug]/features/[featureId] — stesso scoping/gate; PATCH riconvalida featureData, featureTypeId immutabile"

decisions:

- "actionSchema/featureSchema sono Zod in codice (un handler = una definizione), non JSON-Schema autoriale: stesso principio di referenceDataFlags.ts (T-016). Le colonne Json FeatureType.actionSchema/featureSchema restano uno snapshot d'introspezione (z.toJSONSchema, Zod 4 nativo) generato dal seed, mai l'origine di verità della validazione — sia l'API di config (featureData) sia executeFeatureAction (actionData) validano contro lo Zod dell'handler risolto via functionName."
- "Nessun vincolo UNIQUE a DB su FeatureType.functionName (schema T-015 invariato): l'unicità è responsabilità applicativa del seed (getFeatureTypeByFunctionName idempotente), stesso trattamento di ReferenceData.name/DataType.name."
- "learnTalent: self-assign puro (isMaster sempre false) — 'apprendi talento' è un'azione downtime del giocatore, non una concessione master; passa quindi per tutti i gate di characterData.service (playerAssignable, creationOnly, requisiti, budget XP)."
- "deathXpRecovery: nessuna approvazione — l'Action viene loggata done+completionDate immediata (a differenza di learnTalent/waitingApproval) perché la morte è già un fatto registrato (Character.deathDate), non un'azione da rivedere. Se l'importo calcolato è 0 l'Action resta comunque loggata, senza XpTransaction (recordDeathRecovery rifiuta importi non positivi)."
- "featureData di deathXpRecovery implementa solo la variante 'percentuale' (recoveryPercentage 0-100) menzionata nello scope, non 'formula': una formula libera richiederebbe un mini-DSL valutato server-side, fuori scope per uno scaffold — se serve, è un task successivo esplicito."
- "getCharacterInCampaign (nuova query su character.repository) scopa per campaignId diretto, a differenza di getCharacterByIdScoped che richiede orgSlug+campaignSlug: gli handler del registry ricevono già la campagna risolta come {id}, non gli slug."
- "Route di configurazione Feature (POST/PATCH) riusano requireCampaignAdminBySlug (head_master o super-admin), stesso helper delle altre route di gestione catalogo T-016 — nessun endpoint pubblico per FeatureType (catalogo dev-seeded, non gestito via API in questo task)."

## Note / Log

- 2026-07-13 (owner): dipende da T-015. `functionName` = registry hardcoded lato dev
  (decisione dal design). Il modello `Function` (codice utente) resta fuori dalla
  Fase 2 per motivi di sicurezza.
- 2026-07-13 (owner): redesign — l'handler d'esempio ora materializza `CharacterData` +
  `XpTransaction` (via T-017/T-025), non righe `Data`. Il registry **feature/azioni** è
  distinto dal registry **visibilità** (`VisibilityCondition.functionName`, T-026).
- 2026-07-14 (owner): T-015/016/017/025 sono `done` ma le rispettive PR (#32, #33, #36,
  #34) non sono ancora mergiate in `main` — deroga esplicita al gating §12: sblocco
  T-019 stackando su `task/018-api-creazione-pg` (contiene già 015+016+017+025 merged,
  verificato con `merge-base --is-ancestor`), invece di attendere il merge in `main`.
  Worktree dedicato in `../core-task-019`. PR di T-019 andrà aperta con base
  `task/018-api-creazione-pg` (a cascata, come #36/#38/#34), da riallineare a `main`
  quando la catena 015→018 verrà integrata.
- 2026-07-14 (dev): inizio implementazione in worktree `../core-task-019`.
- 2026-07-14 (dev): implementati registry (`src/lib/features/`), 2 handler d'esempio
  (`downtimeLearnTalent`, `deathXpRecovery`), repository `action`/`featureType`/`feature`
  (+ `getCharacterInCampaign`), API `GET/POST /api/campaigns/[campaignSlug]/features` +
  `GET/PATCH/DELETE .../[featureId]`, seed catalogo FeatureType da registry. `bun run
type-check`, `bun run lint`, `bun run test:run` tutti verdi (922 test, inclusi seed.ts
  verificato con un tsconfig temporaneo che include `prisma/**/*.ts`, non coperto dallo
  script `type-check` di default). Porto a `in-review` per reviewer/qa. Branch:
  `task/019-registry-feature-config-campagna` (verifica: `git log
task/018-api-creazione-pg..task/019-registry-feature-config-campagna`).
- 2026-07-14 (owner): rieseguiti type-check/lint/test:run indipendentemente dopo
  che il dev è stato interrotto a fine lavoro (kill esterno durante una
  riverifica ridondante, lavoro già committato e loggato) — confermati verdi
  (922/922 test). Passo a reviewer.
- 2026-07-14 (reviewer, round 1/3): **OK pulito, nessun finding bloccante** —
  pronto per QA. Verificato: registry con `Map` (non object literal, evita
  strutturalmente il buco di prototype-pollution trovato in T-026 round 1);
  `executeFeatureAction` valida `actionData` contro l'`actionSchema` prima di
  invocare l'handler; scoping multi-tenant corretto su tutte le route
  (`findUnique({ id, campaignId })`, 404 su cross-tenant); gate ruolo via
  `requireCampaignAdminBySlug`; `featureData` validato contro il vero Zod
  schema dell'handler (non lo snapshot JSON), confermato nel codice;
  `learnTalent` atomico in un'unica `$transaction`, propaga correttamente gli
  errori del servizio T-017; `deathXpRecovery` gestisce `deathDate` null,
  `recoveryPercentage` fuori range (respinto al config-time dal featureSchema),
  importi non positivi. Suggerimenti opzionali non bloccanti: `.parse()` vs
  `safeParse` nella rivalidazione difensiva di `deathXpRecovery`; nessun guard
  esplicito su auto-recupero (deceased === successor, innocuo finché non
  wired); nessun UNIQUE DB su `FeatureType.functionName` (rischio residuo
  accettato, unicità applicativa via seed); manca un test esplicito
  `getFeatureHandler("toString"|"constructor")` per ancorare la resistenza al
  prototype-pollution (strutturalmente già garantita da `Map`). Nessuna
  migrazione introdotta in questo task.
- 2026-07-14 (qa): **verifica indipendente, tutti i 4 criteri passano.**
  Letto tutto il codice prodotto (registry, entrambi gli handler, repository
  action/featureType/feature, route GET/POST/[featureId] GET/PATCH/DELETE,
  seed). Eseguito `bun run type-check` (pulito), `bun run lint` (pulito),
  `bun run test:run` = 922/922 verdi prima delle mie aggiunte, confermando il
  Log del dev/owner. Ho poi colmato personalmente il gap non bloccante
  segnalato dal reviewer (test mancante su prototype-pollution) e ho
  esercitato in prima persona 3 scenari end-to-end coi handler reali
  (non mockati/finti):
  - `getFeatureHandler("toString"|"constructor"|"hasOwnProperty"|"__proto__")`
    → sempre `UnknownFeatureFunctionError`, mai un valore ereditato da
    `Object.prototype` (`Map` risolve strutturalmente il buco di T-026,
    confermato con test, non solo per lettura del codice) — aggiunto a
    `src/lib/features/registry.test.ts`.
  - Nuovo `src/lib/features/executeFeatureAction.e2e.test.ts`: usa il
    registry _reale_ (import side-effect di `learnTalent`/`deathXpRecovery`,
    non azzerato) per verificare (a) `downtimeLearnTalent` con
    `actionData: {}` (manca `referenceDataId`) → `ActionDataValidationError`
    _prima_ di toccare il DB (`referenceData.findUnique`/`action.create`/
    `characterData.create`/`xpTransaction.create` mai chiamati); (b)
    `deathXpRecovery` su un PG con `deathDate: null` →
    `CharacterNotDeceasedError` gestito, nessun `action.create`/
    `xpTransaction.create`; (c) le 4 chiavi prototype-collision anche
    attraverso l'entry point pubblico `executeFeatureAction`, non solo
    `getFeatureHandler` isolato.
  - Riletti i test di route esistenti (`features/__tests__/route.test.ts`,
    `features/[featureId]/__tests__/route.test.ts`): coprono già 401 (non
    autenticato), 403 (non head_master), 404 su `Feature`/campagna
    cross-tenant (query scopata `where: { id, campaignId }` in
    `feature.repository.ts`, nessuna compound-unique a schema ma pattern già
    usato altrove nel repo — `type-check` conferma che Prisma la accetta),
    422 su `featureData` non conforme al vero Zod schema dell'handler (non
    allo snapshot JSON in `FeatureType.featureSchema`), immutabilità di
    `featureTypeId` in PATCH. Non ho trovato necessità di aggiungerne altri:
    i pattern di isolamento multi-tenant/ruolo sono coerenti con il resto del
    repo.
  - Rieseguiti `bun run type-check`/`bun run lint`/`bun run test:run` dopo le
    mie aggiunte: **932/932 test verdi (79 file)**, type-check e lint puliti.
  - Non eseguito: `prisma/seed.ts` contro un DB reale (letto solo per
    conferma statica che itera `listRegisteredFeatureHandlers()` in modo
    idempotente) — non necessario per i 4 criteri di accettazione, che non
    richiedono di popolare un DB reale; nessun accesso Neon fatto perché
    questo task non introduce migrazioni né richiede validazione dati a DB.
    Verdetto: tutti e 4 i criteri soddisfatti con prova diretta (non solo
    lettura di codice). Spunto tutti i checkbox, lascio `status: in-review`
    (il merge/chiusura spetta all'owner).
- 2026-07-14 (owner): push del branch + PR #40 aperta verso
  `task/018-api-creazione-pg` (stacked su #38, non ancora mergiata in `main`) —
  coerente con la deroga al gating §12 annotata sopra. Da riallineare a `main`
  quando la catena 015→018 verrà integrata.
- 2026-07-16 (owner): status → done (review + QA puliti, nessun finding
  bloccante residuo; nota: per §6 del README il `done` spetta formalmente a
  dopo il merge — deviazione esplicita su istruzione diretta dell'utente,
  stesso trattamento già applicato a T-016, per non tenere il task fermo su
  "in-review" mentre attende solo il merge a monte di PR #32/#33/#38 non
  ancora integrate). PR #40 resta aperta verso `task/018-api-creazione-pg`,
  da riallineare a `main` quando la catena 015→018 verrà integrata.
