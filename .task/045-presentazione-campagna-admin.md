---
id: "045"
title: "Sezione admin 'Presentazione' campagna: logo, copertina, descrizione, galleria"
status: done
priority: P1
assignee: ""
branch: task/045-presentazione-campagna-admin
base: main
trello: ""
created: 2026-07-31
updated: 2026-08-19
---

## Obiettivo

Dare all'head_master di una campagna una pagina admin per curare come la
campagna si presenta: logo, immagine di copertina, descrizione testuale e una
galleria di immagini (max 5), tutte salvate come URL pubblici pronti per un
futuro consumo dal sito vetrina (fuori scope qui).

## Scope

Incluso:

- Nuovi campi `Campaign.logo`/`logoKey`/`coverImage`/`coverImageKey` +
  modello `CampaignImage` (galleria, max 5 enforced in autorizzazione).
- Tre endpoint UploadThing (`campaignLogoUploader`, `campaignCoverUploader`,
  `campaignGalleryUploader`) con moduli `authorize*`/`apply*` dedicati,
  stesso contratto di `avatarUpload.ts`/`documentUpload.ts`.
- Repository (`campaign.repository.ts`) per logo/cover/galleria.
- Route `DELETE` per rimuovere logo/cover/singola immagine di galleria.
- Nuova pagina admin `admin/presentazione` (solo per head_master, guard
  ereditato da `admin/layout.tsx`) con upload/rimozione immagini +
  form descrizione (riusa `PUT /api/campaigns/[campaignSlug]` esistente).
- Collegamento da `admin/page.tsx` (converti il placeholder "Presentazione"
  in sezione reale) e nuova rotta in `routes.ts`.
- Test per repository, `authorize*`, route `DELETE` (limiti max 5 inclusi).

Escluso:

- Sito vetrina pubblico (`src/app/(front)/`) e `middleware.ts`: nessuna
  esposizione pubblica di questi dati in questo task, solo URL
  "potenzialmente pubblici" salvati senza gate di visibilità aggiuntivo.
- Qualunque meccanismo di `DataVisibility`/`VisibilityCondition` su questi
  campi (non pertinente, sono a livello `Campaign`, non `Data`).

## Criteri di accettazione

- [x] Un head_master carica/sostituisce/rimuove logo e copertina della
      propria campagna dalla nuova pagina admin; un non-head_master non può
      (403 lato API, guard ereditato lato UI); test su `authorize*` e route
      `DELETE`.
- [x] Un head_master modifica la descrizione della campagna dalla stessa
      pagina (via `PUT /api/campaigns/[campaignSlug]` esistente, nessuna
      nuova route per il testo).
- [x] Un head_master carica fino a 5 immagini in galleria, rimuovibili
      singolarmente; il 6° upload viene rifiutato con errore leggibile
      (autorizzazione conta le esistenti + le nuove); test sul limite.
- [x] `bun run type-check`, `bun run lint` verdi; `bun run test:run` verde
      (1460/1460, 122 file di test, nessun fallimento — vedi Log).

## Artifacts

files_modified:

- prisma/schema.prisma (`Campaign.logo`/`logoKey`/`coverImage`/`coverImageKey`, nuovo modello `CampaignImage`)
- prisma/migrations/20260730225554_campaign_presentation/migration.sql (applicata al DB dev Neon in `.env`)
- src/lib/repositories/campaign.repository.ts (+ `updateCampaignLogo`, `updateCampaignCover`, `listCampaignImages`, `countCampaignImages`, `addCampaignImage`, `getCampaignImageById`, `removeCampaignImage`)
- src/lib/repositories/campaign.repository.test.ts (+ test per le funzioni sopra)
- src/lib/repositories/types.ts (+ `UpdateCampaignLogoInput`, `UpdateCampaignCoverInput`, `CreateCampaignImageInput`)
- src/lib/repositories/README.md (indice aggiornato con le nuove funzioni)
- src/lib/campaignImageUpload.ts (nuovo — helper WebP condivisi da logo/cover/galleria)
- src/lib/campaignLogoUpload.ts (nuovo, + test)
- src/lib/campaignCoverUpload.ts (nuovo, + test)
- src/lib/campaignGalleryUpload.ts (nuovo, + test)
- src/lib/validations/campaignPresentationUpload.ts (nuovo — `campaignPresentationImageUploadInputSchema`, `campaignPresentationSchema`, `MAX_CAMPAIGN_GALLERY_IMAGES=5`, `CAMPAIGN_IMAGE_WEBP_QUALITY`)
- src/lib/queries/campaignPresentation.ts (nuovo — `useQueryCampaignPresentation`)
- src/lib/uploadthing-client.ts (+ overload `useUploadThing` per `campaignLogoUploader`/`campaignCoverUploader`/`campaignGalleryUploader`)
- src/app/api/uploadthing/core.ts (+ 3 endpoint `campaignLogoUploader`/`campaignCoverUploader`/`campaignGalleryUploader`)
- src/app/api/campaigns/[campaignSlug]/logo/route.ts (nuovo, DELETE, + test)
- src/app/api/campaigns/[campaignSlug]/cover/route.ts (nuovo, DELETE, + test)
- src/app/api/campaigns/[campaignSlug]/gallery/[imageId]/route.ts (nuovo, DELETE, + test)
- src/app/api/campaigns/[campaignSlug]/presentation/route.ts (nuovo, GET, + test — vedi decisione sotto)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/presentation/page.tsx (nuovo, Server Component)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/presentation/\_components/PresentationManager.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/presentation/\_components/LogoUpload.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/presentation/\_components/CoverUpload.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/presentation/\_components/GalleryManager.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/presentation/\_components/useCampaignImageUpload.ts (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx (placeholder "Presentazione" → `AdminSectionRow` reale, rimossa `AdminSectionPlaceholderRow` ormai inutilizzata)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/**tests**/page.test.tsx (+ test link Presentazione)
- src/app/routes.ts (+ `campaignAdminPresentation`)
- src/test/helpers/prisma-fixtures.ts (+ `logo`/`logoKey`/`coverImage`/`coverImageKey` su `mockCampaign`, nuova `mockCampaignImage`)

interfaces:

- "updateCampaignLogo(prisma, campaignId: number, { logo: string|null, logoKey: string|null }) -> Promise<Campaign>"
- "updateCampaignCover(prisma, campaignId: number, { coverImage: string|null, coverImageKey: string|null }) -> Promise<Campaign>"
- "listCampaignImages(prisma, campaignId: number) -> Promise<CampaignImage[]>"
- "countCampaignImages(prisma, campaignId: number) -> Promise<number>"
- "addCampaignImage(prisma, campaignId: number, { url, key, order }) -> Promise<CampaignImage>"
- "getCampaignImageById(prisma, id: number, campaignId?: number) -> Promise<CampaignImage|null>"
- "removeCampaignImage(prisma, id: number) -> Promise<CampaignImage>"
- "authorizeCampaignLogoUpload(prisma, { userId, userEmail, campaignSlug }) -> {ok:true, context:{campaignId, previousLogoKey}} | {ok:false, status, message}"
- "applyCampaignLogoUpload(prisma, context, file:{url,key}, deleteFile) -> Promise<Campaign>"
- "authorizeCampaignCoverUpload / applyCampaignCoverUpload — stessa firma, per `coverImage`/`coverImageKey`"
- "authorizeCampaignGalleryUpload(prisma, { userId, userEmail, campaignSlug, newFilesCount }) -> {ok:true, context:{campaignId}} | {ok:false, status, message} — rifiuta se esistenti+newFilesCount > 5"
- "applyCampaignGalleryUpload(prisma, context:{campaignId}, file:{url,key}) -> Promise<CampaignImage> — order = countCampaignImages corrente"
- "GET /api/campaigns/[campaignSlug]/presentation -> {description, logo, coverImage, images:[{id,url,order}]} (head_master/super-admin, sola lettura)"
- "DELETE /api/campaigns/[campaignSlug]/logo|cover -> {url:null} (head_master/super-admin)"
- "DELETE /api/campaigns/[campaignSlug]/gallery/[imageId] -> 204 (head_master/super-admin, scoped a campagna)"
- "routes.campaignAdminPresentation(camp: string) -> string"

decisions:

- "segmento URL inglese `admin/presentation` (non `presentazione`, nonostante il path letterale nel brief): tutte le altre sotto-sezioni admin (`roles`, `data-types`, `characters`, `actions`, `features`) usano segmenti inglesi con label italiane in UI — verificato leggendo `routes.ts` prima di scegliere, come richiesto esplicitamente dal brief."
- "nuova route di sola lettura `GET /api/campaigns/[campaignSlug]/presentation`, non riabilitato `GET` sull'endpoint esistente `/api/campaigns/[campaignSlug]` (quel `GET` è esplicitamente 405, con un test dedicato `route.test.ts` che lo asserisce — riabilitarlo avrebbe rotto un contratto testato). Stesso precedente già stabilito in T-030 per `GET .../visibility-conditions`: additiva, sola lettura, stessa guardia head_master (`requireCampaignAdminBySlug`) delle altre route di gestione campagna."
- "colonne `logoKey`/`coverImageKey` dedicate su `Campaign` (pattern `ReferenceData.fileKey`), non extraction da URL come per `User.image`/`Character.avatar` (`extractUploadThingKey`) — deciso a monte nel brief, confermato applicabile senza modifiche."
- "helper di conversione WebP (fast-path client già-WebP + round-trip server di fallback) estratti in un nuovo modulo condiviso `src/lib/campaignImageUpload.ts`, riusato dai tre moduli `authorize*`/`apply*` di logo/cover/galleria: i tre casi sono la stessa identica operazione ('carica un'immagine di presentazione, normalizza a WebP'), a differenza di avatar/documento che restano moduli indipendenti nel resto del repo (domini diversi). Nessuna modifica ad `avatarUpload.ts` esistente."
- "tutti e tre gli endpoint immagine di `core.ts` (`campaignLogoUploader`/`campaignCoverUploader`/`campaignGalleryUploader`) restituiscono `{ url }` da `onUploadComplete` (non `{ logo }`/`{ coverImage }`): permette ai widget client di leggere `serverData.url` senza sapere quale endpoint hanno chiamato, ed evita un round-trip di refetch per riflettere l'esito in UI (vedi `useCampaignImageUpload`)."
- "tetto galleria enforced in `authorizeCampaignGalleryUpload` sommando le immagini già presenti (`countCampaignImages`) e `files.length` del batch corrente (disponibile nel `.middleware()` di UploadThing, non solo nell'`.input()`): un batch multi-file che sfonderebbe il tetto è rifiutato per intero (400, messaggio IT), prima che UploadThing avvii l'upload dei singoli file."
- "`useCampaignImageUpload` (client) non chiama `useUploadThing` al proprio interno: gli overload di `useUploadThing` (`src/lib/uploadthing-client.ts`) richiedono un endpoint letterale per la risoluzione del tipo, non una union — `LogoUpload`/`CoverUpload` chiamano `useUploadThing` con il proprio endpoint letterale e passano `startUpload`/`isUploading` già risolti all'hook condiviso (che gestisce solo conversione client/limiti/rimozione, endpoint-agnostico)."
- "`PresentationManager` tiene lo stato via TanStack Query (`useQueryCampaignPresentation`, stesso pattern di `DataTypesManager`/`FeaturesManager`), non Server Component + props: aggiorna la cache con `queryClient.setQueryData` dopo upload/rimozione di logo/copertina (URL già noto da `serverData.url`, nessun round-trip) e con `refetch()` per la galleria (batch multi-immagine, più semplice rileggere la lista intera)."
- "descrizione: nessuna nuova route, riusa `PUT /api/campaigns/[campaignSlug]` esistente (`updateCampaignSchema` accetta già `{description}` da solo, il `.refine` su 'almeno un campo' è soddisfatto) — verificato leggendo `route.ts` prima di scrivere, come richiesto dal brief."

## Note / Log

- 2026-07-31 (dev): inizio implementazione. Brief ricevuto direttamente
  dall'owner (non da Trello), file `.task/045-...` creato da me per tracciare
  lo stato secondo convenzione. Letto codice di riferimento
  (`AvatarUpload.tsx`, `avatarUpload.ts`, `documentUpload.ts`,
  `uploadthing/core.ts`, `authorization.ts`, `campaign.repository.ts`,
  `routes.ts`, `admin/page.tsx`) prima di scrivere: repo usa una libreria UI
  "core" custom (non shadcn/ui come genericamente descritto nel profilo
  agente) e non ha più il segmento `org/[orgSlug]` nelle rotte (organizzazione
  singola, `ARCANA_DOMINE_SLUG`) — seguo lo stato reale del codice, non le
  assunzioni del brief dove divergono. `GET /api/campaigns/[campaignSlug]` è
  esplicitamente 405 (testato): serve una nuova route di sola lettura per
  popolare la pagina admin, vedi decisione sotto.
- 2026-07-31 (dev): schema Prisma aggiornato (`Campaign.logo`/`logoKey`/
  `coverImage`/`coverImageKey`, nuovo modello `CampaignImage`);
  `bunx prisma migrate dev --name campaign_presentation` eseguita con
  successo contro il DB dev Neon già configurato in `.env` (nessun problema
  di raggiungibilità in questo ambiente); `bunx prisma generate` eseguito.
- 2026-07-31 (dev): implementati i tre moduli `authorize*`/`apply*`
  (`campaignLogoUpload.ts`/`campaignCoverUpload.ts`/`campaignGalleryUpload.ts`,
  autorizzazione via `isSuperAdmin`/`isUserCampaignAdmin`, stessa soglia
  head_master di `canManageCampaign` in `api/campaigns/[campaignSlug]/
route.ts`), gli endpoint UploadThing in `core.ts`, il repository esteso, e
  le route `DELETE` logo/cover/gallery (+ `GET .../presentation`, sola
  lettura, vedi decisione). Implementazione completata.
- 2026-07-31 (dev): implementata la UI admin
  (`admin/presentation/page.tsx` + `_components/`, TanStack Query, riuso di
  `convertImageFileToWebp` da `AvatarUpload.tsx` e di `HeroBanner` per la
  copertina), collegata da `admin/page.tsx` (placeholder → sezione reale) e
  `routes.ts`. `bun run type-check` e `bun run lint` verdi;
  `bun run test:run` → 122 file di test, 1460/1460 verdi (nessun
  fallimento pre-esistente né nuovo). Task lasciato in `in-review` (non
  porto a `done` da solo, come da istruzioni ricevute) — pronto per
  handoff a review/QA. Nessun problema bloccante riscontrato: né migrazione
  DB né nomi di helper di autorizzazione sono divergenti dalle ipotesi del
  brief, salvo le due divergenze già segnalate sopra (assenza di
  `org/[orgSlug]`, libreria UI "core" invece di shadcn/ui) e le decisioni
  aggiuntive in `## Artifacts > decisions` (route `GET .../presentation`
  nuova, segmento URL `presentation` invece di `presentazione`).
- 2026-08-19 (owner): riconciliazione board vs realtà del codice. Il ciclo
  formale reviewer/qa non risulta mai girato su questo file (nessun
  verdetto registrato dopo l'ultima riga del dev sopra), ma la feature è
  verificata presente a HEAD di `main` (schema `CampaignImage`/`logo*`/
  `coverImage*`, tre endpoint UploadThing, repository, route `DELETE`
  logo/cover/gallery, `GET .../presentation`, pagina
  `admin/presentation/`) ed è stata mergiata via PR: commit `04b7726`
  "Merge pull request #61 from arcanadomine/task/045-presentazione-campagna-admin"
  in `main`. Dopo il merge l'utente ha continuato a lavorarci direttamente
  su `main` (commit `1c0eff4` "PresentationManager", `60c1094`
  "refactoring PresentationManager"), quindi il codice è consolidato,
  rifattorizzato e in uso — il ciclo di review a posteriori su codice già
  superato dai fatti non verrebbe riaperto formalmente. Porto `status` a
  `done` per riflettere lo stato reale; `assignee` svuotato. Non ho
  ri-eseguito `bun run test:run` in questa riconciliazione: l'ultima
  esecuzione verde nota nel Log (1460/1460) precede il merge e i commit di
  refactoring successivi, che restano fuori dallo scope di questa nota.
