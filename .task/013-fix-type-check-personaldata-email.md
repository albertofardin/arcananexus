---
id: "013"
title: "Fix type-check rotto su integration (PersonalData.email + .next stale)"
status: done
priority: P0
assignee: owner
branch: task/013-fix-type-check-personaldata-email
base: integration/fase-1-backend
trello: ""
created: 2026-07-09
updated: 2026-07-09
---

## Obiettivo

Riportare `bun run type-check` a verde sul branch `integration/fase-1-backend`.
Oggi è rotto: blocca il criterio di accettazione "type-check verde" di TUTTI i
task in corso (009–012), che branchano da `integration`. È un P0 bloccante:
va risolto e mergiato **prima** degli altri, così gli altri partono da una base
sana.

## Scope

Incluso:

- **Causa reale** — il model Prisma `PersonalData` espone un campo `email`
  (required) non allineato al codice:
  - `src/lib/repositories/personalData.repository.ts:20` — la `create` non passa
    `email` (TS2322 su `PersonalDataUncheckedCreateInput`).
  - `src/test/helpers/prisma-fixtures.ts:164` — `mockPersonalData` non include
    `email` nel base object (TS2322: `email` optional vs required).
    Allineare codice e fixture allo schema: verificare in `prisma/schema.prisma`
    se `email` su `PersonalData` è voluto required. Se sì → aggiungere `email` a
    fixture e al percorso di create (schema Zod/`createPersonalData` + eventuali
    chiamanti). Se `email` NON doveva essere required (o non esistere) → correggere
    lo schema + migrazione Prisma. **Decidere in base allo schema e ai chiamanti,
    documentando la scelta in Artifacts/decisions.**
- **Artefatti stale `.next`** — i 7 errori `.next/types/validator.ts` (TS2307
  "Cannot find module '.../page.js'" per admin/events/memberships/login/
  registration/resetpassword) sono type generati obsoleti nel `.next` della
  working copy. In un checkout pulito `tsc` non li include. Verificare che
  spariscano rigenerando (`rm -rf .next` o `bun run build`) e non nascondano
  route realmente rotte (alcune pagine sono state spostate sotto
  `org/[orgSlug]` in fase-1). Se una route referenziata non esiste più è solo
  artefatto stale; se invece manca una pagina attesa, segnalarlo (fuori scope
  il ripristino, va all'owner).

Escluso:

- Refactor non necessari al di fuori di ciò che serve per il verde di type-check.
- Bonifica lint/test estesa oltre a non introdurre regressioni (T-007 ha già
  fatto la bonifica di base; qui è la sola regressione `PersonalData.email`).

## Criteri di accettazione

- [x] `bun run type-check` è **verde** (0 errori) su `task/013-*`.
- [x] `bun run lint` verde (nessuna regressione introdotta).
- [x] `bun run test:run` verde (o fallimenti pre-esistenti documentati vs base).
- [x] La scelta su `PersonalData.email` (allineare codice vs correggere schema) è
      documentata in `## Artifacts` → decisions, coerente con `prisma/schema.prisma`.
- [x] Nessun errore residuo `.next/types/validator.ts` in un checkout pulito
      (rigenerato), oppure spiegazione se una route è realmente assente.

## Artifacts

files_modified:

- nessun file sorgente modificato (vedi decisions: causa reale era il Prisma
  Client generato in `node_modules/.prisma/client`, non tracciato in git)
  interfaces:
- (nessuna firma nuova/cambiata — `upsertPersonalData`/`mockPersonalData`
  restano invariate, coerenti con lo schema che non ha mai avuto `email`)
  decisions:
- "Causa reale diversa dall'ipotesi in Scope: `prisma/schema.prisma` NON ha
  (e non deve avere) `email` su `PersonalData` — è rimosso di proposito, vedi
  commento a schema.prisma:86-88 ('Nessuna copia dell'email... vedi review T-6,
  MAJOR #3'). Il codice (`personalData.repository.ts`, `prisma-fixtures.ts`)
  era già coerente con lo schema attuale. L'errore TS2322 veniva dal Prisma
  Client generato in `node_modules/.prisma/client`, stale: conteneva ancora
  `email String` (verificato confrontando `node_modules/.prisma/client/schema.prisma`
  con `prisma/schema.prisma` sorgente). Fix: `bunx prisma generate` per
  riallineare il client al sorgente. Nessuna migrazione DB necessaria (schema e
  DB erano già corretti), nessun cambio di codice sorgente necessario."
- "Gli errori stale `.next/types/validator.ts` erano dovuti a un `.next`
  precedente nel worktree; rigenerati (`rm -rf .next` prima del type-check nel
  worktree pulito) e non ricompaiono — nessuna route mancante rilevata."

## Note / Log

- 2026-07-09 (owner): task creato come P0. Rilevato durante il setup di 009–012:
  `bun run type-check` su `integration/fase-1-backend` fallisce con 2 errori reali
  (`PersonalData.email` mancante in repository.create e in `mockPersonalData`) +
  7 errori stale `.next/types/validator.ts`. Blocca il gate type-check degli altri
  task → va mergiato per primo, gli altri ribranchano dalla `integration` sanata.
- 2026-07-09 (dev): inizio implementazione nel worktree `core-task-013`, branch
  `task/013-fix-type-check-personaldata-email` (già in checkout).
- 2026-07-09 (dev): root cause non era il codice ma il Prisma Client generato
  stale (`email` residuo da schema precedente); `bunx prisma generate` risolve
  entrambi gli errori TS2322 senza toccare `personalData.repository.ts` né
  `prisma-fixtures.ts`. Vedi Artifacts/decisions.
- 2026-07-09 (dev): tutti e 3 i gate verdi nel worktree —
  `bun run type-check` 0 errori, `bun run lint` 0 warning/errori,
  `bun run test:run` 546/546 test passati (42 file). Nessuna regressione vs
  base. Status → `in-review`. Verifica: `git switch task/013-fix-type-check-personaldata-email`
  (nel worktree `core-task-013`), poi `bunx prisma generate && bun run type-check`.
- 2026-07-09 (owner): review integratore — nessun codice sorgente cambiato (solo
  regenerazione client + doc), review pesante non necessaria. Gate verificati sul
  checkout principale post-merge: `bun run type-check` 0 errori (dopo `rm -rf .next`
  stale). Merge in `integration/fase-1-backend` (`--no-ff`). Status → `done`.
  Nota operativa: `bunx prisma generate` va rieseguito dopo ogni cambio schema /
  checkout fresco (già in CLAUDE.md).
