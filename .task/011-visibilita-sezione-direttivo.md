---
id: "011"
title: "Visibilità sezione edit membri direttivo (direttivo + super-admin)"
status: done
priority: P1
assignee: ""
branch: task/011-visibilita-sezione-direttivo
base: integration/fase-1-backend
trello: ""
created: 2026-07-09
updated: 2026-07-09
---

## Obiettivo

Rendere la sezione di modifica dei **membri del direttivo** visibile e usabile
solo a chi fa parte del direttivo e al super-admin. Oggi le pagine sotto
`dashboard/admin/*` non hanno alcuna guardia server-side e la voce di menu
"Gestione Ruoli" è mostrata a tutti; l'API dei ruoli associativi è invece
super-admin only.

## Scope

Incluso:

- **Infrastruttura capabilities** (base condivisa con T-012): nuovo
  `GET /api/me/capabilities` che ritorna per l'utente della sessione
  (via `getEffectiveUserId`) almeno:
  `{ isSuperAdmin, isDirettivoMember, headMasterCampaignSlugs }`.
  `isDirettivoMember` = `hasAssociationRoleBypass(user.associationRole)` OPPURE
  super-admin (il set direttivo è board/treasurer/vice_president/secretary/
  president, già definito in `authorization.ts`). Esporre un hook client
  (es. `useCapabilities`) per il gating della navigazione.
- **Guardia server** sulla sezione direttivo: la pagina
  `dashboard/admin/roles` (rende `OrgRolesManager`) deve essere accessibile solo
  a direttivo o super-admin; altrimenti `EmptyCard`/`notFound`. La sezione
  **direttivo** dentro `OrgRolesManager` è mostrata a direttivo+super-admin.
  (La parte "ruoli di tutte le campagne" della stessa pagina è god-view
  super-admin — vedi Decisioni; il suo gating fine è competenza di T-012.)
- **API ruoli associativi**: consentire le operazioni sul direttivo
  (`GET /api/admin/association-roles` per la parte direttivo, e
  `PUT /api/admin/association-roles/[userId]` che chiama `setUserAssociationRole`)
  a super-admin **oppure** membri del direttivo, non più solo super-admin.
  Il `syncDirettivoMembers` del client passa da qui.
- **Navigazione**: nel `BtnPlatformAdmin` la voce "Gestione Ruoli" è mostrata
  solo se `isDirettivoMember || isSuperAdmin`. Le voci "Gestione Utenti" e
  "Gestione Campagne" restano super-admin only (gating coerente via capabilities).
- Test: `/api/me/capabilities` per super-admin / direttivo / utente normale;
  API association-roles ammette direttivo e nega utente normale (403);
  isolamento (un utente non direttivo non vede la sezione né la voce di menu).

Escluso:

- Gating dell'editing dei ruoli di campagna (head_master) → **T-012**.
- Impersonation UI (T-010), rimozione mock (T-009).

## Criteri di accettazione

- [x] Un utente non direttivo e non super-admin **non** vede la voce "Gestione
      Ruoli" e, navigando all'URL a mano, ottiene una schermata di permessi
      insufficienti (non i dati). (verificato via test: `BtnPlatformAdmin.test.tsx`,
      `dashboard/admin/roles/__tests__/page.test.tsx`; non verificato manualmente
      in browser)
- [x] Un membro del direttivo (es. `secretary`) vede la sezione direttivo e può
      aggiungere/rimuovere membri del direttivo; la modifica persiste
      (verificato su DB reale). — Verificato dal QA su DB reale (branch Neon
      effimero) con login reale e chiamate HTTP reali (non Prisma mockato):
      loggato come `president@ad.com` (direttivo, `associationRole: president`,
      non super-admin), `POST /api/admin/association-roles` su
      `supporter.campaign1@ad.com` → `201`, confermato con query SQL diretta
      che `User.associationRole` è passato da `member` a `secretary`; poi
      `DELETE /api/admin/association-roles/[userId]` sullo stesso utente →
      `204`, confermato via SQL il ripristino a `member` (stato originale).
      Vedi Log.
- [x] Il super-admin mantiene pieno accesso. (invariato nei test esistenti +
      nuovi, tutti verdi)
- [x] `GET /api/me/capabilities` ritorna i flag corretti per super-admin,
      direttivo e utente normale (test).
- [x] L'endpoint reale che aggiunge/rimuove un membro del direttivo (`POST`
      /`DELETE /api/admin/association-roles`[/`[userId]`] — il file non ha un
      `PUT`, vedi Artifacts/decisions) risponde 403 a un utente normale e
      201/204 a un membro del direttivo (test).
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/app/api/me/capabilities/route.ts (nuovo — GET, con method guards)
- src/app/api/me/capabilities/\_\_tests\_\_/route.test.ts (nuovo)
- src/lib/validations/capabilities.ts (nuovo — capabilitiesResponseSchema)
- src/lib/queries/capabilities.ts (nuovo — hook useCapabilities, pattern queryOptions coerente con queries/campaigns.ts)
- src/lib/repositories/grant.repository.ts (nuova getHeadMasterCampaignSlugs)
- src/lib/repositories/grant.repository.test.ts (test per getHeadMasterCampaignSlugs)
- src/lib/authorization.ts (nuovi isDirettivoMember, requireDirettivoOrSuperAdmin)
- src/lib/authorization.test.ts (test per isDirettivoMember)
- src/app/(dashboard)/dashboard/admin/roles/page.tsx (guardia direttivo/super-admin inline, EmptyCard se non autorizzato)
- src/app/(dashboard)/dashboard/admin/roles/\_\_tests\_\_/page.test.tsx (nuovo)
- src/app/(dashboard)/\_components/OrgRolesManager.tsx (solo commento aggiornato — nessuna logica: il gating è a monte, guardia pagina + API; NON toccato l'import di roles.json, territorio T-009)
- src/app/(dashboard)/\_components/BtnPlatformAdmin.tsx (voci filtrate via useCapabilities; "Gestione Ruoli" a direttivo+super-admin, "Gestione Utenti"/"Gestione Campagne" solo super-admin; componente nasconde tutto se nessuna voce è permessa)
- src/app/(dashboard)/\_components/\_\_tests\_\_/BtnPlatformAdmin.test.tsx (nuovo)
- src/app/api/admin/association-roles/route.ts (GET/POST: requireSuperAdmin → requireDirettivoOrSuperAdmin; GET calcola `campaigns` solo se super-admin, altrimenti `[]` lato server)
- src/app/api/admin/association-roles/\_\_tests\_\_/route.test.ts (nuovi casi direttivo 200/201/403)
- src/app/api/admin/association-roles/[userId]/route.ts (DELETE: requireSuperAdmin → requireDirettivoOrSuperAdmin)
- src/app/api/admin/association-roles/[userId]/\_\_tests\_\_/route.test.ts (nuovi casi direttivo 204/403)
  interfaces:
- "GET /api/me/capabilities -> { isSuperAdmin: boolean, isDirettivoMember: boolean, headMasterCampaignSlugs: string[] }"
- "isDirettivoMember(prisma, userId) -> Promise<boolean> (isSuperAdmin(email) OR hasAssociationRoleBypass(associationRole))"
- "requireDirettivoOrSuperAdmin(handler: (req, context, info: { userId, isSuperAdmin }) => Promise<Response>) -> route handler; 401/403 se non autorizzato"
- "getHeadMasterCampaignSlugs(prisma, userId) -> Promise<string[]> (Grant.role === head_master, join su Campaign.slug)"
  decisions:
- "capabilities via endpoint dedicato: la sessione Better Auth non espone associationRole né grant"
- "il brief menzionava PUT /api/admin/association-roles/[userId]; il codice reale usa POST (add, su /route.ts) + DELETE (remove, su [userId]/route.ts) — allargato il gating su questi due, non introdotto un PUT che non esisteva"
- "GET /api/admin/association-roles: per un direttivo non super-admin il campo `campaigns` è forzato a [] lato server (non solo nascosto in OrgRolesManager) — coerente con la regola CLAUDE.md 'visibilità server-side, mai filtrare dati sensibili solo lato client'; il gating fine per-campagna (head_master) resta a T-012"
- "OrgRolesManager non ha ricevuto logica di gating: la guardia di pagina (dashboard/admin/roles/page.tsx) + il `campaigns: []` server-side dell'API bastano a soddisfare 'solo sezione direttivo per direttivo non super-admin'; toccato solo il commento, per non collidere con l'import roles.json di T-009 né con la sezione campagne di T-012"
- "ESCALATION per la review (segnalata anche dall'owner nel Log): i membri del direttivo possono aggiungere/rimuovere altri membri del direttivo (stesso potere del super-admin su questo sotto-dominio) — implementato così perché il requisito è esplicito, ma è una escalation di privilegio da confermare in review"

## Note / Log

- 2026-07-09 (owner): task creato. La sessione Better Auth espone solo
  id/name/email (nessun `associationRole`/grant) → serve `/api/me/capabilities`
  per il gating client; i Server Component/layout possono invece usare
  direttamente gli helper di `authorization.ts`.
- 2026-07-09 (owner): DA CONFERMARE (sicurezza/prodotto) — consentire ai membri
  del direttivo di **modificare** la composizione del direttivo significa che un
  membro può aggiungerne/rimuoverne altri (potenziale escalation). Il requisito
  dell'utente è esplicito ("sezione di edit membri direttivo visibile a membri
  del direttivo e super-admin"), quindi implementato così; segnalare in review se
  si preferisce limitare l'edit al solo super-admin lasciando ai membri la sola
  lettura.
- 2026-07-09 (owner): DA CONFERMARE (prodotto) — la pagina `dashboard/admin/roles`
  mescola direttivo e ruoli di TUTTE le campagne (god-view super-admin). Per un
  membro del direttivo non super-admin si mostra **solo** la sezione direttivo.
  Se in futuro serve una superficie direttivo dedicata/separata, valutarlo a
  parte. Coordinare con T-012 che condivide questa pagina e le capabilities.
- 2026-07-09 (dev): inizio implementazione su task/011-visibilita-sezione-direttivo
  (worktree core-task-011, base integration/fase-1-backend).
- 2026-07-09 (dev): implementate capabilities (`/api/me/capabilities` +
  `useCapabilities`), guardia pagina `dashboard/admin/roles`, gating
  `BtnPlatformAdmin`, allargamento gating API association-roles a
  direttivo+super-admin. `OrgRolesManager` non toccato a livello di logica
  (solo commento): il `campaigns: []` server-side per direttivo non
  super-admin copre il criterio "solo sezione direttivo" senza serve
  modificarne il markup, evitando conflitti con T-009 (roles.json) e T-012
  (sezione campagne). 3 gate (type-check/lint/test:run) verdi, 570 test totali.
- 2026-07-09 (dev): ESCALATION per la review — i membri del direttivo possono
  aggiungere/rimuovere altri membri del direttivo tramite
  POST/DELETE `/api/admin/association-roles`(`/[userId]`), stesso potere del
  super-admin su questo sotto-dominio (già segnalato dall'owner come
  DA CONFERMARE sopra). Implementato secondo il requisito esplicito, ma da
  confermare in review. Criterio "modifica persiste su DB reale" NON
  verificato in questo turno (nessun DB/sessione reale disponibile): solo
  test con Prisma mockato. status → in-review.
- 2026-07-09 (reviewer): VERDETTO **OK con nit** (round 1/3). Nessun P0/P1.
  Sicurezza verificata OK: `/api/me/capabilities` non fa leak (findUnique per id,
  nessun param userId, impersonation-aware); `requireDirettivoOrSuperAdmin` senza
  buchi (associationRole non-nullable a schema); gating `campaigns: []`
  sufficiente. Findings non bloccanti: P2 escalation direttivo→direttivo
  giudicata **accettabile** (organo collegiale, NON escalation verso super-admin),
  ma raccomandato audit-log come follow-up; P3 prisma diretto in capabilities
  (accettabile, precedente nell'auth-layer); P3 tripla definizione del set
  direttivo (drift risk, pre-esistente) → candidato test di uguaglianza; P3
  `removeUserFromDirettivo` incondizionato (edge minore pre-esistente). Richiede
  QA su DB reale prima del `done`.
- 2026-07-09 (owner): mergiato in `integration/fase-1-backend` (`--no-ff`); gate
  post-merge verdi (type-check 0, lint pulito, 570 test). Resta `in-review` in
  attesa della QA su DB reale (criterio "modifica persiste"). Audit-log del
  direttivo tracciato come follow-up (candidato T-014), escalation accettata dal
  reviewer e coerente col requisito esplicito.
- 2026-07-09 (qa): verifica end-to-end su **DB reale Neon** (stesso branch
  effimero usato per T-009, vedi Log lì per dettagli di creazione/pulizia) con
  server applicativo reale (`bun dev -p 3100` puntato al branch, login reale
  via `/api/auth/sign-in/email`, non Prisma mockato). Persone usate:
  `president@ad.com` (`associationRole: president`, membro del direttivo NON
  super-admin — nessun `Account` per `secretary@ad.com` nel seed, usato
  `president` come istanza concreta dello stesso set `hasAssociationRoleBypass`
  citato nel criterio) e `no-quota@ad.com` (utente normale,
  `associationRole: registered`). (1) Gating negato: `GET`, `POST`
  `/api/admin/association-roles` e `DELETE /api/admin/association-roles/[userId]`
  con sessione `no-quota@ad.com` → tutti `403 {"error":"Permessi insufficienti"}`.
  (2) Gating ammesso: stessi 3 endpoint con sessione `president@ad.com` →
  `GET` 200, `POST` 201, `DELETE` 204. (3) `campaigns: []` server-side per
  direttivo non super-admin: `GET /api/admin/association-roles` con
  `president@ad.com` → `"campaigns":[]` nel body (confermato anche il
  contrario: con `mattia@arcana.it` super-admin la stessa route torna
  `campaigns` valorizzato con le 3 campagne di `arcana-domine`, nessun leak
  delle campagne dell'altra organizzazione `shadow-realms`). (4) Persistenza
  reale: stato iniziale `supporter.campaign1@ad.com` → `associationRole:
"member"` (verificato via query Prisma diretta sul branch); `POST
/api/admin/association-roles {"userId":"IgU0zsGUfjlBZGByISz5QF8pZEioAEnB",
"role":"secretary"}` come `president@ad.com` → `201`, poi query diretta →
  `associationRole: "secretary"` (persistito); `DELETE
/api/admin/association-roles/IgU0zsGUfjlBZGByISz5QF8pZEioAEnB` come
  `president@ad.com` → `204`, poi query diretta → `associationRole: "member"`
  (ripristinato allo stato originale, nessun dato lasciato alterato sul
  branch). Gate di regressione rieseguiti sul tip di
  `integration/fase-1-backend`: `bun run type-check` 0 errori, `bun run
test:run` 585/585 verdi (46 file). Criterio "modifica persiste su DB reale"
  spuntato. Gli altri 4 criteri erano già spuntati dal dev/reviewer con test
  automatici (Prisma mockato) — non ri-verificati qui salvo sovrapposizione
  con quanto sopra (gating direttivo/utente normale confermato anche a runtime
  reale, coerente con i test mockati). **Non verificato**: rendering client
  della sezione direttivo (`OrgRolesManager`, voce menu `BtnPlatformAdmin`) in
  browser reale — nessun accesso a browser in questo giro, solo API/DB.
- 2026-07-09 (owner): QA su DB reale (branch Neon effimero) OK per "modifica
  persiste" (POST/DELETE association-roles come direttivo → 201/204, persistenza
  e ripristino confermati via SQL; gating 403 utente normale; `campaigns: []`
  server-side). Residuo solo-browser (rendering sezione) non bloccante.
  Reviewer OK già dato → condizioni §6 soddisfatte. status → done.
