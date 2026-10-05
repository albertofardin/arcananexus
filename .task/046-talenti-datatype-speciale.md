---
id: "046"
title: "Talenti come DataType speciale (kind: talent)"
status: done
priority: P1
assignee: dev
branch: task/046-talenti-datatype-speciale
base: main
trello: ""
created: 2026-08-11
updated: 2026-08-11
---

## Obiettivo

Il `DataType` di `kind: "talent"` diventa un caso speciale: non creabile da
UI/API come nuovo data-type generico, sempre presente esattamente una volta
per campagna (nome fisso "Talenti"), gestito da una pagina dedicata in
"Gestione Campagna" invece che dai "Tipi di Dato" generici, con le sue
`ReferenceData` raggruppate per "Categoria" e una visibilità in sidebar
sempre-ultima quando attiva.

Nota di processo: questo task non è passato dal planning `owner` sul board —
il brief è arrivato come piano già approvato dall'utente
(`~/.claude/plans/replicated-waddling-pudding.md`, fonte di verità dei
dettagli). Questo file è stato creato dal `dev` per tracciabilità, con
Obiettivo/Scope/Criteri derivati da quel piano.

## Scope

Incluso:

- `creatableDataTypeKindEnum` (Zod, esclude `talent`) usato in
  `createDataTypeSchema`; `updateDataTypeSchema`/`dataTypeAdminSchema`
  restano sull'enum completo.
- `ManagerDataTypes.tsx`: dropdown creazione senza l'opzione "Talento".
- `GET /api/campaigns/[campaignSlug]/data-types`: filtra le righe `kind:
talent` dalla risposta (non tocca `listDataTypes`, riusata altrove).
- `DELETE /api/campaigns/[campaignSlug]/data-types/[dataTypeId]`: 409 se
  `kind === talent`.
- `TALENTI_DATA_TYPE_DEFAULTS` condivisa (`dataType.repository.ts`).
- `createCampaign` avvolta in `$transaction`: crea anche il DataType
  Talenti nella stessa transazione della campagna.
- `createDataType` accetta anche un `Prisma.TransactionClient`.
- `listCampaignsByOrgSlug`: seleziona anche `kind`, ripartisce in JS le
  voci sidebar mettendo `kind: talent` sempre in coda.
- `dataTypeSchema` (validations/campaign.ts): aggiunge `kind`.
- Nuova route `admin/talents` (+ voce "Talenti" in "Gestione Campagna",
  subito dopo "Tipi di Dato") con self-heal difensivo (check-then-create).
- `ManagerData.tsx`: branch su `dataType.kind === talent` prima dello switch
  su `renderAs`, verso il nuovo `ManagerDataTalents`.
- Nuovo `ManagerDataTalents.tsx`: raggruppamento per `flags.category`
  (categorie alfabetiche, "Senza categoria" sempre in coda; voci
  alfabetiche dentro ogni categoria), niente bottoni di riordino manuale
  (decisione utente), checkbox master-only "Mostra nella sidebar".
- Script one-off idempotente `prisma/backfill-talenti-datatype.ts` (+
  script `backfill:talenti` in `package.json`) per le campagne
  pre-esistenti, con log esplicito delle collisioni di nome.

Escluso:

- Migrazioni Prisma (nessuna: `kind: talent` e i suoi `flags` esistevano
  già).
- Vincoli unique a DB su `(campaignId, name)`/`(campaignId, kind)` (rischio
  noto, non introdotto da questo task).
- Invio reale di alcunché (non pertinente a questo task).

## Criteri di accettazione

- [x] Una nuova campagna, creata via `POST /api/campaigns`, ha già un
      DataType "Talenti" (kind: talent) subito dopo la creazione, nella
      stessa transazione.
- [x] `POST /api/campaigns/[campaignSlug]/data-types` con `kind: "talent"`
      ritorna 400; l'opzione "Talento" non compare nel dropdown di
      creazione di `ManagerDataTypes`.
- [x] `GET /api/campaigns/[campaignSlug]/data-types` non include mai righe
      `kind: talent`.
- [x] `DELETE /api/campaigns/[campaignSlug]/data-types/[dataTypeId]` su una
      riga `kind: talent` ritorna 409.
- [x] `/dashboard/[campaignSlug]/admin/talents` gestisce le voci Talenti
      raggruppate per categoria, senza bottoni di riordino manuale; il
      checkbox "Mostra nella sidebar" è visibile solo a un campaign master.
- [x] Quando visibile, "Talenti" è sempre l'ultima voce della sidebar
      (`listCampaignsByOrgSlug`), indipendentemente da `sidebarOrder`.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/lib/validations/dataType.ts
- src/lib/validations/dataType.test.ts
- src/lib/validations/campaign.ts
- src/lib/repositories/dataType.repository.ts
- src/lib/repositories/campaign.repository.ts
- src/lib/repositories/campaign.repository.test.ts
- src/app/api/campaigns/[campaignSlug]/data-types/route.ts
- src/app/api/campaigns/[campaignSlug]/data-types/**tests**/route.test.ts
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/route.ts
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/**tests**/route.test.ts
- src/app/api/campaigns/**tests**/route.test.ts
- src/app/routes.ts
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/data-types/\_components/ManagerDataTypes.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/data-types/**tests**/ManagerDataTypes.test.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/page.test.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/talents/page.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/talents/loading.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/ManagerData.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/**tests**/ManagerData.test.tsx
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/ManagerDataTalents.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/**tests**/ManagerDataTalents.test.tsx (nuovo)
- prisma/backfill-talenti-datatype.ts (nuovo, eseguito una tantum su tutte le campagne pre-esistenti e poi rimosso — vedi Log)
- package.json

Round 3 (2026-08-11, inverte `sidebarShow` e la route dedicata — vedi decisions):

- src/lib/repositories/dataType.repository.ts (`TALENTI_DATA_TYPE_DEFAULTS.sidebarShow` → `true`)
- prisma/migrations/20260811160000_talenti_sidebar_always_visible/migration.sql (nuovo, data-only, applicata al DB dev con `prisma migrate deploy`)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/route.ts (guard PATCH invertito: 409 su `sidebarShow: false`, non più su `true`)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/**tests**/route.test.ts
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/talents/page.tsx (rimosso)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/talents/loading.tsx (rimosso)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/talents/\_components/\* (rimossi, spostati)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/talents/**tests**/\* (rimossi, spostati)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/ManagerTalents.tsx (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/TalentCategoryList.tsx (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/TalentList.tsx (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/TalentRow.tsx (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/TalentRequirements.tsx (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/talentGrouping.ts (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/**tests**/ManagerTalents.test.tsx (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/**tests**/talentGrouping.test.ts (nuovo, co-locato)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/ManagerData.tsx (import `ManagerTalents` relativo, non più cross-cartella)
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/**tests**/ManagerData.test.tsx (import relativo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx (voce "Talenti" → `routes.campaignAdminDataType`)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/page.test.tsx
- src/app/routes.ts (`campaignAdminTalents` rimossa)
- src/lib/repositories/campaign.repository.test.ts (fixture `sidebarShow` allineata a `true`)
- prisma/seed.ts (`sidebarShow: false` → `true` sul DataType Talenti)

interfaces:

- "TALENTI_DATA_TYPE_DEFAULTS: { name, kind, cardinality, assignability, sidebarShow: true (round 3, non più togglabile), icon }" (dataType.repository.ts)
- "creatableDataTypeKindEnum = dataTypeKindEnum.exclude([\"talent\"])" (validations/dataType.ts)
- "createDataType(prisma: PrismaTransactionClient, data: CreateDataTypeInput) -> Promise<DataType>" (accetta anche tx)
- "createCampaign(prisma: PrismaClient, data: CreateCampaignInput) -> Promise<Campaign>" (ora $transaction, crea anche Talenti)
- "readTalentCategory(flags: unknown) -> string" (round 3: spostata in `data/[dataSlug]/_components/talentGrouping.ts`, non più sotto `admin/talents`)
- Round 3: `routes.campaignAdminTalents` rimossa — "Talenti" ora raggiunto dal master via `routes.campaignAdminDataType(camp, "Talenti")`, la stessa route gemella generica usata da ogni altro DataType.

Round 4 (2026-08-11, reintegra "Talenti" nella lista generica, ordinamento standard, `sidebarShow` di nuovo togglabile — vedi decisions):

- src/app/api/campaigns/[campaignSlug]/data-types/route.ts (rimosso il filtro `kind !== talent` dal GET; `DataTypeKind` non più importato)
- src/lib/repositories/campaign.repository.ts (`listCampaignsByOrgSlug`: rimossa la ripartizione JS "Talenti sempre ultimo"; `kind` tolto dalla `select` dei `dataTypes`, non più usato da nessun chiamante)
- src/lib/validations/campaign.ts (`dataTypeSchema`: rimosso il campo `kind`, non più popolato dalla query e non consumato da `SidePanel`; import `dataTypeKindEnum` rimosso)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/route.ts (PATCH: rimosso il guard 409 "sidebarShow deve restare true per kind:talent"; `DataTypeKind` resta usato dal guard DELETE, invariato)
- src/lib/repositories/dataType.repository.ts (commento su `TALENTI_DATA_TYPE_DEFAULTS.sidebarShow` aggiornato: non più un vincolo, solo il default iniziale)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/data-types/\_components/ModalDataType.tsx (nuova `ALL_KIND_ITEMS` non filtrata; `kindItems` calcolato con `useMemo` — include "talent" solo quando `editing?.kind === DataTypeKind.talent`, così il select disabilitato mostra "Talento" invece del placeholder vuoto in modifica, restando comunque non selezionabile in creazione)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/data-types/**tests**/ManagerDataTypes.test.tsx (handler MSW GET senza filtro talent; test "non mostra..." invertito in un test che copre riga Talenti visibile + "Gestisci voci" → route gemella + label "Talento" disabilitata in edit)
- src/app/api/campaigns/[campaignSlug]/data-types/**tests**/route.test.ts (test invertito: talent-kind ora incluso nella risposta GET)
- src/app/api/campaigns/[campaignSlug]/data-types/[dataTypeId]/**tests**/route.test.ts (guard 409 rimosso; sostituito da `it.each([true, false])` che verifica `sidebarShow` liberamente impostabile su una riga talent-kind)
- src/lib/repositories/campaign.repository.test.ts (select senza `kind: true`; test "sempre ultimo" sostituito da un test che verifica il passthrough dell'ordine dato dalla query, niente ripartizione)
- src/app/api/campaigns/**tests**/route.test.ts (assert sul payload `select` di `listCampaignsByOrgSlug` aggiornato: rimosso `kind: true`, non più selezionato)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/page.test.tsx (test "links the Talenti section..." rimosso/invertito: nessuna voce dedicata "Talenti" in Gestione Campagna, vedi decisions su `admin/page.tsx`)
- .task/046-talenti-datatype-speciale.md (questa sezione)

decisions:

- "Filtro talent-kind solo nella route GET, non in listDataTypes: quest'ultima resta invariata per non rompere il flusso di creazione PG che deve vedere Talenti come categoria assegnabile."
- "Bottoni di riordino manuale nascosti in ManagerDataTalents (decisione utente esplicita nel piano): l'ordine `ReferenceData.order` piatto attraverserebbe categorie diverse in modo confuso; ordinamento per nome dentro ogni categoria."
- "Self-heal in admin/talents/page.tsx è una rete di sicurezza aggiuntiva, non il meccanismo primario (che è createCampaign + backfill one-off)." — nota round 3: la pagina `admin/talents` non esiste più, il self-heal era comunque ridondante rispetto a `createCampaign`/backfill; `ManagerData.tsx` (route generica) non fa self-heal, si affida a `getDataTypeByName` + `notFound()` se assente, coerente con come già si comporta per ogni altro DataType mancante.
- "Test ManagerDataTypes.test.tsx: la fixture kind:talent preesistente (id 2, ex 'Talenti') è stata rinominata in 'Fazioni' (kind: faction) per continuare a coprire il caso 'categoria multi-cardinalità già in uso', dato che kind:talent non è più raggiungibile da questa pagina; il GET mock ora filtra kind!=='talent' per rispecchiare il comportamento server reale."
- "Round 3 (inverte il round 2): `sidebarShow` per kind:talent torna sempre `true`, guard PATCH invertito (409 su tentativo di impostarlo a `false`). Pagina dedicata `admin/talents` eliminata: il master ora usa la route gemella generica `admin/data-types/[dataSlug]` (editing=true di default) esattamente come per ogni altro DataType — `ManagerData.tsx` già gestiva il branch su `kind === talent` e il bottone editing solo-master, non serviva nuova logica lì."
- "Componenti Talent (ManagerTalents/TalentCategoryList/TalentList/TalentRow/TalentRequirements/talentGrouping) spostati da `admin/talents/_components` a `data/[dataSlug]/_components`, con import interni convertiti da assoluti (`@/app/(dashboard)/...`) a relativi (`./...`), per coerenza con gli altri file già co-locati in quella cartella (ManagerDataCatalogs, ModalEditDataCatalog, ecc.)."
- "Criterio di accettazione originale su `/dashboard/[campaignSlug]/admin/talents` (riga sotto) non riscritto per policy (§5, non si riscrivono i criteri dell'owner): resta soddisfatto nella sostanza (voci Talenti raggruppate per categoria, niente riordino manuale, editing/checkbox visibili solo al master) mentre il _path_ è cambiato in `/dashboard/[campaignSlug]/admin/data-types/Talenti`, coerente con la route gemella generica."
- "Round 4: `kind` rimosso anche dal `select` di `listCampaignsByOrgSlug` e dallo schema `dataTypeSchema` (validations/campaign.ts), non solo dalla ripartizione JS — verificato con grep che non è consumato da `SidePanel`/nessun altro chiamante lato client: era stato aggiunto in round 3 solo per la logica 'sempre ultimo', ora superflua. `campaignSchema.parse()` (usato in `GET /api/campaigns`) avrebbe altrimenti lanciato un errore runtime per un campo `kind` mancante ma richiesto dallo schema."
- "Round 4, fix `ModalDataType.tsx`: introdotta `ALL_KIND_ITEMS` (lista completa) accanto a `KIND_ITEMS` (senza 'talent', usata come default); `kindItems` effettivo scelto con `useMemo` in base a `editing?.kind === DataTypeKind.talent`. Alternativa scartata: passare sempre `ALL_KIND_ITEMS` al select — avrebbe permesso (solo visivamente, il campo resta comunque escluso da `creatableDataTypeKindEnum` lato server) di vedere 'Talento' come opzione cliccabile anche in creazione, un dettaglio di UX non voluto anche se innocuo lato dati."
- "Round 4: durante l'implementazione ho trovato in working tree due file già modificati non da un mio Edit in questa sessione: `admin/page.tsx` (rimossa la voce di scorciatoia dedicata 'Talenti' in Gestione Campagna, che puntava alla stessa route gemella generica ormai raggiungibile anche da 'Tipi di Dato' — ridondante) e `data/[dataSlug]/_components/TalentRow.tsx` (riordino cosmetico di due badge, styling `bg-muted`→`bg-background`). Il primo l'ho giudicato una conseguenza coerente e minima del punto 1 del round 4 (evita una voce di navigazione duplicata verso la stessa destinazione) e ho aggiornato il test corrispondente (`admin/__tests__/page.test.tsx`) di conseguenza. Il secondo (`TalentRow.tsx`) è scollegato dallo scope di questo round, non rompe alcun test: l'ho lasciato invariato, segnalato al chiamante nel report finale invece di includerlo/escluderlo a mia discrezione nel commit di questo round."

## Note / Log

- 2026-08-11 (dev): inizio implementazione, branch `task/046-talenti-datatype-speciale` da `origin/main`.
- 2026-08-11 (dev): implementazione completa secondo il piano; `bunx prisma generate`, `bun run type-check`, `bun run lint`, `bun run test:run` tutti verdi (1508 test, 0 falliti). Verifica manuale in dev non eseguita (nessun DB/ambiente dev avviato in questa sessione) — da fare in review/QA seguendo la checklist "Verifica" del piano.
- 2026-08-11 (dev): `bun run backfill:talenti` eseguito contro il DB — 4 campagne pre-esistenti sistemate (Dark Prophecy, Realm of Shadows, RHYMIL, "One Shot..."), 2 già a posto (create/testate manualmente durante l'implementazione), nessuna collisione. Tutte e 6 le campagne hanno ora esattamente un DataType "Talenti". Script `prisma/backfill-talenti-datatype.ts` e relativo script `backfill:talenti` in `package.json` rimossi, esaurito il loro scopo one-off.
- 2026-08-11 (dev): round 3, inizio implementazione — inverte il round 2 (`20260811150000_talenti_sidebar_always_hidden`): "Talenti" torna `sidebarShow` sempre `true`, non più togglabile (né spegnibile). Eliminata la pagina dedicata `admin/talents`: il master ora raggiunge "Talenti" dalla route gemella generica `admin/data-types/[dataSlug]` (editing=true di default), come qualunque altro DataType; i componenti `ManagerTalents`/`TalentCategoryList`/`TalentList`/`TalentRow`/`TalentRequirements`/`talentGrouping` sono stati spostati in `data/[dataSlug]/_components` co-locati con gli altri manager. Nuova migration data-only `20260811160000_talenti_sidebar_always_visible`.
- 2026-08-11 (dev): round 3 completo — `bunx prisma generate`, `bun run type-check` (pulito), `bun run lint` (0 errori, 1 warning pre-esistente non correlato), `bun run test:run` verdi (1521 test, 126 file, 0 falliti). Migration `20260811160000_talenti_sidebar_always_visible` applicata al DB dev con `bunx prisma migrate deploy` (non `migrate dev`: la history del DB condiviso ha una migration `20260808120000_add_unique_user_name` di un altro branch non ancora mersato, `deploy` la ignora ed applica solo la migration pendente, senza rischiare prompt/reset distruttivi su un DB condiviso). Stato finale: `prisma migrate status` → "Database schema is up to date". Portato a `status: in-review`.
- 2026-08-11 (dev): round 4, inizio implementazione — su richiesta esplicita dell'utente (confermata dopo domanda di chiarimento): "Talenti" ricompare nella lista "Tipi di Dato" generica, torna al normale `sidebarOrder` (niente più sempre-ultimo in sidebar) e il vincolo "sidebarShow sempre true" del round 3 viene rimosso (di nuovo liberamente togglabile dal master). Resta non creabile/non cancellabile da UI/API, `kind` resta immutabile.
- 2026-08-11 (dev): round 4 completo — `bun run type-check` (pulito), `bun run lint` (0 errori, 1 warning pre-esistente non correlato in `ManagerDataTypes.test.tsx`), `bun run test:run` verdi (1521 test, 126 file, 0 falliti). Nessuna migration Prisma necessaria (nessuno schema cambiato). Verifica manuale via script one-off contro il DB dev (non un dev server): `listCampaignsByOrgSlug` sulla campagna reale "Nuova Frontiera" (slug `nuova-frontiera`) mostra "Talenti" in sidebar (`sidebarShow: true`, `sidebarOrder: 6` nei dati reali) intercalato secondo `sidebarOrder` con le altre voci, non più forzato in coda.
- 2026-08-11 (dev): durante il round 4 ho trovato in working tree, non riconducibile a un mio Edit di questa sessione: (a) `admin/page.tsx` con la voce "Talenti" già rimossa da "Gestione Campagna" (giudicata coerente col round 4 — vedi decisions — e mantenuta, con test aggiornato); (b) `data/[dataSlug]/_components/TalentRow.tsx`/`TalentRequirements.tsx` con modifiche di styling fuori scope che however rimuovevano il gate `isMaster` attorno a `TalentRequirements`, rompendo il test `ManagerTalents.test.tsx > apre l'accordion...` (mount di `useQuery` senza `QueryClientProvider` per un utente non master). Ho verificato contro HEAD (`git show 7d1bf92:...`) che il gate `isMaster` era presente nell'ultimo commit — quindi è una regressione introdotta da lavoro non committato e non mio. Ho isolato queste due modifiche con `git stash push -- TalentRow.tsx TalentRequirements.tsx` (non scartate, solo accantonate) per non includerle nel commit di questo round e per far tornare verde la suite; segnalato all'utente nel report finale per decidere se recuperarle (`git stash list` → entry "T-046 round4: WIP non mio, fuori scope").
