---
id: "043"
title: "Apprendimento talenti (downtime): mostra i requisiti mancanti specifici, non solo il messaggio generico"
status: done
priority: P2
assignee: ""
branch: task/043-dettaglio-requisiti-mancanti-azione-talento
base: nuova_frontiera
trello: ""
created: 2026-07-24
updated: 2026-07-24
---

## Obiettivo

Segnalazione utente: nella richiesta di azione "apprendimento talenti"
(`downtimeLearnTalent`, T-019/T-033), quando la richiesta viene rifiutata
per requisiti non soddisfatti, il toast mostra solo il messaggio generico
"I requisiti per questa voce di catalogo non sono soddisfatti." — senza
dire QUALI requisiti mancano. Il server include già il dettaglio completo
(`RequirementsNotSatisfiedError.evaluation`, serializzato in `details` sulla
risposta 422 da `actions/route.ts`), ma il client
(`FeatureActionForm.tsx`, usato da questa pagina) non lo legge: la sua
`mapSubmitErrorMessage` gestisce solo gli errori di budget XP e i problemi
di validazione Zod, altrimenti ricade sul messaggio generico dell'errore.

`CharacterCreationForm.tsx` risolve già esattamente lo stesso problema per
il flusso di creazione PG (`isEvaluationErrorDetails`/`mapSubmitErrorMessage`,
righe ~139-180): costruisce un messaggio con i nomi dei requisiti mancanti,
i gruppi OR mancanti ("serve X oppure Y") e i conflitti bloccanti. Va
riusata la stessa logica (o un helper condiviso) in `FeatureActionForm.tsx`.

## Scope

Incluso:

- `FeatureActionForm.tsx`: aggiungere la stessa gestione di
  `missingRequires`/`missingRequirementGroups`/`blockingConflicts` già
  presente in `CharacterCreationForm.tsx` (`isEvaluationErrorDetails` +
  logica di `mapSubmitErrorMessage`) — valutare se estrarre un helper
  condiviso riusabile da entrambi i componenti (es.
  `src/lib/utils/requirementErrorMessage.ts` o simile) invece di duplicare
  la stessa logica, dato che la forma della risposta 422 è identica in
  entrambi i punti (`RequirementsNotSatisfiedError.evaluation` serializzato
  da entrambe le route, `characters/route.ts` e
  `characters/[characterId]/actions/route.ts`).
- Il messaggio risultante deve elencare i nomi delle voci di catalogo
  mancanti (requisiti AND individuali), i gruppi OR mancanti in forma
  leggibile ("serve X oppure Y"), e gli eventuali conflitti bloccanti
  posseduti — stesso stile/tono italiano già usato in
  `CharacterCreationForm.tsx`.
- Test per il nuovo comportamento in
  `FeatureActionForm`/il suo file di test esistente.

Escluso:

- Nessuna modifica alla logica server (`evaluateRequirements`,
  `RequirementsNotSatisfiedError`, le route) — il dettaglio è già presente
  nella risposta, manca solo la resa lato client.
- Nessuna modifica al comportamento di `CharacterCreationForm.tsx` (già
  corretto, serve solo da riferimento/eventuale estrazione condivisa).

## Criteri di accettazione

- [x] Una richiesta di azione `downtimeLearnTalent` rifiutata per requisiti
      individuali mancanti mostra nel toast i nomi delle voci mancanti
      (non solo il messaggio generico); test.
- [x] Una richiesta rifiutata per un OR-group non soddisfatto mostra "serve
      X oppure Y" con i nomi reali delle alternative; test.
- [x] Una richiesta rifiutata per un conflitto bloccante mostra il nome
      della voce già posseduta che blocca; test.
- [x] Nessuna regressione sui messaggi già corretti (errore XP, errori di
      validazione Zod, messaggio generico per altri tipi di errore).
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi
      (nessuna regressione oltre ai 10 fallimenti pre-esistenti già
      documentati e confermati indipendenti in T-035/T-039/T-040/T-041/T-042).

## Artifacts

files_modified:

- src/lib/requirementErrorMessage.ts (nuovo — helper condiviso)
- src/app/(dashboard)/\_components/CharacterCreationForm.tsx (refactor: usa l'helper condiviso, nessun cambio di comportamento)
- src/app/(dashboard)/\_components/FeatureActionForm.tsx (mapSubmitErrorMessage legge ora il dettaglio di RequirementsNotSatisfiedError)
- src/app/(dashboard)/\_components/**tests**/FeatureActionForm.test.tsx (+3 test: requisito mancante, OR-group mancante, conflitto bloccante)

interfaces:

- `isEvaluationErrorDetails(details: unknown): details is RequirementEvaluationErrorDetails` — type guard condiviso (spostato da `CharacterCreationForm.tsx`, comportamento invariato).
- `formatRequirementEvaluationMessage(base: string, details: RequirementEvaluationErrorDetails): string` — costruisce il messaggio con requisiti mancanti/gruppi OR/conflitti bloccanti, estratto 1:1 dalla logica già presente in `CharacterCreationForm.mapSubmitErrorMessage`.
- `RequirementEvaluationErrorDetails` — forma di `error.evaluation` serializzato dal 422 (`missingRequires?`, `missingRequirementGroups?`, `blockingConflicts?`), identica in `characters/route.ts` e `characters/[characterId]/actions/route.ts`.

decisions:

- Helper messo in `src/lib/requirementErrorMessage.ts` (file flat, non `src/lib/utils/requirementErrorMessage.ts`): esiste già `src/lib/utils.ts` come file, creare anche una directory `utils/` allo stesso livello avrebbe reso ambiguo l'import `@/lib/utils` per chi esplora l'albero — il repo ha già il pattern "un file per concern" a livello di `src/lib/` (`documentUpload.ts`, `impersonation.ts`), quindi seguito quello.
- Wording del gruppo OR mantenuto identico a `CharacterCreationForm` ("almeno una tra: X, Y"), non "serve X oppure Y" (frase informale usata solo nel titolo del task/obiettivo) — per non introdurre due toni diversi per lo stesso dato tra i due componenti.
- `CharacterCreationForm.tsx` cambiato solo per usare l'helper condiviso: nessuna modifica di comportamento, verificato dai suoi test esistenti (7/7 verdi, invariati).

## Note / Log

- 2026-07-24 (owner): task aperto su segnalazione diretta dell'utente
  ("in apprendimento talenti l'errore dice solo 'i requisiti non sono
  soddisfatti', aggiungi l'info su quali requisiti non sono soddisfatti").
  Root cause identificata per ispezione del codice: il server include già
  il dettaglio (`error.evaluation` nella risposta 422), ma
  `FeatureActionForm.tsx` non lo legge — a differenza di
  `CharacterCreationForm.tsx`, che ha già la logica corretta per lo stesso
  problema nel flusso di creazione PG. Priorità P2 (non blocca il flusso,
  è un miglioramento di leggibilità dell'errore). Assegnato a `dev`,
  `status: in-progress`.
- 2026-07-24 (dev): estratto `isEvaluationErrorDetails`/
  `formatRequirementEvaluationMessage` in `src/lib/requirementErrorMessage.ts`
  a partire da `CharacterCreationForm.mapSubmitErrorMessage`; riusato in
  entrambi i componenti. Aggiunti 3 test in `FeatureActionForm.test.tsx`
  (requisito individuale mancante, OR-group mancante, conflitto bloccante).
  `bun run type-check` e `bun run lint` verdi; `bun run test:run`: 1367
  passati, 10 falliti (gli stessi noti in `DataTypesManager`/
  `ReferenceDataManager`, pre-esistenti e indipendenti da questo task).
  Branch `task/043-dettaglio-requisiti-mancanti-azione-talento` da
  `nuova_frontiera`, worktree principale. `status: in-review`,
  `assignee: reviewer`.
- 2026-07-24 (reviewer): round 1 — **OK PULITO**. Estrazione dell'helper
  confermata 1:1 (nessuna differenza sottile su array vuoti/undefined/
  ordine di concatenazione), `CharacterCreationForm.tsx` invariato nel
  comportamento (8/8 test preesistenti verdi senza modifiche), ordine dei
  controlli in `FeatureActionForm.mapSubmitErrorMessage` corretto (XP →
  evaluation → Zod, shape mutuamente esclusive, nessun falso positivo). 3
  nuovi test significativi (asseriscono il messaggio reale con nomi delle
  voci). Nessuna regressione. `type-check`/`lint` puliti, `test:run`
  1367/1377 (10 fail preesistenti confermati). Nessun finding.
- 2026-07-24 (owner): verdetto integrato. Rischio basso (solo formattazione
  messaggi client, nessuna logica server/DB toccata) — salto un giro qa
  dedicato, proporzionato al rischio. Tutte e tre le condizioni di stop
  (`.task/README.md` §6) soddisfatte. Status → `done`.
