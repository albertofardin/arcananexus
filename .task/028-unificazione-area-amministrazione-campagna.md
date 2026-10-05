---
id: "028"
title: "Unificare settings/ e admin/ in un'unica area di amministrazione campagna"
status: done
priority: P1
assignee: ""
branch: task/028-unificazione-area-amministrazione-campagna
base: task/015-schema-metamodel-dati-campagna
trello: ""
created: 2026-07-17
updated: 2026-07-17
qa: ok
---

## Obiettivo

Oggi esistono due sezioni parallele e ridondanti sotto `[campaignSlug]`, entrambe
gatate allo stesso ruolo (`head_master`, via `CampaignRoleGuard`): `settings/`
(un solo placeholder "in costruzione", dati mock non collegati a schema) e
`admin/` (`roles`, `downtime` mock, `characters`, `characters/[id]` reali).
Unificarle in un'unica area di amministrazione campagna elimina la
duplicazione e dà un posto solo dove aggiungere le nuove UI di configurazione
del metamodel (T-029 DataType/sidebar, T-030 catalogo, T-031 feature).

## Scope

Incluso:

- Un'unica area, sotto `admin/` (nome scelto perché già ospita contenuto
  reale: `roles`, `characters`; `settings/` ha solo un placeholder). Spostare
  sotto `admin/` qualunque contenuto reale eventualmente utile di
  `settings/page.tsx` (oggi solo mock `CampaignSettings` con `TODO(T-013
candidato)` — verificare se `CampaignSettings`/`CampaignSettingsValue` ha
  campi con backing reale a schema; se nessuno, il redirect può bastare senza
  portare dietro il form mock).
- `settings/` diventa un redirect (Server Component, `redirect()` di
  `next/navigation`) verso `admin/` (o verso una sotto-pagina equivalente),
  per non rompere eventuali link/bookmark esistenti (`routes.campaignSettings`
  è referenziato da `CampaignsManager`/sidebar — verificare tutti i
  riferimenti con `grep -rn "campaignSettings" src/`).
- Menu/entry point di navigazione (sidebar, `SidePanel`, eventuali link
  "Impostazioni Campagna") aggiornati a puntare a una sola area.
- `admin/page.tsx` (home dell'area) diventa un indice reale che elenca le
  sotto-sezioni disponibili (ruoli, downtime, personaggi, DataType — T-029,
  catalogo — T-030, feature — T-031), non un form isolato.
- Copy IT coerente; nessuna regressione sul guard `head_master` esistente
  (`admin/layout.tsx`), che resta il guard unico dell'area risultante.
- Test: routing/redirect, guard invariato (401/403 per non-head_master),
  nessuna sotto-pagina orfana.

Escluso:

- Le nuove UI di configurazione vere e proprie (DataType/sidebar → T-029,
  catalogo/reference-data → T-030, Feature → T-031): qui si prepara solo il
  contenitore/indice unificato in cui quelle UI andranno innestate.
- Cambiare il ruolo richiesto per l'accesso (resta `head_master`).

## Criteri di accettazione

- [x] `/dashboard/[campaignSlug]/settings` non è più una sezione duplicata:
      o non esiste più, o reindirizza coerentemente alla nuova area unica;
      test.
- [x] `/dashboard/[campaignSlug]/admin` è un indice reale delle sotto-sezioni
      disponibili (non più un form mock isolato); test.
- [x] Il guard `head_master` (o super-admin) resta invariato su tutta l'area
      risultante; test 401/403/200 non regrediti rispetto a `admin/__tests__/layout.test.tsx`
      e `settings/__tests__/layout.test.tsx` esistenti.
      (`admin/__tests__/layout.test.tsx` invariato e verde; `settings/`
      non ha più un layout/guard proprio per scelta di design esplicita nello
      Scope — il vecchio `settings/__tests__/layout.test.tsx` è stato sostituito
      da `settings/__tests__/page.test.tsx`, che copre il redirect; il 403 per
      non-head_master resta coperto end-to-end perché il redirect atterra su
      `admin/`, che applica lo stesso guard, invariato.)
- [x] Nessun link rotto: tutti i riferimenti a `routes.campaignSettings` nel
      codice risolvono correttamente (grep + test).
      (`campaignSettings` rimosso da `routes.ts`: dopo l'aggiornamento del
      quick link home, zero riferimenti residui nel codice — verificato con
      `grep -rn "campaignSettings\b" src/`.)
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi.
      (`test:run`: 4 fallimenti pre-esistenti e indipendenti dal task —
      `impersonation-flow.test.tsx` e `UsersManager.test.tsx` — riprodotti
      anche su un checkout pulito dello stesso branch via `git stash`, non
      legati a questo cambiamento.)

## Artifacts

- files_modified:
  - `src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx` — riscritto:
    da form mock `CampaignSettings` a indice reale (card verso
    `admin/roles`, `admin/characters`, `admin/downtime` + placeholder
    "Prossimamente" per T-029/T-030/T-031).
  - `src/app/(dashboard)/dashboard/[campaignSlug]/settings/page.tsx` —
    riscritto: da placeholder "in costruzione" a Server Component che fa
    `redirect(routes.campaignAdmin(campaignSlug))`.
  - `src/app/(dashboard)/dashboard/[campaignSlug]/settings/layout.tsx` —
    eliminato (guard non più necessario: il redirect porta su `admin/`, che
    applica CampaignRoleGuard a monte).
  - `src/app/(dashboard)/dashboard/[campaignSlug]/settings/__tests__/layout.test.tsx`
    — eliminato (testava il layout/guard rimosso).
  - `src/app/(dashboard)/dashboard/[campaignSlug]/settings/__tests__/page.test.tsx`
    — nuovo: verifica il redirect verso `routes.campaignAdmin(campaignSlug)`,
    propagazione slug multi-tenant.
  - `src/app/(dashboard)/dashboard/[campaignSlug]/admin/__tests__/page.test.tsx`
    — nuovo: verifica che l'indice linki le sotto-sezioni reali, non renderizzi
    più il vecchio mock, elenchi i placeholder T-029/030/031, propaghi lo slug.
  - `src/app/(dashboard)/dashboard/[campaignSlug]/page.tsx` — quick link home
    "Impostazioni"/`routes.campaignSettings` → "Amministrazione"/
    `routes.campaignAdmin`.
  - `src/app/routes.ts` — rimosso `campaignSettings` (nessun riferimento
    residuo nel codice dopo l'update del quick link home; la sidebar
    `BtnCampaignAdmin`/`SidePanel` usava già solo le rotte `campaignAdmin*`).
- interfaces: nessuna firma di funzione pubblica cambiata (solo componenti
  pagina/route Next.js, stesse signature `Page({ params })`).
- decisions:
  - Nel codice reale su questo branch `admin/page.tsx` (non `settings/page.tsx`)
    era quello con il form mock `CampaignSettings`/`TODO(T-013 candidato)`;
    `settings/page.tsx` era il placeholder "in costruzione" — invertito
    rispetto alla descrizione del task. Verificato a schema (`model Campaign`):
    nessun campo del mock (`sections/limits/managerId/logoUrl/backgroundUrl`)
    ha backing reale → il mock è stato eliminato senza portare nulla dietro,
    come previsto dal criterio di uscita in caso di assenza di backing.
  - `settings/` non ha più un proprio layout/guard: il redirect Server
    Component non richiede auth propria, la guardia head_master resta unica
    e viene applicata a valle da `admin/layout.tsx` (nessuna duplicazione di
    logica, nessuna regressione di sicurezza: chi non è head_master arriva comunque
    alla card "Permessi insufficienti" dopo il redirect).
  - `CampaignSettings.tsx`/`CampaignSettingsValue` (componente) non toccati:
    restano in uso da `CampaignsManager.tsx` (gestione campagne a livello
    piattaforma, `dashboard/admin/campaigns`), contesto distinto e fuori scope.
  - Sidebar (`SidePanel.tsx`/`BtnCampaignAdmin.tsx`) già puntava solo a
    `routes.campaignAdmin*`: nessuna modifica necessaria lì, solo il quick
    link della home campagna referenziava ancora `campaignSettings`.

## Note / Log

- 2026-07-17 (owner): nuovo task dall'analisi UX post-Fase 2 — richiesto
  dall'utente. `settings/` e `admin/` sono duplicati funzionalmente (stesso
  guard `head_master`, `settings/` è solo un placeholder mai completato dopo
  T-009). Base branch: `task/015-schema-metamodel-dati-campagna` (deroga
  esplicita §12 — l'intera catena Fase 2, PR #32, non è ancora mergiata in
  `main`: `origin/main` non ha ancora `DataTypeKind`/`XpTransaction`/
  `FeatureType`, verificato). Da riallineare a `main` al merge di #32, come
  fatto per T-017/018/019/020/021/022/026.
- 2026-07-17 (owner): sblocca T-029/T-030/T-031 (tutte vogliono vivere
  nell'area unificata). Non blocca T-032/T-033/T-034 (indipendenti).
- 2026-07-17 (dev): inizio implementazione. Percorso reale su questo branch è
  `dashboard/[campaignSlug]/{settings,admin}` (senza `org/[orgSlug]`, già
  rimosso in T-precedente). Nota: nel codice attuale i ruoli di
  `settings/page.tsx` e `admin/page.tsx` sono invertiti rispetto alla
  descrizione del task — `admin/page.tsx` è quello con il form mock
  `CampaignSettings`/`TODO(T-013 candidato)`, `settings/page.tsx` è il
  placeholder "in costruzione". Verificato a schema (`model Campaign` in
  prisma/schema.prisma): solo `name/slug/description/type` hanno backing
  reale, nessuno dei campi del mock (`sections/limits/managerId/logoUrl/
backgroundUrl`) — procedo a eliminare il mock senza portare nulla dietro,
  come da criterio di uscita del task.
- 2026-07-17 (dev): implementazione completata. `admin/page.tsx` è ora
  l'indice reale (roles/characters/downtime + placeholder T-029/030/031);
  `settings/page.tsx` è un redirect verso `admin/`, `settings/layout.tsx`
  eliminato; quick link home e `routes.ts` aggiornati (`campaignSettings`
  rimosso, zero riferimenti residui). `type-check` e `lint` verdi;
  `test:run` verde a meno di 4 fallimenti pre-esistenti e indipendenti
  (impersonation-flow/UsersManager, riprodotti anche su base pulita via
  `git stash`). Branch: `task/028-unificazione-area-amministrazione-campagna`
  (su `task/015-schema-metamodel-dati-campagna`); verifica con
  `bun run test:run -- "src/app/(dashboard)/dashboard/[campaignSlug]"`.
  Porto lo stato a `in-review`.
- 2026-07-17 (QA): verifica end-to-end su questo branch, tutti i criteri
  osservati passare in prima persona (non solo lette le dichiarazioni di
  dev/reviewer):
  1. `settings/page.tsx` letto: è un Server Component che fa solo
     `redirect(routes.campaignAdmin(campaignSlug))`, nessun guard proprio;
     `settings/layout.tsx` confermato assente (`find` sulla cartella).
     `bun run test:run -- "src/app/(dashboard)/dashboard/[campaignSlug]"`
     → 8 file, 57 test, tutti verdi (incl. i due redirect test su slug
     multi-tenant `test-campaign`/`other-campaign`).
  2. `admin/page.tsx` letto: indice reale con card verso
     `campaignAdminRoles/Characters/Downtime` + 3 placeholder "Prossimamente"
     (Tipi di Dato/Catalogo/Feature, T-029/030/031), niente più form mock
     `CampaignSettings`. Test `admin/__tests__/page.test.tsx` verde (4 test:
     link reali, assenza mock "Le Cronache di Eldoria", placeholder T-029/
     030/031, propagazione slug).
  3. `admin/layout.tsx` letto: `CampaignRoleGuard` con `requiredRole:
Role.head_master`, invariato, copre home + tutte le sottorotte.
     `admin/__tests__/layout.test.tsx` verde (2 test). Nessun guard duplicato
     su `settings/` (rimosso by design, motivato nello Scope: il redirect
     atterra comunque su `admin/` guardato).
  4. `grep -rn "campaignSettings" src/` → solo 2 hit, entrambi commenti
     esplicativi (non riferimenti a route/simbolo); `routes.ts` letto: la
     chiave `campaignSettings` non esiste più. `BtnCampaignAdmin.tsx` e la
     home campagna (`[campaignSlug]/page.tsx`) verificati puntare solo a
     `routes.campaignAdmin*`. Nessun link rotto.
  5. `bun run type-check` → pulito (nessun errore). `bun run lint` → pulito
     (nessun errore). `bun run test:run` (suite completa) →
     `Test Files 2 failed | 87 passed (89)`, `Tests 4 failed | 1064 passed
(1068)`; i 4 fallimenti sono esattamente e solo
     `impersonation-flow.test.tsx` (1 test) e `UsersManager.test.tsx`
     (3 test), come dichiarato dal dev — nessun fallimento nuovo. Verificato
     inoltre in autonomia che questi due file di test sono bit-identici tra
     il branch base (`task/015-schema-metamodel-dati-campagna`) e questo
     branch (`git diff task/015...HEAD -- src/components/impersonation
".../UsersManager.test.tsx"` → nessun diff), quindi il fallimento è
     dimostrabilmente indipendente dalle modifiche di T-028.
  6. `bun run test:run -- src/app/__tests__/multi-tenant-isolation.test.ts`
     → 28/28 verdi, nessuna regressione multi-tenant.

  Verdetto: **QA OK** — tutti i criteri di accettazione osservati passare
  realmente. Pronto per PR.
