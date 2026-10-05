---
id: "014"
title: "Risolvi conflitti di merge tra main e integration/fase-1-backend (PR #29)"
status: done
priority: P0
assignee: dev
branch: task/014-risolvi-conflitti-merge-main
base: integration/fase-1-backend
trello: ""
created: 2026-07-10
updated: 2026-07-10
---

## Obiettivo

La PR #29 (`integration/fase-1-backend` → `main`) è in conflitto
(`mergeStateStatus: DIRTY`, `mergeable: CONFLICTING`). `main` è andato avanti in
autonomia con 7 commit (font, webp, fix CSS/console, lint/type-check) che non
sono mai stati portati dentro `integration/fase-1-backend`. Riconciliare i due
branch così la PR torna mergiabile senza perdere lavoro da nessuna delle due
parti.

## Scope

Incluso:

- Creare `task/014-risolvi-conflitti-merge-main` da `integration/fase-1-backend`,
  fare `git merge origin/main` lì dentro e risolvere **tutti** i conflitti.
- File toccati su entrambi i lati dal commit comune (`git merge-base
origin/main integration/fase-1-backend`) — verificare ognuno per conflitti
  testuali reali:
  - `.storybook/preview.tsx`, `scripts/children-prop-codemod.mjs`
  - `src/app/__tests__/multi-tenant-isolation.test.ts`
  - `src/app/(dashboard)/_components/RolesManager.tsx`
  - `src/app/(dashboard)/dashboard/[campaignSlug]/characters/[id]/__tests__/page.test.tsx`
  - `src/app/(dashboard)/dashboard/profile/page.tsx`
  - `src/app/api/admin/users/route.ts`
  - `src/app/api/campaigns/__tests__/route.test.ts`
  - `src/app/api/characters/__tests__/route.test.ts`
  - `src/app/api/events/__tests__/route.test.ts`
  - `src/app/api/memberships/__tests__/route.test.ts`
  - `src/app/api/organizations/[orgId]/campaigns/route.ts`
  - `src/app/api/profile/route.ts`, `src/app/api/profile/update/route.ts`
  - `src/app/loading.test.tsx`
  - `src/components/stories/InputSelect.tsx`, `src/components/utils/setTextBold.tsx`
  - `src/lib/auth.test.ts`, `src/lib/authorization.test.ts`
  - `src/lib/repositories/campaign.repository.test.ts`,
    `src/lib/repositories/data.repository.test.ts`,
    `src/lib/repositories/dataType.repository.test.ts`,
    `src/lib/repositories/index.ts`,
    `src/lib/repositories/organization.repository.test.ts`,
    `src/lib/repositories/personalData.repository.ts`
  - `src/lib/validations/profile.ts`
  - `src/test/helpers/prisma-fixtures.ts`, `src/test/helpers/test-utils.tsx`,
    `src/test/mocks/msw-handlers.ts`, `src/test/mocks/prisma.ts`,
    `src/test/setup.ts`
- Preservare le funzionalità introdotte da `main` (font Roboto singolo, webp,
  fix scrolling CSS, fix console errors, esiti lint/type-check) **insieme** a
  tutto il lavoro di Fase 1 Backend (ruoli, grant, impersonation, profilo).
- Dopo il merge: `bunx prisma generate`, poi i 3 gate verdi (type-check, lint,
  test:run) nel branch `task/014-*`.
- Merge di `task/014-*` in `integration/fase-1-backend` (`--no-ff`) e push, così
  la PR #29 si aggiorna automaticamente e torna `MERGEABLE`.

Escluso:

- Nuove feature o refactor non necessari alla risoluzione dei conflitti.
- Modifiche a `main` direttamente (si lavora solo su `task/014-*` e poi su
  `integration/fase-1-backend`).

## Criteri di accettazione

- [x] Nessun marker di conflitto (`<<<<<<<`, `=======`, `>>>>>>>`) residuo nel
      working tree dopo il merge.
- [x] `bun run type-check` verde su `task/014-risolvi-conflitti-merge-main`.
- [x] `bun run lint` verde.
- [x] `bun run test:run` verde (o fallimenti pre-esistenti documentati vs base).
- [x] `task/014-*` mergiato in `integration/fase-1-backend` e pushato.
- [x] `gh pr view 29 --json mergeable,mergeStateStatus` riporta
      `"mergeable":"MERGEABLE"`.

## Artifacts

files_modified:

- `.storybook/preview.tsx` — conflitto reale, risolto a mano
- `src/components/utils/setTextBold.tsx` — conflitto reale, risolto a mano
- `src/lib/repositories/index.ts` — conflitto reale, risolto a mano
- `src/app/__tests__/multi-tenant-isolation.test.ts` — preso HEAD
- `src/app/api/profile/route.ts` — conflitto add/add, preso HEAD
- `src/app/api/profile/update/route.ts` — conflitto add/add, preso HEAD
- `src/lib/repositories/personalData.repository.ts` — conflitto add/add, preso HEAD
- `src/lib/validations/profile.ts` — conflitto add/add, preso HEAD
- `src/test/mocks/prisma.ts` — conflitto reale, preso HEAD (mockDeep)
- `src/app/api/campaigns/__tests__/route.test.ts` — preso HEAD
- `src/app/api/characters/__tests__/route.test.ts` — preso HEAD
- `src/app/api/events/__tests__/route.test.ts` — preso HEAD
- `src/app/api/memberships/__tests__/route.test.ts` — preso HEAD
- `src/lib/repositories/dataType.repository.test.ts` — preso HEAD
- `src/lib/repositories/organization.repository.test.ts` — preso HEAD
- `src/lib/repositories/data.repository.test.ts` — preso HEAD
- `src/lib/repositories/campaign.repository.test.ts` — preso HEAD
- `src/lib/auth.test.ts` — preso HEAD
- `src/lib/authorization.test.ts` — preso HEAD
- `src/test/helpers/prisma-fixtures.ts` — preso HEAD
- `src/test/helpers/test-utils.tsx` — preso main (fix lint import/named)
- `src/test/setup.ts` — preso HEAD
- Merge commit `b62bac0` (`origin/main` → `task/014-*`): altri ~35 file
  toccati su entrambi i lati sono stati risolti automaticamente da
  `git merge` (3-way, nessun marker di conflitto), verificati a campione
  (`RolesManager.tsx`, `admin/users/route.ts`,
  `organizations/[orgId]/campaigns/route.ts`,
  `characters/[id]/__tests__/page.test.tsx`, `loading.test.tsx`,
  `InputSelect.tsx`, `scripts/children-prop-codemod.mjs`, `profile/page.tsx`)
  e coperti dai 3 gate verdi.

interfaces: nessuna interfaccia nuova o modificata (solo risoluzione conflitti,
nessuna feature nuova).

decisions:

- I 21 conflitti testuali reali riguardavano quasi tutti lo stesso pattern: i
  commit di lint/type-check fatti indipendentemente su `main` (`fe82cae`,
  `5842197`-equivalenti) e su `integration/fase-1-backend` (T-007, commit
  `5842197`) hanno risolto lo stesso debito in modo diverso. Criterio generale
  usato: quando un lato è un puro superset dell'altro (stessi fix + più
  funzionalità/test), si prende il lato più ricco; quando main referenzia
  enum/funzioni ormai obsolete (es. `Role.admin`/`Role.helper`, sostituiti da
  `Role.head_master/master/supporter` nel refactor ruoli di Fase 1 Backend, mai
  toccato da main), si scarta la versione main perché non compilerebbe più
  contro lo schema Prisma corrente.
- `src/test/mocks/prisma.ts`: HEAD usa `vitest-mock-extended` (`mockDeep`,
  `prismaMock`/`prismaClient` tipizzati) introdotto nel commit T-007
  ("bonifica debito type-check e lint pre-esistente", 0 errori/0 warning,
  343/343 test verdi); main aveva mantenuto i mock manuali `vi.fn()` con un
  secondo export `prismaMockFns` come workaround di tipizzazione. Presa la
  versione HEAD per l'intero file e per tutti i test dipendenti (rename
  `prismaMockFns` → `prismaMock`/`prismaClient`), dato che è la soluzione più
  matura e già verificata.
- `src/app/api/profile/route.ts`, `.../profile/update/route.ts`,
  `personalData.repository.ts`, `validations/profile.ts` (conflitti add/add):
  main aveva aggiunto una prima versione minimale della feature profilo
  (commit "fix console errors read in dev tools") indipendentemente
  dall'implementazione già presente su `integration/fase-1-backend`
  (commit 61f20ab + fix successivo 7c879e1 "correggi rate-limit bypassato,
  impersonation ed email denormalizzata"). La versione HEAD è un superset più
  sicuro (richiede `currentPassword` per il cambio email, blocca il cambio
  email durante l'impersonificazione, passa dal router HTTP di Better Auth per
  beneficiare del rate-limit nativo); presa integralmente, scartata quella di
  main. Verificato che `dashboard/profile/page.tsx` (merge automatico, nessun
  conflitto) è già scritto contro la shape `{ user, personalData }` di HEAD.
- `src/lib/repositories/index.ts`: il conflitto era solo l'assenza su main di
  `export * from "./grant.repository"` e `"./user.repository"` (repository non
  esistenti su main); presi gli export aggiuntivi di HEAD.
- `.storybook/preview.tsx`, `src/components/utils/setTextBold.tsx`: allineati
  al font Roboto singolo introdotto da main (che ha rimosso l'intero sistema di
  temi multi-font, non toccato da `integration/fase-1-backend` — vedi
  `src/app/layout.tsx`, mai modificato lato Fase 1 Backend, quindi già mergiato
  pulito con la versione main). Il parametro `_font`/`font` inutilizzato in
  `setTextBold` è stato rimosso (versione main) invece di essere solo
  rinominato con `_` (versione HEAD), perché nessun call-site lo usa.
- `src/test/helpers/test-utils.tsx`: presa la versione main
  (`// eslint-disable-next-line import/named` + import non type-only di
  `RenderOptions`), fix mirato per un falso positivo del resolver di
  `import/named` (regola attiva come `error` in `eslint.config.mjs`) su
  quell'export generico di `@testing-library/react`.
- Circa 35 file elencati nello Scope come "toccati su entrambi i lati" sono
  stati auto-risolti da `git merge` (3-way) senza marker di conflitto:
  verificato via `diff` mirato che per ciascuno o (a) il risultato coincide con
  HEAD (main non aveva modifiche indipendenti sopravvissute, es.
  `admin/users/route.ts`), o (b) le modifiche non si sovrapponevano
  testualmente (es. `RolesManager.tsx`, `profile/page.tsx` — font/stile da
  main + feature da HEAD sulle stesse righe ma hunk diversi). Nessun intervento
  manuale necessario oltre alla verifica.
- Nessun fallimento pre-esistente da documentare: i 3 gate (`type-check`,
  `lint`, `test:run` — 624/624) sono verdi sia prima del commit di merge che
  dopo, senza eccezioni.

## Note / Log

- 2026-07-10 (owner): task creato come P0. PR #29 CONFLICTING contro `main`,
  che ha 7 commit non ancora integrati (`a35e1e4`…`70ab6d6`: type-check, lint,
  font, webp, fix CSS/console). 30 file toccati su entrambi i lati dal
  merge-base — elenco in Scope. Assegnato a dev.
- 2026-07-10 (dev): inizio implementazione. Branch `task/014-risolvi-conflitti-merge-main`
  creato da `origin/integration/fase-1-backend`. Prossimo: `git merge origin/main`
  e risoluzione conflitti file per file.
- 2026-07-10 (dev): `git merge origin/main` eseguito, 21 file con conflitto
  testuale reale (su 30 dello Scope) risolti a mano — dettagli e criteri in
  Artifacts. Gli altri ~35 file toccati su entrambi i lati sono stati
  auto-risolti dal 3-way merge e verificati a campione.
- 2026-07-10 (dev): `bunx prisma generate` OK. Gate verdi su
  `task/014-risolvi-conflitti-merge-main`: `type-check` 0 errori, `lint` 0
  errori/0 warning, `test:run` 624/624 (55 file). Nessun fallimento
  pre-esistente da documentare. Merge commit `b62bac0`. Status → in-review.
  Prossimo: merge `--no-ff` in `integration/fase-1-backend` e push (come da
  procedura indicata dall'owner per questo task), poi verifica `gh pr view 29`.
- 2026-07-10 (dev): `git merge --no-ff task/014-risolvi-conflitti-merge-main`
  in `integration/fase-1-backend` (commit `18a8343`), nessun conflitto
  aggiuntivo (albero identico a `task/014-*`, verificato con `git diff
--stat` vuoto). Push su origin (`fff3a9b..18a8343`).
  `gh pr view 29 --json mergeable,mergeStateStatus` → `"mergeable":
"MERGEABLE"` (`mergeStateStatus: "UNSTABLE"`, in attesa dei check CI —
  fuori scope di questo task). Criteri di accettazione tutti soddisfatti.
  Nota ambientale: eseguendo i gate dal checkout condiviso
  `/Users/mattiafattorello/repo/arcanadomine/core` (anziché dal worktree
  isolato dell'agente) compaiono falsi positivi — `.next/dev/types/
validator.ts` stale (gitignorato, non correlato) ed ESLint che scansiona
  anche la copia annidata `.claude/worktrees/agent-.../src` come se fosse
  parte del progetto. Non sono problemi reali del codice: `git diff --stat`
  tra `integration/fase-1-backend` e `task/014-*` è vuoto, quindi i gate
  verdi già verificati nel worktree isolato restano validi per lo stato
  finale pushato.
- 2026-07-10 (owner): verdetto reviewer round 1 — **OK pulito**, nessun
  bounce. Verificate le 5 decisioni di risoluzione conflitto contro i 7
  commit di `main`: nessuna funzionalità persa (font/webp/css-scrolling/
  console-fix di `main` tutti presenti in HEAD; `grant.repository`/
  `user.repository` di Fase 1 presenti; nessun `.skip`/`.todo` introdotto).
  Gate rilanciati dal reviewer sul tree isolato: 0 errori type-check, 0
  lint, 624/624 test. I falsi positivi visti dal dev sul checkout condiviso
  erano dovuti al worktree annidato `.claude/worktrees/agent-ad97c5a0c068edbdc`
  (non escluso da vitest/eslint) — rimosso (`git worktree remove --force`),
  albero verificato identico prima della rimozione (`git diff --stat` vuoto).
  Nessun ulteriore giro dev↔reviewer necessario. Prossimo: qa.
- 2026-07-10 (qa): verifica indipendente sul checkout condiviso
  `/Users/mattiafattorello/repo/arcanadomine/core`, branch
  `integration/fase-1-backend` @ `1fac09a` (`git status` pulito, in sync con
  `origin/integration/fase-1-backend`). Nessun worktree annidato residuo
  (`.claude/worktrees` vuota, `git worktree list` mostra solo il checkout
  principale) — confermato che il falso positivo del dev non può ripresentarsi.
  Gate rilanciati io stesso, da zero (`rm -rf .next` prima):
  `bunx prisma generate` OK; `bun run type-check` → 0 errori; `bun run lint` →
  0 errori/0 warning; `bun run test:run` → **624/624** (55 file, 5.45s).
  Rilanciato anche isolato `bunx vitest run
src/app/__tests__/multi-tenant-isolation.test.ts` → **28/28 passed**.
  `gh pr view 29 --json mergeable,mergeStateStatus,statusCheckRollup` →
  `"mergeable":"MERGEABLE"`, `"mergeStateStatus":"UNSTABLE"` (unico blocco a
  UNSTABLE sono check Netlify deploy-preview `IN_PROGRESS`/`PENDING`, non CI di
  questo repo, fuori scope del task — nessun conflitto residuo). Nessun marker
  `<<<<<<<`/`=======`/`>>>>>>>` residuo (`grep -rn` su `src/`, `.storybook/`,
  `scripts/`, `prisma/` → 0 risultati). Controlli funzionali mirati: (1) letti
  per intero `src/app/api/profile/route.ts` e
  `src/app/api/profile/update/route.ts` — confermato che è la versione Fase 1
  (HEAD): `wantsEmailChange` blocca il cambio email se
  `context.isImpersonating` (403 "Operazione non consentita durante
  l'impersonificazione"), richiede `currentPassword` e lo verifica via
  `/verify-password` instradato attraverso `callAuthEndpoint` (router HTTP
  Better Auth, rate-limited) prima di `/change-email`; (2) `src/app/layout.tsx`
  usa un unico font `Roboto` da `next/font/google` (nessun sistema multi-font
  residuo); grep di tutti i riferimenti `.webp` in `src/` (`globals.css`,
  `(front)/data.ts`, `profile/conventions/page.tsx`) e verificato che ogni file
  referenziato esiste davvero sotto `public/` (10/10 presenti: convention
  logos, `corporate/camp_isola_background.webp`, `texture-fantasy.webp`); (3)
  `grep -rn "prismaMockFns" src/` → 0 risultati, nessun riferimento pendente;
  `src/test/mocks/prisma.ts` usa `mockDeep`/`vitest-mock-extended` come
  dichiarato. Nessun difetto trovato. **Verdetto: pronto per merge in main**
  — tutti i criteri di accettazione osservati passare di persona, PR #29
  MERGEABLE, nessuna regressione, nessuna funzionalità persa da nessuno dei
  due lati. Status → done.
