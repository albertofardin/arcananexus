---
id: "007"
title: "Bonifica debito type-check/lint pre-esistente"
status: done
priority: P2
assignee: reviewer
branch: task/007-bonifica-type-check-lint
trello: ""
created: 2026-07-07
updated: 2026-07-07T10:45
---

## Obiettivo

Riportare `bun run type-check` e `bun run lint` a verde. Su `main` esistono errori
pre-esistenti (rilevati durante la T-1): ~208 errori di type-check e ~38 errori + 16
warning di lint, **non introdotti da nessun task di Fase 1**. Vanno bonificati per
poter usare type-check/lint come gate affidabile sui task successivi.

## Scope

Incluso (dalle osservazioni della T-1):

- Mock Prisma non tipizzati nei test dei repository.
- Tipi stale in `.next/types`.
- Cast `Mock` su `auth.api.getSession` nei test di route.
- `@typescript-eslint/no-explicit-any` diffuso nei test dei repository.

Escluso:

- Modifiche di comportamento/produzione: è una bonifica di soli tipi/lint e test.

## Criteri di accettazione

- [x] `bun run type-check` verde (0 errori).
- [x] `bun run lint` verde (0 errori; warning ridotti o giustificati).
- [x] `bun run test:run` resta verde.

## Note / Log

- 2026-07-07 (owner): task creato a valle della T-1, che ha rilevato il debito
  pre-esistente e verificato (diff-zero) di non averlo introdotto. Priorità P2:
  non blocca la Fase 1 ma va chiuso per riabilitare i gate.
- 2026-07-07 (dev): inizio implementazione. Lavoro in worktree separato
  `../core-task-007` (branch `task/007-bonifica-type-check-lint` da
  `origin/main`) per non toccare i worktree già occupati da altri task in
  corso (001, 006).
- 2026-07-07 (dev): ripreso dopo un tentativo precedente morto per limite di
  sessione (nessun commit). Nel worktree erano già presenti, non committate,
  le modifiche a `src/test/mocks/prisma.ts` (mock Prisma via
  `vitest-mock-extended` `mockDeep<PrismaClient>()`) e un fix parziale in
  `multi-tenant-isolation.test.ts`. `type-check` sul branch prima di
  proseguire: 133 errori (contro ~201 su `main` pulito, quindi il lavoro
  precedente aveva già ridotto il debito). Diagnosticato che il resto degli
  errori TS2615 ("circularly references itself") è un bug noto
  Prisma/vitest-mock-extended sul tipo `groupBy` (having-clause
  auto-referenziale) che si manifesta perché questo repo ha
  `strictNullChecks: false` in `tsconfig.json` (prisma/prisma#10203) — non
  risolvibile abilitando `strictNullChecks` senza uscire dallo scope "solo
  test" (impatterebbe tutta la codebase di produzione). Fix: in
  `src/test/mocks/prisma.ts`, `prismaMock` è ora tipizzato su una vista del
  client senza `groupBy` per model (`OmitGroupBy<PrismaClient>`, via cast
  esplicito e documentato, il mock reale a runtime resta invariato) per
  configurare i mock senza innescare il bug; esportato anche `prismaClient`
  (stesso oggetto, tipato `PrismaClient`) da passare alle funzioni
  repository/authorization che richiedono `prisma: PrismaClient`.
  Aggiornati i call-site in `authorization.test.ts`,
  `campaign.repository.test.ts`, `data.repository.test.ts`,
  `dataType.repository.test.ts`, `organization.repository.test.ts` per
  usare `prismaClient` invece di `prismaMock` quando passato come argomento.
  Sostituiti 3 `mockImplementation(({ where }) => ...)` in
  `authorization.test.ts` con catene `mockResolvedValueOnce` (stesso pattern
  già usato in `multi-tenant-isolation.test.ts`), perché il tipo del client
  reale Prisma (`Prisma__GrantClient`, fluent) non è compatibile con una
  funzione che ritorna una `Promise` semplice.
  Risolti anche gli errori `TS2352` su `(auth.api.getSession as Mock)` in
  4 file di test di route (`memberships`, `characters` route+page, `events`)
  con `as unknown as Mock` (il tipo reale di better-auth `getSession` non si
  sovrappone a sufficienza con `Mock` per un cast diretto).
  Risultato: `bun run type-check` → 0 errori (verificato due volte per
  escludere non-determinismo della cache di TS sul bug TS2615).
  `bun run test:run` → 343/343 verdi. Prossimo passo: lint.
- 2026-07-07 (dev): bonificato anche `bun run lint` (partiva da 39 errori +
  16 warning). Fix principali:
  - **`no-explicit-any` nei test dei repository** (`campaign.`,
    `dataType.`, `organization.repository.test.ts`, ~35 occorrenze totali):
    ora che `prismaMock` è tipizzato correttamente (vedi log precedente),
    i cast `as any` sui valori passati a `.mockResolvedValue(...)` erano
    solo un workaround per lo stesso bug TS2615 e non servivano più; rimossi
    senza introdurre altri cast.
  - **`import/order` — pattern "vi.mock poi import" nei test di route**
    (`campaigns`, `characters`, `events`, `memberships`
    `__tests__/route.test.ts`): la regola `newlines-between: never` non
    tollera la riga vuota tra il primo blocco di import e l'import "post-mock"
    (`import { prisma } from '@/lib/db'` dopo `vi.mock('@/lib/db', ...)`).
    Vitest hoista comunque le chiamate `vi.mock` sopra tutti gli import a
    prescindere dalla posizione nel sorgente (verificato coi test dopo la
    modifica), quindi ho spostato questi import "post-mock" nel blocco di
    import iniziale e lasciato i `vi.mock(...)` subito dopo, senza righe
    vuote intermedie. Comportamento a runtime invariato.
  - **`import/order` in `scripts/children-prop-codemod.mjs`**: falso
    positivo dovuto a `const require = createRequire(...)` — il resolver di
    eslint-plugin-import riconosce staticamente `require(...)` come uno
    pseudo-import e lo mette in conflitto di gruppo con gli import ESM
    sovrastanti. Rinominata la variabile locale in `nodeRequire` (nessun
    cambio di comportamento, verificato con `bun run children:check`).
  - **`no-duplicate-imports`** in `src/test/helpers/prisma-fixtures.ts`:
    unificati i due import da `@prisma/client` in uno solo con `type` inline
    sui tipi.
  - **`import/named`** in `src/test/helpers/test-utils.tsx` (`RenderOptions`
    non risolto da `@testing-library/react`): risolto con
    `import { render, type RenderOptions } from ...` (limite del resolver
    di eslint-plugin-import su questo export generico, non un problema
    reale di tipo — `tsc` non si lamentava).
  - **`no-explicit-any` residui** in `src/lib/auth.test.ts` e
    `src/test/setup.ts`: sostituiti con `Record<string, unknown>` /
    `unknown` al posto di `any`.
  - **16 warning `no-unused-vars` pre-esistenti** (sparsi tra `.storybook/`,
    test e un paio di route handler): rimossi import/variabili morte o
    prefissati con `_` i parametri intenzionalmente non usati (stub HTTP
    method su `organizations/[orgId]/campaigns/route.ts`,
    `setTextBold`'s `font`). Nessuna modifica di comportamento — solo pulizia
    lint. Nessun `eslint-disable` introdotto: tutti i casi erano risolvibili
    con una tipizzazione o una rimozione pulita.

  **Risultato finale**: `bun run type-check` → 0 errori (era ~201 su
  `main`/`origin` pulito). `bun run lint` → 0 errori, 0 warning (era 39
  errori + 16 warning). `bun run test:run` → 343/343 verdi, invariati.
  Nessuna modifica a logica di route handler/repository/UI: solo tipi dei
  mock di test, ordine/pulizia import, e param/variabili non usate.
  Verifica: dalla worktree `../core-task-007` (branch
  `task/007-bonifica-type-check-lint`), `bun run type-check && bun run lint
&& bun run test:run`.

- 2026-07-07T10:45 (reviewer): review OK. Modifiche di produzione tutte cosmetiche
  (import inutilizzati rimossi, param prefissati `_`, `require`→`nodeRequire` con
  commento, wrapping riga); nessun cambio di logica; la route
  `organizations/[orgId]/campaigns` resta scoped per `organizationId`; i cambi ai
  test non indeboliscono asserzioni (deep-mock `mockDeep` + split
  `prismaMock`/`prismaClient`, fix TS2615 su `groupBy`). Merge in
  `integration/fase-1-backend` con `git merge --no-ff` → commit `21c20b2`.
  Conflitti risolti combinando i campi nuovi delle fixture di T-1
  (associationRole/status, campaign.type, mockGrant=head_master) con la
  ristrutturazione mock di T-7 in `prisma-fixtures.ts`, `authorization.test.ts`,
  `multi-tenant-isolation.test.ts` (mappatura ruoli admin→head_master,
  helper→supporter). Obiettivo raggiunto sull'integrato: `type-check` 0 errori,
  `lint` 0 errori, `test:run` 343/343 verdi. Task portato a `done`.
