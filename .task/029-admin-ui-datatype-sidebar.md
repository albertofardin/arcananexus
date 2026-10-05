---
id: "029"
title: "UI admin: gestione DataType (kind/cardinalità/presentazione) e composizione sidebar"
status: done
priority: P0
assignee: ""
branch: task/029-admin-ui-datatype-sidebar
base: task/028-unificazione-area-amministrazione-campagna
trello: ""
created: 2026-07-17
updated: 2026-07-17
qa: ok
---

## Obiettivo

T-016 ha costruito repository + API per il CRUD dei `DataType` (`kind`,
`cardinality`, `renderAs`, `showInSidebar`, `sidebarOrder`, `icon`), ma non
esiste **nessuna UI**: oggi l'unico modo per creare/modificare un `DataType`
è chiamare l'API a mano o passare dal seed script. Un head_master reale non
può configurare la propria campagna. Questo task costruisce la UI di
amministrazione che chiude quel buco: creare/modificare/eliminare `DataType`
e comporre la sidebar (ordine, icona, visibilità in sidebar) da interfaccia.

## Scope

Incluso:

- Pagina nell'area admin unificata (T-028), es.
  `admin/data-types` (nuova rotta in `routes.ts`: `campaignAdminDataTypes`):
  lista dei `DataType` della campagna (letta da
  `GET /api/campaigns/[campaignSlug]/data-types`), con create/edit/delete via
  form.
- Form create: `name`, `kind` (select tra i valori di `DataTypeKind`, **immutabile
  dopo la creazione** — vedi invariante T-016), `cardinality` (`single`/`multi`),
  `renderAs` (`catalog`/`documents`), `playerAssignable`, `showInSidebar`,
  `sidebarOrder`, `icon` (riuso del picker icone già in uso altrove, es.
  `SidePanel`/`CampaignSettings`).
- Form edit: stessi campi tranne `kind`/`dataTypeId` (immutabili — la PATCH
  con `kind` è già rifiutata 400 dalla API T-016; il form non deve nemmeno
  proporlo come editabile).
- Composizione sidebar: riordino (drag&drop o frecce su/giù, aggiornando
  `sidebarOrder` via PATCH) e toggle `showInSidebar` direttamente dalla lista,
  senza dover aprire il form di edit per ogni singolo campo.
- Delete con conferma (`Modal`, stesso pattern di `BtnUser.tsx`/
  `DocumentsManager.tsx`); gestire l'errore se la API rifiuta (es. `DataType`
  con `ReferenceData` figlie — verificare comportamento reale della `DELETE`
  T-016 e mostrare un messaggio comprensibile, non un 500 muto).
- Copy IT; gestione errori/toast coerente col resto dell'app (`use-toast`).
- Test componente + eventuali route/loader coinvolti.

Escluso:

- CRUD delle `ReferenceData` (voci di catalogo) — T-030.
- Configurazione `Feature`/`FeatureType` — T-031.
- Cambiare l'API T-016 (repository/route esistenti, già `done`+review+QA):
  solo consumo da UI nuova.

## Criteri di accettazione

- [x] Un head_master crea un nuovo `DataType` dalla UI (name/kind/cardinality/
      renderAs/showInSidebar/sidebarOrder/icon) e lo vede comparire nella
      sidebar della campagna (T-020) dopo il refresh; test.
- [x] Un head_master modifica `showInSidebar`/`sidebarOrder`/`icon`/`name` di
      un `DataType` esistente; `kind` non è modificabile dalla UI; test.
- [x] Un head_master elimina un `DataType`; se l'API rifiuta (dipendenti),
      l'errore è mostrato in modo leggibile, non un crash silenzioso; test.
- [x] Un non-head_master non vede la pagina (gate ereditato da T-028); test.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/(dashboard)/\_components/DataTypesManager.tsx (nuovo — CRUD list/create/edit/delete + composizione sidebar)
- src/app/(dashboard)/\_components/**tests**/DataTypesManager.test.tsx (nuovo — 7 test di integrazione via MSW)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/data-types/page.tsx (nuovo — wrapper, nessuna logica propria: guardia ereditata da admin/layout.tsx)
- src/lib/queries/dataTypes.ts (nuovo — useQueryCampaignDataTypes)
- src/lib/validations/dataType.ts (aggiunto dataTypeAdminSchema/dataTypeAdminListSchema per la risposta GET admin)
- src/lib/icons.ts (nuovo — CATALOG_ICONS estratto da CampaignSettings.tsx per riuso nel picker icona)
- src/app/(dashboard)/\_components/CampaignSettings.tsx (SECTION_ICONS locale sostituito con l'import da @/lib/icons, nessun cambio di comportamento)
- src/app/routes.ts (aggiunta routes.campaignAdminDataTypes)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx (placeholder "Tipi di Dato" promosso a AdminSectionLink verso la nuova pagina)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/page.test.tsx (assert aggiuntivo sul nuovo link, stesso pattern degli altri)

interfaces:

- "useQueryCampaignDataTypes(campaignSlug: string) -> UseQueryResult<DataTypeAdmin[]>" (src/lib/queries/dataTypes.ts, GET ?includeCount=true)
- "dataTypeAdminSchema: ZodObject" / "type DataTypeAdmin" (src/lib/validations/dataType.ts — id/campaignId/name/kind/description/cardinality/playerAssignable/showInSidebar/sidebarOrder/icon/renderAs/\_count?.referenceData)
- "CATALOG_ICONS: string[]" (src/lib/icons.ts — set icone Material Symbols condiviso tra CampaignSettings e DataTypesManager)
- "routes.campaignAdminDataTypes(camp: string) -> string" (src/app/routes.ts)
- "DataTypesManager()" (default export, client component, nessuna prop — legge campaignSlug da useParams, gate head_master ereditato da admin/layout.tsx)

decisions:

- "Delete non è mai rifiutata dalla API per dipendenti: DataType→ReferenceData→CharacterData sono tutte onDelete: Cascade a schema (verificato in prisma/schema.prisma). Il criterio 'se l'API rifiuta (dipendenti)' è quindi gestito come: (a) errori HTTP generici (403/404/500/network) mostrati via toast leggibile invece di un crash muto, testato con un 409 mock in DataTypesManager.test.tsx; (b) dato che il cascade è un rischio di perdita dati silenziosa più insidioso di un rifiuto, il modal di conferma avvisa esplicitamente quante ReferenceData verranno eliminate insieme (\_count.referenceData, richiesto via GET ?includeCount=true)."
- "Riordino sidebar via frecce su/giù (non drag&drop, opzione esplicitamente ammessa dallo scope): nessuna libreria dnd già presente nel repo, le frecce restano coerenti con lo stile esistente (NumberStepper in CampaignSettings) senza aggiungere una dipendenza. Ogni mossa rinormalizza l'intero sottoinsieme showInSidebar=true a interi sequenziali 0..n-1 in base alla posizione visualizzata (stesso ordinamento sidebarOrder asc/null-last + nome usato da campaign.repository.ts per T-020), poi scambia le due posizioni toccate: gestisce in modo deterministico anche i sidebarOrder nulli/non consecutivi già presenti nei dati seed."
- "Form create/edit condivisi in un solo componente (DataTypeFormModal): kind è editabile solo in creazione (FieldSelect abilitato) e mostrato disabilitato in modifica — la PATCH con kind è già rifiutata 400 dalla API T-016 (T-016, non toccata), qui semplicemente non è proposto come editabile, coerente con lo scope."
- "Campo description del DataType non esposto nel form: non è nell'elenco esplicito dei campi richiesti dallo scope (name/kind/cardinality/renderAs/playerAssignable/showInSidebar/sidebarOrder/icon). Resta gestibile solo via API diretta; nessuna regressione (il PATCH non lo tocca se omesso dal body, essendo lo schema Zod .partial())."
- "Icon picker riusato letteralmente da CampaignSettings (stesso set CATALOG_ICONS, estratto in src/lib/icons.ts) invece di duplicarlo, per restare coerenti come richiesto dal task ('riuso del picker icone già in uso altrove')."
- "Test con MSW (setupServer + store in-memory), stesso pattern di impersonation-flow.test.tsx, invece di mockare la query hook: esercita davvero fetch+Zod+refetch end-to-end (create/edit/toggle/reorder/delete), non solo il rendering statico."

## Note / Log

- 2026-07-17 (owner): nuovo task — chiude il gap "backend Fase 2 completo,
  zero UI di scrittura del metamodel" segnalato dall'utente. Dipende da T-028
  (area unificata) e T-016 (API, `done`). Priorità **P0**: senza questa UI la
  Fase 2 backend non è realmente utilizzabile da un head_master reale (solo
  via API diretta o seed script).
- 2026-07-17 (owner): base branch `task/028-...` (stack sulla catena
  Fase 2/T-028), deroga §12 — vedi nota in T-028. Sblocca la UI di sidebar
  "self-service": T-020 (sidebar dinamica, `done`) legge già `showInSidebar`/
  `sidebarOrder`/`icon`, questo task è il lato scrittura mancante.
- 2026-07-17 (dev): inizio implementazione su worktree dedicato
  (`core-task-029`, branch `task/029-admin-ui-datatype-sidebar`).
- 2026-07-17 (dev): implementata `DataTypesManager` (list/create/edit/delete
  - toggle `showInSidebar` + riordino con frecce su/giù), nuova pagina
    `admin/data-types`, `routes.campaignAdminDataTypes`, query hook
    `useQueryCampaignDataTypes`, schema Zod `dataTypeAdminSchema`; estratto
    `CATALOG_ICONS` condiviso da `CampaignSettings` per il picker icona (vedi
    `## Artifacts` per dettagli/decisioni). 7 nuovi test di integrazione
    (MSW) in `DataTypesManager.test.tsx`, tutti verdi.
- 2026-07-17 (dev): `bun run type-check` verde, `bun run lint` verde,
  `bun run test:run` — 1075 test (1071 pass, 4 fail), stesso conteggio di
  fallimenti (4, in `UsersManager.test.tsx` e
  `impersonation-flow.test.tsx`, azione "Impersona") già presente sul base
  branch `task/028-...` prima di questo lavoro (verificato con
  `git stash` + re-run sullo stesso worktree: 1068 test, 1064 pass, stessi
  4 fail) — pre-esistenti, non toccati da questo task, nessuna regressione
  introdotta.
- 2026-07-17 (dev): criterio "un non-head_master non vede la pagina" non
  ha un test dedicato in `admin/data-types/__tests__/`: `page.tsx` non ha
  logica propria (solo `<DataTypesManager />`), la guardia head_master è
  ereditata da `admin/layout.tsx` e già coperta a fondo per l'intero
  segmento in `admin/__tests__/layout.test.tsx` (T-028) — stesso pattern
  già seguito da roles/characters/downtime, che non hanno test di pagina
  propri. Consegna in `in-progress` (non porto a `in-review` autonomamente,
  per istruzione esplicita dell'owner in questo handoff): pronto per
  review/QA.
- 2026-07-17 (reviewer): verdetto OK round 1, nessun blocking finding. Un
  nit non-bloccante da chiudere prima di QA: in `handleMove` (riordino
  sidebar), il fallimento di una PATCH a metà sequenza faceva `return`
  senza `refetch()`, lasciando la UI sullo stato pre-move anche se alcune
  posizioni erano già state aggiornate sul server.
- 2026-07-17 (dev): fix post-review — `handleMove` chiama `refetch()` sia
  nel ramo di fallimento della sequenza di PATCH sia nel `catch`, per
  riallineare sempre la UI allo stato reale del server dopo un fallimento
  parziale del riordino. `bun run type-check`/`lint` verdi,
  `bun run test:run` invariato (1075 test, 1071 pass, stessi 4 fail
  pre-esistenti su base branch, nessuna regressione); i 7 test di
  `DataTypesManager.test.tsx` restano verdi. Nessun altro giro di review
  richiesto per questo fix mirato: il task passa a QA.
- 2026-07-17 (qa): verdetto **PASS**, tutti e 5 i criteri verificati
  osservandoli passare (non solo letti sulle checkbox). Dettaglio:
  - Criterio 1 (creazione + comparsa in sidebar): oltre ai 7 test di
    `DataTypesManager.test.tsx` (`bunx vitest run DataTypesManager.test.tsx`
    → 7/7 verdi), eseguita verifica e2e dal vivo: `bun dev` con `.env`
    puntato al DB Neon reale (symlink `../core/.env`, stesso pattern già
    usato in `core-task-023`), login via
    `POST /api/auth/sign-in/email` come `headmaster.campaign1@ad.com`
    (seed, head_master su `campaign1`/`arcana-domine`). Stato iniziale:
    `GET /api/campaigns?orgSlug=arcana-domine` → `campaign1.dataTypes: []`
    (nessuna sezione in sidebar). Creato un `DataType` con lo stesso body
    che invia il form (`POST /api/campaigns/campaign1/data-types`, name
    "QA Test Fazioni", kind faction, showInSidebar true, icon flag) → 201.
    Ri-chiamata `GET /api/campaigns?orgSlug=arcana-domine` →
    `campaign1.dataTypes: [{"name":"QA Test Fazioni","icon":"flag"}]`:
    l'endpoint che alimenta `SidePanel` (`useQueryCampaigns` →
    `listCampaignsByOrgSlug`, T-020) riflette davvero la nuova sezione dopo
    il refresh, confermando l'integrazione end-to-end tra la scrittura T-029
    e la lettura T-020 (non solo il mock MSW del test componente).
  - Criterio 2 (edit + kind immutabile): verificato sia via test componente
    (kind mostrato disabilitato, click non apre altre opzioni, `kind` non
    presente nel body PATCH) sia dal vivo:
    `PATCH /api/campaigns/campaign1/data-types/19` con
    name/icon/sidebarOrder/showInSidebar → 200, campi aggiornati; stesso
    endpoint con body `{"kind":"generic"}` → 400
    `{"error":"Dati non validi","details":{"formErrors":["Unrecognized key:
\"kind\""]}}` (schema Zod `.strict()`), confermando che la UI non
    propone nulla che l'API accetterebbe comunque per errore.
  - Criterio 3 (delete + errore leggibile): letto `prisma/schema.prisma`
    (`DataType.referenceData`/`ReferenceData.dataType`:
    `onDelete: Cascade`; `ReferenceData.instances`/`CharacterData.
referenceData`: `onDelete: Cascade`) e la route
    `data-types/[dataTypeId]/route.ts` (`DELETE` chiama `deleteDataType`
    senza alcun controllo di dipendenze pregresso): confermata l'
    affermazione del dev, l'API non rifiuta mai per dipendenti. Riprodotto
    dal vivo sul DB reale: creato `DataType` id 19 con una `ReferenceData`
    figlia (id 12, via `POST /api/campaigns/campaign1/reference-data`),
    poi `DELETE /api/campaigns/campaign1/data-types/19` → 204 (non
    rifiutata); verifica diretta via script Prisma:
    `dataType.findUnique({id:19})` e `referenceData.findUnique({id:12})`
    entrambi `null` dopo la delete — cascade reale confermato, DB
    ripulito automaticamente senza artefatti orfani. L'interpretazione del
    criterio data da dev/reviewer (avviso preventivo nel modal con il
    conteggio `_count.referenceData` + gestione toast leggibile per
    qualunque errore HTTP reale, testata con un 409 mock in
    `DataTypesManager.test.tsx`) è ragionevole e ne rispetta lo spirito,
    dato che uno scenario letterale "API rifiuta per dipendenti" non può
    verificarsi con lo schema attuale — il rischio reale è la perdita
    silenziosa via cascade, correttamente segnalato nel modal.
  - Criterio 4 (gate non-head_master): letti `admin/layout.tsx`
    (`CampaignRoleGuard` con `requiredRole: head_master`, applicato all'
    intero segmento `admin/*`) e `CampaignRoleGuard.test.tsx` (guardia
    testata a fondo: nessuna sessione → `notFound`, campagna inesistente →
    `notFound`, ruolo insufficiente → "Permessi insufficienti" senza
    montare i children, cross-tenant head_master di campagna A bloccato su
    campagna B). Verificato anche dal vivo: login come
    `master.campaign1@ad.com` (non head_master) →
    `GET /api/campaigns/campaign1/data-types` → 403
    `{"error":"Permessi insufficienti"}`; `GET
/dashboard/campaign1/admin/data-types` → 200 ma con "Permessi
    insufficienti" nell'HTML server-renderizzato (0 occorrenze di "Tipi di
    Dato"/"Nuovo tipo di dato"); stessa pagina come `headmaster.campaign1@
ad.com` → 200 senza alcuna occorrenza di "Permessi insufficienti".
    Nessun test di pagina dedicato in `admin/data-types/__tests__/` (come
    dichiarato dal dev), ma la guardia è generica e già coperta a fondo per
    l'intero segmento: coerente con roles/characters/downtime.
  - Criterio 5 (check verdi): `bun run type-check` → nessun errore.
    `bun run lint` → nessun errore/warning. `bun run test:run` → 1075 test,
    1071 pass, 4 fail (stessi `UsersManager.test.tsx` e
    `impersonation-flow.test.tsx`, azione "Impersona"). Confermato che sono
    pre-esistenti e indipendenti da questo task: checkout detached del base
    branch `f8e1216` (task/028) + `bun run test:run` → 1068 test, 1064
    pass, stessi 4 fail identici (stesso nome test, stesso file) — nessuna
    regressione introdotta da T-029, tornato poi su
    `task/029-admin-ui-datatype-sidebar` (`git checkout`, working tree
    pulito prima e dopo).
  - Setup usato per la verifica dal vivo: worktree `core-task-029`,
    `.env` symlinkato a `../core/.env` (DB Neon reale, stesso pattern di
    `core-task-023`), `bunx prisma generate`, `bun dev`. Utenti seed usati:
    `headmaster.campaign1@ad.com` / `master.campaign1@ad.com` (password
    `ArcanaDomineTest2026!`, vedi `prisma/seed.ts`). Nessun dato di
    produzione modificato in modo permanente: i `DataType`/`ReferenceData`
    creati per il test sono stati eliminati nello stesso giro (l'ultimo,
    id 19, via il cascade della DELETE stessa) e lo stato finale di
    `campaign1` coincide con quello di partenza (4 `DataType` originari,
    verificato con una `GET` finale). Server di dev fermato al termine
    (`pkill -f "next dev"`).
  - Status impostato a `in-review` (non `done`, per istruzione esplicita:
    la decisione finale spetta all'owner).
- 2026-07-17 (owner): review OK, QA PASS su tutti i criteri — porto lo
  status a `done` e apro la PR stacked su `task/028-...`.
