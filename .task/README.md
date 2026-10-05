# `.task/` — State object del sistema ad agenti

Questa cartella è la **fonte di verità dello stato di lavorazione** (lo _state
object_ esterno del sistema ad agenti). Vive **fuori dai messaggi degli LLM**: gli
agenti muoiono, i file `.task/` restano. Ogni agente al bordo di un turno legge da
qui e scrive qui — non si tramanda contesto in prosa da una chiamata all'altra.

> Trello è **sola lettura** (vedi `owner`). Lo stato che gli agenti possono
> modificare vive **solo** qui.

---

## 1. Un file per task

Un file Markdown per task, nominato **`NNN-slug.md`** (`NNN` = progressivo a 3
cifre, `slug` = kebab-case). Lo stesso identificatore `NNN-slug` è anche il **nome
del branch** (`task/NNN-slug`): file, branch e task condividono l'id.

## 2. Frontmatter (schema esatto)

```yaml
---
id: "001" # stringa a 3 cifre, = prefisso del filename
title: "Titolo breve" # una riga
status: todo # vedi §3
priority: P0 # P0 (bloccante) → P3 (nice-to-have)
assignee: dev # owner | dev | reviewer | qa | "" (nessuno)
branch: task/001-slug # branch dedicato; "" finché non aperto
base: main # base branch da cui parte il task (default main)
trello: "" # URL card Trello di origine, se esiste
created: 2026-07-07 # data ISO
updated: 2026-07-07 # data ISO dell'ultima modifica
---
```

Valori ammessi:

- **`status`** (ciclo di vita, §3): `backlog` · `todo` · `in-progress` ·
  `in-review` · `done` · `blocked`.
- **`priority`**: `P0` · `P1` · `P2` · `P3`.
- **`assignee`**: `owner` · `dev` · `reviewer` · `qa` · `""`.

## 3. Ciclo di vita di `status`

```
backlog ──▶ todo ──▶ in-progress ──▶ in-review ──▶ done
                         ▲                │
                         └────────────────┘   (findings da correggere)
                         │
                      blocked   (contesto mancante / dipendenza esterna / decisione umana)
```

- `backlog` → idea registrata, non ancora pronta.
- `todo` → pronta, con criteri di accettazione definiti, in attesa di un `dev`.
- `in-progress` → un agente ci sta lavorando (l'`assignee` dice chi).
- `in-review` → implementazione finita, in attesa di reviewer/qa.
- `done` → vedi §6 (condizione di stop verificabile).
- `blocked` → fermo per una causa esterna; il Log spiega cosa sblocca.

## 4. Sezioni del corpo (obbligatorie, in quest'ordine)

```markdown
## Obiettivo

Una–tre frasi: cosa e perché.

## Scope

Incluso: … / Escluso: … (i confini del task)

## Criteri di accettazione

- [ ] Criterio verificabile 1
- [ ] Criterio verificabile 2
      Ogni criterio è OSSERVABILE (un comando che passa, un comportamento visto).
      Definiti dall'owner al planning, spuntati SOLO da chi li ha visti passare.

## Artifacts (extraction strutturata — NON prosa; vedi §5)

files_modified:

- path/al/file.ts
  interfaces:
- "nomeFunzione(args) -> ritorno"
  decisions:
- "scelto X perché Y"

## Note / Log (append-only, una riga per evento)

- AAAA-MM-GG (ruolo): cosa è successo, in una riga.
```

## 5. Regola sul contenuto: fatti in campi, non racconti

Il **riuso** dello stato passa da `## Artifacts` (campi: file toccati, interfacce,
decisioni), non dalla prosa del Log. Il Log resta append-only e **conciso**: una
riga per evento, non un tema. Se stai scrivendo un paragrafo nel Log, quasi sempre
il suo contenuto utile va estratto in `## Artifacts`.

## 6. Condizione di stop (verificabile, non a giudizio)

Un task passa a **`done` se e solo se** valgono _tutte e tre_:

1. tutti i criteri di accettazione sono `- [x]` (osservati passare);
2. `bun run test:run` è verde (o i fallimenti sono pre-esistenti e documentati nel
   Log, con la prova del confronto vs il base branch);
3. il `reviewer` ha dato un **verdetto OK** e — se previsto — il `qa` ha verificato.

Chi porta il task a `done`: l'**owner** (dopo il merge). Reviewer e qa **non**
mettono `done` da soli; segnalano che le loro condizioni sono soddisfatte.

## 7. Schema di handoff (delega via tool `Task`)

Quando l'owner delega, il brief passato all'agente ha **campi fissi**, non prosa
libera. È il contratto tra owner e worker:

```
task_file:      .task/NNN-slug.md      # da leggere e (per dev/qa) aggiornare
branch:         task/NNN-slug
base_branch:    main
scope_incluso:  …
scope_escluso:  …
criteri:        (rimando ai criteri nel file, o elenco)
file_rilevanti: [percorsi che l'agente deve guardare per primi]
```

## 8. Chi scrive cosa (permessi sullo stato)

| Agente       | Può scrivere in `.task/`                             | Note                                                                             |
| ------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| **owner**    | frontmatter, tutte le sezioni                        | possiede la board; crea i file, integra i verdetti                               |
| **dev**      | frontmatter + `## Artifacts` + `## Note / Log`       | non riscrive Obiettivo/Scope/Criteri decisi dall'owner                           |
| **reviewer** | **niente**                                           | è **read-only**: _ritorna_ il verdetto come messaggio finale, lo integra l'owner |
| **qa**       | frontmatter + checkbox dei criteri + `## Note / Log` | spunta un criterio solo dopo averlo visto passare                                |

## 9. Loop di correzione: tetto e non-progresso

- Il ciclo **dev ↔ reviewer** ha un tetto di **3 round**. Al 3° round senza esito
  pulito → `status: blocked` ed **escalation all'utente** (non un altro giro).
- **Non-progresso**: se dopo un retry i findings (o lo stato) non cambiano, non
  ritentare identico — cambia strategia o escala. Ritentare all'infinito un errore
  deterministico è la prima fonte di costo patologico.

## 10. Tassonomia dei fallimenti (come reagire)

- **Transitori** (timeout, rate limit) → retry con backoff, con tetto.
- **Deterministici** (file assente, input malformato, bug) → **non** ritentare
  identico: correggi, cambia approccio o escala.
- **Di giudizio** (plausibile ma sbagliato) → lo becca la review/qa → loop di
  correzione (§9).
- **Blocchi** (contesto mancante, task ambiguo, decisione o azione umana) →
  `status: blocked`, risali all'owner/utente. Vedi il caso reale in `001`.

## 11. Cleanup di worktree e branch (skill `task-cleanup`)

Quando un task è **`status: done`** e il suo branch `task/*` è già **mergiato**, il
worktree e il branch non servono più. Li rimuove la skill **`task-cleanup`**, che
l'owner esegue come **ultimo passo esplicito** dell'integrazione:

```bash
bash .claude/skills/task-cleanup/cleanup.sh <NNN>   # o senza argomenti: tutti i done+mergiati
```

È **deterministica ed esplicita** (non un automatismo che scatta da solo): pulisce
solo branch `task/*` già mergiati nel branch corrente, mai il branch in checkout,
mai `main`/`integration`; se un branch non è ancora mergiato si ferma senza toccare
nulla. Non cancella il file `.task/NNN-*.md` (la storia del task resta).

---

## 12. Dipendenze tra task: gating del `dev` su PR aperte

Se il task `B` dipende da un task `A` (vedi il grafo dipendenze, es. §13) e il
branch di `A` ha già una **PR aperta** ma non ancora mergiata in `main`, il
`dev` **non parte automaticamente** su `B`: aspetta che la PR di `A` sia
**mergiata in `main`** prima di iniziare l'implementazione.

Niente PR "a cascata" (stacked PR con base sul branch di `A`): ogni branch
task parte da `main`, quindi il lavoro su `B` non parte finché `A` non è
integrato. Se serve sbloccare `B` prima del merge di `A` (es. per non
bloccare tutta un'ondata), è una decisione esplicita dell'owner/utente da
annotare nel Log del task, non un default.

## 13. Fase 2 — ordine di attacco (metamodel dati campagna)

Grafo delle dipendenze tra i task 015-026 (`A → B` = B dipende da A). Base branch:
`main` (`integration/fase-2-backend` è stato mergiato in `main` e cancellato su
GitHub prima che questi task partissero — le PR di Fase 2 puntano direttamente a
`main`).

```
015 schema (foundation)
 ├─▶ 016 catalogo repo+API
 ├─▶ 025 ledger XP
 │     └─(016,025)─▶ 017 servizio assegnazione
 │                     ├─▶ 018 API creazione PG        (+025)
 │                     └─▶ 019 registry feature        (+025)
 ├─(016)─▶ 026 visibilità condizionale
 │           └─(016,026)─▶ 020 sidebar
 │                           └─▶ 021 documenti
 └─(018,016)─▶ 022 UI creazione PG

023 seed        ← 015,016,025,026 (esercita tutto il metamodel)
024 import      ← 016 (+025)   [backlog: attende formato dati legacy]
```

Ondate parallelizzabili (un dev per riga = massimo parallelismo):

| Ondata                                | Task                                                                                  | Priorità     | Sblocca  |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------ | -------- |
| **0** — foundation                    | **015** schema                                                                        | P0           | tutto    |
| **1** — dopo lo schema (in parallelo) | **016** catalogo · **025** ledger XP                                                  | P0 · P0      | 017, 026 |
| **2** — regole PG                     | **017** servizio assegnazione                                                         | P0           | 018, 019 |
| **3** — write+azioni (in parallelo)   | **018** API creazione PG · **019** registry feature · **026** visibilità condizionale | P0 · P1 · P1 | 020, 022 |
| **4** — read/frontend (in parallelo)  | **020** sidebar · **022** UI creazione PG                                             | P1 · P1      | 021      |
| **5** — contorno                      | **021** documenti · **023** seed · **024** import                                     | P1 · P2 · P2 | —        |

Note:

- **015 è l'unico vero collo di bottiglia**: finché la migrazione non è mergiata,
  nulla parte. Da fare per primo e da sbloccare in fretta.
- **025 (ledger XP) è P0** perché sta a monte di 017/018: alzato dal design che ha
  spostato gli XP su ledger separato. Non trattarlo come "contorno".
- **023 (seed)** conviene tenerlo per ultimo tra i P0/P1 dipendenti: esercita
  `kind`, cardinalità, requisiti, XP e visibilità condizionale tutti insieme → è di
  fatto lo smoke-test manuale del metamodel.

## 14. Fase 2 — completamento (task 028-034)

015-027 sono tutti `done` (024 resta `backlog`, bloccato sul formato dei dati
legacy). L'intera catena vive però ancora su
`task/015-schema-metamodel-dati-campagna` (PR #32, aperta verso `main`, non
mergiata — verificato: `origin/main` non ha ancora `DataTypeKind`/
`XpTransaction`/`FeatureType`): **tutti i task 028-034 stackano su quella
catena** (deroga esplicita §12, stesso pattern già usato da 017-022/026), da
riallineare a `main` quando #32 verrà mergiata.

Gap individuati (backend Fase 2 completo, ma senza UI di scrittura né
wiring end-to-end su tre fronti): nessuna UI ammnistrativa per configurare
`DataType`/`ReferenceData`/`Feature` (tutto scrivibile solo via API diretta o
seed), `settings/`/`admin/` duplicati, `demo-metamodello` separata da
`campaign1`, il loop azione→approvazione mai wired, la scheda PG cieca sul
nuovo metamodel.

```
028 unificazione area admin (settings/+admin/)
 ├─▶ 029 UI DataType + sidebar
 │     └─▶ 030 UI ReferenceData (flags/requisiti/documenti generici)
 ├─▶ 031 UI configurazione Feature
 └─▶ 033 esecuzione+approvazione azioni (coda master)

032 consolidare seed (demo-metamodello → campaign1)   ← indipendente
034 scheda PG: XP + dati assegnati                     ← indipendente (dipende solo da 017/025/026, tutti done)
```

Ondate parallelizzabili:

| Ondata                        | Task                                            | Priorità | Sblocca       |
| ----------------------------- | ----------------------------------------------- | -------- | ------------- |
| **0** — contenitore           | **028** unificazione area admin                 | P1       | 029, 031, 033 |
| **1** — scrittura metamodel   | **029** UI DataType/sidebar                     | P0       | 030           |
| **2** — catalogo              | **030** UI ReferenceData                        | P0       | —             |
| **1-2** (parallelo a 029/030) | **031** UI configurazione Feature               | P2       | —             |
| **1-2** (parallelo)           | **033** esecuzione/approvazione azioni          | P1       | —             |
| — (indipendenti, no gate)     | **032** consolidare seed · **034** scheda PG XP | P2 · P1  | —             |

Note:

- **029/030 sono P0**: senza questa UI il backend Fase 2 non è realmente
  utilizzabile da un head_master reale — è il gap più grave rispetto
  all'obiettivo della fase.
- **033 dipende concettualmente da almeno una `Feature` attiva** (via 031 o
  seed T-023/032) per essere testabile end-to-end, ma il suo codice (route +
  UI) non dipende tecnicamente da 031: può partire in parallelo.
- **032 e 034 non toccano l'area admin unificata**: nessun motivo per
  attendere 028, possono partire subito.
- **024 (import legacy) resta in `backlog`**, bloccato sul formato/accesso ai
  dati del sito legacy — dipendenza invariata da 016 (+025).
