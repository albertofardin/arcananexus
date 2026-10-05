---
id: "044"
title: "Messaggio errore: XP insufficiente su RequirementsNotSatisfiedError non viene comunicato (fallback generico)"
status: done
priority: P1
assignee: ""
branch: task/044-messaggio-xp-insufficiente-requisiti
base: nuova_frontiera
trello: ""
created: 2026-07-24
updated: 2026-07-24
---

## Obiettivo

Gap trovato investigando una segnalazione utente (PG 29, tentativo di
apprendere "Addestramento fisico 2" in Nuova Frontiera via
`downtimeLearnTalent`): il rifiuto era corretto (XP insufficienti, 0
disponibili contro 30 richiesti — requisiti e conflitti tutti soddisfatti),
ma il toast mostrava solo il messaggio generico "I requisiti per questa
voce di catalogo non sono soddisfatti.", senza dire che il problema era
l'XP.

Causa: `RequirementsNotSatisfiedError.evaluation` include `xpCost`/
`xpAvailable`/`xpSufficient` (oltre a `missingRequires`/
`missingRequirementGroups`/`blockingConflicts`), ma
`formatRequirementEvaluationMessage`/`isEvaluationErrorDetails`
(`src/lib/requirementErrorMessage.ts`, T-043) leggono solo questi ultimi
tre campi. Quando `missingRequires`/`missingRequirementGroups`/
`blockingConflicts` sono tutti vuoti ma `xpSufficient === false`, il
messaggio costruito è vuoto/assente e si ricade sul messaggio generico —
esattamente il sintomo segnalato. Non è un problema nuovo introdotto da
T-043: T-043 ha semplicemente scoperto (senza risolverlo) che questo campo
non era mai stato gestito nemmeno nella versione originale di
`CharacterCreationForm.mapSubmitErrorMessage` da cui l'helper è stato
estratto.

## Scope

Incluso:

- `src/lib/requirementErrorMessage.ts`: estendere
  `isEvaluationErrorDetails`/`formatRequirementEvaluationMessage` per
  leggere anche `xpCost`/`xpAvailable`/`xpSufficient` dalla evaluation, e
  includere nel messaggio finale un'indicazione esplicita quando
  `xpSufficient === false` (es. "XP insufficienti (disponibili X,
  richiesti Y)"), con lo stesso stile già usato per `InsufficientXpError`
  in `mapSubmitErrorMessage` ("disponibili X XP, richiesti Y XP").
- Il messaggio deve comporsi correttamente in tutte le combinazioni
  possibili: solo XP insufficiente, XP insufficiente + requisiti mancanti
  insieme, nessun problema di XP (comportamento invariato).
- Verificare se `CharacterCreationForm.tsx` (che condivide lo stesso
  helper) soffre dello stesso sintomo nel flusso di creazione PG — se sì,
  è già coperto dal fix condiviso; aggiungere comunque un test dedicato lì
  per confermarlo esplicitamente (l'investigazione precedente non l'aveva
  verificato).
- Test per il nuovo comportamento in `FeatureActionForm.test.tsx` (il test
  esistente a riga ~127 copre solo la forma `{available, cost}` di
  `InsufficientXpError`, non lo scenario reale `evaluation.xpSufficient
=== false` con gli altri campi vuoti — aggiungere quello mancante).

Escluso:

- Nessuna modifica alla logica di valutazione XP/requisiti server-side
  (`evaluateRequirements`, `getXpBalance`, `debitTalent`) — il dato è già
  corretto e presente, manca solo la resa del messaggio.
- Nessuna modifica al comportamento quando l'errore è realmente
  `InsufficientXpError` (percorso master/`debitTalent` con override) — quel
  caso è già gestito correttamente da `isXpErrorDetails`.

## Criteri di accettazione

- [x] Un tentativo di apprendere un talento con requisiti soddisfatti ma
      XP insufficiente mostra un messaggio che indica esplicitamente XP
      disponibili e richiesti (non il messaggio generico) — test su
      `FeatureActionForm.test.tsx` che riproduce lo scenario esatto
      (evaluation con `missingRequires`/`missingRequirementGroups`/
      `blockingConflicts` vuoti, `xpSufficient: false`).
- [x] Un tentativo con requisiti mancanti E XP insufficiente insieme
      mostra entrambe le informazioni nel messaggio; test.
- [x] Nessuna regressione sui messaggi già corretti (requisiti mancanti
      senza problema XP, OR-group, conflitti bloccanti, `InsufficientXpError`
      dal percorso master, Zod, generico per altri errori).
- [x] Verificato (con test o conferma esplicita nel Log) che
      `CharacterCreationForm.tsx` benefici dello stesso fix per lo stesso
      scenario, dato che condivide l'helper.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi
      (nessuna regressione oltre ai 10 fallimenti pre-esistenti già
      documentati e confermati indipendenti nei task precedenti).

## Artifacts

- files_modified:
  - `src/lib/requirementErrorMessage.ts` — estesa
    `RequirementEvaluationErrorDetails` (+`xpCost`, `xpAvailable`,
    `xpSufficient`), `isEvaluationErrorDetails` (accetta anche solo
    `xpSufficient` come discriminante) e `formatRequirementEvaluationMessage`
    (accoda `XP insufficienti (disponibili X XP, richiesti Y XP)` quando
    `xpSufficient === false`, componibile con requisiti/OR-group/conflitti;
    comportamento invariato quando `xpSufficient` è `true`/assente).
  - `src/app/(dashboard)/_components/__tests__/FeatureActionForm.test.tsx` —
    2 nuovi test: solo XP insufficiente (scenario PG 29/"Addestramento
    fisico 2", 0/30 XP), requisiti mancanti + XP insufficiente insieme.
  - `src/app/(dashboard)/_components/__tests__/CharacterCreationForm.test.tsx`
    — 1 nuovo test dedicato: stesso scenario (solo `xpSufficient: false`)
    sul flusso di creazione PG (master forza il submit, il 422 arriva dal
    server), a conferma che l'helper condiviso copre anche questo form senza
    modifiche a `CharacterCreationForm.tsx` stesso.
- interfaces:
  - `formatRequirementEvaluationMessage(base: string, details: RequirementEvaluationErrorDetails): string`
    — firma invariata, `RequirementEvaluationErrorDetails` estesa con 3 campi
    opzionali (`xpCost?: number | null`, `xpAvailable?: number`,
    `xpSufficient?: boolean`).
- decisions:
  - Il messaggio XP si accoda in coda a `parts` (dopo requisiti/OR-group/
    conflitti), non lo sostituisce: copre sia il caso "solo XP" (task
    originale) sia le combinazioni con altri problemi, senza cambiare
    l'ordine/priorità già esistente tra requisiti mancanti e conflitti
    bloccanti (invariato da T-039, fuori scope qui).
  - `isEvaluationErrorDetails` ora accetta anche un `details` che ha solo
    `xpSufficient` (senza gli altri tre campi) come "chiave" — necessario in
    teoria per robustezza, anche se nella pratica la evaluation reale
    include sempre tutti i campi (compresi gli array vuoti), quindi il
    guard esistente già passava anche prima di questo cambio per i payload
    reali del server.
  - Nessuna modifica a `CharacterCreationForm.tsx`/`FeatureActionForm.tsx`:
    entrambi già chiamano `formatRequirementEvaluationMessage` con
    `body.details` grezzo, quindi beneficiano del fix automaticamente
    tramite l'helper condiviso — confermato con un test dedicato per
    ciascuno.

## Note / Log

- 2026-07-24 (owner): task aperto dopo un'indagine diagnostica su
  segnalazione utente ("non riesco ad apprendere addestramento fisico 2"
  per il PG 29 in Nuova Frontiera). Causa reale: il PG ha saldo XP 0,
  il talento costa 30, tutti gli altri requisiti/conflitti sono
  soddisfatti — il rifiuto server è corretto, ma il messaggio client non
  lo comunica (fallback al messaggio generico), perché
  `formatRequirementEvaluationMessage` (T-043) non legge i campi
  `xpCost`/`xpAvailable`/`xpSufficient` della evaluation. Confermato con
  una simulazione dal vivo (rollback esplicito, nessuna scrittura
  persistita) che cattura l'eccezione reale
  `RequirementsNotSatisfiedError` con quei campi esatti. Priorità P1
  (blocca la comprensione dell'errore per l'utente, anche se il rifiuto
  sottostante è corretto). Assegnato a `dev`, `status: in-progress`.
- 2026-07-24 (dev): inizio implementazione su
  `task/044-messaggio-xp-insufficiente-requisiti` (da `nuova_frontiera`).
- 2026-07-24 (dev): estesi `isEvaluationErrorDetails`/
  `formatRequirementEvaluationMessage` in `requirementErrorMessage.ts` per
  leggere `xpCost`/`xpAvailable`/`xpSufficient` e comporre il messaggio XP
  in coda a requisiti/OR-group/conflitti. Aggiunti 2 test in
  `FeatureActionForm.test.tsx` (solo XP, XP + requisito mancante insieme) e
  1 test dedicato in `CharacterCreationForm.test.tsx` a conferma che
  l'helper condiviso copre anche il flusso di creazione PG senza modifiche
  al componente. Test esistente su `InsufficientXpError`
  (`{available, cost}`, percorso master/`debitTalent`) invariato e
  verificato distinto (18/18 verdi su entrambi i file di test).
  `bun run type-check`/`bun run lint` puliti; `bun run test:run` 1370/1380
  (10 fallimenti pre-esistenti in `DataTypesManager.test.tsx`/
  `ReferenceDataManager.test.tsx`, stessi confermati indipendenti in T-043,
  nessuna nuova regressione).
- 2026-07-24 (dev): verifica dal vivo con script temporaneo
  (`tmp-verify-044.ts`, cancellato dopo l'esecuzione, mai committato) che
  riusa `evaluateRequirements`/`RequirementsNotSatisfiedError`/
  `formatRequirementEvaluationMessage` reali dentro `prisma.$transaction`
  con rollback esplicito (sentinel error, nessuna scrittura persistita):
  PG 29 in Nuova Frontiera, voce "Addestramento fisico 2" (id 57, flags
  `cost: 30`), evaluation reale `{xpCost: 30, xpAvailable: 0,
xpSufficient: false, missingRequires: [], missingRequirementGroups: [],
blockingConflicts: []}`. Messaggio finale confermato: "I requisiti per
  questa voce di catalogo non sono soddisfatti.: XP insufficienti
  (disponibili 0 XP, richiesti 30 XP)" — non più il fallback generico.
  Branch verificabile con
  `git log task/044-messaggio-xp-insufficiente-requisiti` e
  `bun run test:run` (target: `FeatureActionForm.test.tsx`,
  `CharacterCreationForm.test.tsx`). Porto `status: in-review`,
  `assignee: reviewer`.
- 2026-07-24 (reviewer): round 1 — **OK PULITO**. Composizione del
  messaggio verificata corretta in tutte le combinazioni (solo requisiti,
  solo conflitto, solo XP, requisito+XP, conflitto+XP), comportamento
  byte-identico al pre-fix quando `xpSufficient` è `true`/assente. I due
  shape XP (`isXpErrorDetails` vs `isEvaluationErrorDetails`) confermati
  distinti e non colludenti. Test nuovi significativi (asseriscono i
  numeri reali, non un messaggio generico). Verifica dal vivo su Neon non
  disponibile in quella sessione (tool assente), ma confermata per via
  dell'invariante server (`xpSufficient === false` implica sempre
  `xpCost`/`xpAvailable` numerici) che il fix risolve esattamente lo
  scenario originale (PG 29/"Addestramento fisico 2"). `type-check`/`lint`
  puliti, `test:run` 1370/1380 (10 fail preesistenti confermati). Nessun
  finding bloccante.
- 2026-07-24 (owner): verdetto integrato. Rischio basso (formattazione
  messaggio client, nessuna logica server toccata), stesso trattamento
  proporzionato già applicato a T-043 — nessun giro qa dedicato. Tutte e
  tre le condizioni di stop (`.task/README.md` §6) soddisfatte. Status →
  `done`.
