# Best Practice per Sistemi Multi-Agente di Sviluppo

### Documento di riferimento per la revisione di un'architettura ad agenti

---

## Come usare questo documento

Questo documento definisce le best practice per un sistema multi-agente di sviluppo (setup **centralizzato**). È pensato per essere passato a Claude come griglia di revisione della tua architettura attuale.

**Istruzioni suggerite per la revisione:**

> Ho un sistema ad agenti la cui struttura ti descrivo/allego. Usa il documento allegato come riferimento. Per ogni sezione: (1) valuta se la mia struttura rispetta la best practice, (2) segnala le violazioni e gli anti-pattern presenti, (3) proponi una correzione concreta e prioritizzata. Concludi con una lista di interventi ordinati per impatto.

---

## Principio guida (leggere prima di tutto)

Un sistema ad agenti robusto è **un insieme di contratti ben definiti tra componenti singolarmente inaffidabili**. I modelli sono probabilistici e sbagliano; i contratti sono la struttura deterministica che rende quel comportamento abbastanza prevedibile da essere utile.

Ogni area di questo documento è un contratto:

| Area                      | Contratto su...                 |
| ------------------------- | ------------------------------- |
| 1. Architettura           | chi comanda                     |
| 2. Ruoli                  | chi fa cosa                     |
| 3. Memoria / State object | cosa passa tra i turni          |
| 4. Token / Budget         | quanto puoi spendere            |
| 5. Control flow / Handoff | come passa il lavoro tra agenti |
| 6. Tooling                | come l'agente tocca il mondo    |
| 7. Qualità                | cosa vuol dire "fatto"          |
| 8. Error handling         | cosa fare quando si rompe       |
| 9. Observability          | cosa il sistema rende visibile  |

**Tre facce dello stesso principio:** lo state object (3) è il contratto tra i turni, l'handoff tipizzato (5) è il contratto tra agenti, l'output del tool (6) è il contratto con il mondo.

---

## 1. Architettura e topologia

**Scelta di riferimento: centralizzato** (orchestrator a stella). È il default corretto; non serve altro finché non compaiono colli di bottiglia reali.

**Best practice:**

- [ ] Topologia centralizzata: un orchestrator coordina, i worker non comunicano tra loro direttamente.
- [ ] Passaggio a **centralizzato gerarchico leggero** (orchestrator → lead intermedio → worker) _solo_ se compaiono: (a) bloat di contesto dell'orchestrator, o (b) decomposizione troppo profonda per un solo livello.
- [ ] Peer-to-peer / mesh evitato salvo necessità dimostrata (raramente ne vale la pena).

**Criterio di evoluzione (non è la scala di per sé):**

- Bloat di contesto dell'orchestrator → segnale di gerarchia.
- Profondità di decomposizione eccessiva → segnale di gerarchia.

**Anti-pattern da segnalare:**

- Worker che comunicano tra loro con stato conversazionale condiviso.
- Passaggio a topologie complesse "per scalabilità" senza un collo di bottiglia reale.

> La vera decisione di design non è la topologia ma **cosa ritornano i worker all'orchestrator**: output grezzo → esplosione; output riassunto/strutturato → si resta centralizzati a lungo senza problemi.

---

## 2. Ruoli e responsabilità

**Principio:** ogni agente è una **funzione tipizzata** — un'identità, un obiettivo unico, input dichiarati, output in formato preciso, confini espliciti. Se non riesci a scriverne la "firma" in poche righe, il ruolo è mal definito.

**Due principi trasversali:**

- [ ] **Single responsibility:** un agente = un compito. Niente agenti "tuttofare".
- [ ] **Stato centralizzato, worker stateless:** lo stato vive nell'orchestrator/store esterno; i worker sono effimeri (ricevono contesto, producono output, muoiono).

**Ruoli (instanziare solo quelli giustificati da un collo di bottiglia reale):**

| Ruolo                      | Fa                                         | Riceve                                            | Ritorna                               | NON fa                                             |
| -------------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| **Orchestrator**           | intake, dispatch, aggregazione, stop       | obiettivo + state object                          | prossima decisione / risultato finale | non scrive codice, non tiene transcript dei worker |
| **Planner**                | scompone in task ordinati con dipendenze   | obiettivo                                         | task list strutturata                 | (fondibile nell'orchestrator in setup semplici)    |
| **Worker/Executor**        | scrive/esegue codice                       | _un_ task + contesto minimo                       | diff + summary + status               | non decide lo scope, non fa self-review            |
| **Reviewer/Critic**        | valuta l'output                            | specifica + diff (NON il ragionamento del worker) | pass/fail + problemi strutturati      | non riscrive il codice                             |
| **Tester**                 | genera test; esegue in modo deterministico | codice/specifica                                  | risultati strutturati troncati        | non fa girare log interi nel contesto              |
| **Researcher**             | recupera e sintetizza contesto esterno     | domanda                                           | estratto sintetizzato                 | non ributta dump grezzi nel contesto               |
| **Memory/Context manager** | decide cosa tenere/comprimere/scartare     | state object                                      | contesto renderizzato                 | spesso è funzione deterministica, non un agente    |

**Setup minimo funzionante:** Orchestrator (con planning fuso) + Worker + Reviewer.
Aggiungere: Tester separato (quando la validazione entra nel loop), Researcher (quando i worker sprecano token a cercare), Planner separato (quando vuoi differenziare i modelli).

**Scheletro di system prompt per un sotto-agente:**

- [ ] Identità (una riga)
- [ ] Obiettivo unico
- [ ] Input (cosa riceve e in che forma)
- [ ] Output (formato esatto / schema)
- [ ] **Confini negativi espliciti** (cosa NON fare: "non modificare altri file", "non aggiungere dipendenze", "non fare refactoring non richiesto")
- [ ] Condizione di stop

**Anti-pattern da segnalare:**

- Orchestrator che diventa anche coder → assorbe dettagli implementativi e perde capacità di coordinamento.
- Reviewer che vede il ragionamento del worker → bias di auto-revisione.
- Reviewer che riscrive il codice → due coder, nessun controllo qualità.
- Assenza di confini negativi nei prompt (causa il 90% dei comportamenti indesiderati).

---

## 3. Gestione contesto e memoria

**Principio:** non esiste "la memoria" al singolare. Esistono livelli con tempi di vita diversi. **Niente vive in contesto più a lungo del necessario.**

**I tre livelli:**

- [ ] **Working memory** — contesto della singola chiamata, effimero, minimo indispensabile.
- [ ] **Task/session memory** — stato del lavoro in corso (task list, summary), vive nell'orchestrator o in uno store esterno.
- [ ] **Long-term memory** — conoscenza persistente (convenzioni, decisioni), recuperata on-demand, non tenuta sempre in contesto.

**La mossa che cambia tutto — State object esterno:**

- [ ] Lo stato vive **fuori dai messaggi dell'LLM** (JSON / file / DB).
- [ ] A ogni chiamata si _renderizza_ nel prompt solo la fetta di stato rilevante.
- [ ] I worker ritornano **summary strutturati dentro lo state object**, non output grezzi.
- [ ] Risultato: la crescita del costo è controllata da te, non lineare-automatica.

Struttura di riferimento dello state object:

```
{
  "goal": "...",
  "tasks": [
    {"id": 1, "desc": "...", "status": "done", "summary": "implementato X, ritorna Y"},
    {"id": 2, "desc": "...", "status": "in_progress", "deps": [1]}
  ],
  "artifacts": {"files_modified": [...], "interfaces": {...}},
  "decisions": ["scelto async perché ..."]
}
```

**Strategie di compressione (dalla più economica alla più costosa):**

- [ ] Troncamento a finestra scorrevole (gratis, perde info vecchia).
- [ ] Summarization progressiva (una chiamata LLM economica, taglia il resto).
- [ ] Summarization gerarchica (summary di summary, per lavori lunghi).
- [ ] **Extraction strutturata** invece di summary in prosa (fatti in campi: file toccati, interfacce, decisioni — costa meno e si riusa meglio).

**Retrieval:**

- [ ] Memoria a lungo termine e file: recupero on-demand, non "tutto in contesto per sicurezza".
- [ ] Per il **codice**: ricerca strutturale (firme, dipendenze) invece di embeddings.
- [ ] Embeddings solo per documentazione in linguaggio naturale.

**Anti-pattern da segnalare:**

- **Orchestrator che accumula tutto:** appende output completi "per non perdere niente" → dopo N task è ingestibile e paradossalmente meno capace.
- Summarization per riflesso: comprimere ha un costo (una chiamata LLM); per task brevi il troncamento secco è più economico.
- Ri-caricare file già noti invece di usare l'interfaccia salvata nello state object.

---

## 4. Ottimizzazione token e costi

**Principio:** ogni token ha una causa. Il costo è una funzione di **quanto contesto tieni vivo e per quanto tempo**. Interventi ordinati per leva (dalla più alta).

**Leva 1 — Prompt caching** (miglior rapporto risparmio/sforzo):

- [ ] Parti stabili (istruzioni di sistema, ruoli, documentazione ricorrente, schemi) messe in cache.
- [ ] Prompt strutturati **dal più stabile al più variabile** (statico in alto, task specifico in fondo) per massimizzare la porzione cacheabile.
- [ ] Mai mescolare statico e dinamico (rompe la cache).

**Leva 2 — Model routing:**

- [ ] Modelli economici per: routing, classificazione, summarization, extraction, validazioni semplici.
- [ ] Modelli potenti per: pianificazione complessa, codice non banale, review critica.
- [ ] Abilitato dalla separazione dei ruoli (2): un tuttofare non permette routing.

**Leva 3 — Controllo dell'input:**

- [ ] Minimo contesto per worker (3 file rilevanti, non 20 — costa meno e rende meglio).
- [ ] Output dei tool troncati/paginati prima di rientrare.
- [ ] Non ri-caricare file già noti.
- [ ] Retrieval mirato, non contesto preventivo.

**Leva 4 — Controllo dell'output:**

- [ ] Output strutturati e concisi (JSON / formati compatti).
- [ ] `max_tokens` esplicito e sensato per ogni tipo di chiamata.
- [ ] Prompt interni che vietano verbosità di cortesia (gli agenti parlano con agenti, non con umani).

**Leva 5 — Fuori dall'LLM tutto il deterministico** (risparmio 100% sui task spostati):

- [ ] Eseguire test, calcolare diff, applicare patch, parsing, formattazione, ricerca strutturale, validazione schema → script, non LLM.

**Leva 6 — Budget e circuit breaker** (contro i costi patologici):

- [ ] Budget massimo di step per obiettivo.
- [ ] Budget di token/costo per task, con hard stop.
- [ ] Rilevamento di non-progresso (se lo stato non cambia dopo un retry, non ritentare uguale).
- [ ] Profondità massima di ricorsione nella decomposizione.

**Ordine di priorità pratica per chi parte:**

1. State object esterno + worker stateless
2. Prompt caching
3. Fuori dall'LLM il deterministico
4. Model routing
5. Controllo input/output
6. Budget e circuit breaker

> Nota: per soglie, durata e prezzi aggiornati del prompt caching e dei modelli, verificare sempre la documentazione ufficiale Anthropic — sono dettagli che cambiano.

---

## 5. Orchestrazione e control flow

**Principio:** un sistema ad agenti è **un loop che a ogni giro decide una cosa sola — cosa fare dopo — finché una condizione di stop non è vera.** La complessità è prendere bene quella decisione e garantire che il loop termini.

**Loop centrale dell'orchestrator:**

```
finché non (condizione di stop):
    1. leggi lo state object
    2. decidi il prossimo task (o che hai finito)
    3. seleziona agente + modello adatti      <- model routing (4)
    4. renderizza il contesto minimo           <- memoria (3)
    5. esegui l'agente
    6. integra il risultato nello state object  <- memoria (3)
    7. controlla i budget (step, token, tempo)  <- budget (4)
```

**Sequenziale vs. parallelo (dipende dalle dipendenze dichiarate):**

- [ ] Sequenziale quando i task dipendono l'uno dall'altro (default, deterministico, debuggabile).
- [ ] Parallelo quando i task sono indipendenti (riduce latenza, costo per task basso grazie ai contesti isolati).
- [ ] Il parallelismo pulito richiede worker **stateless** che comunicano via state object (altrimenti race condition).
- [ ] Pattern **fan-out / fan-in**: l'aggregazione (fan-in) lavora su summary strutturati, non output grezzi.

**Condizione di stop (esplicita e verificabile, non a giudizio del modello):**

- [ ] Stop per completamento: tutti i task `done` + validazione passa.
- [ ] Stop per budget: rete di sicurezza → produce **escalation**, non un silenzioso "finito".
- [ ] Stop per blocco: gestito come evento, non come fallimento del loop.
- [ ] Preferire condizioni deterministiche ("i test passano") a giudizi del modello ("sembra buono").

**Handoff tra agenti (il contratto che determina se il sistema regge):**

- [ ] Handoff **tipizzato**: A produce esattamente la struttura che B si aspetta.
- [ ] Schemi di handoff definiti **prima** dei prompt (lo schema è il contratto, il prompt l'implementazione).

**Cicli di revisione (worker ↔ reviewer):**

- [ ] Tetto esplicito di iterazioni (es. max 3 round → escalation).
- [ ] Feedback strutturato e azionabile (file/riga/fix), non "non mi convince".
- [ ] Rilevamento di non-progresso (se i problemi non si riducono, esci e cambia strategia).

**Determinismo dove puoi:**

- [ ] Transizioni che sono regole (`if test falliscono → worker`) restano `if`, non chiamate LLM.
- [ ] Decisioni LLM riservate ai bivi che richiedono giudizio reale.

**Anti-pattern da segnalare:**

- Condizione di stop lasciata al giudizio del modello.
- Handoff in prosa libera da re-interpretare.
- Loop di correzione senza tetto di iterazioni.

---

## 6. Tooling e integrazioni

**Principio:** ogni tool è sia una capacità sia una superficie di rischio. **Il valore di un tool non è cosa fa, ma cosa ritorna nel contesto.**

**Dotazione minima per lo sviluppo:**

- [ ] Filesystem con letture **mirate** (per range/simbolo), non solo dump completo.
- [ ] Esecuzione codice/shell (canale del lavoro deterministico) — in sandbox.
- [ ] Ricerca strutturale nel codice (grep, simboli, dipendenze).
- [ ] Retrieval/documentazione (qui gli embeddings hanno senso).
- [ ] Version control (diff, commit, branch — per checkpoint e rollback).

**Regola d'oro — output progettati per il contesto:**

- [ ] Ritorna il minimo utile, non il massimo disponibile.
- [ ] Tronca e paginale di default.
- [ ] Struttura l'output (dati, non testo grezzo da re-interpretare).
- [ ] Comprimi il rumore (un fallimento utile è "test X: atteso A, ottenuto B", non 2000 righe di log).

**Tool design:**

- [ ] Pochi tool ben progettati e componibili, non tanti granulari e sovrapposti.
- [ ] Ogni tool occupa spazio nel prompt e ogni scelta in più confonde il modello.
- [ ] Fondere tool quasi-uguali con un parametro.
- [ ] Descrizione di ogni tool scritta con cura (cosa fa, quando usarlo, cosa ritorna).

**Isolamento ed esecuzione sicura:**

- [ ] Sandbox (container/VM) per l'esecuzione di codice.
- [ ] Filesystem con confini (working directory delimitata, read-only su ciò che non va toccato).
- [ ] Permessi minimi per ruolo (il reviewer non scrive file; il researcher non ha shell).
- [ ] Approvazione umana sulle azioni irreversibili (commit su main, operazioni distruttive).

**Gestione errori dei tool (input previsto, non eccezione fatale):**

- [ ] Errore strutturato e leggibile dall'agente ("file non trovato: X"), non stack trace grezzo.
- [ ] Strategia dell'agente: ritenta con parametri corretti oppure dichiara il blocco.
- [ ] Budget sui retry dei tool.

**Nota MCP:** se costruisci su Claude, il Model Context Protocol offre tool riutilizzabili e componibili con interfaccia comune — coerente con "pochi tool ben fatti e componibili" a livello di ecosistema. Verificare la documentazione ufficiale aggiornata prima di adottarlo.

**Anti-pattern da segnalare:**

- Tool che ritorna sempre il file intero quando servivano 10 righe (spreco token n.1).
- Troppi tool simili → ambiguità nella selezione.
- Esecuzione shell/scrittura senza sandbox né confini.

---

## 7. Qualità e valutazione

**Principio:** in un sistema ad agenti valuti un **processo probabilistico** con output variabili, non testi codice deterministico.

**Due livelli da non confondere:**

- [ ] **Valutazione dell'output (in-loop):** il singolo risultato è buono? (review + test) → accetta o rifà adesso.
- [ ] **Valutazione del sistema (offline):** il sistema nel complesso è affidabile? Gira su task noti, misura successo/costo/latenza → decide se una modifica ha migliorato o peggiorato.
- [ ] Presenza di _entrambi_ (senza l'offline, ogni modifica è basata sulla sensazione).

**Gerarchia dei metodi (dal più affidabile):**

- [ ] **Verifiche deterministiche** — test passano? compila? schema valido? linter pulito? → **massimizzare queste**.
- [ ] **Ground truth su task noti** — set con risposta corretta per la valutazione offline.
- [ ] **LLM-as-judge** — solo dove la qualità non è esprimibile deterministicamente.

**LLM-as-judge — bias da neutralizzare:**

- [ ] Auto-preferenza → il judge non vede il ragionamento del worker, idealmente istanza diversa.
- [ ] Sensibilità al formato → giudica meglio ciò che è ben formattato.
- [ ] Inconsistenza → per decisioni importanti, più valutazioni o criteri più stretti.
- [ ] **Criteri specifici e verificabili**, non giudizio libero ("gestisce input vuoto? ha test sui path principali?" >> "è buono?").

**Criteri di accettazione:**

- [ ] Definiti al **planning**, non alla review ("questo task è fatto quando: X, Y, Z").

**Costo della qualità:**

- [ ] Rigore modulato sul rischio (auth/pagamenti → review multipla + test estesi; task banale → check deterministici).
- [ ] Legame con model routing (4): rischio alto → modello potente + review approfondita.

**Anti-pattern da segnalare:**

- Solo valutazione in-loop, nessuna valutazione offline.
- LLM-as-judge con giudizio libero anziché criteri concreti.
- Stesso rigore massimo applicato a tutto.

---

## 8. Error handling e recovery

**Principio:** il fallimento **è il caso comune**, non l'eccezione. Il design giusto non è "come evito gli errori" ma "come li rendo recuperabili".

**Tassonomia dei fallimenti (la reazione dipende dal tipo):**

- [ ] **Transitori** (timeout, rate limit) → retry con backoff.
- [ ] **Deterministici** (file assente, input malformato, bug) → NON ritentare identico; correggere/cambiare/escalare.
- [ ] **Di giudizio** (sbagliato ma plausibile) → li becca la valutazione (7) → loop di correzione.
- [ ] **Blocchi** (contesto mancante, task ambiguo) → risalire all'orchestrator/umano.

> Distinzione critica: **ritentare all'infinito un errore deterministico è la fonte n.1 di costi patologici.**

**Strategie di recovery (scala di escalation — dal gradino più economico):**

- [ ] Retry con backoff (solo transitori, con tetto).
- [ ] Retry con correzione (passa l'errore precedente come contesto, non ripetere a freddo).
- [ ] Fallback (modello diverso, approccio più semplice, tool alternativo).
- [ ] Ripianificazione (risali al planner — il vero potere degli agenti: ripensare il piano, non solo ritentare).
- [ ] Escalation umana (ultimo gradino; definire _quando_ è una decisione di design).

**Checkpoint e ripartenze pulite (secondo dividendo dello state object):**

- [ ] Checkpoint dello stato a ogni step completato (crollo al task 8 → riparti dal task 8, non da zero).
- [ ] Idempotenza dove possibile (un task ripetuto non fa danni doppi).
- [ ] Isolamento del fallimento (worker stateless: uno che fallisce non contamina gli altri).

**Degrado controllato:**

- [ ] Fallimento parziale non azzera il lavoro parziale (4 worker su 5 riusciti → prosegui, marca il 5° per retry).
- [ ] Fan-in progettato per tollerare risultati mancanti.

**Anti-pattern da segnalare:**

- Retry identico su errori deterministici.
- Nessun checkpoint → un crollo butta l'intera sessione.
- Worker con stato condiviso → un fallimento contamina il resto.

---

## 9. Observability

**Principio:** non puoi migliorare, debuggare o controllare i costi di ciò che non vedi — e questi sistemi sono opachi per natura.

**Le tre cose da tracciare:**

- [ ] **Tracce di esecuzione** — quale agente, quale input, quale modello, cosa ha ritornato, quale decisione. Ricostruibile per intero, anche in flussi paralleli.
- [ ] **Costi e consumo** — token in/out **per agente, per task, per modello** (la disaggregazione dice _dove_ spendi).
- [ ] **Metriche di qualità/performance** — tasso di successo, round di review, frequenza blocchi, latenza per step.

**Tracce strutturate, non print:**

- [ ] Ogni evento è un record con campi (timestamp, agente, task_id, modello, token, esito) → filtrabile e aggregabile.
- [ ] **trace_id / correlation_id** propagato lungo tutta la catena di un obiettivo (indispensabile con agenti paralleli).

**Debug di flussi paralleli e non-deterministici:**

- [ ] Raggruppare per correlation_id, non per ordine temporale.
- [ ] Loggare abbastanza da poter **replay-are** una traccia (input esatto, modello, parametri).

**Loop di miglioramento (non solo debug):**

- [ ] Le tracce reali alimentano il ground truth set della valutazione offline (7).
- [ ] I pattern di fallimento indicano dove il sistema è fragile.
- [ ] I dati di costo indicano dove ritarare il model routing (4).

**Alert sui costi patologici:**

- [ ] Alert su "sessione > N token" / "task > N round" → intervieni prima che una sessione impazzita costi quanto mille normali.
- [ ] Il budget (4) è il freno; l'observability è il cruscotto.

**Anti-pattern da segnalare:**

- `print` sparsi invece di tracce strutturate.
- Costo tracciato solo in totale, senza disaggregazione.
- Observability guardata solo quando qualcosa si rompe.

---

## Checklist di revisione sintetica

Da compilare per la struttura attuale:

| #   | Area                                       | Rispettata? | Anti-pattern trovati | Intervento proposto | Priorità |
| --- | ------------------------------------------ | ----------- | -------------------- | ------------------- | -------- |
| 1   | Architettura centralizzata                 |             |                      |                     |          |
| 2   | Ruoli tipizzati + worker stateless         |             |                      |                     |          |
| 3   | State object esterno + memoria a livelli   |             |                      |                     |          |
| 4   | Caching, routing, budget                   |             |                      |                     |          |
| 5   | Loop, stop verificabile, handoff tipizzati |             |                      |                     |          |
| 6   | Tool con output progettati + sandbox       |             |                      |                     |          |
| 7   | Valutazione in-loop + offline              |             |                      |                     |          |
| 8   | Recovery per tipo di errore + checkpoint   |             |                      |                     |          |
| 9   | Tracce strutturate + costi disaggregati    |             |                      |                     |          |

**Ordine di priorità degli interventi (se si parte da zero):**

1. State object esterno + worker stateless (risolve la crescita strutturale del costo)
2. Prompt caching (grosso risparmio, poco sforzo)
3. Fuori dall'LLM tutto il deterministico
4. Model routing
5. Handoff tipizzati + condizioni di stop verificabili
6. Budget, circuit breaker e alert
7. Checkpoint e recovery
8. Observability strutturata
9. Valutazione offline con ground truth

---

_Sintesi finale: un sistema ad agenti robusto è un insieme di contratti ben definiti tra componenti singolarmente inaffidabili. Ogni best practice qui è un contratto che rende il comportamento probabilistico abbastanza prevedibile da essere utile._
