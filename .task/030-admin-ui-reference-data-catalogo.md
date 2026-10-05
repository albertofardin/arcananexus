---
id: "030"
title: "UI admin: gestione voci di catalogo (ReferenceData) generica, inclusi flags per-kind, requisiti e documenti"
status: done
priority: P0
assignee: ""
branch: task/030-admin-ui-reference-data-catalogo
base: task/029-admin-ui-datatype-sidebar
trello: ""
created: 2026-07-17
updated: 2026-07-17
qa: ok
---

## Obiettivo

T-016 ha costruito repository + API per il CRUD delle `ReferenceData` (voci di
catalogo: razze, religioni, talenti, regolamenti…) con `flags` validati
per-`kind` e grafo dei requisiti (T-027); T-021 ha costruito **solo** il
rendering/upload per `renderAs = documents` (`DocumentsManager`, scoping a
"Regolamenti"). Manca una UI generica per creare/modificare le voci di **ogni**
`DataType` (`renderAs = catalog`): oggi un head_master non può aggiungere una
razza o un talento se non passando dall'API o dal seed. Questo task copre
quel buco e generalizza il pattern documenti a "upload come tipo di
reference data" per qualunque `DataType` `documents`, non solo i regolamenti.

## Scope

Incluso:

- Pagina nell'area admin unificata (T-028), scelto un `DataType` (da T-029),
  es. `admin/data-types/[dataTypeId]/reference-data` (nuova rotta in
  `routes.ts`): lista delle `ReferenceData` di quel `DataType`
  (`GET /api/campaigns/[campaignSlug]/reference-data?dataTypeId=…` — verificare
  il filtro esatto supportato dalla route T-016, altrimenti filtrare lato
  server nella pagina) con create/edit/delete.
- **Form `flags` dinamico per-`kind`**: il form deve renderizzare campi
  diversi a seconda del `kind` del `DataType` scelto (`talent` →
  `cost`/`repeatable`/`creationOnly`; `race` → `startingPx`; altri `kind` →
  nessun campo flags, oggetto vuoto) — riusare/rispecchiare gli schemi Zod
  già definiti in `src/lib/validations/referenceDataFlags.ts` (T-016) come
  fonte di verità per i campi da mostrare, non duplicarli a mano lato client
  senza riferimento.
- **Gestione requisiti** (`DataRequirement`, `requires`/`blocks`): dalla
  pagina di edit di una `ReferenceData`, aggiungere/rimuovere archi verso
  altre voci della stessa campagna, via
  `POST/DELETE /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements`
  (T-016/T-027 già gestiscono anti-ciclo, tetto di profondità, 409 su
  cancellazione con dipendenti — la UI deve solo mostrare questi errori in
  modo leggibile, non reimplementare le regole).
- **Generalizzazione upload documenti (T-021)**: per `DataType` con
  `renderAs = documents` **diversi da "Regolamenti"**, la UI admin di questo
  task deve permettere lo stesso upload/sostituzione/delete già costruito da
  T-021 (`DocumentsManager`/`documentUpload.ts`), che è già generico per
  `dataTypeId` — verificare se basta riusare `DocumentsManager` così com'è
  dentro la nuova pagina admin, o se va estratto/adattato (es. oggi vive sotto
  `data/[dataSlug]/page.tsx`, non sotto `admin/`).
- **Vincolo esplicito da preservare**: nella pagina pubblica/giocatore
  (`data/[dataSlug]/page.tsx`, T-020/T-021) i documenti restano **solo
  scaricabili**, mai modificabili/eliminabili — verificare che l'estensione di
  questo task non introduca controlli di scrittura lato pagina pubblica (la
  gestione admin vive esclusivamente sotto l'area `admin/`).
- Visibilità/`visibilityConditionId` editabili dal form (select tra le
  `VisibilityCondition` esistenti in campagna, se presenti).
- Copy IT; toast/errori coerenti; test.

Escluso:

- Cambiare le API/repository T-016/T-021/T-027 (già `done`+review+QA): solo
  consumo da UI nuova.
- UI di creazione delle `VisibilityCondition` stesse (restano hardcoded lato
  dev/registry, T-026 — fuori scope per design).

## Criteri di accettazione

- [x] Un head_master crea una `ReferenceData` per un `DataType kind=talent`
      con `flags` (`cost`/`repeatable`/`creationOnly`) validati dal form
      prima dell'invio; errore 422 dell'API mostrato leggibile se i flags
      non rispettano lo schema; test.
- [x] Un head_master aggiunge un requisito `requires`/`blocks` tra due voci
      della stessa campagna dalla UI; il 409 (ciclo) o il 409 (dipendenti su
      delete, T-027) sono mostrati con messaggio comprensibile; test.
- [x] Un head_master carica un documento per un `DataType documents` diverso
      da "Regolamenti" dalla nuova pagina admin; il giocatore lo vede solo
      scaricabile nella pagina pubblica (nessun controllo di modifica/delete
      esposto lì); test.
- [x] Un non-head_master non vede la pagina (gate ereditato da T-028); test.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/routes.ts
- src/app/(dashboard)/\_components/DataTypesManager.tsx
- src/app/(dashboard)/\_components/DocumentsManager.tsx (spostato da `dashboard/[campaignSlug]/data/[dataSlug]/_components/`, + prop `onChanged` opzionale)
- src/app/(dashboard)/\_components/ReferenceDataManager.tsx (nuovo)
- src/app/(dashboard)/\_components/**tests**/ReferenceDataManager.test.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/page.tsx (solo import aggiornato)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/data-types/[dataTypeId]/reference-data/page.tsx (nuovo)
- src/app/api/campaigns/[campaignSlug]/visibility-conditions/route.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/visibility-conditions/**tests**/route.test.ts (nuovo)
- src/lib/repositories/visibilityCondition.repository.ts (nuovo)
- src/lib/repositories/visibilityCondition.repository.test.ts (nuovo)
- src/lib/queries/dataTypes.ts (+ `useQueryCampaignDataType`)
- src/lib/queries/referenceData.ts (nuovo)
- src/lib/queries/dataRequirements.ts (nuovo)
- src/lib/queries/visibilityConditions.ts (nuovo)
- src/lib/validations/referenceData.ts (+ `referenceDataAdminSchema`/List)
- src/lib/validations/dataRequirement.ts (+ schemi risposta grafo requisiti)

interfaces:

- "listVisibilityConditions(prisma: PrismaClient) -> Promise<VisibilityCondition[]>"
- "GET /api/campaigns/[campaignSlug]/visibility-conditions -> VisibilityCondition[] (head_master/super-admin, sola lettura)"
- "useQueryCampaignDataType(campaignSlug: string, dataTypeId: number) -> UseQueryResult<DataTypeAdmin>"
- "useQueryCampaignReferenceData(campaignSlug: string, dataTypeId?: number, options?: { enabled?: boolean }) -> UseQueryResult<ReferenceDataAdmin[]>"
- "useQueryDataRequirements(campaignSlug: string, referenceDataId: number | null) -> UseQueryResult<DataRequirementsGraph>"
- "useQueryVisibilityConditions(campaignSlug: string) -> UseQueryResult<VisibilityConditionOption[]>"
- "DocumentsManager({ ..., onChanged?: () => void }) — prop aggiunta, retrocompatibile (default undefined = comportamento T-021 invariato)"
- "routes.campaignAdminReferenceData(camp: string, dataTypeId: string | number) -> string"

decisions:

- "DocumentsManager (T-021) riusato per la UI admin senza toccarne la logica di dominio (upload/autorizzazione/delete), ma esteso con una prop opzionale `onChanged`: il consumer originale (`data/[dataSlug]/page.tsx`) è un Server Component e si affida a `router.refresh()` per rileggere `documents` da props; la nuova pagina admin è interamente client-side/TanStack Query, dove `router.refresh()` da solo non invalida la cache client — `onChanged` (chiamata in aggiunta, mai al posto di `router.refresh()`) dà al chiamante client un modo di rifare il proprio fetch. Comportamento del consumer pubblico invariato (prop omessa lì)."
- "DocumentsManager spostato da `data/[dataSlug]/_components/` a `_components/` (cartella condivisa dashboard, stesso posto di `DataTypesManager`/`CampaignRolesManager`) per essere importabile sia dalla pagina pubblica sia da quella admin senza cross-import fra sottoalberi di route; nessuna modifica di comportamento per il consumer pubblico oltre al path di import."
- "form `flags` reso dinamico introspezionando lo `ZodObject.shape` di `getFlagsSchemaForKind(kind)` (T-016) a runtime (boolean → checkbox, number → campo numerico): un nuovo `kind`/flag aggiunto in `referenceDataFlags.ts` resta renderizzabile senza toccare `ReferenceDataManager` — solo un'etichetta IT cosmetica opzionale in `FLAG_LABELS` (fallback sulla chiave grezza se assente)."
- "validazione flags in doppio strato: client-side (stesso schema Zod, blocca l'invio prima della rete, messaggio IT basato sui nomi dei campi falliti — mai il testo Zod di default, non localizzato) + gestione del 422 server-side (stesso schema, stessa formattazione IT) per il caso in cui client e server siano disallineati."
- "errori API (422 flags, 409 ciclo requisiti, 409 dipendenti su delete) mostrati via toast con `buildApiErrorMessage`: antepone sempre `json.error` (già IT dalla route), poi arricchisce con nomi di campo/voci dipendenti da `details` — mai il testo grezzo dei messaggi Zod di default in `details.fieldErrors` (non localizzati)."
- "requisiti in entrata (`requiredBy`) mostrati in sola lettura nella sezione Requisiti: l'API vincola la DELETE di un arco al `referenceDataId` che ne è il `definitionId` (route T-016/T-027) — un arco 'A richiede B' è rimovibile solo dalla pagina di A, mai da quella di B."
- "selettore del bersaglio requisito popolato con l'intero catalogo della campagna (nessun filtro `dataTypeId`): un requisito può attraversare categorie diverse (es. un talento che richiede una razza)."
- "'Condizione di visibilità' mostrata nel form solo se esistono `VisibilityCondition` (altrimenti un select sempre vuoto salvo 'Nessuna condizione' non aggiunge valore) — coerente con lo scope 'se presenti' del task."
- "nuova route GET `/api/campaigns/[campaignSlug]/visibility-conditions` (+ repository dedicato) aggiunta ex-novo per popolare il selettore: non esisteva un endpoint di lettura per `VisibilityCondition` prima di questo task (T-026 ha costruito solo il registry/evaluator server-side, nessuna route). Non è una modifica alle API T-016/T-021/T-027 (fuori scope per design), è additiva e sola lettura, stesso pattern delle guardie head_master esistenti."
- "checkbox lista `showInSidebar`/riordino DataType (T-029) invariate: il pulsante 'Gestisci voci di catalogo' aggiunto a `DataTypeRow` naviga a `routes.campaignAdminReferenceData`, stesso pattern `router.push(... as never)` di `BtnPlatformAdmin`/`SideButton`."

## Note / Log

- 2026-07-17 (dev): inizio implementazione. Verificato `DocumentsManager`
  (T-021): è già generico per `dataTypeId` (nessun riferimento hardcoded a
  "Regolamenti" nel codice), riutilizzato **senza toccarne la logica di
  dominio** — solo spostato in `_components/` (cartella condivisa dashboard,
  stesso posto di `DataTypesManager`) per poter essere importato sia dalla
  pagina pubblica `data/[dataSlug]/page.tsx` sia dalla nuova pagina admin,
  senza cross-import fra sottoalberi di route.
- 2026-07-17 (dev): durante l'implementazione della generalizzazione upload
  documenti (criterio 3) individuato un punto di adattamento non anticipato
  dal brief: `DocumentsManager` chiama solo `router.refresh()` dopo
  upload/delete, adeguato al suo consumer originale (Server Component, dati
  da props) ma insufficiente per la nuova pagina admin (client-side/TanStack
  Query, `router.refresh()` non invalida quella cache). Aggiunta una prop
  opzionale `onChanged` (retrocompatibile, consumer pubblico invariato) — non
  è una riscrittura della logica di dominio (upload/autorizzazione/delete
  restano quelle di T-021), vedi `## Artifacts > decisions`.
- 2026-07-17 (dev): implementazione completata — pagina
  `admin/data-types/[dataTypeId]/reference-data`, form CRUD con `flags`
  dinamico per-`kind` (introspezione dello schema Zod, non duplicato a mano),
  sezione Requisiti (add/remove `requires`/`blocks`, errori 409/422 leggibili
  in IT), riuso di `DocumentsManager` per `renderAs = documents`, selettore
  `visibilityConditionId` (nuova route di sola lettura
  `visibility-conditions`, non esisteva prima). `bun run type-check`,
  `bun run lint` verdi; `bun run test:run` verde a meno dei 4 fallimenti
  pre-esistenti e indipendenti (UsersManager.test.tsx x3, azione "Impersona",
  - impersonation-flow.test.tsx x1) — confermati anche sul base branch
    `task/029-admin-ui-datatype-sidebar` prima di iniziare (stesso identico
    elenco di test falliti, stesso errore). Task lasciato in `in-progress`
    (non porto a `in-review` da solo, come da istruzioni ricevute) — pronto per
    handoff a review/QA.
- 2026-07-17 (owner): nuovo task — chiude il gap "backend Fase 2 completo,
  zero UI di scrittura del catalogo" segnalato dall'utente (punto 2 del
  brief: "pagina per registrare i reference data dei DataType, incluso upload
  documenti"). Verificato: T-021 costruisce `DocumentsManager` già generico
  per `dataTypeId` (non hardcoded a "Regolamenti" nel codice, solo nell'uso
  attuale), quindi l'estensione è principalmente di **posizionamento/routing**
  (renderlo raggiungibile dall'area admin per qualunque `DataType documents`),
  non di riscrittura. Il vincolo "solo download in pubblico" è già rispettato
  da T-021 (`DocumentsManager` in `data/[dataSlug]/page.tsx` mostra i
  controlli di scrittura solo se `isMaster`, mai al giocatore) — da
  preservare, non reintrodurre scrittura lato pagina pubblica.
- 2026-07-17 (owner): dipende da T-028 (contenitore), T-029 (da qui si
  naviga scegliendo il `DataType`), T-016/T-021/T-027 (API, tutte `done`).
  Priorità **P0**, stesso ragionamento di T-029: senza questa UI il catalogo
  di una campagna reale non è popolabile se non a mano via API.
- 2026-07-17 (qa): **verdetto PASS**, tutti i 5 criteri verificati con prova
  diretta (non solo lettura di codice/test dichiarati dal dev). Setup:
  worktree `core-task-030` su branch `task/030-admin-ui-reference-data-catalogo`,
  `.env` symlinkato a `../core/.env` (DB Neon reale, stesso pattern T-023/T-029),
  `bun install` + `bunx prisma generate`, poi `bun dev` contro il DB reale.
  - Check statici: `bun run type-check` verde (nessun output/errore),
    `bun run lint` verde (nessun output/errore).
    `bun run test:run` → `Test Files 2 failed | 91 passed (93)`,
    `Tests 4 failed | 1088 passed (1092)`: i 4 fallimenti sono esattamente
    quelli pre-esistenti noti e indipendenti dichiarati dal dev
    (`UsersManager.test.tsx` × 3 + `impersonation-flow.test.tsx` × 1, tutti
    sull'azione "Impersona"), nessun nuovo fallimento. Criterio 5 **PASS**.
  - `ReferenceDataManager.test.tsx` isolato: `bunx vitest run` →
    `Test Files 1 passed (1)`, `Tests 9 passed (9)`.
  - Criterio 4 (gate head_master, T-028) verificato sia da codice (nuova
    rotta `admin/data-types/[dataTypeId]/reference-data/page.tsx` nidificata
    sotto `admin/layout.tsx`, che avvolge con
    `CampaignRoleGuard requiredRole=head_master`; `page.tsx` non ha guardia
    propria) sia dal vivo: login via `POST /api/auth/sign-in/email` come
    `supporter.campaign1@ad.com` (ruolo `supporter` su `campaign1`) →
    `GET /dashboard/campaign1/admin/data-types/1/reference-data` risponde
    200 ma il body contiene "Permessi insufficienti" /
    "riservata allo staff della campagna con ruolo Head Master" (nessun
    `ReferenceDataManager` montato); controllo positivo con
    `headmaster.campaign1@ad.com` sulla stessa URL → nessun "Permessi
    insufficienti", `ReferenceDataManager` presente nel payload RSC.
    **PASS**.
  - Criteri 1 e 2 (flags per-kind + 422/409) verificati sia via i 9 test
    MSW (checkbox/numerico dinamici per `talent`/`race`, errore 422
    leggibile "I flag non sono coerenti con la categoria: Costo", 409 ciclo
    "Il requisito genererebbe un ciclo", 409 dipendenti "Impossibile
    eliminare: altre voci di catalogo dipendono da questa: Fuoco") sia dal
    vivo contro l'API reale (login `mattia@arcana.it`, super-admin, su
    campagna seed `demo-metamodello`, `DataType` reali `Talenti` id=17
    kind=talent e `Razza` id=15 kind=race): `POST reference-data` con flags
    validi → 201; con `cost:-1` / `startingPx:-3` → 422 con
    `{"error":"I flag non sono coerenti con la categoria","details":{"fieldErrors":{"cost":["Too small: expected number to be >=0"]}}}`
    (stessa forma esatta usata dal fixture MSW, confermando che il test non
    si affida a un mock irrealistico); creato requisito `13 requires 8`
    (201), poi `8 requires 13` → 409
    `{"error":"Il requisito genererebbe un ciclo"}`; `DELETE` di `8` (con
    dipendente `13`) → 409
    `{"error":"Impossibile eliminare: altre voci di catalogo dipendono da
questa","details":{"dependents":[{"id":13,"name":"QA Talento Live"}]}}`.
    Dati di test ripuliti subito dopo (DELETE requirement + DELETE
    reference-data), DB verificato tornato allo stato seed originale.
    **PASS**.
  - Criterio 3 (documento su `DataType documents` ≠ "Regolamenti",
    "solo scaricabile" in pubblico) verificato dal vivo: creato un nuovo
    `DataType` "Mappe di Campagna" (`kind=document`, `renderAs=documents`,
    diverso da "Regolamenti") via `POST data-types`, poi una `ReferenceData`
    con `fileUrl`/`fileKey` valorizzati via `POST reference-data` (via
    l'API generica T-016, legittima e fuori scope di questo task) per
    simulare un documento caricato — l'upload reale via UploadThing SDK non
    è testabile end-to-end in questo ambiente (nessuna credenziale
    UploadThing in `.env`); il livello di interazione upload/`startUpload`
    è comunque coperto in modo reale da
    `ReferenceDataManager.test.tsx` ("un head*master carica un documento per
    un DataType documents diverso da 'Regolamenti'", con `useUploadThing`
    mockato solo per l'SDK esterno). Poi login come
    `giocatore.demo@ad.com` (giocatore PG, non master) e
    `GET /dashboard/demo-metamodello/data/Mappe%20di%20Campagna`: payload
    RSC mostra `DocumentsManager` montato con
    `documents:[{id:14,name:"Mappa del Castello di Ombraluce",...,
fileUrl:"https://qa-fixture.example/mappa.pdf",visibility:"visible"}],
isStaff:false,isMaster:false` — nessun controllo di modifica/eliminazione
    esposto al client (solo `isMaster` abilita "Sostituisci"/"Elimina"/upload
    in `DocumentsManager`). Verificato anche via `git diff` che
    `data/[dataSlug]/page.tsx` (T-021, consumer pubblico) è cambiato \_solo*
    nell'import di `DocumentsManager` rispetto al base branch
    `task/029-admin-ui-datatype-sidebar` (nessuna modifica di logica/props).
    Dati di test ripuliti (`DELETE reference-data/14/document`,
    `DELETE data-types/20`), DB verificato tornato allo stato seed
    originale (solo i 4 `DataType` originali di `demo-metamodello`).
    **PASS**.
  - Verdetto finale: **PASS**, tutti i 5 criteri di accettazione osservati
    passare con prova riproducibile (comandi/output sopra). Nessun difetto
    trovato. Non porto lo status a `done` (competenza owner, §6 README);
    lasciato `in-review`, riassegnato a `owner`.
- 2026-07-17 (owner): review OK (nit minori, nessun fix bloccante), QA
  PASS su tutti i criteri — porto lo status a `done` e apro la PR stacked
  su `task/029-...`.
