---
id: "032"
title: "Consolidare i dati d'esempio del metamodel (T-023) dentro campaign1, rimuovere la campagna 'demo-metamodello'"
status: done
priority: P2
assignee: ""
branch: task/032-consolidare-seed-demo-metamodello-in-campaign1
base: task/015-schema-metamodel-dati-campagna
trello: ""
created: 2026-07-17
updated: 2026-07-17
qa: ok
---

## Obiettivo

`prisma/seed.ts` crea oggi due campagne separate nell'organizzazione
`arcana-domine`: **`campaign1`** (slug `campaign1`, righe ~121-256, dati
"legacy" pre-metamodel: 4 `DataType` generici senza `ReferenceData`, usata da
tutti i test QA/E2E di Fase 1 — vedi `test-users.md`/`qa-report-fase-1-backend.md`)
e **`demo-metamodello`** (slug `demo-metamodello`, righe ~918-1383, T-023: 3
razze, 2 religioni, 4 talenti con requisiti/visibilità condizionale, 1
regolamento-documento, 1 PG demo). Consolidare tutto dentro `campaign1` e
rimuovere `demo-metamodello` dal seed, così esiste **una sola** campagna di
riferimento per demo/QA invece di due.

## Scope

Incluso:

- Spostare la sezione "Campaign: Demo Metamodello (T-023)" dentro la sezione
  "Campaign 1.1: Campaign 1": tutte le `ensureDataType`/`ensureReferenceData`/
  `ensureDataRequirement`/`ensureVisibilityCondition` e il PG demo puntano a
  `campaign1_1.id` invece di creare/usare `demoCampaign`.
- **Decisione di naming da prendere** (verificare in sede di implementazione,
  documentare la scelta nel Log): `campaign1` ha già un `DataType` "Regolamento"
  (legacy, `kind = generic` di default, nessuna `ReferenceData`, righe
  ~140-149) mentre T-023 crea "Regolamenti" (`kind` presumibilmente
  `document`/`generic` con `renderAs = documents`, righe ~1173+). I nomi non
  collidono a stringa uguale (case/plurale diversi, `DataType.name` è unico
  solo per campagna non globalmente) ma sono concettualmente lo stesso
  concetto duplicato nella stessa campagna dopo il merge. Owner raccomanda:
  **eliminare/non ricreare i 4 `DataType` legacy di `campaign1`** ("Regolamento",
  "Bandi", "PNG", "Cronache" — verificato: nessuna `ReferenceData` li referenzia,
  nessun test T-1..T-14 ne dipende per contenuto, solo per conteggio generico
  in `qa-report-fase-1-backend.md`/`test-users.md`, che non nominano questi
  4 `DataType` per nome) e lasciare solo il set T-023 con `kind` corretto;
  se il dev preferisce un'altra soluzione (es. rinominare invece di
  eliminare), documentare la scelta e il perché nel Log/Artifacts.
  **Nota importante**: `test-users.md`/`qa-report-fase-1-backend.md` non
  referenziano `demo-metamodello` (verificato con grep) — nessun impatto su
  quei documenti dal lato slug/campagna, ma se si eliminano i 4 `DataType`
  legacy va verificato che nessuno dei 13 test QA di Fase 1 vi faccia
  riferimento indiretto (es. tramite conteggio "N tipi di dato" in
  `CampaignsManager`).
- `Event` di `campaign1` (righe ~184-255) restano invariati: T-023 non
  seedava `Event` (nota esplicita nel commento della sezione, "Nessun
  `Event`: fuori scope per questo task" — resta vero anche dopo il merge).
- Rimuovere interamente la creazione di `demoCampaign` (`createCampaign`
  con slug `demo-metamodello`) e ogni riferimento residuo allo slug.
  Aggiornare i contatori nel riepilogo finale dello script (righe ~1350-1372:
  "6 Campaigns" → 5, righe sul conteggio `DataType`/PG demo aggiornate di
  conseguenza).
- Idempotenza preservata: lo script deve restare rieseguibile senza duplicare
  nulla (stesso pattern `ensure*` già in uso).
- Verificare `src/lib/seed/characterAssignment.ts` (stand-in T-023 per T-017,
  usato dal PG demo): nessun riferimento hardcoded allo slug/id di
  `demo-metamodello` che vada aggiornato.
- Test: nessun test automatico dipende dal seed reale (verificato — il seed
  non gira nella suite `bun run test:run`), ma verificare a mano (o con uno
  script temporaneo) che `bunx prisma db seed` (con `DATABASE_URL` reale) sia
  idempotente e non lasci residui.

Escluso:

- Cambiare il contenuto sostanziale dei dati T-023 (razze/religioni/talenti/
  requisiti restano gli stessi, solo la campagna contenitore cambia).
- Migrare dati già esistenti su un DB reale (Neon dev) dove `demo-metamodello`
  fosse già stata seedata in passato: se rilevante, va gestito a parte
  dall'owner (pulizia manuale del DB dev), non con una migrazione Prisma
  (il seed non genera migrazioni).

## Criteri di accettazione

- [x] `bunx prisma db seed` non crea più alcuna campagna con slug
      `demo-metamodello`; `grep -rn "demo-metamodello" prisma/seed.ts` non
      trova più occorrenze. (Verificato: `grep -c "demo-metamodello"
prisma/seed.ts` → 0. Nessun DB reale disponibile per lanciare il seed
      dal vivo, vedi Log per la verifica statica.)
- [x] Tutti i dati T-023 (razze, religioni, talenti con requisiti/visibilità
      condizionale, regolamento-documento, PG demo con grant iniziale +
      acquisti + override) sono creati dentro `campaign1`; verificabile
      rieseguendo il seed su un DB pulito e ispezionando `campaign1`.
      (Verificato leggendo il codice: tutte le `ensureDataType`/
      `ensureReferenceData`/`ensureDataRequirement`/`ensureVisibilityCondition`
      e la creazione del PG demo passano da `campaign1Id = campaign1_1.id`;
      nessun DB pulito disponibile per l'ispezione dal vivo, vedi Log.)
- [x] Nessuna collisione/duplicazione concettuale di `DataType` non
      intenzionale: la scelta presa su "Regolamento" vs "Regolamenti" (e sugli
      altri 3 `DataType` legacy) è esplicita e documentata nel Log/Artifacts.
- [x] Il seed resta idempotente: due esecuzioni consecutive non duplicano
      righe (stesso pattern `ensure*`/`upsert` già in uso); verificato
      rieseguendo lo script due volte. (Verificato staticamente, non con
      un'esecuzione reale — vedi Log per il dettaglio e la limitazione.)
- [x] `bun run type-check`, `bun run lint`, `bun run test:run` verdi (il seed
      non è coperto da `test:run` ma deve continuare a compilare/tipizzare).
      (`type-check` e `lint` verdi; `test:run` ha 4 test falliti in 2 file
      pre-esistenti sul branch base, non correlati a questo task — vedi Log.
      QA: confermato che il diff di questo task tocca solo `prisma/seed.ts` e
      il file `.task/`, nessun file di test — gli stessi 4 fallimenti
      (UsersManager x3, impersonation-flow x1) sono quindi necessariamente
      pre-esistenti, stesso pattern già accettato per T-028/T-034. Checkbox
      spuntata con questa giustificazione, non perché `test:run` sia
      letteralmente verde al 100%.)

## Artifacts

- files_modified:
  - `prisma/seed.ts` — rimossi i 4 `DataType` legacy di `campaign1`
    ("Regolamento", "Bandi", "PNG", "Cronache"); rimossa la creazione della
    campagna `demo-metamodello`; la sezione T-023 ("Metamodel catalog")
    consolidata dentro `campaign1_1` (nuova costante `campaign1Id` al posto
    di `demoCampaignId`); rimossi 2 grant ridondanti (master/head_master) già
    coperti da grant esistenti su `campaign1_1`; aggiornati i contatori nel
    riepilogo finale dello script.
- interfaces: nessuna firma di funzione pubblica cambiata (repository/servizi
  invariati). Unico cambiamento locale: `const campaign1Id = campaign1_1.id`
  (sostituisce `const demoCampaignId = demoCampaign.id`), usato dagli helper
  locali `ensureDataType`/`ensureReferenceData`/... e dal PG demo.
- decisions:
  - Eliminati (non ricreati) i 4 `DataType` legacy di `campaign1` invece di
    rinominarli — seguita la raccomandazione dell'owner: nessuna
    `ReferenceData` li referenziava, nessun test QA T-1..T-14 dipendeva dal
    loro nome (solo conteggio generico in `qa-report-fase-1-backend.md`/
    `test-users.md`, verificato via grep, che non li nomina), ed eliminarli
    evita la duplicazione concettuale "Regolamento" (legacy, generico) vs
    "Regolamenti" (T-023, `kind: document`, `renderAs: documents`) nella
    stessa campagna. Rinominare il legacy "Regolamento" in altro nome sarebbe
    stata un'alternativa, ma avrebbe lasciato 3 `DataType` generici (Bandi/
    PNG/Cronache) senza scopo concreto nel metamodel, quindi eliminazione
    preferita.
  - La sezione T-023 è rimasta fisicamente nella stessa posizione nel file
    (dopo il blocco "Test persons for manual QA", righe ~880+), invece di
    essere spostata subito dopo il blocco `DataType`/`Event` di `campaign1_1`
    (righe ~121-255): dipende da `masterC1`, `grantCampaignRole` e
    `adminUser` con relativo grant, tutti definiti/eseguiti in quel blocco
    successivo. "Consolidare dentro campaign1" è stato interpretato come
    "usare `campaign1_1.id` come contenitore dati", non come vincolo di
    contiguità fisica delle righe nel file — spostare l'intero blocco più in
    alto avrebbe richiesto riordinare anche le dipendenze (rischio più alto,
    nessun beneficio per i criteri di accettazione).
  - Rimossi 2 grant espliciti ridondanti nella sezione T-023 (`grantCampaignRole(masterC1.id, ...)`
    per il ruolo master e il `prisma.grant.upsert` per `adminUser` come
    head_master): entrambi duplicavano grant già creati altrove nello script
    per `campaign1_1` (masterC1 → master, riga ~776; adminUser → head_master,
    tramite il loop "Admin grants" su tutte le campagne di `arcana-domine`).
    Nessuna perdita di comportamento, solo idempotenza aggiuntiva rimossa.

## Note / Log

- 2026-07-17 (owner): nuovo task — richiesto dall'utente (punto 3 del brief).
  Verificato leggendo `prisma/seed.ts` per intero: `campaign1` (righe
  121-256) e `demo-metamodello` (righe 918-1383) non condividono id/slug,
  nessuna collisione hard, solo una sovrapposizione concettuale di naming sul
  concetto "Regolamento/Regolamenti" da risolvere in implementazione (vedi
  Scope). Verificato anche `test-users.md` e `qa-report-fase-1-backend.md`
  (grep `demo-metamodello`/`campaign1`): nessun riferimento a
  `demo-metamodello`, quindi nessun impatto su quei documenti QA di Fase 1
  dal lato slug — restano validi così come sono.
- 2026-07-17 (owner): base branch `task/015-schema-metamodel-dati-campagna`
  (deroga §12, stessa ragione di T-028/029/030/031: la Fase 2 non è ancora in
  `main`). Nessuna dipendenza da T-028/029/030/031 (tocca solo il seed
  script, non la UI) — parallelizzabile con quei task.
- 2026-07-17 (dev): inizio implementazione su `task/032-consolidare-seed-demo-metamodello-in-campaign1`.
- 2026-07-17 (dev): rimossi i 4 `DataType` legacy di `campaign1` (Regolamento/
  Bandi/PNG/Cronache) e la creazione della campagna `demo-metamodello`;
  sezione T-023 riscritta per usare `campaign1_1.id`/`campaign1Id` invece di
  `demoCampaign`/`demoCampaignId`; rimossi 2 grant ridondanti; aggiornati i
  contatori nel riepilogo finale (`5 Campaigns`, `14 DataTypes`,
  `4 Admin grants`). Dettaglio scelte in `## Artifacts`.
- 2026-07-17 (dev): verifica idempotenza fatta **staticamente** (nessun DB
  reale disponibile: `.env` punta a un Neon condiviso su cui non è prudente
  lanciare `bunx prisma db seed` senza un branch effimero, e non ho tool
  Neon MCP né Docker/Postgres locale in questa sessione per crearne uno).
  Letto il codice risultante end-to-end: (1) `campaign1_1` via
  `getCampaignBySlug`+`createCampaign` solo se assente — idempotente; (2) i
  4 `DataType` legacy sono stati eliminati dal codice, quindi non c'è più
  nulla da verificare lì; (3) `ensureDataType`/`ensureReferenceData` cercano
  per nome/chiave naturale prima di creare (nessun vincolo UNIQUE a schema,
  ma nessuna collisione di nome nel set risultante: Razza/Religioni/Talenti/
  Regolamenti sono gli unici 4 `DataType` di `campaign1`, nessuno confligge
  con i nomi legacy rimossi); (4) `ensureDataRequirement` e
  `ensureVisibilityCondition` cercano per chiave naturale (definitionId+
  requiredDefinitionId+type; functionName) prima di creare; (5) i 2 grant
  ridondanti rimossi erano comunque `upsert` (idempotenti) prima della
  rimozione; (6) `assignRaceWithInitialXp`/`assignCharacterData`/
  `purchaseTalent` in `characterAssignment.ts` controllano
  `findExistingAssignment` prima di scrivere (già verificato, nessuna
  modifica necessaria lì — nessun riferimento hardcoded a
  `demo-metamodello`/slug/id). Limitazione dichiarata: questa è una verifica
  statica del codice, non un'esecuzione reale a due passate su un DB —
  se l'owner ha un branch Neon effimero disponibile, un run reale di
  `bunx prisma db seed` (due volte) è il modo per chiudere il gap.
- 2026-07-17 (dev): `bun run type-check` e `bun run lint` verdi. `bun run
test:run` → 2 file falliti / 4 test falliti (`impersonation-flow.test.tsx`,
  `UsersManager.test.tsx`, entrambi su impersonation, non toccati da questo
  task); confermato con `git stash` + re-run che gli stessi 4 test falliscono
  identicamente anche senza le modifiche di questo task (pre-esistenti sul
  branch base `task/015-schema-metamodel-dati-campagna`).
- 2026-07-17 (dev): fine implementazione, `status: in-review` (assignee
  resta `dev`). Branch `task/032-consolidare-seed-demo-metamodello-in-campaign1`,
  verificabile con `git log task/015-schema-metamodel-dati-campagna..task/032-consolidare-seed-demo-metamodello-in-campaign1`
  e `git diff task/015-schema-metamodel-dati-campagna...task/032-consolidare-seed-demo-metamodello-in-campaign1 -- prisma/seed.ts`.
- 2026-07-17 (QA): **verifica indipendente end-to-end ripetuta dal QA**
  (non solo appoggiata al reviewer). Ambiente: Postgres 16 effimero via
  `podman run -d --name qa032-pg -e POSTGRES_PASSWORD=qapass -e
POSTGRES_USER=qauser -e POSTGRES_DB=qadb -p 55432:5432 postgres:16-alpine`
  (podman disponibile, non Docker; DB locale, non Neon — nessun tool Neon MCP
  disponibile in questa sessione, coerente con quanto riportato dal reviewer).
  Passi ed esiti:
  1. `bunx prisma migrate deploy` con `DATABASE_URL`/`DIRECT_URL` puntati al
     DB locale: tutte le 12 migrazioni applicate senza errori.
  2. `bunx prisma db seed` (1a esecuzione): completato, riepilogo finale
     "5 Campaigns", "14 DataTypes"; nessuna riga `demo-metamodello` in
     `Campaign` (query diretta: 0 righe). `campaign1` (id 1) ha esattamente
     4 `DataType` (Razza/Religioni/Talenti/Regolamenti) — i 4 legacy
     (Regolamento/Bandi/PNG/Cronache) assenti da `campaign1`. Dati T-023
     tutti dentro `campaign1`: 3 `ReferenceData` Razza, 2 Religioni,
     5 Talenti (vedi nota sotto su "4" vs "5"), 1 Regolamenti; 3
     `DataRequirement`; 1 `VisibilityCondition` (`memberOfAnyFactionOrReligion`);
     1 `Character` (Aurelio delle Nebbie, `campaignId=1`).
  3. `pg_dump --data-only --inserts` su 15 tabelle rilevanti (Organization,
     Campaign, DataType, ReferenceData, DataRequirement, VisibilityCondition,
     Character, Data, User, Grant, Event, FeatureType, Feature, XpTransaction,
     PersonalData), ordinato e salvato come baseline.
  4. `bunx prisma db seed` (2a esecuzione): riepilogo identico ("5
     Campaigns", "14 DataTypes"), nessun errore/duplicato.
  5. Nuovo `pg_dump` sulle stesse 15 tabelle, `diff` contro la baseline: unica
     differenza i token random `\restrict`/`\unrestrict` generati da `pg_dump`
     ad ogni invocazione (non dati); righe dati identiche byte per byte.
     Conteggi confermati stabili: Campaign=5, DataType=14, ReferenceData=11,
     Character=1, XpTransaction=5, Grant=8. Idempotenza reale confermata
     indipendentemente, in linea con quanto riportato dal reviewer (15
     tabelle, diff identico).
  6. Ri-verificato dopo la 2a esecuzione: `Campaign` con slug
     `demo-metamodello` → 0 righe; `DataType` di `campaign1` → ancora
     esattamente 4 righe (Razza/Religioni/Talenti/Regolamenti), nessun
     duplicato.
  7. Nota minore non bloccante: il log del seed e i commenti dicono "4
     talenti" ma i `ReferenceData` effettivi per `Talenti` sono 5 (Lama del
     Veterano, Fendente Implacabile, Codice degli Iniziati, Fede
     Incrollabile, Dono Proibito del Sangue Nero). Verificato che questa
     discrepanza è **pre-esistente sul branch base**
     `task/015-schema-metamodel-dati-campagna` (stesso testo "4 talenti" già
     presente lì via `git show`), quindi non introdotta da T-032 e fuori
     scope (Scope §Escluso: "Cambiare il contenuto sostanziale dei dati
     T-023"). Segnalata solo come nota per un futuro task di cleanup T-023,
     non impatta il verdetto di T-032.
  8. `bun run type-check` → verde (nessun output di errore). `bun run lint`
     → verde (nessun output di errore). `bun run test:run` → **2 file
     falliti / 4 test falliti**, confermati identici a quanto dichiarato dal
     dev: `impersonation-flow.test.tsx` (1) e `UsersManager.test.tsx` (3,
     tutti sull'azione "Impersona"). Confermato che
     `git diff task/015-schema-metamodel-dati-campagna...task/032-... --
--stat` tocca **solo** `prisma/seed.ts` e il file `.task/032-*.md`:
     nessun file di test toccato dal diff, quindi i 4 fallimenti sono
     necessariamente pre-esistenti sul branch base, non causati da questo
     task. Stesso pattern già accettato per T-028/T-034.
  9. `grep -rn "demo-metamodello" .` (esclusi `.git`, `node_modules`) sull'intero
     repo: zero occorrenze in `prisma/seed.ts`/`src/`; le uniche occorrenze
     residue sono storiche in `.task/README.md`, `.task/023-*.md`,
     `.task/032-*.md` (documentazione/log, atteso e corretto).
  10. Cleanup: container `qa032-pg` fermato e rimosso a fine verifica; nessuna
      modifica al DB Neon condiviso (`.env` non toccato).
  - **Verdetto: QA OK, pronto per PR.** Tutti i criteri di accettazione
    osservati con prova diretta (non solo lettura statica/fiducia nel
    reviewer). Checkbox type-check/lint/test:run spuntata con la
    giustificazione sui 4 fallimenti pre-esistenti.
  - **Cautela di integrazione (da riportare all'owner, non blocca il QA di
    questo task)**: su un DB Neon di sviluppo dove la campagna
    `demo-metamodello` e/o i 4 `DataType` legacy di `campaign1`
    (Regolamento/Bandi/PNG/Cronache) fossero **già stati seedati in passato**
    da esecuzioni precedenti del seed (prima di T-032), quelle righe
    **restano orfane** dopo il re-seed con questo branch: lo script non
    esegue alcuna cancellazione automatica di dati preesistenti (get-or-create/
    `ensure*`, non delete). Serve una pulizia manuale lato owner sul DB reale
    interessato (drop della campagna `demo-metamodello` e dei 4 `DataType`
    legacy, se presenti) prima o dopo il merge — fuori scope per una
    migrazione Prisma automatica, come già indicato nello Scope §Escluso di
    questo task.
