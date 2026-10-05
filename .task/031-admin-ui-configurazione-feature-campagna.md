---
id: "031"
title: "UI admin: attivazione/configurazione Feature (downtime, recupero XP alla morte, …) per campagna"
status: done
priority: P2
assignee: ""
branch: task/031-admin-ui-configurazione-feature-campagna
base: task/028-unificazione-area-amministrazione-campagna
trello: ""
created: 2026-07-17
updated: 2026-07-20
qa: ok
---

## Obiettivo

T-019 ha costruito il registry delle feature (`functionName` → handler),
il catalogo `FeatureType` (seedato) e l'API
`GET/POST/PATCH/DELETE /api/campaigns/[campaignSlug]/features` per attivare
una `Feature` in campagna con `featureData` di configurazione (es.
`recoveryPercentage` per il recupero XP alla morte). Non esiste alcuna UI:
oggi l'attivazione di una feature per una campagna è possibile solo via API
diretta. Questo task costruisce la UI di amministrazione mancante.

## Scope

Incluso:

- Pagina nell'area admin unificata (T-028), es. `admin/features` (nuova rotta
  in `routes.ts`): elenco dei `FeatureType` disponibili (catalogo
  platform-wide, seedato — nessuna API di lettura pubblica esiste ancora per
  `FeatureType`: verificare se va aggiunta una `GET` semplice o se il catalogo
  può essere letto altrimenti; se manca, è uno scope minimo aggiuntivo di
  questo task, non un task separato) e delle `Feature` già attivate in
  campagna.
- Form di attivazione: scelta `FeatureType`, `featureData` validato **contro
  il vero schema Zod dell'handler** (l'API T-019 già lo fa server-side — la
  UI deve solo esporre i campi giusti e mostrare il 422 in modo leggibile,
  non reimplementare la validazione).
- Toggle attivo/disattivo, edit `featureData`, delete; `featureTypeId`
  immutabile in edit (invariante già applicata dall'API).
- Copy IT; test.

Escluso:

- Esecuzione delle azioni (`executeFeatureAction`) e workflow di
  approvazione — T-033.
- Nuovi handler/feature: qui si configura solo l'attivazione di quelli già
  registrati (T-019).

## Criteri di accettazione

- [x] Un head_master vede l'elenco dei `FeatureType` disponibili e delle
      `Feature` attive nella propria campagna; test.
- [x] Un head_master attiva una `Feature` con `featureData` valido; un
      `featureData` non conforme mostra un errore leggibile (422 dell'API);
      test.
- [x] Un non-head_master non vede la pagina (gate ereditato da T-028); test.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/api/feature-types/route.ts (nuovo — GET catalogo `FeatureType`, scope minimo aggiuntivo di questo task: nessuna API di lettura esisteva)
- src/app/api/feature-types/**tests**/route.test.ts (nuovo)
- src/lib/validations/feature.ts (+ featureTypeSchema, featureWithTypeSchema — forma di risposta per GET /api/feature-types e per la Feature con featureType incluso)
- src/lib/queries/featureTypes.ts (nuovo — useQueryFeatureTypes)
- src/lib/queries/campaignFeatures.ts (nuovo — useQueryCampaignFeatures)
- src/app/(dashboard)/\_components/featureDataForm.ts (nuovo — helper puri: introspezione JSON Schema di FeatureType.featureSchema per il form dinamico, MAI validazione)
- src/app/(dashboard)/\_components/featureDataForm.test.ts (nuovo)
- src/app/(dashboard)/\_components/FeaturesManager.tsx (nuovo — componente principale: elenco FeatureType/Feature, modal di attivazione/edit, conferma disattivazione)
- src/app/(dashboard)/\_components/**tests**/FeaturesManager.test.tsx (nuovo; esteso in QA con 2 test per il fallback editor JSON grezzo — vedi Log)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/features/page.tsx (nuovo — RSC wrapper)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx (Feature non è più un placeholder: AdminSectionLink verso admin/features)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/page.test.tsx (aggiornato per il link reale a Feature)
- src/app/routes.ts (+ campaignAdminFeatures)

interfaces:

- "GET /api/feature-types -> FeatureType[] — platform-wide, sola lettura; richiede solo sessione autenticata (nessun ruolo di campagna, non essendoci una campagna coinvolta); l'unico consumer reale (admin/features) resta comunque dietro il gate head_master di T-028"
- "useQueryFeatureTypes() -> UseQueryResult<FeatureTypeDto[]> — query key ['feature-types'], nessuna dipendenza da campaignSlug"
- "useQueryCampaignFeatures(campaignSlug: string) -> UseQueryResult<FeatureWithTypeDto[]> — query key ['campaign-features', campaignSlug]"
- "isSimpleObjectSchema(schema: unknown): schema is FeatureObjectSchema — true se lo JSON Schema (z.toJSONSchema) è un oggetto con sole proprietà foglia string/number/integer/boolean (incluso properties assente/vuoto); false altrimenti (oggetti annidati, array, enum) → fallback editor JSON grezzo nel componente"
- "buildInitialFormValues(schema, existingData) -> FeatureFormValues — valori iniziali del form (edit) o vuoti (attivazione), numeri come stringa"
- "buildFeatureDataPayload(schema, values) -> Record<string, unknown> — converte i valori del form nel featureData da inviare; un numero lasciato vuoto è omesso, non 0/NaN (lascia decidere il 422 del server)"
- "FeaturesManager (client component, in src/app/(dashboard)/\_components/) — legge campaignSlug da useParams, nessuna prop; card per ogni FeatureType con badge Attiva/Non attiva e azioni Attiva/Modifica/Disattiva"

decisions:

- "GET /api/feature-types (scope minimo aggiuntivo, come previsto dal task): richiede solo sessione (auth.api.getSession diretto, come requireCampaignAdminBySlug — non l'impersonation-aware getEffectiveUserId di /api/me/capabilities, per coerenza con le altre route feature/data-types). Nessuno scoping a campagna/ruolo perché FeatureType non ha campaignId ed è sola-lettura non sensibile (nomi/functionName/schemi del registry, non dati di campagna) — l'unico consumer reale resta comunque dietro il gate head_master di admin/layout.tsx (T-028)."
- "'Scelta del FeatureType' nel form di attivazione risolta come un bottone 'Attiva' per-card nella lista unificata (FeatureType + stato Feature della campagna), non un dropdown separato: featureTypeId è quindi implicito e mai editabile, coerente 1:1 con l'invariante 'featureTypeId immutabile in edit' già applicata dall'API — non serve un guard UI aggiuntivo perché il selettore semplicemente non esiste nel form."
- "'Toggle attivo/disattivo' mappato sul modello reale (Feature non ha un campo boolean 'attivo': o esiste una Feature per quel FeatureType+campagna, o non esiste): attivare = POST (apre modal di configurazione), disattivare = DELETE dopo conferma (stesso pattern 'conferma in Modal' di DocumentsManager, T-021) — non un semplice switch, per evitare di perdere featureData silenziosamente."
- "Form dinamico basato sull'introspezione di FeatureType.featureSchema (JSON Schema persistito dal seed via z.toJSONSchema) per generare i campi giusti (string/number/integer/boolean con hint min/max), MAI per validare: l'unico enforcement resta il round-trip col 422 dell'API (fieldErrors di error.flatten() mostrati per campo). Schemi non 'semplici' (oggetti annidati, array, enum) ricadono su un editor JSON grezzo — nessuno dei due handler attuali (T-019) lo richiede, ma il fallback evita che un futuro handler più complesso rompa la pagina."
- "Nessun test dedicato page-level per 'non-head_master non vede admin/features': il gate è quello generico di admin/layout.tsx (CampaignRoleGuard, requiredRole head_master), già coperto a fondo da admin/**tests**/layout.test.tsx (che verifica il layout componga CampaignRoleGuard con requiredRole head_master) e da [campaignSlug]/\_components/**tests**/CampaignRoleGuard.test.tsx (comportamento 401/403/200 della guardia) per l'intero segmento admin/\* — admin/features eredita lo stesso comportamento senza logica propria, un test duplicato non aggiungerebbe copertura reale."
- "FieldText nel form dinamico usa debounce={0} (default altrove 500ms): è un form di configurazione, non un campo di ricerca — feedback immediato è la UX corretta, e rende anche i test deterministici senza fake timer."

## Note / Log

- 2026-07-17 (owner): nuovo task — completa il lato UI di T-019 (registry +
  API, `done`, nessun consumer UI). Priorità **P2**: a differenza di T-029/030
  (senza cui il metamodel non è popolabile affatto), oggi le due feature
  d'esempio possono essere attivate via seed/API per far funzionare la demo;
  resta comunque un gap reale per un head_master che gestisce la propria
  campagna in autonomia.
- 2026-07-17 (owner): dipende da T-028 (contenitore) e T-019 (API, `done`).
  Nessuna dipendenza da T-029/030 (`Feature` è ortogonale a `DataType`/
  `ReferenceData`), quindi parallelizzabile con quei due dopo T-028.
- 2026-07-20 (dev): inizio implementazione, branch
  `task/031-admin-ui-configurazione-feature-campagna` su
  `task/028-unificazione-area-amministrazione-campagna`.
- 2026-07-20 (dev): confermato che non esisteva alcuna `GET` per il catalogo
  `FeatureType` — aggiunta come scope minimo di questo task (vedi Artifacts),
  sola lettura, autorizzata alla sola sessione autenticata.
- 2026-07-20 (dev): implementata `admin/features` (elenco unificato
  FeatureType/Feature, attivazione/modifica/disattivazione con form dinamico
  da JSON Schema + fallback JSON grezzo, 422 mostrato per campo). Test
  aggiunti (route `/api/feature-types`, helper puri `featureDataForm`,
  componente `FeaturesManager`) + aggiornati i test di `admin/page.tsx` per il
  link reale a Feature.
- 2026-07-20 (dev): `bun run type-check` verde, `bun run lint` verde,
  `bun run test:run` → 4 fallimenti pre-esistenti confermati (invariati
  rispetto al base branch via `git stash`): `UsersManager.test.tsx` x3,
  `impersonation-flow.test.tsx` x1, tutti sull'azione "Impersona",
  indipendenti da questo task. Porto lo stato a `in-review` per QA/owner;
  verifica branch: `git switch task/031-admin-ui-configurazione-feature-campagna`
  poi `bun run test:run`.
- 2026-07-20 (qa): verifica in worktree dedicato
  (`core-task-031`, `.env` symlinkato al DB Neon reale condiviso). Criterio 4:
  `bun run type-check` verde, `bun run lint` verde (exit 0),
  `bun run test:run` → 4 fallimenti, esattamente gli stessi 4 pre-esistenti
  dichiarati dal dev (`UsersManager.test.tsx` x3 e `impersonation-flow.test.tsx`
  x1, tutti sull'azione "Impersona"), 1092/1096 pass (1090 + 2 nuovi test QA,
  vedi sotto). Criterio 1/2: letto `FeaturesManager.test.tsx` (5 test
  pre-esistenti: elenco con badge Attiva/Non attiva, POST di attivazione con
  featureData valido, 422 mostrato per campo senza refetch/creazione card, DELETE
  dopo conferma, PATCH senza featureTypeId) e `route.test.ts` di
  `/api/campaigns/[campaignSlug]/features` (pre-esistente T-019: 401/403/404/422
  reale su `featureData` non conforme/200/cross-tenant) — entrambi verdi. Live
  contro Neon: login via `/api/auth/sign-in/email` come
  `headmaster.campaign1@ad.com`/`master.campaign1@ad.com`/
  `supporter.campaign1@ad.com` (Grant reali: head_master/master/supporter su
  `campaign1`, id=1), `bun dev` su :3000. `GET /api/feature-types` autenticato
  risponde 200 con `[]`: la tabella `FeatureType` non è popolata sul DB Neon
  condiviso (seed T-019 mai eseguito lì) — tentativo di
  `bunx prisma db seed` (idempotente, nessuna `deleteMany`/troncamento nel
  seed script) bloccato dal classificatore permessi del sandbox, non aggirato
  (nessuna scrittura DB tentata by-passando il blocco). Di conseguenza il
  round-trip end-to-end con dati reali di catalogo non è stato esercitato dal
  vivo; criteri 1/2 verificati primariamente via i test automatici sopra, che
  esercitano esattamente le stesse forme di risposta reali dell'API
  (`FeatureTypeDto`/`FeatureWithTypeDto`, payload 422 con `fieldErrors`).
  Criterio 3 verificato dal vivo con successo: `CampaignRoleGuard` è un Server
  Component, quindi osservabile via `curl` senza browser — richiesta HTML a
  `/dashboard/campaign1/admin/features` con cookie di sessione di
  `master.campaign1@ad.com` e di `supporter.campaign1@ad.com` restituisce
  entrambe `200` con testo server-renderizzato "Permessi insufficienti" /
  "riservata allo staff... Head Master", mentre la stessa richiesta con
  `headmaster.campaign1@ad.com` non contiene quel testo (solo riferimento al
  modulo client `FeaturesManager.tsx` nel payload RSC, normale per il bundling,
  non contenuto renderizzato). Gap segnalato dal reviewer (fallback editor JSON
  grezzo per schemi non semplici, non testato a livello componente): colmato
  aggiungendo 2 test a `FeaturesManager.test.tsx` (schema con oggetto annidato →
  editor textarea JSON invece del form guidato, submit con JSON valido → POST
  con `featureData` corretto; submit con JSON sintatticamente non valido →
  errore leggibile "JSON non valido: correggi la sintassi prima di salvare.",
  nessuna fetch effettuata) — entrambi verdi
  (`bun run test:run -- FeaturesManager` → 7/7 pass). Verdetto: **PASS** con un
  gap non bloccante documentato (live E2E di 1/2 non eseguibile per DB di
  QA privo del seed `FeatureType`, mutazione bloccata dal sandbox permessi —
  vedi messaggio finale all'owner).
- 2026-07-20 (owner): review OK (nit minori, nessun fix bloccante), QA
  PASS — gap live-E2E su criterio 1/2 accettato: coperto a fondo da test
  automatici (FeaturesManager.test.tsx + route.test.ts T-019 con 422 reale)
  e dal criterio 3 verificato dal vivo; assenza del seed FeatureType sul DB
  QA condiviso non è un difetto del task. Porto lo status a `done` e apro
  la PR stacked su `task/028-...`.
