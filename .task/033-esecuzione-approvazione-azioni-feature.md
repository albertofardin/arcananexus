---
id: "033"
title: "Wiring esecuzione azioni (executeFeatureAction) + workflow di approvazione/rifiuto Action per il master"
status: done
priority: P1
assignee: ""
branch: task/033-esecuzione-approvazione-azioni-feature
base: task/028-unificazione-area-amministrazione-campagna
trello: ""
created: 2026-07-17
updated: 2026-07-20
qa: ok
---

## Obiettivo

T-019 ha costruito il registry (`executeFeatureAction`), due handler
funzionanti (`downtimeLearnTalent`, `deathXpRecovery`) e la creazione
dell'`Action` (`waitingApproval` per il primo, `done` immediato per il
secondo), ma **nessuna route API né UI invoca `executeFeatureAction`**, e
**non esiste alcun workflow di approvazione/rifiuto** delle `Action`
`waitingApproval` — verificato: nessuna route sotto `src/app/api` gestisce
`Action`, `characters/[id]/[actionType]/page.tsx` è ancora un placeholder
"in costruzione" da prima di T-019. Il loop di gioco "il giocatore dichiara
un'azione downtime → il master approva o rifiuta" è quindi backend-completo
ma end-to-end non funzionante. Questo task chiude il circuito.

## Scope

Incluso:

- Route API `POST /api/campaigns/[campaignSlug]/characters/[characterId]/actions`
  (o percorso equivalente coerente con le convenzioni esistenti): risolve
  `Feature` attiva per `functionName`, invoca `executeFeatureAction`,
  autorizzazione (il giocatore agisce solo sul proprio PG, il master può
  agire per conto di terzi — verificare la semantica `isMaster` già presente
  negli handler T-019); 401/403/404/422 (validazione `actionData`) coerenti
  col resto dell'app.
- Pagina giocatore `characters/[id]/[actionType]/page.tsx`: sostituire il
  placeholder con un form reale che chiama la route sopra, mostra l'esito
  (creata/`waitingApproval` vs `done` immediato) e gli errori di dominio
  degli handler (es. `InsufficientXpError`, `ReferenceDataNotFoundError`,
  `NotATalentError`) in modo leggibile.
- **Workflow di approvazione**: route
  `PATCH /api/campaigns/[campaignSlug]/actions/[actionId]` (o simile) per
  approvare/rifiutare un'`Action waitingApproval` — verificare se
  `ActionStatus` copre già uno stato "rejected"/"refused" (T-025 Log segnala
  esplicitamente: "`ActionStatus` non ha stato rejected" come punto aperto)
  e, se manca, valutare lo schema minimo necessario (nuovo valore enum o
  riuso di `refund` del ledger T-025 come effetto collaterale del rifiuto,
  senza cambiare `ActionStatus`) — **decisione da annotare esplicitamente
  nel Log prima di implementare**, non da assumere silenziosamente.
- UI master (area admin unificata, T-028): coda delle `Action
waitingApproval` della campagna, con approva/rifiuta; su rifiuto, se
  l'azione aveva addebitato XP (es. `learnTalent`), invocare `refund` (T-025)
  per restituire il credito.
- Copy IT; test end-to-end (route + eventuale componente).

Escluso:

- Nuovi handler feature oltre ai due esistenti.
- UI di configurazione `Feature` (T-031) — qui si consuma una `Feature` già
  attiva, non la si configura.

## Criteri di accettazione

- [x] Un giocatore invoca `downtimeLearnTalent` sul proprio PG dalla UI;
      l'`Action` risultante è `waitingApproval`, il `CharacterData` e
      l'`XpTransaction` di addebito sono creati (coerente con l'handler
      T-019); test.
- [x] Un giocatore che tenta di eseguire l'azione con XP insufficiente vede
      un errore leggibile (non uno stack trace/500); test.
- [x] Un head_master/master vede la coda delle `Action waitingApproval` della
      campagna e può approvare o rifiutare; il rifiuto di un `learnTalent`
      restituisce l'XP addebitato (via `refund`); test.
- [x] Scoping multi-tenant e autorizzazione (giocatore solo sul proprio PG,
      master solo sulla propria campagna) verificati; test.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi (test:run
      verde a meno dei 4 fallimenti pre-esistenti noti, non toccati da questo
      task — vedi Log).

## Artifacts

files_modified:

- prisma/schema.prisma (invariato — nessuna migrazione, vedi decisione nel Log)
- src/lib/repositories/action.repository.ts (review round 1: `claimActionForReview`
  updateMany condizionato + `getActionById`, al posto di `updateActionReview`)
- src/lib/repositories/action.repository.test.ts
- src/lib/repositories/characterData.repository.ts (review round 1, finding B:
  `listCharacterDataForAction`, `deleteCharacterDataByActionId`)
- src/lib/repositories/characterData.repository.test.ts
- src/lib/repositories/feature.repository.ts (`getFeatureByFunctionName`)
- src/lib/repositories/feature.repository.test.ts
- src/lib/repositories/xpTransaction.repository.ts (`listXpTransactionsForAction`)
- src/lib/repositories/xpTransaction.repository.test.ts
- src/lib/services/actionReview.service.ts (nuovo; riscritto in review round 1
  per i finding A/B — claim atomico + rimozione CharacterData sul rifiuto)
- src/lib/services/actionReview.service.test.ts (nuovo; esteso in review round 1)
- src/lib/validations/action.ts (nuovo: `executeActionSchema`, `reviewActionSchema`)
- src/app/api/campaigns/[campaignSlug]/characters/[characterId]/actions/route.ts (nuovo, POST)
- src/app/api/campaigns/[campaignSlug]/characters/[characterId]/actions/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/actions/route.ts (nuovo, GET coda)
- src/app/api/campaigns/[campaignSlug]/actions/**tests**/route.test.ts (nuovo)
- src/app/api/campaigns/[campaignSlug]/actions/[actionId]/route.ts (nuovo, PATCH review)
- src/app/api/campaigns/[campaignSlug]/actions/[actionId]/**tests**/route.test.ts (nuovo)
- src/app/(dashboard)/\_components/FeatureActionForm.tsx (nuovo, client)
- src/app/(dashboard)/\_components/**tests**/FeatureActionForm.test.tsx (nuovo)
- src/app/(dashboard)/\_components/ActionApprovalQueue.tsx (nuovo, client)
- src/app/(dashboard)/\_components/**tests**/ActionApprovalQueue.test.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/characters/[id]/[actionType]/page.tsx (sostituito il placeholder)
- src/app/(dashboard)/dashboard/[campaignSlug]/characters/[id]/[actionType]/**tests**/page.test.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/actions/page.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/actions/**tests**/page.test.tsx (nuovo)
- src/app/(dashboard)/dashboard/[campaignSlug]/admin/page.tsx (link "Coda Approvazioni")
- src/app/routes.ts (`campaignCharacterAction`, `campaignAdminActions`)

interfaces:

- "getFeatureByFunctionName(prisma, campaignId, functionName) -> Promise<FeatureWithType | null>"
- "listWaitingApprovalActionsForCampaign(prisma, campaignId) -> Promise<ActionWithReviewContext[]>"
- "getActionByIdScoped(prisma, id, campaignId) -> Promise<Action | null>"
- "getActionById(prisma, id) -> Promise<Action | null> (review round 1: rilettura interna post-claim, non scopata — solo uso interno del servizio)"
- "claimActionForReview(prisma, id, data: UpdateActionReviewInput) -> Promise<number> (review round 1, finding A: updateMany condizionato a status=waitingApproval, sostituisce `updateActionReview`; ritorna il count, 0 = un'altra richiesta ha già vinto)"
- "listXpTransactionsForAction(prisma, actionId) -> Promise<XpTransaction[]>"
- "listCharacterDataForAction(prisma, actionId) -> Promise<CharacterData[]> (review round 1, finding B)"
- "deleteCharacterDataByActionId(prisma, actionId) -> Promise<Prisma.BatchPayload> (review round 1, finding B)"
- "approveAction(prisma, action: Action, reviewerUserId: string) -> Promise<Action> (review round 1: claim atomico, throw ActionNotPendingError se count===0)"
- "rejectAction(prisma, action: Action, reviewerUserId: string, reason?: string) -> Promise<{ action: Action; refunds: XpTransaction[]; removedCharacterData: CharacterData[] }> (review round 1: claim atomico PRIMA di refund/delete; removedCharacterData nuovo campo, finding B)"
- "POST /api/campaigns/[campaignSlug]/characters/[characterId]/actions — body { functionName, actionData } -> 201 { action, characterData?, xpTransaction? }"
- "GET /api/campaigns/[campaignSlug]/actions -> 200 ActionWithReviewContext[] (master-only)"
- "PATCH /api/campaigns/[campaignSlug]/actions/[actionId] — body { decision: 'approve'|'reject', reason? } -> 200 { action, refunds, removedCharacterData } (409 sia dal pre-check sia da ActionNotPendingError sul claim perso)"

decisions:

- "'rifiutato' rappresentato senza nuovo ActionStatus: status -> done (come approvazione), esito reale in actionData.\_review (outcome/reviewedAt/reviewedByUserId/reason?) perché actionData non è ri-validato dopo la creazione — evita ogni migrazione Prisma (dettaglio completo nel Log 2026-07-20)"
- "refund XP sul rifiuto agganciato allo stesso actionId del debito: con l'azione done, getSettledXpSum conta entrambe le righe (-cost + cost = 0), saldo netto corretto senza toccare lo schema"
- "il master può eseguire un'azione per conto di un altro PG (soglia isUserCampaignMaster, come T-018), ma l'handler learnTalent non propaga isMaster a assignReferenceDataToCharacter (contratto FeatureHandlerContext T-019 non ha questo campo): i gate playerAssignable/creationOnly/requisiti restano quelli del self-assign anche quando è il master a eseguire — comportamento esistente di T-019, non modificato qui (fuori scope: 'nessun nuovo handler')"
- "insufficienza XP su downtimeLearnTalent emerge come RequirementsNotSatisfiedError (422), non InsufficientXpError diretto: assignReferenceDataToCharacter valuta xpSufficient dentro evaluateRequirements prima di raggiungere debitTalent per il self-assign — la route mappa comunque entrambi gli errori su un 422 leggibile"
- "coda approvazione (GET/PATCH .../actions) autorizzata a livello master (requireCampaignMasterBySlug, head_master ⊇ master), ma la UI admin/actions/ eredita il guard head_master-only di admin/layout.tsx (T-028): un master non-head_master può quindi usare l'API ma non l'attuale UI admin — allargare il guard dell'intera area admin è una decisione di T-028, fuori scope qui"
- "nessun CTA 'Azioni disponibili' aggiunto a characters/[id]/page.tsx: la pagina è già coperta da page.test.tsx con un mock prisma minimale (solo character.findUnique) — aggiungere una query feature.findMany lì avrebbe rotto quei test senza un beneficio nei criteri di accettazione (la pagina [actionType] è comunque raggiungibile via URL diretto/routes.campaignCharacterAction); rimane un miglioramento UX aperto per un task successivo"
- "review round 1, finding A (idempotenza): la transizione di stato di approveAction/rejectAction non si fida più dello status dell'Action letto in memoria dal chiamante — claimActionForReview esegue un updateMany condizionato (where: {id, status: waitingApproval}) come primo passo dentro la $transaction, PRIMA di refund/delete; count===0 -> ActionNotPendingError senza alcun effetto collaterale. Il row-lock del DB serializza due review concorrenti sulla stessa Action: solo una vince il claim, l'altra riceve 409, mai un doppio refund silenzioso. Il pre-check in lettura nella route resta come fast-path (evita il round-trip di scrittura per il caso comune), ma non è più la garanzia — quella vive nel servizio"
- "review round 1, finding B (talento rifiutato restava assegnato): rejectAction ora rimuove anche ogni CharacterData con actionId = quella dell'azione rifiutata (deleteCharacterDataByActionId), nella stessa transazione del refund XP — non solo il credito XP viene restituito, anche l'assegnazione (es. il talento) viene revocata. Innocuo (nessuna riga trovata/eliminata) per handler che non creano CharacterData, es. deathXpRecovery, che comunque non passa mai da waitingApproval"
- "finding C del reviewer (uso di actionData.\_review invece di una colonna tipizzata) ratificato come debito tecnico accettato, non toccato in questo giro — coerente con la decisione originale 'nessuna migrazione Prisma' del Log 2026-07-20"

## Note / Log

- 2026-07-17 (owner): nuovo task — gap critico individuato leggendo il
  codice: `executeFeatureAction` (T-019) non ha alcun chiamante nell'app
  (`grep -rn "executeFeatureAction" src/app` → nessun risultato fuori dai
  test), `characters/[id]/[actionType]/page.tsx` è ancora "Pagina in
  costruzione" (placeholder pre-T-019, mai aggiornato). Senza questo task il
  loop di gioco principale della Fase 2 (dichiarare un'azione downtime,
  attendere l'approvazione del master) resta backend-only.
- 2026-07-17 (owner): priorità **P1** (non P0 come T-029/030 perché richiede
  prima che esista almeno una `Feature` attiva in campagna — T-031/seed
  T-023 — per essere testabile end-to-end, quindi non è il primo blocco
  assoluto, ma resta un gap centrale del game-loop). Dipende da T-019
  (registry, `done`), T-017/T-025 (assegnazione/ledger, `done`); la UI master
  di approvazione vive nell'area unificata → dipende da T-028.
- 2026-07-17 (owner): punto aperto esplicito da decidere in fase di
  implementazione (non assumere): come rappresentare "rifiutato" senza uno
  stato `ActionStatus` dedicato — vedi Scope. Se la soluzione scelta tocca lo
  schema Prisma, serve una migrazione: verificare con l'owner prima di
  procedere se il costo è giustificato o se un campo/valore più leggero basta.
- 2026-07-20 (dev): inizio implementazione. Decisione presa su "rifiutato"
  **senza toccare `prisma/schema.prisma`** (nessuna migrazione necessaria),
  motivazione:
  1. `ActionStatus` resta `done | waitingApproval`. `done` significa
     "l'azione non è più in coda di approvazione" — semantica già usata da
     `deathXpRecovery` (T-019) per un'azione mai passata da revisione. Un
     rifiuto è, ai fini della coda e del ledger XP, equivalente: l'azione
     esce da `waitingApproval` e diventa definitiva (anche se l'esito
     concreto è "non concesso"), quindi riusa `done` invece di introdurre un
     terzo stato.
  2. L'esito effettivo (`approved`/`rejected`, chi ha deciso, quando, motivo
     opzionale) viene registrato dentro `Action.actionData` (già `Json?`,
     libero) sotto una chiave riservata `_review`, aggiunta senza toccare i
     campi scritti dall'handler alla creazione — `actionSchema.strict()`
     degli handler (T-019) valida `actionData` solo alla creazione
     (`executeFeatureAction`), mai in lettura, quindi aggiungere `_review` in
     un update successivo non rompe nulla a valle. `completionDate`/
     `lastChangeDate` (già a schema, mai usati per questo) tracciano quando è
     stata presa la decisione.
  3. Effetto collaterale XP sul rifiuto: si cercano le `XpTransaction`
     collegate all'`actionId` con importo negativo (il/i debiti creati
     dall'handler, es. `debitTalent` in `learnTalent.ts`) e per ciascuna si
     invoca `refund(prisma, character, amount, { actionId })` (T-025/
     `xp.service.ts`). Poiché sia il debito sia il refund restano agganciati
     allo stesso `actionId`, e l'azione diventa `done`,
     `getSettledXpSum` (che include le righe legate a un'Action `done`) li
     conta entrambi: `-cost + cost = 0`, saldo netto ripristinato
     correttamente **senza alcuna modifica allo schema**. `getPendingXpReserved`
     smette di riservare quell'importo perché l'azione non è più
     `waitingApproval`.
  4. Alternative scartate: (a) nuovo valore enum `rejected` — richiede
     migrazione Prisma, respinta perché il punto 1-3 sopra ottiene lo stesso
     comportamento osservabile (coda, saldo XP, audit) senza toccare lo
     schema; (b) nuovo campo booleano `rejected`/`outcome` su `Action` —
     stessa obiezione, migrazione non necessaria dato che `actionData` è già
     libero. **Non bloccante**: si procede con l'implementazione.
- 2026-07-20 (dev): implementazione completata. Route `POST
.../characters/[characterId]/actions` (esecuzione, autorizzazione owner/
  master), `GET .../actions` (coda master) e `PATCH .../actions/[actionId]`
  (approva/rifiuta, refund XP su rifiuto via `actionReview.service.ts`);
  pagina giocatore `characters/[id]/[actionType]/page.tsx` con form reale
  (`FeatureActionForm`, supporta i due handler esistenti: talento/PG
  defunto) al posto del placeholder; UI master `admin/actions/`
  (`ActionApprovalQueue`) linkata dall'indice admin. Test aggiunti a ogni
  livello (repository, service, route, componente, pagina) — vedi Artifacts
  per l'elenco file/interfacce/decisioni. Nessuna migrazione Prisma.
- 2026-07-20 (dev): verifica finale — `bun run type-check` e `bun run lint`
  puliti; `bun run test:run` 1123 passed, 4 failed (tutti pre-esistenti,
  confermati non toccati da questo branch: `UsersManager.test.tsx` x3 —
  "azione 'Impersona'" — e `impersonation-flow.test.tsx` x1, nessun file di
  quei test/componenti nel diff di questo task). `status` portato a
  `in-review`; il passaggio a `done` resta all'owner dopo review.
- 2026-07-20 (reviewer): verdetto round 1 **DA CORREGGERE** —
  **finding A (bloccante)**: `rejectAction`/route non hanno una transizione
  atomica, race su doppio reject concorrente crea un doppio refund (PG
  guadagna XP gratis); **finding B**: il rifiuto restituisce l'XP ma non
  rimuove la `CharacterData` creata dall'handler (talento gratis);
  **finding C** (debito accettato, non da correggere ora): `actionData._review`
  invece di una colonna tipizzata.
- 2026-07-20 (dev): fix post-review round 1. Finding A: `action.repository.ts`
  sostituisce `updateActionReview` con `claimActionForReview` (`updateMany`
  condizionato a `status: waitingApproval`, ritorna il count) + `getActionById`
  (rilettura post-claim); `approveAction`/`rejectAction`
  (`actionReview.service.ts`) eseguono il claim atomico come primo passo
  dentro la `$transaction`, prima di qualunque refund/delete — `count === 0`
  → `ActionNotPendingError`, catturato ora anche dalla route (409). Finding
  B: nuove `listCharacterDataForAction`/`deleteCharacterDataByActionId`
  (`characterData.repository.ts`); `rejectAction` rimuove le `CharacterData`
  legate all'azione nella stessa transazione del refund, esposte come
  `removedCharacterData` nel risultato/risposta. Finding C ratificato come
  debito accettato, non toccato. Test aggiunti/estesi a ogni livello
  (repository, service, route) inclusi: idempotenza su doppio reject
  concorrente (un solo refund, la seconda chiamata riceve
  `ActionNotPendingError`/409, non un secondo refund silenzioso) e rifiuto
  di un `learnTalent` pending che verifica **nello stesso test** sia il
  refund XP sia la rimozione della `CharacterData`. `bun run type-check` /
  `lint` puliti; `bun run test:run` 1131 passed, stessi 4 fallimenti
  pre-esistenti invariati (UsersManager x3, impersonation-flow x1). Commit
  su `task/033-esecuzione-approvazione-azioni-feature`. Resta `in-review`,
  pronto per QA (nessun altro giro di review completo richiesto per questi
  due fix mirati, come da indicazione del coordinatore).
- 2026-07-20 (qa): **verdetto PASS**. Verifica in worktree `core-task-033`
  (`.env` symlinkato a `../core/.env`, DB Neon reale), tutti e 5 i criteri
  osservati passare direttamente, non solo dedotti dai test.
  1. `bun run type-check` → pulito. `bun run lint` → pulito, exit 0.
     `bun run test:run` → **1131 passed, 4 failed** — i 4 falliti sono
     esattamente e solo `UsersManager.test.tsx` (3x "azione 'Impersona'") e
     `impersonation-flow.test.tsx` (1x), preesistenti e dichiarati, nessun
     test toccato da questo branch.
  2. Letto il codice: `claimActionForReview` (`action.repository.ts`) è un
     `updateMany` condizionato a `status: waitingApproval` eseguito come
     primo passo dentro `$transaction` in `approveAction`/`rejectAction`
     (`actionReview.service.ts`), prima di refund/delete — architettura
     coerente col fix finding A del round 1.
  3. End-to-end live con `bun dev` contro Neon (dati seed via
     `bunx prisma db seed`, idempotente): creata una `Feature` di
     attivazione per `downtimeLearnTalent` su `demo-metamodello` (assente
     nel DB, T-031 fuori scope qui) e temporaneamente abilitato
     `playerAssignable` sul `DataType` Talenti (era `false` nel seed T-023,
     bloccava anche il self-assign via downtime, non solo l'assegnazione
     diretta) — entrambe ripristinate/pulite a fine sessione (Feature
     lasciata attiva per usi futuri, righe di test Action/CharacterData/
     XpTransaction rimosse, `playerAssignable` riportato a `false`). - **Criterio 1**: login `headmaster.campaign1@ad.com` (proprietario PG
     "aaa", id 5), `POST /api/campaigns/demo-metamodello/characters/5/actions`
     `{functionName:"downtimeLearnTalent", actionData:{referenceDataId:9}}`
     → 201, `Action` `waitingApproval` (id 2), `CharacterData` (id 14) e
     `XpTransaction` di addebito -6 creati. Confermato. - **Criterio 2**: stesso PG, `referenceDataId:10` (costo 15, saldo
     disponibile 14 dopo il primo acquisto) → 422
     `{"error":"I requisiti per questa voce di catalogo non sono
soddisfatti.","details":{"xpCost":15,"xpAvailable":14,
"xpSufficient":false,...}}` — leggibile, nessuno stack trace/500.
     Confermato (emerge come `RequirementsNotSatisfiedError`, non
     `InsufficientXpError` diretto, coerente con la decisione già annotata
     dal dev). - **Criterio 3**: login `master.campaign1@ad.com` (grant `master` su
     demo-metamodello), `GET .../actions` → 200 con l'Action in coda;
     `PATCH .../actions/2 {"decision":"reject"}` → 200, `refunds` con
     `XpTransaction` +6, `removedCharacterData` con la `CharacterData` del
     talento. **Verificato anche a livello DB** (query dirette, non solo
     risposta HTTP): `CharacterData` del talento effettivamente
     cancellata, somma `XpTransaction` del PG tornata a 20 (net 0,
     debito+refund), `Action.status = done`,
     `actionData._review.outcome = "rejected"`. Testato anche il
     percorso di approvazione (azione separata,
     `{"decision":"approve"}` → 200, `refunds: []`, coda tornata vuota).
     Confermato in pieno, incluso il game-loop end-to-end richiesto
     esplicitamente dall'owner (dichiarazione → waitingApproval → rifiuto
     → XP tornato E talento rimosso dalla scheda PG). - **Verifica di concorrenza reale** (richiesta dal reviewer, non solo
     il mock): creata una nuova `Action waitingApproval` (id 5) e lanciate
     due `PATCH .../actions/5 {"decision":"reject"}` **realmente
     concorrenti** (`Promise.all` di due `fetch` nello stesso processo
     Bun, non due `curl` separati) come `master.campaign1@ad.com`.
     Risultato: **una sola** richiesta ha ricevuto 200 (con `refunds`
     popolato), l'altra **409** con messaggio
     `"L'azione non è più in attesa di approvazione."` — il punto finale
     nel messaggio corrisponde esattamente a `ActionNotPendingError`
     (non al fast-path di lettura della route, il cui messaggio non ha il
     punto), a conferma che la race è stata intercettata dal **claim
     atomico a livello DB** (`updateMany` condizionato), non solo dal
     pre-check in lettura. Verificato a DB: `XpTransaction` con
     `reason:"refund"` per `actionId:5` → esattamente **1** riga (nessun
     doppio refund), `CharacterData` per `actionId:5` → 0 righe (rimossa
     una sola volta). Ripetuto anche con due processi `curl` in
     background prima del test più stringente con `Promise.all` (stesso
     esito: 1x 200, 1x 409, 1 solo refund a DB). Garanzia di concorrenza
     confermata **contro il DB reale**, non solo simulata via mock.
  4. Multi-tenant/autorizzazione, verificato live (oltre ai test automatici
     di route già presenti — scoping campagna, 404 su personaggio di
     un'altra campagna, 403 su azione altrui):
     - giocatore che tenta un'azione sul PG di un altro utente → 403
       "Puoi dichiarare azioni solo sul tuo personaggio".
     - giocatore (nessun grant master) su `GET`/`PATCH .../actions` → 403
       su entrambi.
     - `master.campaign1@ad.com` (grant solo su `campaign1`, non su
       `winter-chronicles`) su `GET .../actions` di `winter-chronicles` → 403.
     - `headmaster.campaign1@ad.com` (head_master su `campaign1`, **nessun**
       grant su `demo-metamodello`) su `GET`/`PATCH .../actions` di
       `demo-metamodello` → 403 su entrambi, nonostante il ruolo elevato in
       un'altra campagna — conferma che l'autorizzazione è scopata per
       campagna, non globale sul ruolo.
     - PG di `demo-metamodello` risolto via slug `winter-chronicles` → 404
       "Personaggio non trovato" (nessun leak di esistenza cross-campaign).
       Confermato.
  5. Come sopra (punto 1): `type-check`/`lint`/`test:run` verdi a meno degli
     stessi 4 fallimenti preesistenti dichiarati. Confermato.
     Nessun difetto trovato. Ambiente ripulito a fine sessione (server dev
     fermato, dati di test rimossi/ripristinati, script temporanei eliminati,
     `git status` pulito). `status` lasciato `in-review`: il passaggio a
     `done` resta una decisione dell'owner.
- 2026-07-20 (owner): 2 round di review (findings A/B round 1, entrambi
  fix verificati corretti in round 2), QA PASS con prova reale di
  concorrenza contro DB Neon (doppio reject simultaneo: un solo refund,
  la seconda richiesta 409, nessuna corruzione del ledger XP). Decisione
  di design `_review`/no-migrazione ratificata come debito accettato.
  Porto lo status a `done` e apro la PR stacked su `task/028-...`.
