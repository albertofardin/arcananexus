---
id: "020"
title: "Sidebar dinamica guidata dai DataType (sezioni di campagna)"
status: done
priority: P1
assignee: ""
branch: task/020-sidebar-dinamica-datatype
base: task/026-visibilita-condizionale-registry
trello: ""
created: 2026-07-13
updated: 2026-07-16
---

## Obiettivo

La sidebar della campagna mostra le sezioni derivate dai `DataType`
(`showInSidebar`, `sidebarOrder`, `icon`); selezionando una sezione si vedono le
voci di catalogo (`ReferenceData`) di quel `DataType`, filtrate per visibilità
**server-side** (inclusa quella condizionale — vedi T-026).

## Scope

Incluso:

- Loader/read API server-side: elenco `DataType` con `showInSidebar` per campagna
  (ordinati per `sidebarOrder`) + `ReferenceData` della sezione, con enforcement
  visibilità (`hidden` visibile solo allo staff — vedi regola CLAUDE.md; visibilità
  condizionale delegata all'evaluator di T-026).
- Componente sidebar aggiornato a sezioni dinamiche (Server Component; `"use client"`
  solo per l'interazione).
- Pagina sezione che elenca le `ReferenceData` del `DataType` con `renderAs = catalog`.
- Copy IT; test dei loader e della visibilità.

Escluso:

- `renderAs = documents` / upload (T-021); editing del catalogo (T-016).

## Criteri di accettazione

- [x] La sidebar mostra solo i `DataType` con `showInSidebar`, ordinati; test.
- [x] Le `ReferenceData` `hidden` non sono esposte ai non-staff (filtraggio
      server-side); test di isolamento visibilità.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/lib/repositories/campaign.repository.ts — `listCampaignsByOrgSlug` ora
  filtra `dataTypes` per `showInSidebar: true`, li ordina per `sidebarOrder`
  (nulls last) poi `name`, e seleziona anche `icon`.
- src/lib/validations/campaign.ts — `dataTypeSchema` estesa con
  `icon: z.string().nullable()`.
- src/app/(dashboard)/\_components/SidePanel.tsx — usa `dt.icon ?? "folder_open"`
  invece dell'icona hardcoded.
- src/lib/repositories/character.repository.ts — nuova
  `getUserCharacterInCampaign(prisma, userId, campaignId)`.
- src/lib/repositories/characterData.repository.ts — **nuovo file**, minimale:
  `listOwnedCharacterDataInCampaign(prisma, campaignId, { userId, characterId? })`.
  Non è il repository completo di T-017 (assegnazione/cardinalità/override):
  solo la lettura che serve a costruire `VisibilityContext.ownedData`.
- **Fix finding bloccante round 1 (conteggio `dataTypes`)**: scelta l'opzione
  2 proposta dal reviewer (conteggio dedicato) invece della 1 (filtro lato
  `SidePanel`), perché `listCampaignsByOrgSlug` alimenta con una singola query
  sia `SidePanel` (via `useQueryCampaigns`, stessa cache TanStack Query) sia
  `CampaignsManager`: un campo `dataTypeCount` calcolato via `_count` nella
  stessa query evita di duplicare la query o di spostare la selezione
  `showInSidebar` fuori dal repository (che resta comunque corretta per la
  sidebar, dato che non è un dato sensibile — solo incompleta per chi la
  riusava come proxy del totale).
- src/lib/repositories/referenceData.repository.ts — nuova
  `listReferenceDataForDataType(prisma, dataTypeId)` (include
  `visibilityCondition`, a differenza di `listReferenceDataForCampaign` usata
  dalla route admin T-016 che non ne ha bisogno) + tipo
  `ReferenceDataWithVisibilityCondition`.
- src/lib/repositories/index.ts, src/lib/repositories/README.md — export/doc
  del nuovo `characterData.repository`.
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/page.tsx —
  **spostata** da `[campaignSlug]/[dataSlug]/` (vedi decisione "routing"
  sotto) e riscritta come Server Component reale: risolve
  campagna→DataType→visibilità server-side, `notFound()` se non applicabile.
- Test aggiunti/aggiornati: campaign.repository.test.ts,
  character.repository.test.ts, characterData.repository.test.ts (nuovo),
  referenceData.repository.test.ts,
  data/[dataSlug]/**tests**/page.test.tsx (nuovo, 15 casi: guard 401/404,
  showInSidebar/renderAs, visibilità hidden/staff/super-admin, visibilità
  condizionale T-026, ownedData wiring, empty state);
  src/app/api/campaigns/**tests**/route.test.ts aggiornato alla nuova shape
  della select `dataTypes`.
- (round 2, fix finding bloccante reviewer) src/lib/repositories/campaign.repository.ts
  — `listCampaignsByOrgSlug` seleziona anche `_count: { select: { dataTypes: true } }`
  e mappa il risultato aggiungendo `dataTypeCount` (totale reale, non filtrato)
  accanto a `dataTypes` (che resta filtrato/ordinato per sidebar).
- src/lib/validations/campaign.ts — `campaignSchema` estesa con
  `dataTypeCount: z.number().int().nonnegative()`; `EMPTY_INSTANCE` aggiornato.
- src/app/(dashboard)/\_components/CampaignsManager.tsx:207 — il badge "N tipi
  di dato" ora legge `campaign.dataTypeCount` invece di `campaign.dataTypes.length`.
- Test aggiornati/aggiunti: campaign.repository.test.ts (nuovo caso
  showInSidebar=2 su totale=5 → `dataTypeCount` resta 5),
  src/app/api/campaigns/**tests**/route.test.ts (select con `_count`, mock
  aggiornati con `_count.dataTypes`, nuovo caso di regressione sullo stesso
  scenario 2/5 a livello di risposta HTTP).

interfaces:

- `listCampaignsByOrgSlug(prisma, orgSlug)` → invariata nella firma, cambia
  solo la shape restituita per `dataTypes` (`{ name, icon }`, filtrati/ordinati).
- `getUserCharacterInCampaign(prisma: PrismaClient, userId: string, campaignId: number): Promise<Character | null>`
- `listOwnedCharacterDataInCampaign(prisma: PrismaClient, campaignId: number, owner: { userId: string; characterId?: number | null }): Promise<OwnedCharacterData[]>`
- `listReferenceDataForDataType(prisma: PrismaClient, dataTypeId: number): Promise<ReferenceDataWithVisibilityCondition[]>`

decisions:

- **Lookup slug→DataType**: nessun nuovo campo `slug` su `DataType`. Riuso
  `getDataTypeByName` (già case-insensitive) sul nome decodificato
  (`decodeURIComponent(dataSlug)`), esattamente come suggerito dal brief
  ("matchare per nome decodificato"). Più semplice del cambio di schema, e
  coerente con come `SidePanel`/`routes.campaignData` costruivano già il link
  passando `dt.name` grezzo.
- **Routing**: `routes.campaignData` produce già
  `/dashboard/${camp}/data/${dataName}` (letteral segmento `data/`), ma la
  pagina placeholder viveva in `[campaignSlug]/[dataSlug]/` (un solo segmento
  dinamico, senza il letterale `data`) — mismatch preesistente, la sidebar
  avrebbe linkato a un 404. Ho spostato la pagina in
  `[campaignSlug]/data/[dataSlug]/` per farla combaciare con l'helper
  esistente, invece di toccare `routes.ts`: evita anche collisioni future con
  altri segmenti letterali già usati sotto `[campaignSlug]` (`events`,
  `characters`, `settings`, `admin`) se un `DataType` si chiamasse come uno di
  quelli.
- **`ownedData` senza il repository T-017**: nuovo file
  `characterData.repository.ts` con una sola query mirata
  (`listOwnedCharacterDataInCampaign`), non l'intero servizio di assegnazione.
  Riusa il tipo `OwnedCharacterData` già esportato da `@/lib/visibility/types`
  (T-026) invece di ridefinirlo, per restare la stessa shape attesa da
  `filterVisible`. Owner matching: `userId` diretto OR `characterId` del
  personaggio del viewer nella campagna (`getUserCharacterInCampaign`, nuova
  funzione minimale anch'essa, stesso ordinamento di `listUserCharacters`:
  vivo/approvato/più recente prima).
- **Staff resolution**: `isStaff = isSuperAdmin(email) || isUserCampaignHelper(...)`
  (bypassa anche la condizione, coerente con `filterVisible`/T-026), pattern
  ripreso da `characters/new/page.tsx`.
- **`ReferenceData` con `visibilityCondition`**: non ho toccato
  `listReferenceDataForCampaign` (usata solo dalla route admin di gestione
  catalogo T-016, che non necessita della relazione risolta e ha test che
  assertano l'`include` esatto) — aggiunta invece una funzione dedicata
  `listReferenceDataForDataType` per non introdurre un include superfluo in
  un consumer che non lo usa.
- Nessuna modifica allo schema Prisma: tutti i campi (`showInSidebar`,
  `sidebarOrder`, `icon`, `renderAs`, `visibilityConditionId`) esistevano già
  da T-016.

## Note / Log

- 2026-07-13 (owner): dipende da T-016. La visibilità va valutata server-side, mai
  filtrata nel client (regola CLAUDE.md).
- 2026-07-14 (owner): per §13 del README, T-020 dipende anche da T-026 (evaluator
  di visibilità condizionale, appena passato dev→review→QA, PR #39 non ancora
  mergiata in `main`) oltre che da T-016 (PR #33, non mergiata). Deroga esplicita
  al gating §12: sblocco T-020 stackando su
  `task/026-visibilita-condizionale-registry` (contiene 015+016+026 mergiati
  localmente), invece di attendere il merge in `main`. Worktree dedicato in
  `../core-task-020`. PR di T-020 andrà aperta con base
  `task/026-visibilita-condizionale-registry` (a cascata), da riallineare a `main`
  quando la catena 015→016→026 verrà integrata.
- 2026-07-14 (dev): inizio implementazione, worktree `core-task-020`, branch
  `task/020-sidebar-dinamica-datatype` su base `task/026-...`.
- 2026-07-14 (dev): implementati loader server-side (sidebar filtrata/ordinata,
  pagina sezione reale con lookup DataType + `filterVisible`), repository
  minimale `characterData.repository.ts` per `ownedData`, e fix del mismatch
  di routing `[dataSlug]` → `data/[dataSlug]` (altrimenti 404 dietro al link
  già esistente in sidebar). `bun run type-check` / `bun run lint` /
  `bun run test:run` verdi (820 test, 0 falliti). Passo a `in-review`.
- 2026-07-14 (reviewer, round 1/3): **findings da correggere**, ritorno al dev.
  Bloccante: (🟠) `listCampaignsByOrgSlug` ora filtra `dataTypes` a
  `showInSidebar: true` per servire `SidePanel`, ma la stessa funzione/query
  React alimenta anche `CampaignsManager.tsx:207`
  (`campaign.dataTypes.length` → "N tipi di dato" nella gestione admin
  campagne) — una campagna con 5 DataType di cui 2 `showInSidebar` ora mostra
  "2 tipi di dato" invece di 5: regressione silenziosa, non coperta da test.
  Proposta reviewer: o togliere il `where` da `listCampaignsByOrgSlug`
  (selezionando anche `showInSidebar`/`sidebarOrder`) e filtrare/ordinare lato
  `SidePanel` (showInSidebar non è un dato sensibile, filtro client
  accettabile qui a differenza della visibilità), oppure dare a
  `CampaignsManager` il conteggio reale via un campo/query dedicato
  (es. `_count.dataTypes`). Aggiungere un test che fissi il conteggio.
  Non bloccanti (💡, a discrezione): commento in
  `[campaignSlug]/layout.tsx:3` menziona ancora `[dataSlug]` invece di
  `data/[dataSlug]` dopo lo spostamento; commento in
  `character.repository.ts:90-99` descrive un ordinamento leggermente diverso
  da quello reale (bozza prima di approvato quando entrambi vivi — coerente
  con `listUserCharacters` ma la prosa del commento è fuorviante).
  Confermato invece: fix di routing corretto (bug preesistente, non introdotto
  dal dev), visibilità sempre server-side (nessuna lista grezza pre-filtro al
  client), `isStaff`/tenant-scoping coerenti col resto del repo, 404 corretti,
  separazione `listReferenceDataForDataType`/`listReferenceDataForCampaign`
  corretta. Type-check/lint/test:run rieseguiti indipendentemente dal
  reviewer: verdi (820/820).
- 2026-07-15 (owner): verificato stato del task (worktree `../core-task-020`,
  frontmatter già coerente con l'esito del reviewer). Round 1/3 chiuso con
  findings, tetto §9 non raggiunto. Preparato brief per il dev — round 2/3:
  fix del solo finding bloccante (regressione conteggio `dataTypes` in
  `CampaignsManager.tsx` per il filtro `showInSidebar` introdotto in
  `listCampaignsByOrgSlug`), con test di conferma. I due punti non bloccanti
  (💡 commenti disallineati) sono a discrezione del dev, non richiesti per
  passare la review.
- 2026-07-15 (dev): fix del finding bloccante round 1 — `listCampaignsByOrgSlug`
  ora seleziona anche `_count: { select: { dataTypes: true } }` e ritorna
  `dataTypeCount` (totale reale) accanto a `dataTypes` (che resta filtrato per
  `showInSidebar`, invariato per `SidePanel`); `campaignSchema` esteso con
  `dataTypeCount`; `CampaignsManager.tsx:207` legge `dataTypeCount` invece di
  `dataTypes.length`. Aggiunto test di regressione allo scenario esatto del
  reviewer (5 DataType totali, 2 `showInSidebar`) sia in
  `campaign.repository.test.ts` sia in `route.test.ts` (risposta HTTP),
  più aggiornamento dei mock esistenti che ora richiedono `_count.dataTypes`
  (altrimenti il parsing Zod di `campaignSchema` fallirebbe senza il campo).
  `bun run type-check` / `bun run lint` / `bun run test:run` verdi (822/822,
  +2 rispetto al round 1). Non toccati i due punti non bloccanti (fuori
  scope di questo round). Passo a `in-review` per il round 2/3.
- 2026-07-15 (reviewer, round 2/3): **OK pulito**. Verificato di persona
  (non solo lettura del Log): `dataTypeCount` è il totale reale non filtrato
  — `_count: { select: { dataTypes: true } }` in `campaign.repository.ts:78`
  è un campo top-level distinto dalla relazione `dataTypes` che porta il
  `where: { showInSidebar: true }` (righe 70-77); mapping (righe 83-86)
  estrae `_count.dataTypes` in `dataTypeCount` e rimuove `_count` dalla
  shape, coerente con lo schema Zod e col test. `SidePanel.tsx` senza
  regressioni (usa `dataTypes` filtrata, non tocca `dataTypeCount`).
  `CampaignsManager.tsx:207` legge `dataTypeCount`, badge singolare/plurale
  corretto. Test asseriscono lo scenario reale 5 vs 2 (non solo presenza
  campo): `campaign.repository.test.ts:284-286` e `route.test.ts:295-296`.
  Grep su tutto `src/` per `dataTypes.length`: unica occorrenza residua è
  un commento in `campaign.repository.ts:59`, nessun altro consumer rotto.
  Cifre riconfermate indipendentemente: type-check verde, lint verde,
  test:run 822/822 (70 file). Note non bloccanti: i due punti 💡 del round 1
  (commenti disallineati in `layout.tsx:3` e `character.repository.ts:90-99`)
  erano fuori scope di questo round per brief dell'owner, non ri-sollevati.
  Cautele di integrazione: PR stacked su `task/026-visibilita-condizionale-registry`
  (catena 015→016→026 non ancora in `main`, deroga §12 già a Log), da
  riallineare a cascata al merge; nessuna migrazione Prisma introdotta;
  nuovo campo obbligatorio `dataTypeCount` in `campaignSchema` (cambio di
  shape del contratto `/api/campaigns`) senza consumer esterni nel repo.
  Round 2/3 chiuso senza findings. Prossimo passo: QA.
- 2026-07-15 (owner): integrato verdetto reviewer round 2/3 (OK pulito) nel
  Log. Status resta `in-review`, `assignee: qa` — prossimo passo è la
  verifica QA dei criteri di accettazione (checkbox ancora da spuntare).
- 2026-07-15 (qa): **verifica indipendente, nessun difetto bloccante.**
  Rieseguiti di persona `bun run type-check` (pulito), `bun run lint`
  (pulito), `bun run test:run` → **822/822 test, 70 file, tutti verdi**
  (confermato lo stesso numero dichiarato dal dev/reviewer). Letto il codice
  (non solo il Log) per ciascun criterio:
  1. `showInSidebar`/ordinamento: confermato in
     `campaign.repository.ts:70-78` (`where: { showInSidebar: true }`,
     `orderBy: [{ sidebarOrder: { sort: "asc", nulls: "last" } }, ...]`),
     coperto da `campaign.repository.test.ts:221` ("should scope campaigns
     to the organization slug and only include sidebar-visible dataTypes,
     ordered by sidebarOrder").
  2. Visibilità `hidden` server-side: letta
     `data/[dataSlug]/page.tsx` — Server Component (nessuna direttiva
     `"use client"`), `isStaff` calcolato server-side
     (`isSuperAdmin || isUserCampaignHelper`), `entries` grezze mai passate
     al client: solo `visibleEntries` (esito di `filterVisible`, valutato
     interamente sul server) raggiunge il JSX. Coperto da 4 test dedicati in
     `data/[dataSlug]/__tests__/page.test.tsx` ("hides `hidden`
     ReferenceData from a non-staff viewer", "shows ... to a staff viewer",
     "shows ... to the super-admin even without a campaign grant",
     "resolves conditional visibility (T-026) via the viewer's ownedData").
  3. Gate verdi confermati sopra.
     Verificato anche, senza necessità di nuovi test (giudicato già
     sufficientemente coperto dai test esistenti): la fix della regressione
     round 2 (`dataTypeCount` reale vs `dataTypes` filtrata) resta verde
     (`campaign.repository.test.ts:268`); nessuna occorrenza residua di
     `dataTypes.length` come proxy del totale fuori da un commento
     (`campaign.repository.ts:59`); scoping multi-tenant di
     `getCampaignBySlug`/`getDataTypeByName`/`listReferenceDataForDataType`
     tutti su `campaign.id` risolto da slug+org, coerente col resto del repo
     (nessun test cross-campagna dedicato in questa pagina, ma nessuna nuova
     superficie non scopata introdotta). Le 3 checkbox dei criteri sono state
     spuntate solo dopo aver visto passare le prove sopra in prima persona.
     I due punti 💡 non bloccanti del reviewer (commenti disallineati) restano
     follow-up cosmetici, non toccati. **Verdetto: pronto per il merge**, nessun
     ulteriore giro dev/review necessario.
- 2026-07-16 (owner): segna T-020 come done (review+QA puliti, deroga §12
  già a Log — stack su task/026).
- 2026-07-16 (owner): registra apertura PR #41 (stacked su #39) nel Log T-020.
