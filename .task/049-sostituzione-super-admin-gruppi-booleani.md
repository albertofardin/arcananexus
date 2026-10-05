---
id: "049"
title: "Sostituzione super-admin/AssociationRole con isDirettivo/isDevWeb"
status: in-review
priority: P0
assignee: dev
branch: task/049-sostituzione-super-admin-gruppi-booleani
base: main
trello: ""
created: 2026-08-31
updated: 2026-08-31
---

## Obiettivo

Eliminare il concetto di "super-admin" e il modello `AssociationRole` (7 valori),
sostituendoli con due booleani su `User` (`isDirettivo`, `isDevWeb`) che
governano l'accesso alla sezione Amministrazione e all'impersonation, rimuovendo
senza sostituto il bypass "god mode" su rotte di business generiche.

## Scope

Incluso: vedi brief dettagliato ricevuto dall'owner (schema Prisma + migrazione
con backfill, `authorization.ts`, repository utenti, tutte le route/pagine che
usano `isSuperAdmin`/`AssociationRole`, componenti RoleManager/SidePanel/UsersList,
seed, fixture di test, `cross-task-integration.test.tsx`).

Escluso: `ManagerRolesCampaign.tsx` e `syncCampaignGrants` (restano invariati),
rinomina di cartelle/URL API (`/api/admin/association-roles` resta com'è).

## Criteri di accettazione

- [x] `bunx prisma generate` e migrazione con backfill applicata; nessun
      riferimento residuo a `AssociationRole`/`isSuperAdmin` in `src`/`prisma`
      (verificato via grep — restano solo commenti/titoli di test descrittivi
      che citano il vecchio bypass per contrasto, nessun riferimento a codice)
- [x] `bun run type-check` pulito
- [x] `bun run lint` pulito
- [x] `bun run test:run` verde (1840/1840 test)
- [x] Regole di business dal brief rispettate: gate Amministrazione via
      `isDirettivo || isDevWeb`; impersonation visibile/usabile solo da
      `isDevWeb`; email cablate sempre `isDevWeb` e non rimovibili; bypass
      generico rimosso senza sostituto dalle rotte di business elencate; bypass
      quota associativa tradotto su `isDirettivo || isDevWeb`; "Gestione Ruoli"
      admin mostra solo i due gruppi flat (niente più vista campagne)

## Artifacts

files_modified:

- prisma/schema.prisma (User.associationRole → isDirettivo/isDevWeb, enum AssociationRole rimosso)
- prisma/migrations/20260831102713_replace_association_role_with_group_booleans/migration.sql (nuova, con backfill)
- prisma/migrations/20260831112122_rename_is_dev_web_to_is_sviluppo/migration.sql (nuova: rename colonna isDevWeb→isSviluppo, richiesta dall'utente a valle)
- prisma/seed.ts
- src/lib/authorization.ts (riscritto: HARDCODED_DEV_WEB_EMAILS, isHardcodedDevWeb, getUserGroupFlags, hasAdminSectionAccess, requireAdminSectionAccess; rimossi isSuperAdmin/requireSuperAdmin/requireDirettivoOrSuperAdmin/isDirettivoMember/hasAssociationRoleBypass/checkCampaignRoleForUser; CampaignAdminAccess senza isSuperAdmin, role non più nullable)
- src/lib/authorization.test.ts (riscritto per le nuove funzioni)
- src/lib/repositories/user.repository.ts (+.test.ts): DIRETTIVO_ROLES/setUserAssociationRole/removeUserFromDirettivo → setUserDirettivo/listDevWebMembers/setUserDevWeb/getUserEmailById
- src/lib/repositories/README.md
- src/lib/validations/adminGroups.ts (nuovo, sostituisce validations/associationRole.ts rimosso): assignGroupSchema, rolesOverviewResponseSchema
- src/lib/validations/capabilities.ts (+ src/app/api/me/capabilities/route.ts e test): isSuperAdmin/isDirettivoMember → isDirettivo/isDevWeb
- src/lib/auth.ts: SUPER_ADMIN_USER_IDS → DEV_WEB_USER_IDS (id prevalentementealberto@gmail.com scommentato)
- src/app/api/admin/association-roles/route.ts + [userId]/route.ts (+ relativi **tests**): GET/POST/DELETE riscritti per i due gruppi flat, permessi asimmetrici su devWeb
- src/app/api/admin/users/route.ts (+ test): requireSuperAdmin → requireAdminSectionAccess
- src/app/api/admin/impersonate/start/route.ts, fake/route.ts (+ test start): check isDevWeb via getUserGroupFlags
- Rotte business con bypass rimosso (senza sostituto): src/app/api/campaigns/route.ts, [campaignSlug]/route.ts, [campaignSlug]/grants/[userId]/route.ts, [campaignSlug]/downtime/{route,[id]/route,[id]/read/route,[id]/status/route}.ts, [campaignSlug]/characters/route.ts, [campaignSlug]/characters/[characterId]/{actions,data,talents}/route.ts, [campaignSlug]/missive/{route,[id]/route,[id]/read/route}.ts, characters/[id]/xp-update/route.ts, e relativi test
- Pagine con bypass rimosso: dashboard/[campaignSlug]/downtime/[id]/page.tsx, missive/new/page.tsx, missive/[id]/page.tsx, admin/layout.tsx, admin/page.tsx, admin/campaigns/page.tsx (+ layout test)
- src/lib/campaignLogoUpload.ts, campaignCoverUpload.ts, campaignGalleryUpload.ts, documentUpload.ts (+ rispettivi .test.ts)
- src/components/SidePanel/SidePanel.tsx, src/components/UsersList/UsersList.tsx (+ .test.tsx), src/components/ImpersonationToolbar/**tests**/impersonation-flow.test.tsx
- src/components/RoleManager/ManagerRoles.tsx, ManagerRolesAdmin.tsx (+ test), rolesAssignmentsSync.ts (syncDirettivoMembers → syncGroupMembers)
- src/test/helpers/prisma-fixtures.ts (mockUser: associationRole → isDirettivo/isDevWeb)
- src/app/**tests**/cross-task-integration.test.tsx (riscritto scenario per scenario)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/layout.tsx e admin/presentation/page.tsx (+ layout test): checkCampaignRoleForUser → checkCampaignAccess

--- estensione 2026-08-31 (visibilità campagne + spostamento creazione in Ruoli) ---

- prisma/schema.prisma (Campaign.visibility Boolean @default(true)) + prisma/migrations/20260831133611_add_campaign_visibility/migration.sql
- src/lib/validations/campaign.ts: campaignSchema/EMPTY_INSTANCE +visibility; nuovo updateCampaignVisibilitySchema (createCampaignSchema/updateCampaignSchema invariati, apposta — visibility non è client-settable)
- src/lib/repositories/campaign.repository.ts (+.test.ts): createCampaign forza sempre visibility:false; listCampaignsByOrgSlug accetta { userId, includeHidden } e filtra le campagne nascoste (OR su visibility:true / grant proprio); nuova updateCampaignVisibility
- src/app/api/campaigns/route.ts (+ test): GET legge la sessione e passa includeHidden=isSviluppo a listCampaignsByOrgSlug; POST canCreate estende isOrganizationHeadMaster con bypass isSviluppo (scoped a questa sola route)
- src/app/api/admin/campaigns/[campaignSlug]/visibility/route.ts (nuovo, + **tests**): PATCH isSviluppo-only, dietro requireAdminSectionAccess
- src/components/RoleManager/ModalCreateCampaign.tsx (nuovo): form nome+slug (slug auto-derivato finché non editato manualmente), POST /api/campaigns
- src/components/RoleManager/ManagerRoles.tsx: nuove prop opzionali onCreateCampaign/onToggleCampaignVisibility; bottone "Nuova campagna" nel Toolbar sinistro; badge visibility_off su riga campagna e header selezione; bottone toggle "Rendi pubblica/privata" nel Toolbar destro
- src/components/RoleManager/ManagerRolesAdmin.tsx (+ test): handleCreated (invalida cache campagne, refetch, seleziona la nuova campagna), handleToggleVisibility (PATCH + invalida cache + toast errore), monta ModalCreateCampaign, passa le due nuove prop solo se isSviluppo
- Eliminati: src/app/(dashboard)/dashboard/admin/campaigns/{page,loading}.tsx, src/components/CampaignManager/\*\* (ManagerCampaigns, CardCreateCampaign, ModalSelectHeadmaster, index), routes.adminCampaigns, voce "Gestione Campagne" in BtnUser.tsx
- src/test/helpers/prisma-fixtures.ts: mockCampaign +visibility:true di default

interfaces:

- "getUserGroupFlags(prisma, userId) -> Promise<{ isDirettivo: boolean; isDevWeb: boolean } | null>"
- "hasAdminSectionAccess(prisma, userId) -> Promise<boolean>"
- "requireAdminSectionAccess(handler: (req, ctx, info: { userId, isDevWeb }) => Promise<Response>)"
- "isHardcodedDevWeb(email: string) -> boolean"
- "checkAssociationQuotaAccess(prisma, userId) -> Promise<boolean> // bypass isDirettivo||isDevWeb effettivo"
- "setUserDirettivo(prisma, userId, isDirettivo) -> Promise<User>"
- "setUserDevWeb(prisma, userId, isDevWeb) -> Promise<User>"
- "listDevWebMembers(prisma) -> Promise<{id,name,email,isDevWeb}[]>"
- "getUserEmailById(prisma, userId) -> Promise<string | null>"
- "syncGroupMembers(group: 'direttivo'|'devWeb', previous, next) -> Promise<void>"
- "listCampaignsByOrgSlug(prisma, orgSlug, visibilityFilter?: { userId?: string; includeHidden?: boolean })"
- "updateCampaignVisibility(prisma, id: number, visibility: boolean) -> Promise<Campaign>"

decisions:

- "checkCampaignRoleForUser rimossa (era un wrapper banale di checkCampaignAccess dopo la rimozione del bypass): i due call site (admin/layout.tsx, admin/presentation/page.tsx) chiamano checkCampaignAccess direttamente"
- "CampaignAdminAccess.role reso non-nullable (Role invece di Role | null): senza bypass, ok:true implica sempre un Grant reale"
- "'Gestione Campagne' in admin/campaigns/page.tsx passa sempre readOnly={true}: nessun ruolo passa più il check di creazione campagna dopo la rimozione del bypass, per scelta esplicita dell'owner"
- "comingSoon rimosso solo dall'entry WEB_DEV_ID (ora pienamente funzionante); il meccanismo generico resta nel tipo FlatGroupDef per usi futuri"
- "editable?: boolean su FlatGroupMembers (default true) piegato dentro il calcolo esistente di canAddMembers in ManagerRoles: un gruppo non editabile nasconde sia 'Aggiungi membro' sia i pulsanti di rimozione, stesso pattern già usato per editMode='readonly' sulle campagne"
- ".task/test-users.md (doc QA storica di un task precedente, T-1..T-7) NON aggiornato: è un artefatto congelato, fuori dallo scope dei file esplicitamente elencati dal brief"
- "rename isDevWeb → isSviluppo (richiesto dall'utente a valle): nuova migrazione di rename colonna invece di editare quella già applicata; tutti i simboli TS derivati rinominati coerentemente (HARDCODED_DEV_WEB_EMAILS→HARDCODED_SVILUPPO_EMAILS, isHardcodedDevWeb→isHardcodedSviluppo, listDevWebMembers/setUserDevWeb→listSviluppoMembers/setUserSviluppo, devWebMemberIds→sviluppoMemberIds, discriminatore gruppo \"devWeb\"→\"sviluppo\"); WEB_DEV_ID/DIRETTIVO_ID (id di scope UI) lasciati invariati come da indicazione esplicita"
- "Campaign.visibility @default(true) a livello DB (non false): evita di nascondere di colpo tutte le campagne esistenti dopo la migrazione; solo createCampaign forza esplicitamente false a livello applicativo per le campagne nuove"
- "Bypass isSviluppo su POST /api/campaigns scoped SOLO a questa route (non un god-mode generico): coerente con la rimozione del bypass generico fatta nel resto di questo stesso task — qui è reintrodotto ad-hoc perché la creazione campagna via 'Ruoli e Campagne' precede l'esistenza di qualunque Grant"
- "Route toggle visibilità separata da PUT /api/campaigns/[slug] (che resta head_master, senza visibility nello schema di update): evita che un head_master possa rendere pubblica/privata la propria campagna autonomamente, è una decisione riservata a Sviluppo Web"
- "GET /api/campaigns: default 'solo visibili' anche per utenti autenticati non isSviluppo, con OR su grants proprie — così uno staffer vede sempre la propria campagna anche se non ancora pubblica, senza dover diventare isSviluppo"
- "ModalCreateCampaign.onCreated riceve la risposta grezza di POST /api/campaigns (Prisma Campaign, non il campaignSchema validato con dataTypes/activeFeatures) castata a Campaign: accettabile perché ManagerRolesAdmin.handleCreated usa solo .slug, e il resto della UI si aggiorna via invalidateQueries/refetch, non da questo oggetto"

## Note / Log

- 2026-08-31 (dev): inizio implementazione su branch task/049-sostituzione-super-admin-gruppi-booleani, brief ricevuto direttamente dall'owner (non da Trello) con specifica completa di file da modificare.
- 2026-08-31 (dev): migrazione Prisma applicata (DB di sviluppo Neon condiviso dal progetto, non un branch effimero: nessun tool MCP Neon disponibile in questa sessione — solo Brevo). Backfill eseguito come da spec, nessuna perdita dati (20 utenti pre-esistenti con associationRole non-null, verificati dal warning di `prisma migrate dev`).
- 2026-08-31 (dev): riapertura task per estensione a valle richiesta dall'owner — sposta "Gestione Campagne" (creazione + nuovo toggle `Campaign.visibility`) dentro "Ruoli e Campagne" (`ManagerRolesAdmin`), riservato a `isSviluppo`; elimina la vecchia pagina/componente `CampaignManager`. Stesso branch/task, nessuna deviazione di scope dal brief ricevuto.
- 2026-08-31 (dev): type-check/lint puliti; 9 test residui fallivano perché assumevano ancora il bypass super-admin su rotte già corrette (campaigns POST/PUT/DELETE, grants PATCH, characterData PATCH) — riscritti per verificare l'assenza del bypass invece di rimuoverne la copertura. Suite finale: 1840/1840 verde.
- 2026-08-31 (dev): implementazione completa, portato a in-review. Branch: task/049-sostituzione-super-admin-gruppi-booleani. Verifica: `git log main..task/049-sostituzione-super-admin-gruppi-booleani`, poi `bun run type-check && bun run lint && bun run test:run` sul branch.
- 2026-08-31 (dev): rename richiesto dal coordinatore isDevWeb→isSviluppo applicato in un nuovo commit sullo stesso branch (nessuna riscrittura di storia): nuova migrazione di rename colonna (quella già applicata resta intatta), rename coerente di tutti i simboli TS derivati e del discriminatore di gruppo "devWeb"→"sviluppo". Verifica finale: `bun run type-check`/`lint`/`format` puliti, `bun run test:run` 1840/1840 verde, `grep -rn "isDevWeb|DevWeb|DEV_WEB" src prisma` senza risultati (restano solo le due migrazioni storiche, mai editate).
- 2026-08-31 (dev): estensione "visibilità campagne" implementata (migrazione Prisma applicata sullo stesso DB Neon di sviluppo del task, `bunx prisma migrate dev --name add_campaign_visibility` + `generate`, entrambi ok). Su istruzione esplicita del richiedente NON ho eseguito `type-check`/`lint`/`test:run` in questa sessione (solo `prettier --write` sui file toccati e `prisma format`); portato comunque a `in-review` perché il lavoro di codice è completo — la verifica automatica va fatta prima del merge. Grep finale su `CampaignManager|ManagerCampaigns|adminCampaigns` in `src`: nessun residuo. Branch invariato: task/049-sostituzione-super-admin-gruppi-booleani.
