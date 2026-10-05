---
name: task-cleanup
description: >
  Rimuove il git worktree e cancella il branch di un task di Arcana Domine
  completato e mergiato. Usala quando un file .task/NNN-*.md è a `status: done`
  e il suo branch `task/*` è già stato mergiato nel branch di integrazione —
  tipicamente come ultimo passo dell'owner subito dopo il merge. È esplicita e
  deterministica: la invochi tu quando serve, non scatta da sola. Non tocca
  branch non mergiati, né il branch in checkout, né main/integration.
---

# task-cleanup — pulizia di worktree e branch a task done+merged

Quando un task è **completato e mergiato**, il suo worktree (`../core-task-NNN`) e
il suo branch (`task/NNN-slug`) non servono più. Questa skill li rimuove in modo
sicuro. È un'azione **esplicita**: eseguila come passo finale, non è un automatismo.

## Quando usarla

- Sei l'**owner** e hai appena mergiato un task in `integration/...` e portato il
  file `.task/NNN-*.md` a `status: done` → pulisci quel task.
- In generale, dopo che un branch `task/NNN-*` è confluito nel branch corrente.

## Come

Passa l'**id del task** (o il nome del branch) allo script bundle:

```bash
bash .claude/skills/task-cleanup/cleanup.sh 003
# oppure: bash .claude/skills/task-cleanup/cleanup.sh task/003-guardia-ruolo-progetto
```

Senza argomenti, riconcilia **tutti** i task `done` già mergiati (comodo per una
pulizia in blocco, comunque sicuro):

```bash
bash .claude/skills/task-cleanup/cleanup.sh
```

Lo script stampa cosa fa (worktree rimosso / branch cancellato) e, se un branch
**non è ancora mergiato**, si ferma senza toccare nulla e te lo dice.

## Garanzie di sicurezza

- Agisce **solo** su branch `task/*`, **solo** se `git merge-base --is-ancestor`
  conferma che sono già nel branch corrente.
- **Mai** il branch attualmente in checkout (niente auto-distruzione).
- **Mai** `main` / `integration` / altri branch.
- **Non** cancella il file `.task/NNN-*.md`: la storia del task resta.
