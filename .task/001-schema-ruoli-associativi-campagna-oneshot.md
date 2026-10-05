---
id: "001"
title: "Evoluzione schema: ruoli associativi, banned, ruoli campagna, Campaign one-shot"
status: done
priority: P0
assignee: dev
branch: task/001-schema-ruoli-associativi-campagna-oneshot
trello: ""
created: 2026-07-07
updated: 2026-07-07
---

## Obiettivo

Evolvere `prisma/schema.prisma` per introdurre le fondamenta dati che sbloccano il
resto della Fase 1: ruoli associativi a livello utente, stato `banned`, allineamento
dei ruoli di campagna ai 3 livelli usati dal frontend, e il tipo "one-shot" delle
campagne. È il task che sblocca T-2, T-4 e T-5.

## Scope

Incluso:

- **`AssociationRole`** — nuovo enum sullo `User` con i valori: `registered`,
  `member`, `board`, `treasurer`, `vice_president`, `secretary`, `president`.
  Rappresenta il ruolo dell'utente nell'associazione (il "direttivo").
- **Stato `banned`** — modellato a livello utente/associazione (coerente con "ogni
  utente ha uno stato che potrebbe essere banned"). Scegli tu la forma più pulita
  (valore accanto ad `AssociationRole` oppure status/flag dedicato sullo `User`).
  **Nessun enforcement in questa fase**: a schema resta solo il dato, nessuna route
  o guardia deve ancora bloccare i bannati.
- **Ruoli di campagna a 3 livelli** — l'enum `Role` attuale è `{admin, helper}`. Il
  frontend (`RolesManager` + `src/app/_mock/roles.json`) usa un set globale fisso di
  3 livelli: `head_master` (controllo completo), `master` (editing), `supporter`
  (sola lettura). Allinea l'enum a questi 3 livelli. Nome/icona/colore/descrizione
  restano nel frontend: a DB serve solo il livello.
- **Campaign one-shot** — aggiungi a `Campaign` il modo di distinguere una campagna
  normale da una "one-shot" (campagna con un evento unico). Flag `isOneShot Boolean`
  o enum `CampaignType`, a tua scelta.
- **Migrazione** Prisma + `bunx prisma generate` + aggiornamento dei riferimenti nel
  codice ai vecchi valori `Role.admin`/`Role.helper` (es. `src/lib/authorization.ts`,
  repository, `prisma/seed.ts`) per non rompere il build.

Escluso:

- Enforcement del banned (rimandato a fase successiva).
- Nomi di ruolo personalizzabili per campagna (card 9 scartata: set globale fisso).
- Endpoint/API (coperti da T-2…T-6).

## Criteri di accettazione

- [x] Enum `AssociationRole` presente sullo `User` con i 7 valori indicati.
- [x] Stato `banned` modellato a schema (senza alcun enforcement).
- [x] Ruoli di campagna allineati a `head_master` / `master` / `supporter`; tutti i
      riferimenti nel codice ai vecchi `admin`/`helper` aggiornati e coerenti.
- [x] `Campaign` distingue campagna normale vs one-shot.
- [x] Migrazione Prisma creata; `bunx prisma generate` eseguito; `bun run test:run`
      verde (aggiornando i test che dipendevano dai vecchi valori enum).
      `bun run type-check` e `bun run lint` NON sono pienamente verdi, ma i
      fallimenti sono **pre-esistenti su `origin/main`** (stesso numero e stesso
      identico set di errori con e senza le modifiche di questo task, verificato a
      diff riga per riga) — vedi log sotto.

## Note / Log

- 2026-07-07 (owner): task creato per la Fase 1 Backend. Mapping suggerito dei
  livelli campagna: `admin` → `head_master`, `helper` → `supporter`, con `master`
  come nuovo livello intermedio (editing) — conferma/valuta in implementazione.
  Banned: solo schema, no enforcement (deciso con l'utente).
- 2026-07-07 (dev): inizio implementazione su branch
  `task/001-schema-ruoli-associativi-campagna-oneshot`.
- 2026-07-07 (dev): implementazione completata. Modifiche a `prisma/schema.prisma`:
  - `User`: aggiunti `associationRole AssociationRole @default(registered)` (enum
    con i 7 valori richiesti) e `status UserStatus @default(active)` (enum
    `{active, banned}` — solo dato, nessun enforcement).
  - `Role` (ruoli di campagna) ridotto/rimappato da `{admin, helper}` a
    `{head_master, master, supporter}` (mapping dati esistenti nella migrazione:
    `admin` → `head_master`, `helper` → `supporter`, come suggerito dall'owner).
  - `Campaign`: aggiunto `type CampaignType @default(campaign)` con enum
    `CampaignType {campaign, oneShot}` per distinguere le one-shot.
  - Migrazione creata a mano (non con `prisma migrate dev`, vedi nota tecnica
    sotto): `prisma/migrations/20260707120000_schema_ruoli_associativi_campagna_oneshot/migration.sql`.
    Contiene il `CASE` esplicito per rimappare i dati esistenti in `Grant.role`
    (`admin`→`head_master`, `helper`→`supporter`) prima del cambio di tipo enum,
    per non perdere/corrompere i grant già assegnati.
  - Aggiornati tutti i riferimenti a `Role.admin`/`Role.helper`/stringhe
    `"admin"`/`"helper"`: `src/lib/authorization.ts` (rifatto `checkCampaignAccess`
    con una gerarchia a rank numerico `head_master(3) > master(2) > supporter(1)`;
    `isUserCampaignAdmin` ora richiede `head_master`, `isUserCampaignHelper` richiede
    almeno `supporter`, cioè "qualunque grant"), `prisma/seed.ts` (`role: "head_master"`),
    `src/test/helpers/prisma-fixtures.ts` (`mockUser` con
    `associationRole`/`status` di default, `mockCampaign` con `type`, `mockGrant`
    con `role: Role.head_master`; ha anche risolto un errore di lint pre-esistente
    di doppio import da `@prisma/client` nello stesso file), `src/lib/authorization.test.ts`
    e `src/app/__tests__/multi-tenant-isolation.test.ts` (sostituiti i riferimenti
    `Role.admin`/`Role.helper` con `Role.head_master`/`Role.supporter`).
  - Nota tecnica sulla migrazione: non è stato possibile usare `prisma migrate dev`
    perché il branch Neon di sviluppo presentava drift pre-esistente non legato a
    questo task (un'enum già estesa manualmente + un default di colonna disallineato
    dalla cronologia migrazioni), che avrebbe richiesto un `migrate reset`
    distruttivo. Ho invece: creato un branch Neon **effimero** (`task-001-schema-migration`,
    poi eliminato) partendo da `main` del progetto `ad_test`, generato lo SQL
    incrementale con `prisma migrate diff --from-schema-datamodel <schema pre-task>
--to-schema-datamodel prisma/schema.prisma --script`, corretto a mano il blocco
    `AlterEnum` per rimappare i valori esistenti (`admin`→`head_master`,
    `helper`→`supporter`) invece del cast diretto (che avrebbe fallito su dati reali),
    e validato l'intera migrazione con `prisma db execute` contro il branch effimero
    (verificato con query dirette che i 4 `Grant` con `role='admin'` sono diventati
    `head_master`). Il branch Neon effimero è stato poi eliminato; `.env` locale
    ripristinato al contenuto originale.
  - Verifiche: `bun run test:run` → 343/343 test verdi (invariato rispetto a
    `origin/main`). `bun run type-check` → 208 errori, **identici uno a uno**
    (diff a zero) a quelli presenti su `origin/main` senza le modifiche di questo
    task (mock Prisma non tipizzati nei repository test, `.next/types` stale,
    cast `Mock` su `auth.api.getSession` nei test di route) — nessun nuovo errore
    introdotto. `bun run lint` → 38 errori/16 warning, anch'essi pre-esistenti su
    `origin/main` (in gran parte `@typescript-eslint/no-explicit-any` nei test dei
    repository, non toccati da questo task); ho comunque risolto un
    `no-duplicate-imports` pre-esistente in `prisma-fixtures.ts` dato che stavo già
    modificando quel file.
  - Verifica: `git switch task/001-schema-ruoli-associativi-campagna-oneshot`,
    `bunx prisma generate`, poi `bun run test:run` (343 verdi). Per rivedere la
    migrazione: `prisma/migrations/20260707120000_schema_ruoli_associativi_campagna_oneshot/migration.sql`.
- 2026-07-07 (dev): richiesto dal coordinator di eseguire un `prisma migrate reset`
  distruttivo sul DB Neon di sviluppo condiviso (progetto `ad_test` /
  `shiny-scene-57228836`, branch `main` / `br-curly-shadow-a9mj1w9t`) per sanare il
  drift pre-esistente (non legato a T-1) e verificare che la migrazione di T-1 si
  applichi pulita da zero. Ho creato come rete di sicurezza il branch di backup
  **`backup-pre-reset-t001`** (id `br-muddy-rice-a94rg6yg`, parent `main`) — creato,
  non utilizzato, resta disponibile per un eventuale ripristino.
  **Il `migrate reset` NON è stato eseguito**: il sistema di permessi dell'agente
  (Claude Code auto-mode classifier) ha bloccato il comando due volte, anche dopo un
  messaggio del coordinator che riportava un'autorizzazione esplicita dell'utente
  umano, con la motivazione che un'azione distruttiva su un database condiviso non
  può essere autorizzata da un messaggio di un altro agente/cross-session — richiede
  una review diretta dell'utente umano fuori dall'auto-mode (o una regola di
  permesso Bash esplicita aggiunta dall'utente). Non ho tentato workaround (es. SQL
  diretto equivalente a un drop). `.env` locale, temporaneamente ripuntato al branch
  `main` di `ad_test` per la verifica, è stato **ripristinato al contenuto
  originale** (nessuna modifica residua). Nessuna modifica al `migration.sql` in
  questo passaggio: non è stato possibile verificare se si applica pulito da zero
  perché il reset non è partito.
  **Serve un'azione diretta dell'utente umano** (fuori da questa sessione agente)
  per: eseguire `bunx prisma migrate reset --force` puntando a
  `ad_test`/`main` (o autorizzare esplicitamente il comando a livello di permessi
  Bash), verificare che la migrazione `20260707120000_...` applichi pulita, e
  comunicare l'esito perché io possa aggiornare di conseguenza `migration.sql` se
  necessario. Il branch di backup `backup-pre-reset-t001` va eliminato manualmente a
  reset avvenuto con successo (non l'ho eliminato, essendo pensato come rete di
  sicurezza per l'operazione non ancora completata).
- 2026-07-07 (coordinator): `prisma migrate reset --force` **eseguito con successo**
  dalla sessione principale con consenso esplicito dell'utente umano (guard Prisma
  soddisfatto via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Il DB `ad_test`/
  `main` è stato ricostruito da zero: tutte e 5 le migrazioni applicate pulite
  (inclusa `20260707120000_...`, che quindi **applica correttamente da fresco senza
  correzioni**) + seed completato. `prisma migrate status` → "Database schema is up
  to date!" — drift risolto. Il `migration.sql` NON ha richiesto modifiche. Backup
  `backup-pre-reset-t001` ancora presente su Neon: eliminabile ora che il reset è
  ok. T-1 pronta per la review.
- 2026-07-07 (reviewer): review OK — nessun blocker. Verificato: migrazione SQL
  corretta (pattern AlterEnum canonico Prisma con CASE di rimappatura
  `admin→head_master`/`helper→supporter`; `Grant.role` non ha default a schema →
  nessun drop/set-default necessario; nuove colonne NOT NULL con default → backfill
  senza perdita dati; default schema/SQL coerenti per `registered`/`active`/
  `campaign`; `oneShot` label valido). Semantica autorizzazione: il passaggio a
  rank `>=` NON introduce privilege escalation — gli unici chiamanti passano
  `head_master` (isUserCampaignAdmin) e `supporter` (isUserCampaignHelper);
  `requireRole` è esportata ma inutilizzata; `master` è un livello net-new senza
  dati mappati. Nessun residuo di `Role.admin`/`Role.helper` o stringhe
  `"admin"`/`"helper"` come ruolo (grep ampio pulito); `_mock/roles.json` allineato
  ai 3 nuovi id. Banned/status dormiente confermato (le uniche ref a `.status` sono
  `Membership.status`, campo diverso). Test multi-tenant coerenti. Findings solo
  minori/cosmetici (non bloccanti): (1) manca copertura test del rank intermedio
  `master`; (2) descrizioni test in authorization.test.ts ancora citano
  "admin/helper role". Consigliati ma non necessari per il merge. T-1 → done.
- 2026-07-07 (reviewer): merge in `integration/fase-1-backend` con `git merge
--no-ff` (nessun conflitto, `main` non avanzata) → commit `03f8820`. Migrazione
  `20260707120000_schema_ruoli_associativi_campagna_oneshot` invariata. Post-merge
  con T-7: `type-check` + `lint` + `test:run` (343/343) verdi sul branch di
  integrazione.
- 2026-07-07 (owner): riconciliazione board — consolidati su
  `integration/fase-1-backend` tutti i file `.task/` (001–007 + README), prima
  frammentati (001/007 committati qui, 002–006 solo untracked nel worktree `core`).
  Adottata questa copia di 001 come autoritativa (log T-1 completo:
  dev → coordinator migrate-reset → reviewer done + merge). Board unica qui.
