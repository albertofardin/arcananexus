---
id: "038"
title: "Nessun modo di impostare/cambiare la visibilità di un CharacterData assegnato"
status: done
priority: P1
assignee: dev
branch: task/038-visibilita-assegnazione-dati-pg
base: main
trello: ""
created: 2026-07-21
updated: 2026-07-21
---

## Obiettivo

`CharacterData.visibility` ha `@default(hidden)` in schema (T-015) e nessun
percorso di scrittura lo imposta mai esplicitamente né permette di cambiarlo
dopo la creazione: creazione PG (T-018), concessione manuale del master
(`assignReferenceDataToCharacter`, T-017) ed esecuzione di un'azione feature
(T-019/033) creano tutte `CharacterData` sempre `hidden` — visibile solo
allo staff (commento schema: `hidden // only visible for admin`), mai al
proprietario. Non esiste nemmeno una `updateCharacterData` nel repository:
una volta creata, la visibilità di una `CharacterData` non è modificabile da
nessuna parte del prodotto. Risultato: la sezione "Dati personaggio" della
scheda PG (T-034), costruita apposta perché il giocatore veda i propri dati
assegnati, è di fatto sempre vuota per qualunque assegnazione reale — non
solo per i dati demo. Bug riprodotto dall'utente sul personaggio id 9
(campagna `campaign1`, `slug: campaign1`): tutte e 4 le `CharacterData`
("Umano", "Fazione A", "Base", "Avanzato") sono `hidden`, nessuna via per
renderle visibili.

## Scope

Incluso:

- Un endpoint (probabilmente `PATCH` scoped a campagna/personaggio, coerente
  col pattern esistente delle altre route admin) per cambiare la
  `visibility` (`visible`/`hidden`) di una `CharacterData` già assegnata —
  la "azione di reveal" del master. Nuova `updateCharacterData` nel
  repository (oggi assente: solo create/delete/list/count).
- Guardia di autorizzazione: solo master/head_master (o super-admin) della
  campagna può cambiare la visibilità — stessa soglia usata dalle altre
  operazioni di gestione dati PG (T-017/018, `isUserCampaignMaster`).
- UI: nella scheda PG (`characters/[id]/page.tsx`), nella sezione "Dati
  personaggio", un controllo visibile solo allo staff (es. icona
  occhio/occhio-barrato accanto a ogni voce) per alternare
  visible/hidden — decidere se inline (client component leggero, chiamata
  fetch) o rimandare a un pannello admin dedicato.
- Default per percorso, deciso dall'utente (vedi Log):
  - **Creazione PG** (T-018, catalogo in `characters/new`) → `visibility:
visible` sempre, nessuna scelta esposta al giocatore in fase di
    creazione.
  - **Esecuzione azione feature** (T-019/033, es. `downtimeLearnTalent`,
    `deathXpRecovery`) → `visibility: visible` sempre: il giocatore ha
    dichiarato lui stesso l'azione, non ha senso nascondergliela.
  - **Concessione manuale del master** (`assignReferenceDataToCharacter`,
    `isMaster: true`) → `visibility` **scelta esplicita** del master al
    momento dell'assegnazione (select nel form/endpoint di concessione),
    con **default `hidden`** se non specificata — unico percorso dove ha
    senso un'assegnazione "segreta" da rivelare più avanti.
- Test: repository (`updateCharacterData`), route (autorizzazione,
  multi-tenant scoping), UI (toggle visibile solo allo staff, non al
  giocatore).
- Fix dati demo: portare a `visible` le `CharacterData` del personaggio 9
  (`campaign1`) usate per riprodurre il bug, se non già sistemate a mano.

Escluso:

- Cambiare il default a livello di schema Prisma (`@default(hidden)`) senza
  prima chiarire il comportamento atteso per i tre percorsi di assegnazione
  (rischio di rendere visibile per errore dati pensati per restare segreti,
  es. appartenenze a fazioni/religioni rivelate solo a certe condizioni).
- Toccare `filterVisible`/il registry di visibilità condizionale (T-026):
  questo task riguarda solo _chi può impostare_ `visibility`, non come viene
  valutata a runtime.
- La regola non ancora committata in `src/lib/visibility/filterVisible.ts`
  (PG non "Attivo" non sblocca voci condizionate, working tree al momento
  dell'apertura di questo task): task separato, non in scope qui.

## Criteri di accettazione

- [x] Esiste un modo (endpoint + UI) per un master/head_master di cambiare
      la `visibility` di una `CharacterData` già assegnata a un personaggio
      della propria campagna; verificato dal vivo.
      Verificato dal vivo dall'owner (vedi Log): headmaster.campaign1@ad.com
      cambia `visibility` di una `CharacterData` del PG9 via
      `PATCH .../characters/9/data/21` (hidden→visible round-trip, 200), e
      il toggle risulta montato in HTML solo per l'head_master.
- [x] Un giocatore ordinario non può chiamare l'endpoint di update
      (403/404, coerente col resto delle guardie di ruolo); test.
- [x] L'endpoint è scoped correttamente (non permette di modificare
      `CharacterData` di un'altra campagna); test multi-tenant.
- [x] Creazione PG ed esecuzione azione feature assegnano sempre
      `visibility: visible` (nessuna regressione su questi due percorsi,
      niente scelta esposta); test.
- [x] La concessione manuale del master espone la scelta `visible`/`hidden`
      con default `hidden` se non specificata; test.
- [x] Il personaggio 9 (`campaign1`) mostra correttamente nella sua scheda i
      dati assegnati dopo il fix (riproduzione manuale del bug originale).
      Verificato dal vivo dall'owner (vedi Log): le 4 `CharacterData` restano
      `visible` e compaiono nella scheda sia per l'owner
      (`giocatore.demo@ad.com`) sia per l'head_master.
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi
      (nessuna regressione).

## Artifacts

files_modified:

- src/lib/repositories/characterData.repository.ts — `CreateCharacterDataInput.visibility?`, nuove `getCharacterDataByIdScoped`/`updateCharacterData`
- src/lib/repositories/characterData.repository.test.ts — test per il pass-through di `visibility` in `createCharacterData` e per le due nuove funzioni
- src/lib/services/characterData.service.ts — `AssignReferenceDataOptions.visibility?`, nuova `resolveAssignmentVisibility`, `performWrite` la usa
- src/lib/services/characterData.service.test.ts — nuovo describe "visibilità (T-038)" + aggiornata l'asserzione esatta del self-assign esistente
- src/app/api/campaigns/[campaignSlug]/characters/route.ts — passa sempre `visibility: DataVisibility.visible` alla creazione PG (anche per master che crea per conto terzi)
- src/app/api/campaigns/[campaignSlug]/characters/**tests**/route.test.ts — asserzioni aggiuntive sulla visibilità
- src/lib/features/handlers/learnTalent.test.ts — asserzione aggiuntiva (nessuna modifica al sorgente handler: già corretto col nuovo default self-assign)
- src/lib/validations/characterData.ts (nuovo) — `updateCharacterDataVisibilitySchema`
- src/app/api/campaigns/[campaignSlug]/characters/[characterId]/data/[characterDataId]/route.ts (nuovo) — PATCH "reveal"
- src/app/api/campaigns/[campaignSlug]/characters/[characterId]/data/[characterDataId]/**tests**/route.test.ts (nuovo)
- src/app/(dashboard)/\_components/CharacterDataVisibilityToggle.tsx (nuovo) — client component, icona occhio/occhio-barrato
- src/app/(dashboard)/dashboard/[campaignSlug]/characters/[id]/page.tsx — monta il toggle per `isStaff` accanto al badge "Solo staff"
- src/app/(dashboard)/dashboard/[campaignSlug]/characters/[id]/**tests**/page.test.tsx — asserzioni sul toggle (presente per staff, assente per non-staff)
- .task/038-visibilita-assegnazione-dati-pg.md — questo file (frontmatter/Artifacts/Log)

interfaces:

- `updateCharacterData(prisma: PrismaClient, id: number, data: { visibility: DataVisibility }): Promise<CharacterData>`
- `getCharacterDataByIdScoped(prisma: PrismaClient, id: number, characterId: number, campaignId: number): Promise<CharacterData | null>` (scoping via `dataType.campaignId`, come `getActionByIdScoped`)
- `CreateCharacterDataInput.visibility?: DataVisibility` (repository, pass-through puro)
- `AssignReferenceDataOptions.visibility?: DataVisibility` (service)
- `resolveAssignmentVisibility(isMaster: boolean, requestedVisibility?: DataVisibility): DataVisibility` (service, interno)
- `updateCharacterDataVisibilitySchema = z.object({ visibility: dataVisibilityEnum }).strict()`
- `PATCH /api/campaigns/[campaignSlug]/characters/[characterId]/data/[characterDataId]` — body `{ visibility }`, richiede master/head_master/super-admin (`requireCampaignMasterBySlug`)

decisions:

- Base branch reale: `origin/main` NON contiene il metamodello dati-PG (schema T-015 ha solo il modello `Data` generico, niente `CharacterData`/`ReferenceData`/`characterData.service.ts`/`characters/new`/handler feature). Ho usato `origin/task/015-schema-metamodel-dati-campagna` (branch di integrazione con T-016..T-037 già mergiate, superset stretto di `main`) come base reale per poter lavorare sul codice descritto nel brief; annotato per trasparenza, il `base: main` nel frontmatter riflette l'intento finale (quando l'epic atterrerà su main), non la base tecnica di questo branch.
- Default `visibility` deciso per-chiamata: self-assign (`isMaster` false) → sempre `visible`, non negoziabile (ignora anche un `options.visibility` esplicito, testato). `isMaster` true → `options.visibility ?? hidden`. La route di creazione PG passa sempre `visibility: DataVisibility.visible` esplicito anche quando `isMaster` è true (master crea il PG per conto di un altro utente), per non ereditare il default `hidden` pensato per la concessione post-creazione.
- `deathXpRecovery.ts` non toccato: non chiama mai `assignReferenceDataToCharacter` (crea solo `Action` + `XpTransaction`), quindi non rientra nei percorsi di scrittura da correggere per questo task.
- Nessun nuovo endpoint di "concessione manuale" (grant post-creazione di una nuova assegnazione a un PG già esistente): non esisteva prima di questo task e non è tra gli item inclusi nello scope/criteri (l'unico endpoint richiesto è il "reveal" su un'assegnazione già esistente). Il servizio espone comunque già `visibility` con default `hidden` per `isMaster`, pronto per un futuro endpoint di concessione.
- UI: il toggle è montato solo per `isStaff` come già definito in `characters/[id]/page.tsx` (head_master o super-admin — NON un "master" semplice, che quella pagina già respinge con 404 se non è owner). L'endpoint PATCH usa invece la soglia più permissiva master-or-above (`requireCampaignMasterBySlug`), come richiesto esplicitamente dal brief per l'endpoint. Nessuna incoerenza pratica oggi: un master non-head_master non riesce comunque a raggiungere la scheda di un PG altrui (gate preesistente, non toccato da questo task).
- Verifica live del personaggio 9 (`campaign1`) NON eseguita in questa sessione: nessun accesso DB (`.env` assente in questo worktree) né tool MCP Neon esposto. Comportamento verificato solo via test automatici (repository/service/route/UI). Serve un passaggio di un agente/utente con accesso DB per chiudere questo criterio dal vivo.

- Verifica dal vivo completata dall'owner (sessione successiva a quella del
  dev): stesso worktree, `.env` symlinkato temporaneamente e rimosso a fine
  verifica, `bun dev -p 3010`. Round-trip `PATCH` reale (hidden→visible) su
  `characterDataId 21` del PG9; 403 per owner-non-master e per utente senza
  Grant; 404 per scoping cross-campagna (characterId di un'altra campagna e
  characterDataId di un'altra campagna); 400 per valore `visibility` non
  valido; conferma via conteggio dei riferimenti `characterDataId`/
  `CharacterDataVisibilityToggle` nell'HTML servito che il toggle è assente
  per un owner non-staff e presente (4 istanze) per l'head_master. Re-run
  mirato di tutti i test T-038 nel worktree (125 passed).

## Note / Log

- 2026-07-21 (owner): nuovo task, aperto durante una sessione con l'utente
  che segnalava "nella scheda del mio personaggio non vedo i dati
  assegnati" sul PG 9 (`campaign1`). Diagnosi: non è la regola di stato PG
  in `filterVisible.ts` (il PG è "Attivo", `approvalDate` impostata) — le 4
  `CharacterData` del personaggio sono semplicemente tutte `hidden`
  (default Prisma, mai cambiato da nessun percorso di scrittura esistente).
  Verificato via query diretta (Prisma script one-off contro il DB puntato
  da `.env`) e via esplorazione di tutta la catena di scrittura
  (`characterData.service.ts`, `characterData.repository.ts`,
  `characterCreation.ts`, route azioni T-033): nessuno imposta mai
  `visibility`, e non esiste `updateCharacterData`. L'utente ha scelto di
  aprire questo task per il fix strutturale invece di un fix rapido solo ai
  dati demo.
- 2026-07-21 (owner): decisione di design dell'utente sul default per
  percorso — creazione PG e richiesta azione/feature (talenti, ecc.)
  assegnano sempre `visible` (il giocatore ha già "scelto"/dichiarato quel
  dato, non ha senso nasconderglielo); solo la concessione manuale del
  master espone la scelta visible/hidden, con default `hidden` se il master
  non specifica nulla (unico caso legittimo di assegnazione "segreta").
  Scope e criteri di accettazione aggiornati di conseguenza.
- 2026-07-21 (owner): assegnato a `dev`, status → `in-progress`.
- 2026-07-21 (dev): inizio implementazione. `origin/main` non contiene il
  metamodello dati-PG (blocco di contesto: il brief cita file che non
  esistono su `main`); ho verificato con `git log`/`git show` che
  `origin/task/015-schema-metamodel-dati-campagna` è un superset stretto di
  `origin/main` (merge-base = `main`) e contiene tutto il lavoro T-016..T-037
  già integrato — ho creato `task/038-visibilita-assegnazione-dati-pg` da lì
  invece che da `main` per poter lavorare (dettagli in `## Artifacts` →
  `decisions`).
- 2026-07-21 (dev): implementato `updateCharacterData`/
  `getCharacterDataByIdScoped` nel repository, `visibility` opzionale in
  `AssignReferenceDataOptions`/`createCharacterData`, la route
  `PATCH .../characters/[characterId]/data/[characterDataId]` (master/
  head_master/super-admin, `requireCampaignMasterBySlug`), lo schema Zod
  `updateCharacterDataVisibilitySchema`, il toggle client
  `CharacterDataVisibilityToggle` montato in `characters/[id]/page.tsx` solo
  per `isStaff`, e forzato `visibility: visible` esplicito nella creazione PG
  (`characters/route.ts`) anche quando `isMaster` è true. Test aggiunti/
  aggiornati a ogni livello (repository/service/route/pagina).
- 2026-07-21 (dev): verifica — `bunx prisma generate`, `bun run
type-check` (pulito), `bun run lint` (pulito), `bun run test:run` (1231
  passed, 10 failed — gli stessi 10 falliscono anche stashando tutte le mie
  modifiche e tornando alla punta del branch, confermato con
  `git stash`/`git stash pop`: sono pre-esistenti in
  `DataTypesManager.test.tsx`/`ReferenceDataManager.test.tsx`, non toccati da
  questo task, non causati da queste modifiche). Non ho accesso DB/Neon in
  questa sessione (niente `.env`, nessun tool MCP Neon esposto): il criterio
  "verificato dal vivo" (master che cambia visibilità dal vivo + personaggio
  9 di `campaign1`) resta non spuntato, da chiudere con un passaggio
  owner/QA che abbia accesso al DB. Branch:
  `task/038-visibilita-assegnazione-dati-pg` (creato da
  `origin/task/015-schema-metamodel-dati-campagna`, non da `origin/main` —
  vedi sopra). Per verificare: checkout del branch, `bun install`, `bunx
prisma generate`, poi `bun run type-check && bun run lint && bun run
test:run`. Status → `in-review`.
- 2026-07-21 (reviewer): round 1 — **OK pulito**, nessun finding bloccante.
  Verificati autorizzazione endpoint (403 giocatore ordinario, anche sul
  proprio PG), scoping multi-tenant (404 su characterId/characterDataId di
  un'altra campagna, doppio scoping prima di ogni scrittura), i tre
  percorsi di scrittura (creazione PG e azione feature sempre `visible`,
  concessione master `requested ?? hidden`), toggle montato solo per
  `isStaff` lato server (mai nel markup per non-staff), validazione Zod
  `.strict()` sui soli due valori enum. Osservazioni non bloccanti (nessuna
  azione richiesta): discrepanza già documentata tra soglia UI (`isStaff`,
  head_master) ed endpoint (master-or-above) — innocua perché un master
  semplice non raggiunge comunque la scheda di un PG altrui; nota per un
  task futuro su come la scheda distingue un'azione `waitingApproval` da
  una già acquisita. Merge da fare sull'epic `task/015`, non su `main`
  diretto (main non ha ancora il metamodello dati-PG). Nessuna migrazione
  Prisma coinvolta.
- 2026-07-21 (owner): verifica dal vivo completata (vedi `## Artifacts` →
  `decisions` per i dettagli tecnici) — entrambi i criteri residui
  spuntati. Tutti i criteri di accettazione ora `[x]`, `bun run test:run`
  verde (falliti pre-esistenti confermati e documentati), reviewer OK
  pulito: le tre condizioni di stop (`.task/README.md` §6) sono soddisfatte.
  Status → `done`. Nota per l'integrazione: il branch è nato da
  `origin/task/015-schema-metamodel-dati-campagna` (non da `main` — vedi
  `decisions` del dev), quindi il merge va fatto lì, non su `main`
  direttamente.
