---
id: "012"
title: "Visibilità sezione edit ruoli campagna (super-admin + head_master)"
status: done
priority: P1
assignee: ""
branch: task/012-visibilita-sezione-ruoli-campagna
base: integration/fase-1-backend
trello: ""
created: 2026-07-09
updated: 2026-07-09
---

## Obiettivo

Rendere la sezione di modifica dei **ruoli di campagna** (Gestione Staff:
assegnazione head_master/master/supporter) visibile e usabile solo al super-admin
e all'head_master della campagna. La guardia server della sezione esiste già; la
lacuna è nella **navigazione** (voci mostrate a tutti) e nel gating client
coerente.

## Scope

Incluso:

- **Navigazione di campagna**: nel `BtnCampaignAdmin`, la voce "Gestione Staff"
  (`campaignAdminRoles`) — e coerentemente le altre voci "Impostazioni" riservate
  allo staff — è mostrata solo se l'utente è head_master di quella campagna o
  super-admin. Usa le capabilities di T-011
  (`headMasterCampaignSlugs`, `isSuperAdmin`).
- **Verifica/consolidamento guardia server**: la sezione
  `dashboard/[campaignSlug]/admin` è già protetta da `admin/layout.tsx` via
  `CampaignRoleGuard` (requiredRole `head_master`, bypass super-admin) — confermare
  che copre `admin/roles` e mantenere il comportamento (nessuna regressione).
- **Sezione ruoli campagna nella god-view**: in `OrgRolesManager`
  (`dashboard/admin/roles`) la parte di editing dei ruoli di **tutte** le campagne
  resta riservata al super-admin (un head_master gestisce i propri ruoli dalla
  Gestione Staff della sua campagna, non dalla god-view cross-campagna). Nascondere
  questa parte a chi non è super-admin (i membri del direttivo non super-admin, per
  T-011, vedono solo la sezione direttivo).
- Test: la voce "Gestione Staff" non compare per un utente senza ruolo idoneo
  sulla campagna; compare per head_master e super-admin; la god-view campagne è
  super-admin only.

Escluso:

- Introduzione delle capabilities e gating direttivo → **T-011** (dipendenza).
- Modifiche all'API dei grant di campagna
  (`/api/campaigns/[campaignSlug]/grants*`, già head_master+super-admin) salvo
  regressioni scoperte.

## Criteri di accettazione

- [x] Un utente senza ruolo su una campagna **non** vede la voce "Gestione Staff"
      nel menu di quella campagna; navigando all'URL ottiene "Permessi
      insufficienti" (già garantito dal guard server, da non rompere).
- [x] Un head_master vede e usa la Gestione Staff della **propria** campagna; un
      master/supporter no.
- [x] Nella god-view `dashboard/admin/roles` l'editing dei ruoli delle campagne è
      visibile solo al super-admin.
- [x] Il super-admin mantiene pieno accesso ovunque.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/(dashboard)/\_components/BtnCampaignAdmin.tsx (bottone "Impostazioni" intero — non solo la voce "Gestione Staff" — gated su isSuperAdmin || headMasterCampaignSlugs.includes(campaignSlug); tutte e 3 le voci condividono lo stesso guard server)
- src/app/(dashboard)/\_components/OrgRolesManager.tsx (campagne passate a RolesManager solo se isSuperAdmin, incl. skip del loop di sync in handleSave; sezione direttivo invariata, territorio T-011)
- src/app/(dashboard)/\_components/**tests**/BtnCampaignAdmin.test.tsx (nuovo — 5 casi: nessun ruolo, head_master altra campagna, loading, head_master campagna corrente, super-admin)
- src/app/(dashboard)/\_components/**tests**/OrgRolesManager.test.tsx (nuovo — 2 casi: direttivo non super-admin non vede scope campagna anche se l'API li restituisse, super-admin li vede)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/layout.tsx (SOLO verifica, nessuna modifica: `CampaignRoleGuard` requiredRole head_master copre già admin/, admin/roles, admin/downtime — confermato anche da layout.test.tsx esistente)
  interfaces:
- "usa GET /api/me/capabilities (T-011): headMasterCampaignSlugs, isSuperAdmin"
  decisions:
- "editing ruoli di campagna per head_master avviene nella Gestione Staff di campagna, non nella god-view"
- "gating di BtnCampaignAdmin applicato all'intero bottone 'Impostazioni', non solo alla singola voce 'Gestione Staff': tutte le sue voci (Globali, Gestione Staff, Downtime) condividono lo stesso guard server head_master/super-admin, quindi vanno gated insieme"
- "gating della god-view in OrgRolesManager è difesa in profondità via useCapabilities lato client, in aggiunta (non in sostituzione) al gating server già presente in /api/admin/association-roles"

## Note / Log

- 2026-07-09 (owner): task creato. **Dipende da T-011** (capabilities endpoint +
  hook client + gating di `OrgRolesManager`). Ordinare T-011 prima.
- 2026-07-09 (owner): la guardia server della sezione admin di campagna esiste già
  (`[campaignSlug]/admin/layout.tsx` → `CampaignRoleGuard` head_master, bypass
  super-admin), coerente con l'API grant (`requireCampaignAdminBySlug`). Qui il
  grosso è il gating della **navigazione** e della **god-view**, non nuovi guard.
- 2026-07-09 (owner): NOTA — `OrgRolesManager` è condiviso con T-011: coordinare
  le modifiche per evitare conflitti (T-011 gestisce la sezione direttivo, T-012
  la sezione campagne).
- 2026-07-09 (dev): inizio implementazione nel worktree core-task-012.
- 2026-07-09 (dev): implementato gating in BtnCampaignAdmin (bottone intero,
  non solo la voce roles — tutte le voci condividono lo stesso guard server) e
  in OrgRolesManager (campagne passate a RolesManager e sincronizzate in save
  solo se isSuperAdmin). Verificato `[campaignSlug]/admin/layout.tsx`
  (CampaignRoleGuard head_master, bypass super-admin) invariato: copre già
  admin/, admin/roles, admin/downtime, testato in layout.test.tsx esistente —
  nessuna modifica necessaria. Confermato che `getHeadMasterCampaignSlugs`
  filtra `role: Role.head_master`, quindi master/supporter non compaiono in
  `headMasterCampaignSlugs` (criterio "master/supporter no" soddisfatto senza
  logica aggiuntiva). Aggiunti test BtnCampaignAdmin.test.tsx (5 casi) e
  OrgRolesManager.test.tsx (2 casi). Gate: type-check OK, lint OK (1 errore
  import/order autofixato), test:run 592/592 verdi su 48 file. Commit
  1be830c su branch task/012-visibilita-sezione-ruoli-campagna. Nessun
  push/merge. Stato → in-review.
- 2026-07-09 (reviewer): VERDETTO OK con nit (round 1/3). Gating nav e god-view
  corretti; lo skip `if (isSuperAdmin)` in `handleSave` previene la cancellazione
  distruttiva dei grant se il contratto server (`campaigns: []`) regredisse —
  difesa in profondità reale. Nessun leak multi-tenant, sezione direttivo di
  T-011 non toccata. Nit P3 non bloccanti: matching per slug non org-aware
  (irrilevante finché single-org); `handleSave` non coperto da test (RolesManager
  stubbato). Consigliato il merge.
- 2026-07-09 (owner): mergiato in `integration/fase-1-backend` (`--no-ff`, commit
  ee48578). Gate post-merge combinato con T-010 verdi: type-check 0, lint pulito,
  604 test (51 file). Criteri tutti spuntati (gating puro, coperto da test) →
  tutte le condizioni §6 soddisfatte. status → done. Nit P3 tracciati come
  follow-up (test su `handleSave`; capability org-aware al multi-org).
