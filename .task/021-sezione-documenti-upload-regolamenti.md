---
id: "021"
title: "Sezione documenti (Regolamenti): upload e download gestiti dal master"
status: done
priority: P1
assignee: ""
branch: task/021-sezione-documenti-upload-regolamenti
base: task/020-sidebar-dinamica-datatype
trello: ""
created: 2026-07-13
updated: 2026-07-16
---

## Obiettivo

Per i `DataType` con `renderAs = documents` (es. "Regolamenti"), il master carica
documenti; ogni voce di catalogo (`ReferenceData`) ha `name` = titolo mostrato e un
link di download; i giocatori scaricano.

## Scope

**Storage: UploadThing** (deciso). `description` resta il testo umano; l'URL del
documento vive nel campo dedicato `ReferenceData.fileUrl` (aggiunto in T-015).

Incluso:

- Integrazione UploadThing: file router server-side + componente di upload,
  upload consentito solo al master (head_master/master). Env: `UPLOADTHING_TOKEN`
  (aggiungere a `.template_env`).
- Su upload: creare/aggiornare la `ReferenceData` con `name` = titolo e
  `fileUrl` = URL restituito da UploadThing; conservare la file key per la delete.
- Rendering sezione `documents` (`renderAs = documents`): elenco scaricabili;
  delete file → rimozione anche su UploadThing; controllo ruolo; scoping multi-tenant.
- Test.

Escluso:

- Versioning dei documenti; storage alternativi (R2/Blob) — rivalutabili se si
  superano i limiti del free tier UploadThing.

## Criteri di accettazione

- [x] Il master carica / sostituisce / elimina un documento in un `DataType`
      `documents`; test ruolo (non-master → 403).
- [x] La voce mostra titolo + link; il giocatore scarica; test.
- [x] La delete rimuove il file anche su UploadThing (non solo la `ReferenceData`); test.
- [x] `UPLOADTHING_TOKEN` documentato in `.template_env`; `bun run type-check`,
      `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- prisma/schema.prisma — `ReferenceData.fileKey String?` (nuovo campo,
  accanto a `fileUrl`): la chiave del file su UploadThing, distinta dall'URL,
  serve a `utapi.deleteFiles` per la delete lato storage. Migrazione
  `prisma/migrations/20260716090407_add_reference_data_file_key/` applicata
  sul Neon dev DB (`.env` copiato dal worktree principale, non versionato).
- src/lib/repositories/types.ts,
  src/lib/repositories/referenceData.repository.ts — `fileKey` propagato in
  `Create/UpdateReferenceDataInput` e nelle rispettive query Prisma
  (create/update), stesso trattamento di `fileUrl`.
- src/lib/validations/referenceData.ts — `fileKey` aggiunto ai campi
  editabili (non esposto da un form dedicato, ma persistibile dalla PATCH
  generica di catalogo se mai servisse).
- src/lib/authorization.ts — nuova `isUserCampaignMaster` (guardia master ⊇
  head_master, analoga a `isUserCampaignAdmin` ma soglia `Role.master`);
  nuova `requireCampaignMasterBySlug`, che condivide con
  `requireCampaignAdminBySlug` un helper interno estratto
  (`requireCampaignRoleBySlug`) — stesso identico flusso di
  risoluzione/errore, cambia solo il ruolo richiesto.
- src/lib/documentUpload.ts — **nuovo file**: logica di autorizzazione
  (`authorizeDocumentUpload`) e persistenza (`applyDocumentUpload`)
  dell'upload documenti, estratta dal file router UploadThing perché
  testabile senza toccare l'SDK/il protocollo (niente account/token reale in
  questo ambiente). `applyDocumentUpload` riceve `deleteFile` iniettato
  (mai `utapi` importato direttamente lì) per restare isolata dall'SDK nei
  test.
- src/lib/validations/documentUpload.ts — **nuovo file**: `documentUploadInputSchema`
  Zod, l'`.input()` del file router (`campaignSlug`, `dataTypeId`, `title`,
  `referenceDataId` opzionale per la sostituzione).
- src/lib/uploadthing.ts — **nuovo file**: singleton server `UTApi` (stesso
  pattern del singleton Prisma in `src/lib/db.ts`).
- src/lib/uploadthing-client.ts — **nuovo file**: helper client
  (`useUploadThing`) da `generateReactHelpers<OurFileRouter>()`, con un
  wrapper esplicito su `startUpload` (vedi decisione "bug SDK/strictNullChecks"
  sotto).
- src/app/api/uploadthing/core.ts, src/app/api/uploadthing/route.ts —
  **nuovi file**: file router UploadThing (`documentUploader`) e route
  handler standard (`createRouteHandler`). Wrapper sottili: la logica reale
  è in `src/lib/documentUpload.ts`.
- src/app/api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/document/route.ts
  — **nuovo file**: `DELETE` dedicata ai documenti (permesso master, non
  head_master-only come la DELETE generica di catalogo), scopata a
  `renderAs = documents`; cancella il file su UploadThing (best-effort) poi
  la `ReferenceData`.
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/page.tsx —
  estesa (non più `notFound()` per `renderAs = documents`): calcola
  `isDocuments`/`isMaster` e renderizza `DocumentsManager` per i `DataType`
  documenti, mantenendo invariato il ramo `catalog` di T-020.
- src/app/(dashboard)/dashboard/[campaignSlug]/data/[dataSlug]/\_components/DocumentsManager.tsx
  — **nuovo file** (client): elenco documenti con link di download per tutti;
  per `isMaster` mostra upload (titolo + file), sostituzione per-voce e
  delete con conferma (`Modal`, stesso pattern di `BtnUser.tsx`).
- Test nuovi/aggiornati: `authorization.test.ts` (`isUserCampaignMaster`,
  `requireCampaignMasterBySlug`), `referenceData.repository.test.ts`
  (`fileKey` in create/update), `prisma-fixtures.ts` (`fileKey: null` nel
  default di `mockReferenceData`), `documentUpload.test.ts` (nuovo, 13 casi:
  autorizzazione 401/404/403/ok-master/ok-super-admin/ok-head_master,
  scoping multi-tenant su `dataType`/`referenceData`, creazione vs
  sostituzione, cleanup file precedente best-effort), `document/route.test.ts`
  (nuovo, 10 casi: 401/403 non-master/204 master/400 id/404
  inesistente/404 wrong-renderAs/cleanup UploadThing prima della delete/
  cleanup fallito non blocca/nessuna fileKey→nessuna chiamata/405 sui verbi
  non supportati), `page.test.tsx` (7 nuovi casi "Documents rendering":
  non-notFound, prop `documents` filtrate per visibilità, `isMaster` per
  master/supporter/super-admin, empty state con manager comunque visibile).
- .template_env — documentata `UPLOADTHING_TOKEN`.
- package.json/bun.lock — aggiunte dipendenze `uploadthing@7.7.4`,
  `@uploadthing/react@7.3.3`.

interfaces:

- `isUserCampaignMaster(prisma: PrismaClient, userId: string, campaignId: number): Promise<boolean>`
- `requireCampaignMasterBySlug(prisma, headers, campaignSlug, orgSlug): Promise<CampaignAdminAccess>`
- `authorizeDocumentUpload(prisma: PrismaClient, params: { userId: string | null; userEmail: string | null; campaignSlug: string; dataTypeId: number; title: string; referenceDataId?: number }): Promise<DocumentUploadAuthResult>`
  dove `DocumentUploadAuthResult = { ok: true; context: DocumentUploadContext } | { ok: false; status: number; message: string }`.
- `applyDocumentUpload(prisma: PrismaClient, context: DocumentUploadContext, file: { url: string; key: string }, deleteFile: (fileKey: string) => Promise<unknown>): Promise<ReferenceData>`
- `ourFileRouter.documentUploader` (UploadThing `FileRouter`, endpoint unico) —
  `.input(documentUploadInputSchema)`, autorizzazione in `.middleware()`,
  persistenza in `.onUploadComplete()`.
- `DELETE /api/campaigns/:campaignSlug/reference-data/:referenceDataId/document`
  → 204 (master/head_master/super-admin), 400/403/404 altrimenti.

decisions:

- **`fileKey` come nuovo campo Prisma**, non derivato dall'URL: più robusto
  di un parsing dell'URL (che dipende dal formato esatto delle risposte
  UploadThing) e coerente con l'indicazione del brief ("conservare la file
  key per la delete").
- **Permesso "master" (head_master ⊇ master), non "head_master" come le altre
  route di gestione catalogo (T-016)**: `isUserCampaignMaster`/
  `requireCampaignMasterBySlug` sono nuovi, distinti da
  `isUserCampaignAdmin`/`requireCampaignAdminBySlug` (head_master-only): il
  brief richiede esplicitamente "solo al master (head_master/master)" per i
  documenti, un privilegio più ampio di quello usato per la gestione
  catalogo generica. Non ho toccato le route/guardie esistenti (già
  reviewate/QAte in T-016/T-020): nuova guardia, nuova route dedicata
  (`.../document/route.ts`), invece di allargare il perimetro di quelle
  esistenti.
- **Route DELETE dedicata ai documenti**, non riuso della DELETE generica di
  `reference-data/[referenceDataId]` (head_master-only, con anche il check
  dipendenti del grafo requisiti T-027): i documenti non fanno parte del
  grafo prerequisiti e hanno un privilegio diverso (master), quindi una route
  separata evita di allargare il perimetro autorizzativo/di controllo di
  quella esistente. La cancellazione del file su UploadThing è best-effort
  (log ma non blocca la delete della riga, stesso approccio della cleanup
  avatar in `characters/[id]/avatar/route.ts`).
- **Upload via UploadThing file router**, non un endpoint REST dedicato:
  l'autorizzazione/persistenza vive comunque in funzioni pure testabili
  (`src/lib/documentUpload.ts`), il file router (`core.ts`) resta un wrapper
  sottile. Nessun test colpisce realmente il protocollo/endpoint UploadThing
  (nessun account/token reale in questo ambiente, come da nota dell'owner):
  la copertura è sulla logica estratta, non sull'SDK.
- **Bug di inferenza generica dell'SDK sotto `strictNullChecks: false`**:
  `useUploadThing(...).startUpload` di `@uploadthing/react` sceglie la firma
  dei parametri con un condizionale `undefined extends inferEndpointInput<...>
? ... : ...`; con `strictNullChecks: false` (questo progetto, vedi
  `tsconfig.json`) `undefined` risulta assegnabile a qualunque tipo, quindi
  quel condizionale risolve sempre al ramo "opzionale" e TypeScript rifiuta
  un `input` reale come "non assegnabile a `undefined`" — falso positivo
  dell'SDK sotto questa configurazione specifica, non un problema dei
  chiamanti. Isolato con un wrapper tipato esplicitamente in
  `src/lib/uploadthing-client.ts` (un solo cast, documentato lì), invece di
  spargere `as any`/`as unknown` nel componente UI.
- **`DocumentUploadContext` come `type`, non `interface`**: l'oggetto
  restituito da `.middleware()` deve essere strutturalmente assegnabile a
  `ValidMiddlewareObject` di UploadThing (che ha un indice
  `[key: string]: unknown`); un alias con literal type riceve un indice
  implicito in quel confronto, un'`interface` no (richiederebbe un indice
  esplicito, che romperebbe `keyof`/`Omit` a valle in `onUploadComplete` e
  farebbe collassare i campi tipati al solo indice generico). Vedi commento
  nel file.
- **Discriminante `ok: true`/`ok: false`**: seguito il pattern già presente
  in `authorization.ts` (`CampaignAdminAccess`) — narrowing sempre con
  `result.ok === false`, mai `!result.ok`: sotto `strictNullChecks: false`
  di questo progetto, `!result.ok` non narrowa il discriminante booleano
  (bug noto di TS con null checks disattivati), mentre il confronto esplicito
  con il literal funziona. Non è una scelta di stile: `!result.ok` in
  `src/app/api/uploadthing/core.ts` falliva realmente il type-check.
- **Visibilità di default `visible` alla creazione**: un documento appena
  caricato è pensato per essere scaricabile subito dai giocatori (il caso
  d'uso "Regolamenti"); il master può comunque nasconderlo in seguito con la
  PATCH generica di `ReferenceData` (stessa regola di visibilità di
  T-020/T-026, non duplicata qui).
- **Nessuna modifica alle route/test di T-016/T-020 già reviewate**: solo
  estensioni additive (guard in `page.tsx` allargata da "solo catalog" a
  "catalog o documents", nuova guardia in `authorization.ts` come funzione
  aggiuntiva).

## Note / Log

- 2026-07-13 (owner): `blocked` sulla scelta dello storage upload. Dipende da T-020
  (rendering sezione). Sblocco = decisione infra dell'utente.
- 2026-07-13 (owner): decisione presa → **UploadThing** (free tier, DX Next.js).
  URL su campo dedicato `ReferenceData.fileUrl` (aggiunto in T-015), non su `description`.
  Status `blocked → todo`.
- 2026-07-13 (owner): redesign — i documenti sono `ReferenceData` (catalogo), non `Data`.
- 2026-07-16 (owner): T-020 (rendering sezione) è `done` (PR #41, non ancora mergiata
  in `main`) — sblocco T-021 stackando su `task/020-sidebar-dinamica-datatype`
  (deroga §12, stesso pattern di T-017/018/019/020/022/026). Worktree dedicato in
  `../core-task-021`. Nessun `UPLOADTHING_TOKEN` presente in `.env`/`.template_env`:
  il dev userà mock del SDK UploadThing nei test (coerente con MSW/vi.mock già in uso
  per altri servizi esterni), e documenterà la variabile in `.template_env` come
  richiesto dai criteri — configurare un account reale resta fuori scope.
- 2026-07-16 (dev): implementati upload/sostituzione/delete documenti (UploadThing) con
  logica di autorizzazione/persistenza estratta e testata in isolamento
  (`src/lib/documentUpload.ts`, mai contro l'SDK reale), nuova guardia
  `isUserCampaignMaster`/`requireCampaignMasterBySlug` (permesso master, non solo
  head_master), nuovo campo `ReferenceData.fileKey` (migrazione applicata su Neon dev
  DB), route DELETE dedicata ai documenti, ed estensione di `data/[dataSlug]/page.tsx`
  con `DocumentsManager` (client) per il rendering `renderAs = documents`. Vedi
  `## Artifacts` per il dettaglio, incluse due decisioni tecniche non banali forzate da
  `strictNullChecks: false` di questo progetto (narrowing `=== false` non `!x.ok`, tipo
  di contesto middleware come `type` non `interface`) e un workaround isolato per un
  falso positivo di `@uploadthing/react` sotto la stessa configurazione. Verifiche:
  `bun run type-check` (0 errori), `bun run lint` (0 problemi), `bun run test:run` (861
  test, 72 file, tutti verdi — nessuna regressione). Spuntati tutti e 4 i criteri di
  accettazione (visti passare con test dedicati). Branch
  `task/021-sezione-documenti-upload-regolamenti` (worktree `../core-task-021`,
  stackato su `task/020-sidebar-dinamica-datatype`): verificabile con `git log` sul
  branch e rieseguendo le tre verifiche sopra. Porto lo status a `in-review`.
- 2026-07-16 (reviewer, round 1/3): **OK pulito**, nessun finding bloccante. Verifiche
  indipendenti confermate: type-check 0 errori, lint 0 problemi, test:run 861/72 verdi
  (combacia col dichiarato dal dev). Confermati di persona: scoping multi-tenant su
  upload (`authorizeDocumentUpload`, doppio check dataTypeId/campaignId) e su delete
  (`getReferenceDataByIdScoped` + `renderAs === documents`); gerarchia ruoli corretta
  (supporter escluso, master e head_master ammessi, testato); nessuna regressione su
  `requireCampaignAdminBySlug`/T-016/T-020 dal refactor `requireCampaignRoleBySlug`;
  cleanup file best-effort (log, non blocca) sia in delete sia in sostituzione;
  migrazione `fileKey` additiva/nullable; visibilità `visible` di default intenzionale
  e filtrata server-side (`filterVisible` prima di `DocumentsManager`); le due
  decisioni `strictNullChecks: false` applicate coerentemente (nessun `!x.ok`
  residuo). Findings 💡 non bloccanti (a discrezione, non richiesti per QA): (1)
  ordine delete file→riga in `document/route.ts` lascia un `fileUrl` rotto se la
  delete DB fallisce dopo la delete file (consiglio: invertire l'ordine, coerente col
  flusso di sostituzione che cancella prima la riga); (2) `startUpload` non
  memoizzato in `uploadthing-client.ts` (micro-perf); (3) accept-list server
  (`core.ts`) più larga (`blob` 16MB) dell'intento client (pdf/txt); (4) file orfano
  possibile se `onUploadComplete` lancia dopo che UploadThing ha già salvato (inerente
  all'SDK, fuori scope). Cautele di integrazione: merge dopo T-020 (conflitti attesi
  su `page.tsx`); migrazione da propagare agli altri ambienti; `UPLOADTHING_TOKEN` non
  configurato in questo ambiente (deciso). Round 1/3 chiuso senza findings bloccanti.
  Prossimo passo: QA.
- 2026-07-16 (owner): integrato il verdetto del reviewer (OK pulito) nel Log. Nessun
  finding bloccante da girare al dev — i 4 punti 💡 restano follow-up opzionali, non
  richiesti per l'integrazione (stesso trattamento di T-020/T-022). Porto il task ad
  `assignee: qa` mantenendo `status: in-review` — prossimo passo la verifica
  indipendente QA prima del merge.
- 2026-07-16 (qa): **verifica indipendente eseguita nel worktree `core-task-021`**.
  Rieseguiti io stesso `bun run type-check` (0 errori), `bun run lint` (0 problemi),
  `bun run test:run` (861 test, 72 file, tutti verdi — numeri confermati). Verificati
  di persona i 4 criteri leggendo codice + test (non solo il Log):
  (1) `src/lib/documentUpload.ts` (`authorizeDocumentUpload`/`applyDocumentUpload`) e
  `document/route.ts` (DELETE dedicata) — scoping multi-tenant confermato
  (`getCampaignBySlug` → `getDataTypeByIdScoped`/`getReferenceDataByIdScoped` sempre
  con `campaign.id`, mai per id nudo), 403 per supporter/non-master confermato sia in
  `documentUpload.test.ts` che in `document/__tests__/route.test.ts`
  ("returns 403 when the caller is only a supporter"), gerarchia
  head_master ⊇ master ⊇ supporter confermata via `ROLE_RANK` in `authorization.ts` e
  relativi test (`isUserCampaignMaster`/`requireCampaignMasterBySlug`, inclusi i casi
  head_master-passa/supporter-nega). (2) `DocumentsManager.tsx`: titolo (`document.name`)
  - pulsante "Scarica" che apre `document.fileUrl`; `page.tsx` filtra server-side con
    `filterVisible` prima di passare le entry al componente client (nessuna voce nascosta
    esposta); confermato in `page.test.tsx` ("Documents rendering (T-021)", 7 casi:
    non-notFound, filtro visibilità, isMaster per master/supporter/super-admin, empty
    state con manager visibile per master). (3) Delete rimuove il file anche su
    UploadThing: `utapi.deleteFiles(referenceData.fileKey)` prima della `deleteReferenceData`
    in `document/route.ts`, best-effort (try/catch, log ma non blocca) — confermato dai
    test "deletes the file on UploadThing before deleting the ReferenceData row" e "still
    deletes... when the UploadThing cleanup fails". Edge case fileKey invariata in
    sostituzione: `applyDocumentUpload` salta la cleanup quando
    `previousFileKey === file.key`, con test dedicato
    ("does not attempt cleanup when the new file has the same key as the previous one")
    — verificato passare. (4) `UPLOADTHING_TOKEN` documentato in `.template_env` (righe
    16-19, con commento che spiega provenienza/uso). Migrazione
    `20260716090407_add_reference_data_file_key` presente e coerente con
    `prisma/schema.prisma` (`fileKey String?` su `ReferenceData`) — non ho verificato lo
    stato del DB Neon reale (nessun tool Neon disponibile in questa sessione, vedi nota
    sotto). Nessuna regressione sulla route generica di catalogo (resta
    `requireCampaignAdminBySlug`, head_master-only, invariata) né sulla suite di
    isolamento multi-tenant (`multi-tenant-isolation.test.ts`, inclusa nei 72 file verdi).
    Sul finding 💡 #1 del reviewer (ordine delete file→riga in `document/route.ts`): concordo
    che non sia bloccante — se la `deleteReferenceData` fallisse dopo la cancellazione
    riuscita del file, resterebbe una riga con `fileUrl`/`fileKey` punta-a-file-cancellato
    (link rotto per i giocatori) fino al prossimo retry della delete (che, essendo il
    cleanup file idempotente/best-effort, si autoripara al secondo tentativo). È un
    degrado transitorio di UX in uno scenario raro (fallimento DB dopo cleanup riuscito),
    non una perdita di dati né un problema di sicurezza/multi-tenancy: confermo la
    valutazione del reviewer, resta un follow-up opzionale per il dev/owner, non un
    motivo per bloccare il merge. Non ho toccato i 4 punti 💡 (già valutati dal
    reviewer come non bloccanti, coerente col trattamento di T-020/T-022).
    **Verdetto: pronto per merge.** Lascio `status: in-review` (decisione di portarlo a
    `done` spetta all'owner).
- 2026-07-16 (owner): segna T-021 come done (review+QA puliti, deroga par.6 come
  T-016 — stack su task/020).
- 2026-07-16 (owner): registra apertura PR #43 (stacked su #41) nel Log T-021.
