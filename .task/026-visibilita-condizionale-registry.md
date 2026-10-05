---
id: "026"
title: "Valutazione visibilità condizionale (registry VisibilityCondition + evaluator server-side)"
status: done
priority: P1
assignee: qa
branch: task/026-visibilita-condizionale-registry
base: task/016-catalogo-campagna-repo-api
trello: ""
created: 2026-07-13
updated: 2026-07-16
---

## Obiettivo

Rendere valutabili server-side le condizioni di visibilità referenziate da
`ReferenceData`/`CharacterData` via `visibilityConditionId` → `VisibilityCondition.functionName`,
per il caso "talento/dato visibile solo a chi soddisfa una condizione" (es. membro di una
certa fazione/religione, o con un certo talento). Copre il requisito dei talenti nascosti
per fazione. La valutazione avviene **sempre sul server**; il client non riceve mai le
voci nascoste (regola CLAUDE.md).

## Scope

Incluso:

- Registry `src/lib/visibility/` che mappa `functionName` → predicato tipizzato
  `(viewer, entry, context) => boolean`, con context `{ character, campaign, ownedData }`
  (i `CharacterData` del viewer, per valutare "appartiene alla fazione X"). Nessun codice
  utente: registry hardcoded lato dev (coerente con T-019; il modello `Function` resta
  commentato).
- `filterVisible(entries, viewer, context)` riusabile da: sidebar/sezioni (T-020),
  catalogo (T-016), scheda PG. Combina la visibilità base (`hidden` → solo staff) con la
  condizione (`functionName`). Staff/head_master vedono tutto.
- Almeno un predicato d'esempio: "visibile se il viewer possiede una `ReferenceData` del
  `DataType` `kind = faction/religion` indicata".
- Test: predicato vero/falso, `functionName` sconosciuto → fail-closed (nascosto, no
  crash), staff bypassa, isolamento multi-tenant.

Escluso:

- UI di configurazione delle condizioni da parte del master (le condizioni si assegnano
  via T-016 impostando `visibilityConditionId`); condizioni scritte dall'utente.

## Criteri di accettazione

- [x] `filterVisible` nasconde le voci la cui condizione non è soddisfatta e le mostra a
      chi la soddisfa; test.
- [x] `functionName` sconosciuto → voce **nascosta** (fail-closed), nessun crash; test.
- [x] Staff/head_master vedono anche le voci condizionate; test.
- [x] Valutazione solo server-side; nessuna voce nascosta serializzata al client; test.
- [x] Isolamento multi-tenant; `bun run type-check`, `bun run lint`, `bun run test:run` verdi.

## Artifacts

files_modified:

- src/lib/visibility/types.ts
- src/lib/visibility/predicates.ts
- src/lib/visibility/registry.ts
- src/lib/visibility/filterVisible.ts
- src/lib/visibility/index.ts
- src/lib/visibility/filterVisible.test.ts
- src/lib/visibility/predicates.test.ts
- src/lib/visibility/registry.test.ts

interfaces:

- "isEntryVisible<T extends VisibilityGated>(viewer: VisibilityViewer, entry: T, context: VisibilityContext) -> boolean"
- "filterVisible<T extends VisibilityGated>(entries: T[], viewer: VisibilityViewer, context: VisibilityContext) -> T[]"
- "getVisibilityPredicate(functionName: string) -> VisibilityPredicate | undefined"
- "memberOfAnyFactionOrReligion: VisibilityPredicate (predicato d'esempio, kind faction/religion)"
- "VisibilityViewer { userId: string; isStaff: boolean }"
- "VisibilityContext { campaign: Campaign; character: Character | null; ownedData: OwnedCharacterData[] }"
- "VisibilityGated { visibility: DataVisibility; visibilityConditionId: number | null; visibilityCondition?: { functionName: string } | null }"
- "OwnedCharacterData = CharacterData & { dataType: DataType }"

decisions:

- "quando `visibilityConditionId` è valorizzato la condizione SOSTITUISCE la visibilità di base per i non-staff (anche se `visibility = visible`): è sempre l'ultima parola, non un OR/AND con `visibility` — combo più semplice e prevedibile per chi assegna le condizioni in T-016."
- "`isStaff` è un booleano già risolto dal chiamante (stesso pattern di `isUserCampaignHelper` in characters/[id]/route.ts, non un nuovo helper): `filterVisible` resta una funzione pura, senza query, per essere riusabile e testabile senza Prisma."
- "`visibilityCondition` (relazione risolta) è opzionale sull'entry: se assente pur con `visibilityConditionId` impostato (join non incluso dal chiamante) si tratta come `functionName` sconosciuto -> fail-closed, non un'eccezione."
- "aggiunta difesa in profondità multi-tenant: `filterVisible` filtra sempre `context.ownedData` per `campaign.id` prima di passarlo al predicato, anche se il chiamante dovrebbe già passare dati scoped — evita che un bug a monte faccia trapelare un match cross-campagna."
- "predicato d'esempio `memberOfAnyFactionOrReligion`: verifica il possesso di QUALUNQUE `CharacterData` con `DataType.kind` faction/religion (non un match sulla fazione/religione specifica indicata dall'entry) — coerente con l'indicazione di usare `kind`, non `name`; un gating su un'affiliazione puntuale è un predicato futuro, fuori scope."
- "nessuna route wired in questo task: tutte le route esistenti su ReferenceData/CharacterData sono admin-only (requireCampaignAdminBySlug), quindi non c'è ancora un consumer client-facing da aggiornare — il criterio 'nessuna voce nascosta serializzata al client' è garantito qui a livello di libreria (funzione pura, nessun import da client component) e verrà esercitato concretamente dai consumer T-016/T-020/scheda PG."
- "fix review round 1 (A): `VISIBILITY_PREDICATES` da `Record<string, ...>` a `Map<string, VisibilityPredicate>` — un object literal eredita `Object.prototype`, quindi `functionName` uguali a `toString`/`constructor`/`valueOf`/`hasOwnProperty`/... risolvevano al membro ereditato (leak o crash) invece di `undefined`; `Map` non condivide prototipo con le sue chiavi. Test aggiunti in `registry.test.ts` (7 chiavi di `Object.prototype`) e end-to-end in `filterVisible.test.ts`."
- "fix review round 1 (B): l'invocazione del predicato in `isEntryVisible` è ora in `try/catch` — un predicato che lancia (bug del predicato, dato mancante in `context`, o i casi di A prima del fix) viene trattato come fail-closed (`false`), mai propagato come eccezione al chiamante. Test con predicato di scaffolding che lancia, iniettato via `vi.spyOn(registry, \"getVisibilityPredicate\")`."
- "review round 1 (C), documentato non risolto: `DataVisibility.visible` su `CharacterData` è owner-scoped (visibile al proprietario, non a chiunque) a differenza di `ReferenceData` (campaign-wide); `isEntryVisible`/`VisibilityGated` non fanno owner-scoping da soli — commento esplicito aggiunto in `filterVisible.ts` e `types.ts#VisibilityGated`: il chiamante DEVE passare solo `CharacterData` già filtrate all'owner pertinente. Nessun consumer wired ancora, quindi nessun leak attivo; da irrobustire quando T-020/scheda PG collegheranno la funzione."

## Note / Log

- 2026-07-13 (owner): nuovo task dal redesign — copre "talenti nascosti visibili solo a
  membri di una fazione/religione". Registry visibilità **distinto** da quello feature/azioni
  (T-019). Dipende da T-015 (schema) e T-016 (assegnazione delle condizioni). Consumato da
  T-016/T-020 e dalla scheda PG.
- 2026-07-14 (owner): T-015/016 sono `done` ma le PR (#32, #33) non sono ancora mergiate in
  `main` — deroga esplicita al gating §12: sblocco T-026 stackando su
  `task/016-catalogo-campagna-repo-api` (contiene 015+016), invece di attendere il merge in
  `main`. Worktree dedicato in `../core-task-026`. PR di T-026 andrà aperta con base
  `task/016-catalogo-campagna-repo-api` (a cascata, come #36), da riallineare a `main`
  quando la catena 015→016 verrà integrata.
- 2026-07-14 (dev): implementato `src/lib/visibility/` (registry + `filterVisible` +
  predicato d'esempio `memberOfAnyFactionOrReligion`) e relativi test (18 test, 3 file).
  `bun run type-check`, `bun run lint`, `bun run test:run` verdi (787/787 test, 68 file).
  Branch `task/026-visibilita-condizionale-registry`, verifica con
  `git log --oneline task/016-catalogo-campagna-repo-api..task/026-visibilita-condizionale-registry`.
  Nessuna route wired (i consumer arrivano con T-016/T-020/scheda PG): vedi decisione in
  Artifacts. Stato → `in-review`.
- 2026-07-14 (reviewer, round 1/3): **findings da correggere**, ritorno al dev.
  Bloccanti: (A) `VISIBILITY_PREDICATES` è un object literal → eredita
  `Object.prototype` (`toString`, `constructor`, `valueOf`, `hasOwnProperty`, …);
  `getVisibilityPredicate` ritorna quei membri ereditati invece di `undefined` per
  quei `functionName`, causando leak (voce `hidden` mostrata) o crash — viola il
  criterio "`functionName` sconosciuto → fail-closed/no crash" (`registry.ts:19`,
  `filterVisible.ts:47-50`). (B) l'invocazione del predicato in `filterVisible.ts:50`
  non è in `try/catch`: un predicato che lancia (inclusi i casi di A) propaga
  l'eccezione invece di essere trattato come fail-closed. Non bloccante ma da
  documentare: (C) `DataVisibility.visible` su `CharacterData` è semanticamente
  owner-scoped (visibile al proprietario, non a tutti) ma `isEntryVisible`/
  `VisibilityGated` non portano `userId`/`characterId` e trattano `visible`
  uniformemente — nessun leak attivo (nessuna route wired) ma da chiarire prima che
  T-020/scheda PG si fidino della funzione come gate completo. Confermato invece:
  decisione "condizione sostituisce visibilità base", bypass staff, difesa
  multi-tenant su `ownedData` (`scopeContextToCampaign`), nessuna route toccata.
- 2026-07-14 (dev): corretti i due bloccanti del round 1. (A) `registry.ts`:
  `VISIBILITY_PREDICATES` è ora un `Map` invece di un object literal (niente più
  eredità di `Object.prototype`); 7 nuovi test in `registry.test.ts` per le chiavi
  `Object.prototype` + 4 test end-to-end in `filterVisible.test.ts`. (B)
  `filterVisible.ts`: l'invocazione del predicato in `isEntryVisible` è ora in
  `try/catch`, fail-closed su eccezione; nuovo test con predicato di scaffolding
  che lancia (iniettato via `vi.spyOn` su `./registry`). (C) documentato con
  commenti espliciti in `filterVisible.ts` e `types.ts#VisibilityGated` (non
  risolto nel codice, come da nota non bloccante del reviewer): il chiamante deve
  passare `CharacterData` già owner-scoped. `bun run type-check`, `bun run lint`,
  `bun run test:run` verdi (799/799 test, 68 file; +12 test rispetto al round 1).
  Stato → `in-review`.
- 2026-07-14 (reviewer, round 2/3): **OK** — bloccanti A/B verificati chiusi nel
  diff effettivo (Map senza eredità di prototype su A; try/catch fail-closed su
  B), copertura test adeguata (tutte e 7 le chiavi problematiche di
  `Object.prototype`), nota C documentata e chiara. Nessuna regressione sui
  criteri già confermati (bypass staff, condizione-sostituisce-visibilità, difesa
  multi-tenant). Quality gates rieseguiti indipendentemente dal reviewer:
  type-check/lint/test:run verdi (799/799). Pronto per QA.
- 2026-07-14 (qa): **verificato, tutti i 5 criteri passano.** Letto il codice
  completo (`types.ts`, `predicates.ts`, `registry.ts`, `filterVisible.ts`,
  `index.ts`) e i 3 file di test esistenti (18+ casi: base, condizione
  vera/falsa, sostituzione visibilità, fail-closed `functionName` sconosciuto,
  relazione non inclusa, 7 chiavi di `Object.prototype` sia a livello registry
  che end-to-end in `filterVisible`, predicato che lancia via `vi.spyOn`,
  bypass staff, isolamento multi-tenant su `ownedData`, `filterVisible` su
  array misto). Quality gate rieseguiti indipendentemente: `bun run
type-check` OK, `bun run lint` OK, `bun run test:run` → 799/799 verdi (68
  file), inclusa `src/app/__tests__/multi-tenant-isolation.test.ts` (28/28)
  senza regressioni. Criterio 4 (nessun leak client-side) verificato anche via
  grep statico: nessun file con `"use client"` importa `lib/visibility`,
  nessun consumer wired (atteso, coerente con la decisione in Artifacts).
  Stress-test aggiuntivo (non incluso nella suite, eseguito e poi rimosso
  perché fuori scope): scritto un predicato realistico "membro della fazione
  SPECIFICA indicata dall'entry" (non solo kind faction/religion generico),
  con un'interfaccia entry estesa (`requiredFactionDataTypeId`) e registrato
  via `vi.spyOn(registry, "getVisibilityPredicate")` — 5 casi (match esatto
  visibile, fazione diversa nascosta, bypass staff, difesa multi-tenant su
  `ownedData` applicata anche a un predicato non previsto dal registry di dev,
  `filterVisible` su elenco misto), tutti passati: il pattern registry/context
  regge a un caso d'uso reale oltre l'esempio generico, senza modifiche al
  codice di produzione. Nessun difetto trovato. Nota C (owner-scoping
  `CharacterData.visible` non gestito da questo modulo) confermata come
  documentata e non bloccante qui, da verificare quando T-020/scheda PG
  collegheranno la funzione — non è un gap di questo task. Stato → `in-review`
  (pronto per decisione merge dell'owner).
- 2026-07-14 (owner): push del branch + PR #39 aperta verso
  `task/016-catalogo-campagna-repo-api` (stacked su #33, non ancora mergiata in
  `main`) — coerente con la deroga al gating §12 annotata sopra. Da riallineare a
  `main` quando la catena 015→016 verrà integrata.
- 2026-07-16 (owner): status → done (review + QA puliti, nessun finding
  bloccante residuo; nota: per §6 del README il `done` spetta formalmente a
  dopo il merge — deviazione esplicita su istruzione diretta dell'utente,
  stesso trattamento già applicato a T-016, per non tenere il task fermo su
  "in-review" mentre attende solo il merge a monte di PR #32/#33 non ancora
  integrate). Follow-up non bloccante aperto: nota C del reviewer round 1
  (owner-scoping di `CharacterData.visible` non gestito da questo modulo) da
  verificare quando T-020/scheda PG collegheranno la funzione. PR #39 resta
  aperta verso `task/016-catalogo-campagna-repo-api`, da riallineare a `main`
  quando la catena 015→016 verrà integrata.
