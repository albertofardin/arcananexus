---
id: "040"
title: "Nuova Frontiera: catalogo dati + azioni downtime + seed dedicato"
status: done
priority: P2
assignee: ""
branch: task/040-nuova-frontiera-dati-campagna
base: task/015-schema-metamodel-dati-campagna
trello: ""
created: 2026-07-22
updated: 2026-07-23
---

## Obiettivo

"Nuova Frontiera" è una campagna reale della stessa associazione (Arcana
Domine, vedi intestazione del regolamento: "NUOVA FRONTIERA — Associazione
Arcana Domine"), gestita finora su un gestionale precedente. In
`gdxhisfn_NuovaFrontiera.csv/` (root del repo, **non committato**, vedi
Scope §PII) c'è l'estrazione completa del vecchio DB più il regolamento in
PDF. L'obiettivo è modellare il catalogo dati di questa campagna (razze,
fazioni, divinità, talenti con le loro categorie, oggetti, dicerie) e le
azioni Downtime del regolamento (cap. 16) sul metamodello attuale
(`DataType`/`ReferenceData`/`DataRequirement`, `Feature`/`FeatureType`), e
preparare un seed specifico e ri-eseguibile che importi questo catalogo da
CSV (non trascritto a mano) in una campagna "Nuova Frontiera" reale sotto
l'organizzazione `arcana-domine`.

## Scope

Incluso:

**Dati** — un `DataType` per ciascuno di questi, con `ReferenceData`
popolate leggendo il CSV corrispondente (non hardcoded riga per riga):

| CSV                                                                        | DataType                                           | `kind`     | `cardinality` | note                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------- | ---------- | ------------- | --------------------------------------------------------------------------- |
| `table_razze.csv` (7 righe)                                                | Razza                                              | `race`     | `single`      | `flags.startingPx` da `exp_iniziali`                                        |
| `table_fazioni.csv` (6 righe)                                              | Fazione                                            | `faction`  | `single`      |                                                                             |
| `table_divinita.csv` (5 righe)                                             | Divinità                                           | `religion` | `single`      | riusa `kind: religion` per il concetto di divinità/culto di questa campagna |
| `table_talenti.csv` (238 righe) + `table_talenti_categorie.csv` (21 righe) | Talenti                                            | `talent`   | `multi`       | vedi sotto                                                                  |
| `table_dicerie.csv` (29 righe)                                             | Dicerie                                            | `generic`  | `multi`       | tutte `status=visibile` nel CSV                                             |
| `table_oggetti.csv` (923 righe)                                            | split in 8 `DataType` per `categoria` (vedi sotto) | `generic`  | `multi`       | tutte `status=nascosto` nel CSV → seedare `visibility: hidden`              |

Nota sui conteggi: `wc -l` sui CSV sovrastima le righe logiche (molti campi
hanno HTML/testo con newline interne tra virgolette) — usare un parser CSV
vero (RFC4180, gestisce virgolette e newline incluse), non uno split per
riga. I conteggi sopra sono quelli reali già verificati con `csv.DictReader`
di Python durante l'analisi preliminare.

Split oggetti per `categoria` → nome `DataType` (tutti `playerAssignable:
false`, `showInSidebar: true`, `renderAs: catalog`):
`ingrediente`→"Ingredienti", `oggetto` e `-nessuno-`→"Oggetti" (fondere le
due categorie: `-nessuno-` è residuale, poche righe con `tipologia:
trappola`), `oggetto incantato`→"Oggetti Incantati", `droga`→"Droghe",
`malattia`→"Malattie", `tonico da battaglia`→"Tonici da Battaglia",
`speciale`→"Oggetti Speciali", `maledizione`→"Maledizioni". Comporre
`description` da `descrizione` + `tipologia` (se non vuota) + `rarita`
(mappare `C`→Comune, `NC`→Non Comune, `R`→Raro, `L`→Leggendario, ignorare
`-nessuno-`) — nessun flag nuovo su `kind: generic` (resta a schema flags
vuoto per quel kind, vedi `referenceDataFlags.ts`).

**Talenti**: categoria (`talenti_categorie.nome`) va in `flags.category`
(campo opzionale già aggiunto a `talentFlagsSchema` dal task
[[039-data-requirement-or-group]], usarlo — non reinventarlo).
`costo_exp`→`flags.cost`, `repeatable: false` e `creationOnly: false` come
default (il CSV non ha dati affidabili per popolarli diversamente).
`status: nascosto/visibile`→`DataVisibility.hidden/visible`. Requisiti da
`and_ids_talenti` (virgola-separati) → `DataRequirement type: requires`
individuali (AND, comportamento storico). `not_ids_talenti` →
`DataRequirement type: blocks`. `or_ids_talenti` → **usare il nuovo
`groupId`** del task 039: tutte le righe risultanti dallo stesso
`or_ids_talenti` di uno stesso talento condividono un `groupId` (es. l'id
del talento stesso, o un contatore locale — qualunque intero stabile e
non ambiguo per quella `definition`). Gli id CSV nei tre campi possono
riferirsi a talenti non presenti tra le 238 righe reali (righe
soft-cancellate nel gestionale originale): costruire prima una mappa
id-CSV→id-DB di tutti i talenti importati, poi in un secondo passaggio
creare i `DataRequirement`, saltando (con un conteggio/log finale, non
silenziosamente) i riferimenti che non risolvono.

**Eventi**: `table_eventi.csv` (8 righe reali) → `Event` della campagna.
Campi: `name`←`nome`, `place`←`luogo_evento`, `descriptionShort`←`descrizione`,
`descriptionFull`←`descrizione_completa` (contiene HTML da Google Docs:
va ripulito — tag rimossi, entità decodificate — non salvato grezzo),
`eventDate`←`data_evento`, `closeDate`←`scadenza_iscrizioni`.
`publicationDate` non è nel CSV: derivarla (es. qualche mese prima di
`eventDate`, purché precedente a `closeDate`) — è un campo obbligatorio a
schema, va scelto un criterio ragionevole e documentato nel task.

**Azioni Downtime** (Regolamento cap. 16, tabella `table_azioni_downtime.csv`,
10 righe `status=visibile`): un `functionName` **per categoria** (non un
handler condiviso — `getFeatureByFunctionName` risolve solo la prima
`Feature` per `functionName` di una campagna, quindi condividerlo tra le 10
categorie renderebbe le altre 9 irraggiungibili, vedi
`feature.repository.ts`). Le 10 categorie: Lavorare, Produrre, Indagare,
Ricercare, Missiva a PG, Missiva a PNG, Sabotare, Mecenatismo, Costruire,
Altro. L'handler è lo stesso codice per tutte e 10 (una factory/loop, non
10 file quasi identici) — vedi `src/lib/features/handlers/learnTalent.ts` e
`deathXpRecovery.ts` come pattern di riferimento per come un handler si
registra (`registerFeatureHandler`, side-effect import in
`src/lib/features/index.ts`). Ogni handler crea una `Action
waitingApproval` con `actionData` a testo libero (`descrizione` +
opzionale `destinatario`) — **non** costruire un motore di risoluzione
automatica (niente sistema di monete/inventario/edifici a schema per
simularlo davvero): la valutazione narrativa resta un compito manuale
dello staff, tramite la coda di review già esistente (T-033,
`listWaitingApprovalActionsForCampaign` / `actionReview.service.ts`).
`FeatureType` è platform-wide (seedabile una volta, come
`downtimeLearnTalent`): qualunque campagna può attivarne una creando una
`Feature` che vi punta, non solo Nuova Frontiera.

**Campagna e utenti**: campagna "Nuova Frontiera" sotto l'organizzazione
`arcana-domine` esistente (slug `nuova-frontiera`). Esattamente 5 utenti
loggabili nuovi, creati con lo stesso pattern già usato in `prisma/seed.ts`
(`auth.api.signUpEmail`, non `prisma.user.create` a mano — hasha la
password correttamente):

- **headmaster** → `Grant role: head_master` sulla campagna
- **master** → `Grant role: master`
- **supporter** → `Grant role: supporter`
- **player1**, **player2** → nessun `Grant` (giocatori semplici)

Nessun `Character` per nessuno dei 5 (vedi PII/scope sotto — niente PG/PNG
importati). Considera dare quota associativa dell'anno corrente
(`getCurrentAssociationYear`, come già fa `prisma/seed.ts`) almeno a
headmaster/master/supporter.

**Seed script**: nuovo script standalone (es. `prisma/seed-nuova-frontiera/`,
struttura a scelta del dev — non deve essere infilato dentro
`prisma/seed.ts`, che resta il seed demo generico), invocabile con un nuovo
script `package.json` (es. `bun run seed:nuova-frontiera`). Deve:

- Leggere i CSV a runtime con un parser CSV vero scritto ad hoc (nessuna
  nuova dipendenza da installare per questo — verificare comunque se nel
  frattempo è comparsa una libreria CSV già in `package.json`, altrimenti
  scriverne uno minimale RFC4180: gestione virgolette, virgole e newline
  interne, escape `""`).
- Essere idempotente: ri-eseguirlo non deve duplicare nulla. Il nome non è
  una chiave affidabile (923 oggetti hanno 16 nomi duplicati veri, causati
  da record diversi con lo stesso nome ma id CSV diversi) — usare
  `ReferenceData.externalId` (campo già a schema, pensato per import
  legacy, vedi commento T-024) con un prefisso stabile tipo
  `nf-oggetto-<id>`, `nf-talento-<id>`, ecc. Verificare se esiste già un
  lookup by-externalId nel repository (`referenceData.repository.ts`);
  se no, aggiungerlo (pattern analogo a `getReferenceDataByName`).

**PII — limiti assoluti**: NON leggere, importare o referenziare in alcun
modo `table_utenti.csv`, `table_personaggi.csv`, `table_png.csv`,
`table_eventi_iscrizioni.csv`, `table_downtime.csv` — contengono dati
personali reali (codice fiscale, password hash, email) di persone vere.
Il task copre SOLO le tabelle di catalogo elencate sopra + `table_eventi.csv`

- `table_azioni_downtime.csv`. Aggiungere `gdxhisfn_NuovaFrontiera.csv/` al
  `.gitignore` del repo (la cartella non deve mai finire in un commit).

Escluso:

- Import di PG/PNG/utenti reali del gestionale precedente (esplicitamente
  richiesto fuori scope dall'utente).
- Un motore di risoluzione/gioco per le azioni downtime (mercato, monete,
  inventario, edifici): fuori scope, non esiste a schema oggi.
- UI dedicata per la campagna Nuova Frontiera: usa l'admin generico già
  esistente (`ReferenceDataManager`, gestione `Feature`, ecc.).
- `or_ids_talenti`: rappresentarlo correttamente è comunque nello scope di
  QUESTO task (userà la capacità del task 039), ma la revisione del design
  di quella capacità appartiene al task 039, non a questo.

## Criteri di accettazione

- [x] `bun run seed:nuova-frontiera` (o nome equivalente) è idempotente:
      eseguito due volte di fila non crea righe duplicate (verificabile
      con una query di conteggio prima/dopo la seconda esecuzione).
      **Verificato dal vivo su Neon dev** (stesso DB del resto della
      piattaforma, `.env` del repo): 1° run da DB pulito (nessuna
      campagna `nuova-frontiera` preesistente, verificato prima) →
      creazione completa; 2° run consecutivo → conteggi bit-per-bit
      identici (`campaigns:1, dataTypes:13, referenceData:1208,
dataRequirement:584, events:8, features:10, users:5`), `0
DataRequirement creati` al 2° giro (vedi Log per l'output completo
      di entrambi i run e le query di verifica).
- [x] Dopo il seed: campagna "Nuova Frontiera" esiste sotto `arcana-domine`;
      i `DataType` (Razza, Fazione, Divinità, Talenti, Dicerie + gli 8 per
      oggetti = **13 totali**, non 12/6 come scritto sopra dall'orchestratore
      — 5 categorie base + 8 split oggetti, vedi nota in Artifacts/decisions)
      esistono con conteggi `ReferenceData` coerenti con i CSV (7/6/5/238/29
      rispettivamente, e 923 sommando le 8 split di Oggetti: 212+477+14+18+
      67+32+101+2 = 923) — verificato dal vivo, non solo dedotto dal log del
      seed.
- [x] Almeno un talento con `or_ids_talenti` non vuoto nel CSV originale
      risulta, dopo il seed, con un `DataRequirement.groupId` non nullo
      condiviso tra le sue alternative. Verificato dal vivo: talento
      "Guida" (`nf-talento-17`, CSV `or_ids_talenti: "127,16"`) ha
      `DataRequirement.groupId = 65` (il suo id DB) su due righe verso
      "Santuario" (`nf-talento-127`) ed "Esploratore" (`nf-talento-16`) —
      query diretta su Neon, non solo unit test.
- [x] I 10 `functionName` downtime sono registrati nel registry
      (`listRegisteredFeatureHandlers()` li include, test dedicato in
      `downtimeAction.test.ts`) e, dopo il seed, la campagna Nuova
      Frontiera ha 10 `Feature` attive che vi puntano — verificato dal vivo
      (query diretta, 10 righe, un `functionName` distinto ciascuna).
- [x] Esattamente 5 utenti nuovi loggabili (headmaster/master/supporter/
      player1/player2) esistono con i `Grant` descritti sopra; nessun
      `Character` creato per nessuno di loro — verificato dal vivo (5
      utenti, 3 `Grant` head_master/master/supporter, 0 `Character` nella
      campagna).
- [x] Nessun riferimento, nel codice del seed o nei suoi commit, a
      `table_utenti.csv`/`table_personaggi.csv`/`table_png.csv`/
      `table_eventi_iscrizioni.csv`/`table_downtime.csv`.
      `gdxhisfn_NuovaFrontiera.csv/` è in `.gitignore` (committato per
      primo, prima di qualunque altro codice). Verificato con `grep -r`
      mirato sui 5 basename in `prisma/seed-nuova-frontiera/` e
      `src/lib/`: nessun match.
- [x] `bun run type-check`, `bun run lint` verdi. `bun run test:run`: 1311
      pass / 10 fail su 1321 — i 10 fail sono **preesistenti e non
      correlati** (stesso identico elenco di `DataTypesManager.test.tsx`/
      `ReferenceDataManager.test.tsx` già documentato e confermato da
      dev/reviewer/qa nel task 039, mismatch accessible-name su
      icon-button `edit`/`delete`): riconfermato in questa sessione con lo
      stesso metodo (`git stash push -u`, rilanciato lo stesso file su
      HEAD pulito → stessi 10 fail identici, poi `git stash pop`). Nuovi
      handler/repository hanno copertura test dedicata (58 nuovi test in
      9 file, dettaglio in Artifacts).

## Artifacts

files_modified:

- `.gitignore` (`/gdxhisfn_NuovaFrontiera.csv/`, primo commit)
- `src/lib/validations/referenceDataFlags.ts` (`talentFlagsSchema.category`
  opzionale, reintrodotto dopo la rimozione round-2 del task 039)
- `src/lib/validations/referenceDataFlags.test.ts` (nuovo)
- `src/app/(dashboard)/_components/ReferenceDataManager.tsx`
  (`buildDefaultFlags`/`FlagsForm` gestiscono campi `flags` stringa
  opzionali — `unwrapFlagField`/`isOptionalFlagField` — senza rompere il
  rendering/default numerico esistente)
- `src/lib/repositories/referenceData.repository.ts`
  (`getReferenceDataByExternalId`, nuovo)
- `src/lib/repositories/referenceData.repository.test.ts` (nuovi test)
- `src/lib/features/handlers/downtimeAction.ts` (nuovo: handler condiviso +
  `DOWNTIME_CATEGORIES`, registra 10 `functionName`)
- `src/lib/features/handlers/downtimeAction.test.ts` (nuovo)
- `src/lib/features/index.ts` (side-effect import del nuovo handler)
- `prisma/seed-nuova-frontiera/csv.ts` + `.test.ts` (parser RFC4180 ad hoc)
- `prisma/seed-nuova-frontiera/html.ts` + `.test.ts` (pulizia HTML via jsdom)
- `prisma/seed-nuova-frontiera/paths.ts` + `.test.ts` (allowlist CSV, unico
  punto di lettura da disco)
- `prisma/seed-nuova-frontiera/oggetti.ts` + `.test.ts` (split categoria →
  8 `DataType`, composizione `description`)
- `prisma/seed-nuova-frontiera/talenti.ts` + `.test.ts` (grafo requisiti
  AND/OR/blocks da id CSV, risoluzione categoria)
- `prisma/seed-nuova-frontiera/eventi.ts` + `.test.ts` (parsing date,
  derivazione `publicationDate`)
- `prisma/seed-nuova-frontiera/index.ts` (nuovo, orchestratore principale)
- `package.json` (script `seed:nuova-frontiera`)

interfaces:

- "getReferenceDataByExternalId(prisma, dataTypeId, externalId) -> ReferenceData | null"
- "parseCsvRows(content) -> string[][]"
- "parseCsvRecords(content) -> Record<string,string>[]" (throws `CsvHeaderMismatchError` su mismatch colonne)
- "parseIdList(value) -> number[]"
- "readCatalogCsv(name: CatalogCsvName) -> Record<string,string>[]" (name vincolato a un literal union di 9 CSV di catalogo, mai i 5 PII)
- "cleanHtml(html) -> string" (jsdom, blocchi `<p>/<div>/<li>` uniti da riga vuota)
- "resolveOggettoDataTypeName(row: OggettoRow) -> string" (throws `UnknownCategoriaError`)
- "buildOggettoDescription(row: OggettoRow) -> string"
- "resolveTalentoCategory(row: TalentoRow, categorie: TalentiCategoriaRow[]) -> string" (throws `UnknownTalentiCategoriaError`)
- "buildTalentoRequirements(rows: TalentoRow[]) -> { requirements: RequirementDescriptor[]; skipped: SkippedReference[] }" (id CSV, non ancora risolti a id DB; `isOrGroup` marca le righe da `or_ids_talenti`)
- "parseCsvDate(value, eventoId) -> Date" (throws `InvalidEventDateError`)
- "derivePublicationDate(eventDate, closeDate) -> Date" (90gg prima di eventDate, fallback 7gg prima di closeDate se il criterio principale cadrebbe dopo closeDate)
- "DOWNTIME_CATEGORIES: { nome: string; functionName: string }[]" (10 categorie, `src/lib/features/handlers/downtimeAction.ts`)

decisions:

- "`talentFlagsSchema.category` reintrodotto come opzionale (`z.string().optional()`), non con un default stringa vuota: `buildDefaultFlags`/`FlagsForm` in `ReferenceDataManager.tsx` lo trattano come 'non impostato' (`undefined`) finché l'head_master non lo valorizza esplicitamente — verificato che il test esistente `un head_master crea una ReferenceData per kind=talent con flags dinamici` (che non tocca il campo `category`) passa invariato, perché `toEqual` di vitest ignora le proprietà `undefined`."
- "`getReferenceDataByExternalId` scoped su `dataTypeId` (non globale), stesso trattamento di `getReferenceDataByName`: unità di idempotenza coerente con il resto del repository, anche se in pratica il prefisso (`nf-oggetto-`, `nf-talento-`, ...) sarebbe già sufficiente a evitare collisioni cross-`DataType`."
- "Handler downtime condiviso (1 modulo, 1 funzione `handler`, 10 registrazioni in loop da `DOWNTIME_CATEGORIES`) invece di 10 file quasi identici: nessuna `CharacterData`/`XpTransaction` creata (a differenza di `learnTalent`), solo un'`Action waitingApproval` con `actionData` a testo libero — la valutazione narrativa resta manuale (task esplicitamente fuori scope per un motore di risoluzione automatico)."
- "Mappa `nome CSV -> functionName` (`DOWNTIME_CATEGORIES`) tenuta nel codice dell'handler (non letta dinamicamente dal CSV): il `functionName` è per natura una decisione tecnica del dev, non un dato del gestionale precedente; il seed legge comunque `table_azioni_downtime.csv` e fallisce esplicitamente se incontra un `nome` non mappato, così la mappa resta verificata contro il CSV reale a ogni run invece di essere solo un elenco scollegato."
- "Parser CSV scritto ad hoc (character-by-character, RFC4180) invece di una regex: verificato contro i 9 CSV di catalogo reali, stessi conteggi esatti prodotti da `csv.DictReader` di Python usato nell'analisi preliminare (7/6/5/21/238/29/923/8/10)."
- "Sentinella letterale `NULL` (vista in `note_master`/campi liberi del gestionale precedente) normalizzata a stringa vuota dentro `parseCsvRecords` stesso (non nei consumer): un solo posto che conosce questo dettaglio del gestionale, tutti i consumer (talenti and/or/not, dicerie, ecc.) vedono solo 'stringa vuota o valore reale'."
- "`readCatalogCsv` accetta solo un literal union type di 9 nomi (`CatalogCsvName`): i 5 CSV con dati personali reali non compaiono nell'union, quindi leggerli richiederebbe un cast esplicito (`as unknown as CatalogCsvName`) sia per superare TypeScript sia per superare il check runtime — due barriere indipendenti, non una sola."
- "`or_ids_talenti` → `DataRequirement.groupId = id DB della definition stessa`: stabile, unico per costruzione per quella `definitionId` (la chiave del gruppo in `evaluateRequirements`, T-039, è già `(definitionId, groupId)`), nessun contatore/tabella gruppi aggiuntiva."
- "Requisiti duplicati nel CSV stesso (591 righe generate dal parsing, 584 effettivamente creabili — verificato dal vivo): la stessa coppia (definitionId, requiredDefinitionId, type) può comparire più volte tra i campi and/or di uno stesso talento; l'insieme in memoria `existingRequirementKeys` (alimentato sia da `listRequirementsForCampaign` sia dalle righe appena create nello stesso run) le deduplica prima dell'INSERT, evitando di far leva sul solo vincolo UNIQUE del DB (che avrebbe comunque impedito il duplicato, ma con un errore P2002 invece di uno skip pulito)."
- "`publicationDate` derivata con criterio 'eventDate − 90 giorni', fallback 'closeDate − 7 giorni' se il criterio principale cadrebbe dopo closeDate: verificato sia su fixture sintetiche sia sulle 8 righe reali (nessuna delle 8 usa il fallback, `closeDate` è sempre entro ~2 settimane da `eventDate`)."
- "`Event` non ha una chiave naturale/unique a schema: idempotenza basata su `(campaignId, name)` — sufficiente perché le 8 righe reali hanno nomi tutti distinti, stesso principio di `getReferenceDataByName` per le entità senza `externalId`."
- "Discrepanza aritmetica nel testo originale del task ('i 6 DataType... = 12 totali'): sono 5 categorie base (Razza/Fazione/Divinità/Talenti/Dicerie) + 8 split oggetti = **13** DataType, non 6 né 12 — verificato dal vivo (13 righe in `DataType` per la campagna). Non è un difetto dell'implementazione, è un refuso nel testo del task: documentato qui invece di forzare un conteggio sbagliato per far tornare i conti."
- "Seed eseguito dal vivo contro il DB Neon dev condiviso (stesso `.env` del resto della piattaforma) direttamente da `dev`, non rimandato a `qa`: a differenza di un esperimento effimero (T-039, dati temporanei creati e poi ripuliti), qui l'intero scopo del seed è lasciare la campagna Nuova Frontiera persistente — non c'era nulla da 'ripulire' dopo. Verificata l'assenza di una campagna `nuova-frontiera` preesistente prima del primo run (DB pulito), poi 2 run consecutivi con query di conteggio prima/dopo per l'idempotenza (vedi Log e criteri di accettazione). Nessun accesso al tool Neon MCP in questa sessione (non nell'elenco strumenti disponibili): la verifica è stata fatta con script Prisma ad hoc via Bash, non con `run_sql`/branch effimeri."
- "Round 2 (fix finding reviewer): `buildTalentoRequirements` ristrutturata attorno a un helper interno `resolveValidIds(definitionCsvId, field, rawValue) -> number[]` (risolve un campo and/or/not a soli id CSV validi, collezionando gli sganciati in `skipped` come già in precedenza) invece del precedente `collect` che emetteva subito i `RequirementDescriptor`: l'OR-group va valutato per intero (intersezione con gli id AND validi dello stesso talento) prima di sapere se va emesso, quindi non può più emettere le righe mentre parsa. Comportamento invariato per `and`/`not_ids_talenti` (emissione immediata, non condizionata) e per il log `skipped` (un id or_ids_talenti che non risolve viene comunque raccolto in `skipped`, indipendentemente dal fatto che l'intero gruppo poi venga scartato per overlap — sono due condizioni ortogonali: 'riferimento CSV rotto' vs 'gruppo ridondante')."
- "Verificato con uno script ad hoc (`bunx tsx`, non committato) il grafo requisiti prodotto dalla funzione fixata contro le 238 righe reali di `table_talenti.csv`, per tutti e 6 i talenti citati dal reviewer: 'Cercatore' (183) ora → solo AND 28 (nessun 33); 'Ripresa Rapida' (190) → solo AND 9 (nessun 41); 'Ferocia Primordiale - Volontà d'Acciaio' (193) → solo AND 191+9 (nessuno dei 3 OR-member 192/189/190, l'intero gruppo scartato); 152/161/168 → stesso esito di prima (gruppo vuoto) ma ora per costruzione (intersezione non vuota rilevata esplicitamente), non per la coincidenza della dedup by-key in `index.ts`; 'Guida' (17, nessun overlap) → invariato, AND 1 + OR 127/16 con `groupId` condiviso."

## Note / Log

- 2026-07-22 (orchestratore): task scritto dopo ricerca preliminare (analisi
  CSV con `csv.DictReader` Python per conteggi reali, lettura completa del
  regolamento cap. 16 "Le azioni Downtime" via `pdftotext`, lettura dei
  pattern esistenti `seed.ts`/`characterAssignment.ts`/`learnTalent.ts`/
  `deathXpRecovery.ts`/`feature.repository.ts`). Nessun codice applicativo
  scritto per questo task in questa sessione (a differenza del task 039,
  qui il processo dev→reviewer→qa è stato rispettato fin dall'inizio, su
  richiesta esplicita dell'utente). Assegnato a `dev`.
- 2026-07-22 (dev): inizio implementazione. Aggiunto
  `/gdxhisfn_NuovaFrontiera.csv/` a `.gitignore` come primo commit, prima di
  qualunque altro codice. Branch `task/040-nuova-frontiera-dati-campagna`
  creato da `nuova_frontiera` nello stesso working directory (non un
  worktree isolato) per preservare l'accesso ai CSV untracked.
- 2026-07-22 (dev): capacità di piattaforma propedeutiche committate
  (`5f59420`): `flags.category` opzionale su `talentFlagsSchema`
  (reintrodotto dopo la rimozione round-2 del task 039, questa volta con
  gestione corretta di default/rendering — verificato che il test
  preesistente sui flags dinamici di `ReferenceDataManager.test.tsx` non
  regredisce), `getReferenceDataByExternalId` nel repository, 10 handler
  downtime via factory condivisa (`downtimeAction.ts`,
  `DOWNTIME_CATEGORIES`). `type-check`/`lint` puliti; suite mirata (nuovi
  test + `ReferenceDataManager.test.tsx`) confrontata con lo stesso metodo
  di T-039 (`git stash push -u` + rilancio su HEAD pulito): stessi 4 fail
  preesistenti, nessuna regressione introdotta.
- 2026-07-22 (dev): parser CSV RFC4180 scritto ad hoc
  (`prisma/seed-nuova-frontiera/csv.ts`), verificato contro tutti e 9 i CSV
  di catalogo reali — stessi conteggi esatti di `csv.DictReader` Python
  usato nell'analisi preliminare (7/6/5/21/238/29/923/8/10). Aggiunti
  `html.ts` (pulizia HTML via jsdom, già devDependency), `paths.ts`
  (allowlist dei 9 CSV di catalogo, unico punto di lettura da disco — un
  CSV PII richiederebbe un cast esplicito sia a compile-time sia a
  runtime per essere letto), `oggetti.ts`/`talenti.ts`/`eventi.ts` (logica
  pura testabile senza DB per split categoria, grafo requisiti AND/OR/
  blocks, derivazione `publicationDate`). 40 nuovi test, tutti verdi.
- 2026-07-22 (dev): scritto l'orchestratore
  `prisma/seed-nuova-frontiera/index.ts` (campagna, 5 `DataType` base + 8
  split oggetti, import completo dei 6 CSV di catalogo, grafo requisiti a
  due passaggi con mappa csvId→id DB, 10 Feature downtime, 5 utenti via
  `auth.api.signUpEmail`, nessun `Character`). Aggiunto script
  `bun run seed:nuova-frontiera` in `package.json`. `type-check`/`lint`
  puliti.
- 2026-07-22 (dev): **eseguito dal vivo contro Neon dev** (stesso `.env`
  del resto della piattaforma; nessun accesso al tool Neon MCP in questa
  sessione — verifica fatta con script Prisma ad hoc via Bash). Verificato
  prima che nessuna campagna `nuova-frontiera` esistesse già. 1° run:
  successo completo, log `7 razze / 6 fazioni / 5 divinità / 238 talenti /
584 DataRequirement (591 attesi dal CSV, 0 scartati per riferimenti
sganciati) / 29 dicerie / 923 oggetti su 8 DataType / 8 eventi / 10
Feature downtime / 5 utenti`. Query dirette post-seed: 13 `DataType`,
  1208 `ReferenceData` (7+6+5+238+29+923, esatto), 584
  `DataRequirement`, OR-group verificato dal vivo (talento "Guida",
  `nf-talento-17`, `groupId=65` condiviso con "Santuario"/"Esploratore",
  combacia con `or_ids_talenti: "127,16"` del CSV), 10 `Feature` con
  `functionName` tutti distinti, 5 utenti/3 `Grant`/0 `Character`. 2° run
  consecutivo: conteggi finali bit-per-bit identici, `0 DataRequirement
creati` (deduplica via `existingRequirementKeys` funzionante) —
  idempotenza confermata con query di conteggio prima/dopo, non solo
  dedotta. `bun run type-check`/`bun run lint` puliti; `bun run test:run`
  → 1311 pass / 10 fail su 1321 (58 nuovi test aggiunti da questo task,
  tutti verdi; i 10 fail sono gli stessi identici, per nome e file, già
  documentati e confermati preesistenti nel task 039 —
  `DataTypesManager.test.tsx` 6 fail + `ReferenceDataManager.test.tsx` 4
  fail, riverificati singolarmente in questa sessione, nessuno dei due
  file toccato dalle modifiche di questo task). Nessun riferimento ai 5
  CSV PII in codice/commit (verificato con `grep -r` mirato). Tutti i
  criteri di accettazione soddisfatti con verifica dal vivo, non solo
  dedotti dal log del seed — dettaglio completo in Artifacts. Segnalata
  in Artifacts una discrepanza aritmetica nel testo originale del task
  ("12 DataType totali" → sono in realtà 13: 5 base + 8 split oggetti),
  non corretta nel corpo del task (di competenza dell'owner, non del
  dev) ma documentata qui e nei criteri. Riportato a `reviewer`. Branch:
  `task/040-nuova-frontiera-dati-campagna` — verificabile con `git log`
  (commit su questo branch) e rieseguendo `bun run seed:nuova-frontiera`
  (idempotente, sicuro da rilanciare).
- 2026-07-22 (reviewer): round 1 — **findings da correggere**. 🟠 Difetto di
  correttezza circoscritto: quando `and_ids_talenti` e `or_ids_talenti` dello
  stesso talento condividono un id (overlap), la dedup per chiave
  `(definitionId:requiredDefinitionId:type)` in `index.ts` scarta l'arco OR
  duplicato ma lascia gli altri membri dell'OR-group come vincolo aggiuntivo
  reale, invece di riconoscere che l'intero gruppo è già soddisfatto
  dall'AND. Risultato: 3 talenti ("Cercatore" nf-talento-183, "Ripresa
  Rapida" nf-talento-190, "Ferocia Primordiale - Volontà d'Acciaio"
  nf-talento-193) risultano più difficili da acquisire nel seed di quanto
  la fonte CSV preveda (es. "Cercatore": fonte richiede solo 28, seed
  richiede 28 AND 33). Altri 3 casi di overlap (152/161/168) risultano
  corretti solo per una coincidenza della dedup (il gruppo si svuota del
  tutto), non per costruzione. Proposta: se
  `and_ids ∩ or_ids(risolti) ≠ ∅` per un talento, scartare l'intero
  OR-group di quel talento (già soddisfatto dall'AND), non solo l'arco
  collidente — fix in `buildTalentoRequirements`
  (`prisma/seed-nuova-frontiera/talenti.ts`). Cautela d'integrazione: il
  seed non aggiorna righe `DataRequirement` già esistenti (dedup solo in
  creazione) — le 5 righe OR errate già persistite su Neon dev andranno
  ripulite a mano o l'intero set `DataRequirement` della campagna andrà
  cancellato prima del re-seed dopo la fix. Tutto il resto verificato
  pulito e conforme ai criteri: PII (nessun riferimento ai 5 CSV vietati,
  `.gitignore` verificato via `git ls-tree`), idempotenza (logica ispezionata
  chiave per chiave, coincide con gli `@@unique` a schema), parser CSV
  (RFC4180 vero, conteggi riprodotti indipendentemente: 7/6/5/21/238/29/923/
  8/10, split oggetti 923 su 8 DataType verificato), `groupId` per OR-group
  pulito (caso "Guida"), `and`/`not`/skip-log corretti, 10 functionName
  downtime distinti via factory condivisa, 5 utenti/grant/0 Character
  corretti, eventi con pulizia HTML e `publicationDate` derivata
  ragionevole, "13 DataType" confermato refuso di solo testo (nessun
  problema di modellazione). `type-check`/`lint` puliti, `test:run` 1311/
  1321 (10 fail preesistenti confermati indipendentemente, stessi del
  task 039). Round 1/3. Riportato a `dev`, `status: in-progress`.
- 2026-07-22 (dev): round 2 — fix del finding reviewer. `buildTalentoRequirements`
  (`prisma/seed-nuova-frontiera/talenti.ts`) ora scarta l'intero OR-group di
  un talento (non solo l'arco collidente) quando almeno un suo id valido
  compare anche tra gli id AND validi dello stesso talento — vedi decisions
  per il dettaglio dell'implementazione (`resolveValidIds`). Aggiunto test
  dedicato in `talenti.test.ts` con un OR-group a 2 membri (uno collidente,
  uno extra) che riproduce esattamente il pattern di "Cercatore": verifica
  che nessuno dei due generi più una riga, non solo che l'arco collidente
  sparisca. Verificato con script ad hoc (non committato, vedi decisions)
  contro le 238 righe reali: i 3 talenti col bug (183/190/193) e i 3 casi
  "corretti per coincidenza" (152/161/168) producono ora l'esito atteso per
  costruzione; "Guida" (17, nessun overlap) invariato. `bun run type-check`
  pulito (nota: la prima esecuzione post-checkout risultava falsamente pulita
  per via di `tsconfig.tsbuildinfo` incrementale non invalidato dopo
  `bunx prisma generate` — cancellato il file e rieseguito da zero per un
  esito genuino; da allora verde per davvero). `bun run lint` pulito.
  `bun run test:run`: 1312 pass / 10 fail su 1322 (stessi 10 fail
  preesistenti già documentati nei round precedenti, per nome e file
  identici — nessuna regressione; +1 test rispetto al round 1, il nuovo
  test sull'overlap, verde).
  **Verifica dal vivo su Neon dev** (script Prisma ad hoc, stesso `.env`):
  confermate esattamente le 5 righe `DataRequirement` errate previste dal
  reviewer — id 390 (definitionId 224 "Cercatore" → requiredDefinitionId 81,
  groupId 224), id 411 (definitionId 231 "Ripresa Rapida" → 89, groupId 231),
  id 416/417/418 (definitionId 234 "Ferocia Primordiale" → 233/230/231,
  tutte groupId 234) — nessun'altra riga tocca questi 3 `definitionId` oltre
  a quelle corrette (AND, `groupId: null`). **Tentata la pulizia mirata**
  (`DELETE ... WHERE id IN (390, 411, 416, 417, 418)`, documentata per
  intero prima dell'esecuzione, con verifica pre-delete del conteggio/
  contenuto esatto delle 5 righe e un guard esplicito che avrebbe abortito
  se una riga con `groupId: null` fosse finita nella lista): **bloccata dal
  classificatore dell'auto mode** ("Blocked by classifier") prima
  dell'esecuzione — nessuna riga cancellata, DB invariato. Non ho tentato
  un workaround: la cautela del task era esplicita ("NON eseguire operazioni
  distruttive sul DB senza prima documentare chiaramente cosa stai per
  fare"), e il blocco della sandbox va nella stessa direzione — serve
  un'azione umana esplicita (l'utente/owner, con accesso a un permesso Bash
  più ampio o al tool Neon MCP `run_sql`, può eseguire questa singola query
  già scritta e verificata sopra). **Stato dati Neon dev**: le 5 righe
  errate sono ancora lì; il codice del seed è corretto e idempotente in
  avanti (un re-seed non le ricrea né le aggiunge di nuovo), ma non le
  rimuove (nessuna logica di aggiornamento righe esistenti, solo
  creazione — vedi finding reviewer originale). Serve l'azione umana sopra
  prima di considerare i dati live pienamente coerenti col CSV sorgente.
  Riportato a `reviewer`, `status: in-review`. Branch invariato:
  `task/040-nuova-frontiera-dati-campagna` (verificabile con
  `git log`/`git diff` su questo branch; `talenti.test.ts` mirato con
  `bun run test:run prisma/seed-nuova-frontiera/talenti.test.ts`, 8/8 verdi).
- 2026-07-23 (reviewer): round 2 — **OK PULITO**. Fix dell'overlap AND/OR
  confermata corretta in generale (non solo sui casi noti): se un membro
  dell'OR-group è già tra gli AND obbligatori, la disgiunzione OR è una
  tautologia e l'intero gruppo si annulla, indipendentemente dagli altri
  membri. Rieseguito il parsing dei CSV col codice attuale: i 6 talenti
  citati (183/190/193/152/161/168) producono l'esito atteso, "Guida" (caso
  pulito) invariato, totale requirements 591→579 (−12, combacia con le 5
  righe DB già ripulite nel task dati separato). Nuovo test significativo
  (OR-group con un membro collidente + uno extra legittimo: nessuna riga
  emessa per nessuno dei due). `type-check`/`lint` puliti, `test:run`
  1312/1322 (10 fail preesistenti confermati, nessuna new regression).
  Round 2/3, chiuso.
- 2026-07-23 (owner): le 5 righe `DataRequirement` errate già persistite su
  Neon dev (id 390/411/416/417/418) sono state verificate ed eliminate
  (autorizzazione utente esplicita, task di pulizia dati separato) — dati
  live ora coerenti col codice corretto. Verdetto reviewer round 2
  integrato. Assegnato a `qa` per verifica end-to-end prima di `done`:
  questo task crea una campagna reale con volumi significativi (13
  DataType, ~1200 ReferenceData, ~580 DataRequirement, 10 Feature, 5
  utenti) e vincoli PII assoluti — merita una verifica indipendente oltre
  a quella già fatta da dev/reviewer. `status: in-review`, `assignee: qa`.
- 2026-07-23 (qa): **verifica indipendente completata, condizioni QA
  soddisfatte**. Nota: nessun tool MCP Neon disponibile in questa sessione
  (contrariamente a quanto indicato nelle istruzioni) — verifica dal vivo
  condotta con script Prisma ad hoc via Bash contro lo stesso Neon dev
  (`.env` del repo), stesso metodo già usato da dev/reviewer.
  1. **PII**: `git rev-list --all | git ls-tree` sui 5 basename vietati →
     nessun match in nessun commit di nessun branch. `git grep`/`grep -r`
     mirato su `prisma/seed-nuova-frontiera/`, `src/lib/`, `package.json` →
     nessun match (gli unici match nel repo sono nel testo del task stesso,
     che li cita per vietarli). `.gitignore:58` →
     `/gdxhisfn_NuovaFrontiera.csv/`, confermato con
     `git check-ignore -v gdxhisfn_NuovaFrontiera.csv/`. `paths.ts` ispezionato:
     `readCatalogCsv` accetta solo l'union `CatalogCsvName` di 9 nomi,
     nessuno dei 5 PII compare.
  2. **Seed dal vivo**: campagna `nuova-frontiera` esisteva già (id 7,
     creata dal dev in una sessione precedente, con le 5 righe
     `DataRequirement` errate già ripulite dall'owner come da Log
     precedente) — gestito il caso rieseguendo il seed a partire da questo
     stato invece che da DB pulito, come consentito dal mandato. Conteggi
     pre-seed (bunx prisma generate rieseguito prima, il client locale era
     stale e non esponeva ancora `groupId`): 13 `DataType` (7 razze / 6
     fazioni / 5 divinità / 238 talenti / 29 dicerie / 923 oggetti su 8
     split: 212+477+14+18+67+32+101+2=923, somma verificata), 1208
     `ReferenceData` totali, **579** `DataRequirement` (non più 584: coincide
     con la pulizia owner delle 5 righe overlap AND/OR), 8 `Event`, 10
     `Feature` con 10 `functionName` distinti, 5 `User` nuovi, 3 `Grant`
     (head_master/master/supporter, ruoli corretti), 0 `Character`. **Run 1**
     (QA, consecutivo): output seed `0 DataRequirement creati (579 attesi...)`,
     query diretta post-run → conteggi identici punto per punto ai
     pre-seed. **Run 2** (QA, consecutivo): stesso output (`0
DataRequirement creati`), query diretta post-run → conteggi
     bit-per-bit identici al Run 1. Idempotenza confermata dal vivo con due
     esecuzioni reali e query di conteggio, non dedotta dal solo Log del dev.
  3. **OR-group**: query diretta su talento "Guida" (`nf-talento-17`, id DB 65) → 3 righe `DataRequirement`: verso "Avanguardia" (AND,
     `groupId: null`), verso "Santuario" e "Esploratore" (`groupId: 65`
     condiviso su entrambe) — combacia esattamente con `or_ids_talenti:
"127,16"` del CSV e col criterio di accettazione. Verificate anche
     assenti le 5 righe già segnalate come errate (id 390/411/416/417/418):
     query diretta → 0 risultati, coerente con la pulizia owner.
  4. **Downtime**: `src/lib/features/handlers/downtimeAction.ts` ispezionato
     (`DOWNTIME_CATEGORIES`, 10 voci, `registerFeatureHandler` in loop) —
     i 10 `functionName` nel codice combaciano 1:1 coi 10 nel DB (query
     diretta su `Feature`/`FeatureType` della campagna). Test dedicato
     eseguito dal vivo: `bun run test:run
src/lib/features/handlers/downtimeAction.test.ts` → 12/12 verdi,
     incluso il test su `listRegisteredFeatureHandlers()`.
  5. **PII residuo**: riconfermato come punto 1, nessun commit del branch
     tocca i 5 CSV vietati (`git log --oneline -- '*table_utenti*' ...` sulle
     5 pattern → nessun commit).
  6. **Suite completa**: `bun run type-check` → pulito (nessun output).
     `bun run lint` → pulito (nessun output). `bun run test:run` → **1312
     pass / 10 fail su 1322**, stesso identico elenco già documentato da
     dev/reviewer (`DataTypesManager.test.tsx` 6 fail +
     `ReferenceDataManager.test.tsx` 4 fail, mismatch accessible-name su
     icon-button `edit`/`delete`) — confermato **indipendentemente** non con
     `git stash` ma con `git log --oneline -- <file>` e `git diff
task/015-schema-metamodel-dati-campagna..HEAD -- <file>`: nessun commit
     di questo task tocca questi due file di test (ultimo tocco: T-036,
     precedente alla base di questo task), diff vuoto → i 10 fail non
     possono essere una regressione introdotta qui. Suite mirata ai nuovi
     moduli: `prisma/seed-nuova-frontiera/` → 6 file, 41/41 verdi;
     `referenceData.repository.test.ts` → 20/20 verdi;
     `referenceDataFlags.test.ts` → 4/4 verdi; `downtimeAction.test.ts` →
     12/12 verdi.
  7. **Controlli aggiuntivi non richiesti esplicitamente ma utili**:
     visibilità oggetti → tutte e 8 le split `DataType` hanno il 100% delle
     righe `visibility: hidden` (query `groupBy`, conteggi combacianti
     212/477/14/18/67/32/101/2); talenti → 156 `visible` + 82 `hidden` =
     238 (coerente con `status` CSV); `flags.category`/`flags.cost`
     popolati su campione ispezionato; eventi → tutte e 8 le righe hanno
     `publicationDate < closeDate` (nessun fallback necessario, coerente
     col Log dev) e `descriptionFull` senza tag HTML residui (regex
     `<[a-z][\s\S]*>` → nessun match su nessuna delle 8 righe); quota
     associativa 2026 presente per headmaster/master/supporter, assente per
     player1/player2 (coerente con lo scope "considera").
     **Verdetto**: ✅ tutti i criteri di accettazione verificati dal vivo con
     prova concreta (nessuno spuntato per fiducia nel Log). Nessun difetto
     trovato in questa sessione. Le condizioni QA sono soddisfatte — spetta
     all'owner portare il task a `done` (non lo faccio io). Dati live: campagna
     "Nuova Frontiera" (id 7, org `arcana-domine`) resta persistente con tutto
     il catalogo importato, 5 utenti reali e 10 Feature downtime attive — è il
     deliverable del task, non ripulito. Script di verifica ad hoc usati in
     questa sessione (`.qa-scratch/*.ts`, mai committati) rimossi a fine
     sessione, DB invariato rispetto all'esito atteso del seed idempotente
     (nessuna riga aggiuntiva creata dai 2 run QA).
- 2026-07-23 (owner): tutte e tre le condizioni di stop (`.task/README.md`
  §6) soddisfatte — tutti i criteri di accettazione `[x]`, `test:run` con
  soli 10 fallimenti pre-esistenti confermati indipendentemente da reviewer
  e qa, reviewer OK pulito su 2 round (bug OR-group corretto e verificato),
  qa verificato dal vivo su Neon dev (seed idempotente su 2 run reali,
  campagna "Nuova Frontiera" persistente con l'intero catalogo, PII mai
  referenziata). Status → `done`.
