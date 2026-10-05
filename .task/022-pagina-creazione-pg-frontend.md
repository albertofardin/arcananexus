---
id: "022"
title: "Pagina creazione PG (frontend)"
status: done
priority: P1
assignee: ""
branch: task/022-pagina-creazione-pg-frontend
base: task/018-api-creazione-pg
trello: ""
created: 2026-07-13
updated: 2026-07-16
---

## Obiettivo

UI per creare un PG scegliendo le voci di catalogo della campagna, con validazione
di cardinalità, requisiti e **budget XP** (feedback soft; override visibile solo al
master).

## Scope

Incluso:

- Form (React Hook Form + Zod) che carica i `DataType`/`ReferenceData` disponibili e
  permette la selezione secondo cardinalità (`single` → radio/select, `multi` →
  multiselect).
- **Budget XP**: la razza scelta determina gli XP di partenza; ogni talento con `cost`
  scala il residuo mostrato in tempo reale; talenti `creationOnly` evidenziati.
- Requisiti non soddisfatti / XP insufficiente mostrati come warning; il master può
  forzare (override e sforo), il giocatore no.
- Submit → API T-018; copy IT; stati loading/error.
- Test componente (Testing Library + MSW).

Escluso:

- Editing di un PG esistente; workflow di approvazione completo.

## Criteri di accettazione

- [x] La selezione rispetta la cardinalità; requisiti mancanti e budget XP residuo
      mostrati; test.
- [x] L'override è disponibile solo al master; test.
- [x] Creazione end-to-end contro API mockata; `bun run type-check`,
      `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/(dashboard)/dashboard/[campaignSlug]/characters/new/page.tsx (riscritta:
  Server Component carica catalogo + calcola `isMasterOrAbove`, non usa più
  `CharacterEditor`)
- src/app/(dashboard)/\_components/CharacterCreationForm.tsx (nuovo, client)
- src/app/(dashboard)/\_components/**tests**/CharacterCreationForm.test.tsx (nuovo)
- src/lib/repositories/dataRequirement.repository.ts (+ `listRequirementsForCampaign`)
- src/lib/repositories/dataRequirement.repository.test.ts (+ test per la funzione sopra)

interfaces:

- "listRequirementsForCampaign(prisma: PrismaClient, campaignId: number) -> Promise<Pick<DataRequirement, 'id'|'definitionId'|'requiredDefinitionId'|'type'>[]>"
- "CharacterCreationForm({ campaignSlug, isMasterOrAbove, catalog: CatalogDataType[], requirements: CatalogRequirementEdge[] }) -> JSX.Element"
- "CatalogDataType { id, name, kind: DataTypeKind, cardinality: DataCardinality, description, icon, referenceData: CatalogReferenceDataItem[] }"
- "CatalogReferenceDataItem { id, name, description, flags: unknown }"
- "CatalogRequirementEdge { definitionId, requiredDefinitionId, type: 'requires'|'blocks' }"

decisions:

- "Caricamento catalogo per il giocatore ordinario: nessuna nuova route API pubblica.
  La Server Component di `new/page.tsx` chiama direttamente `listDataTypes` +
  `listReferenceDataForCampaign` (repository esistenti, T-016) e passa il risultato
  come prop al client component — coerente con 'Server Components di default' e con
  il pattern già in uso in questa stessa pagina (calcolo server-side di `isAdmin`)."
- "Player vede solo i `DataType` con `playerAssignable: true`; il master (isMasterOrAbove)
  vede l'intero catalogo, coerente col bypass che ottiene comunque lato server
  (`isMaster: true` passato al servizio in T-018)."
- "Anteprima live requisiti/XP: nessun riuso diretto di `evaluateRequirements` (T-017,
  legge `CharacterData` di un `character.id` esistente, non applicabile in creazione).
  Aggiunta `listRequirementsForCampaign` (nuova, con test) per caricare il grafo
  `DataRequirement` scopato alla campagna una sola volta; il form ricalcola
  client-side `missingRequires`/`blockingConflicts` contro il Set di selezione
  corrente (stessa forma/logica simmetrica di `blocks` di `evaluateRequirements`,
  duplicata qui perché lì opera su `CharacterData` persistite). L'enforcement reale
  resta il 422 del server al submit."
- "Requirement edges filtrati a runtime dalla Server Component a quelli con entrambi
  gli estremi nel catalogo visibile al viewer corrente: un requisito verso una voce
  non assegnabile dal giocatore (es. talento concesso solo dallo staff) non è comunque
  soddisfacibile in autonomia, e non se ne espone il nome lato player."
- "Override master: nessun flag esplicito nel payload (la route T-018 applica sempre
  `isMaster: isMasterOrAbove` in base al ruolo del chiamante). Il form quindi non
  disabilita il pulsante Salva per il master anche con warning attivi, ma lo blocca
  (soft, client-side, con toast) per il giocatore ordinario quando `!allSatisfied`
  — eccetto il vincolo 'una sola razza', bloccante per chiunque perché il server non
  lo bypassa mai."
- "Assegnazioni inviate come `{ referenceDataId }` senza `value`: lo scope del task
  copre scelte di catalogo semplici (razza/religione/talenti), non risposte
  free-form; `value` resta un'estensione futura del servizio (T-017) non necessaria
  qui."
- "Type del PG non inviato nel payload (sempre PG via default Prisma): questa pagina
  è dedicata alla creazione PG (titolo/scope del task), la scelta PG/PNG resta
  fuori — `CHARACTER_STAFF_ONLY_FIELDS` della route T-018 non include comunque
  `type`, quindi esporlo in UI avrebbe richiesto una decisione di scope aggiuntiva
  non coperta da questo task."

## Note / Log

- 2026-07-13 (owner): dipende da T-018 (API) e T-016 (catalogo da cui leggere le voci).
- 2026-07-13 (owner): redesign — voci = `ReferenceData`; aggiunto il budget XP guidato
  dalla razza + costi talenti.
- 2026-07-14 (owner): T-016/017/018/025 sono `done` ma le rispettive PR (#33, #36,
  #38, #34) non sono ancora mergiate in `main` — deroga esplicita al gating §12:
  sblocco T-022 stackando su `task/018-api-creazione-pg` (contiene già
  015+016+017+025+018 merged localmente), invece di attendere il merge in `main`.
  Worktree dedicato in `../core-task-022`. PR di T-022 andrà aperta con base
  `task/018-api-creazione-pg` (a cascata), da riallineare a `main` quando la catena
  015→018 verrà integrata.
- 2026-07-14 (dev): inizio implementazione, worktree `core-task-022`.
- 2026-07-14 (dev): implementato `CharacterCreationForm` (RHF+Zod) + riscritta
  `characters/new/page.tsx` come Server Component che carica il catalogo via
  repository esistenti e calcola `isMasterOrAbove`; aggiunta
  `listRequirementsForCampaign` (nuova, con test) per l'anteprima requisiti. 5
  test componente (Testing Library + MSW) su cardinalità/budget XP/override
  master. `bun run type-check`, `bun run lint`, `bun run test:run` verdi (863
  test, 71 file). Porto il task a `in-review`. Branch:
  `task/022-pagina-creazione-pg-frontend` (worktree `../core-task-022`), da
  verificare con `git log --oneline task/018-api-creazione-pg..HEAD` e
  `bun run test:run` sullo stesso worktree.
- 2026-07-15 (owner): verificato stato del task (worktree `../core-task-022`,
  frontmatter già coerente: `in-review`/`reviewer`). Nessun round di review
  ancora avvenuto. Preparato brief per il reviewer — round 1/3.
- 2026-07-15 (reviewer, round 1/3): **OK pulito**, nessun finding bloccante.
  Verifiche di persona: `type-check` verde, `lint` pulito, `test:run` 863/71
  verde (coincide col dichiarato dal dev). Criteri di accettazione tutti
  soddisfatti: cardinalità (FieldSelect single / BtnCheckbox multi, 2 test),
  budget XP (xpAvailable da razza, xpSpent da talenti, residuo live,
  creationOnly marcati), override master (authority server-side T-018, flag
  client solo UX non aggirabile, canSubmit = !tooManyRaces &&
  (isMasterOrAbove || allSatisfied), 2 test), submit end-to-end mockato via
  MSW. Verifiche mirate: nessuna route API pubblica nuova (catalogo scopato a
  campaignId via repository T-016, filtro playerAssignable server-side);
  requirement edges filtrati sia in `listRequirementsForCampaign` (scope
  campaignId) sia in defense-in-depth lato page; payload compatibile con
  `createCharacterWithCatalogSchema` (T-018), nessun rischio 400; niente
  doppio-submit (SaveBar in Portal, `disabled={saving}`). Note informative non
  ostative (follow-up opzionale, non bloccano l'integrazione): (1) badge
  costo/creationOnly mostrato solo per cardinalità multi, un talento
  single-cardinality con cost perderebbe XP senza badge; (2) talenti
  repeatable non esprimibili in creazione (gate server 409 non raggiungibile
  da qui, scelta di scope); (3) conflitto `blocks` mostrato due volte
  (simmetrico A↔B); (4) naming prop `isMasterView`→`isMasterOrAbove`; (5) test
  repository `dataRequirement.repository.test.ts` verifica solo shape
  where/select del mock, non filtraggio su dati reali (coerente con stile del
  file). Cautele di integrazione: PR stacked su `task/018-api-creazione-pg`
  (deroga §12 già annotata), riallineare a `main` a valle del merge 015→018,
  attenzione a conflitti su `dataRequirement.repository.ts`
  (`listRequirementsForCampaign` accanto al codice T-027) al rebase. Nessuna
  migrazione introdotta. Esito: procede verso QA/merge.
- 2026-07-15 (owner): integrato il verdetto del reviewer nel Log. Nessun
  finding bloccante da rigirare al dev — porto il task ad `assignee: qa`
  mantenendo `status: in-review` (criteri già verificati dal reviewer, manca
  la verifica indipendente QA prevista dal ciclo di vita §6.3 prima del
  merge). Preparato brief QA (vedi handoff §7 nel messaggio di consegna).
- 2026-07-16 (qa): verifica indipendente nel worktree `../core-task-022`.
  Eseguiti io stesso: `bun run type-check` (pulito), `bun run lint` (pulito),
  `bun run test:run` → **863 test, 71 file, tutti verdi** (combacia col
  dichiarato da dev/reviewer). Rieseguito isolatamente anche
  `CharacterCreationForm.test.tsx` (5/5 verdi). Criteri verificati leggendo
  il codice, non solo il Log:
  (1) cardinalità — `CharacterCreationForm.tsx`: `toggleSingle` sostituisce
  (rimuove tutte le voci del gruppo prima di aggiungere la nuova, dietro
  `FieldSelect`), `toggleMulti` accumula in un `Set` (dietro `BtnCheckbox`);
  budget XP (`xpAvailable` da `startingPx` della razza, `xpSpent` somma
  `cost` dei talenti, `xpRemaining` live) e requisiti mancanti/conflitti
  (`evaluateSelection`, sezione "Requisiti non soddisfatti") mostrati nella UI
  — confermato da test 1/2/3 del file component;
  (2) override master — verificato che l'autorità reale è lato server:
  `route.ts` (T-018) calcola `isMasterOrAbove` in modo indipendente dalla
  sessione (`isSuperAdmin`/`isUserCampaignMaster`), non fidandosi di alcun
  flag client, e lo passa come `isMaster` al servizio di assegnazione
  (bypassa requisiti/XP solo per master); lato form, `canSubmit =
!tooManyRaces && (isMasterOrAbove || allSatisfied)` blocca il submit (soft,
  con toast) per il giocatore quando i requisiti/XP non sono soddisfatti, ma
  non per il master — confermato dai test 3 (player bloccato, toast, nessun
  payload inviato) e 4 (master forza, payload inviato, redirect su successo);
  anche se un client malevolo aggirasse il check soft, il server applicherebbe
  comunque `RequirementsNotSatisfiedError`/`InsufficientXpError` in modo
  indipendente — nessun bypass reale possibile;
  (3) end-to-end contro API mockata — test 5 (`MSW`, selezione soddisfatta)
  verifica payload (`name`, `assignments` con `referenceDataId`) e redirect di
  successo; payload confrontato anche contro
  `createCharacterWithCatalogSchema` (T-018): campi (`name`, `background`,
  `printableNotes`, `assignments`) tutti presenti/validi nello schema
  `.strict()` lato server, nessun rischio di 400 per shape.
  Controlli aggiuntivi di QA (oltre alla review): (a) scoping campagna —
  `listDataTypes`/`listReferenceDataForCampaign`/`listRequirementsForCampaign`
  tutti filtrati per `campaignId` risolto da `getCampaignBySlug`, nessuna voce
  di un'altra campagna può comparire nel catalogo; (b) `git diff
task/018-api-creazione-pg..HEAD --stat` coerente con gli Artifacts
  dichiarati (nessun file non annotato); (c) test del repository
  `dataRequirement.repository.test.ts` per `listRequirementsForCampaign`
  verifica solo la shape della query verso il mock Prisma (where/select),
  non un filtraggio su dati reali — confermo la nota già loggata dal
  reviewer, non bloccante, coerente con lo stile esistente del file.
  Nessun difetto bloccante trovato. Verdetto: **criteri soddisfatti,
  verificati di persona** — spunto le 3 checkbox. Lascio `status: in-review`
  (spetta all'owner portarlo a `done`/aprire la PR).
- 2026-07-16 (owner): segna T-022 come done (review+QA puliti, deroga §12
  già a Log — stack su task/018).
- 2026-07-16 (owner): registra apertura PR #42 (stacked su #38) nel Log T-022.
