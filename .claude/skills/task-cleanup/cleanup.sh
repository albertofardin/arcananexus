#!/usr/bin/env bash
# Rimuove il git worktree e cancella il branch di un task completato e MERGIATO.
#
# Uso:
#   cleanup.sh <NNN|task/NNN-slug>   pulisce quel singolo task (output informativo)
#   cleanup.sh                        riconcilia TUTTI i .task/ done già mergiati
#                                     (silenzioso sui branch già puliti)
#
# Sicurezza (invariati, sempre applicati):
#   - tocca SOLO branch `task/*`;
#   - SOLO se già mergiati nel branch corrente (`git merge-base --is-ancestor`);
#   - MAI il branch attualmente in checkout; MAI main/integration.
# Non cancella il file .task/NNN-*.md (è la storia del task).
# Compatibile bash 3.2 (macOS).

repo="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$repo" ] || { echo "task-cleanup: non sono in una repo git" >&2; exit 1; }
cd "$repo" || exit 1
current="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)"

resolve_branch() {  # id NNN → branch dal frontmatter; altrimenti passa attraverso
  case "$1" in
    task/*) printf '%s\n' "$1" ;;
    [0-9][0-9][0-9])
      f="$(ls "$repo"/.task/"$1"-*.md 2>/dev/null | head -1)"
      [ -n "$f" ] && sed -n 's/^branch:[[:space:]]*//p' "$f" | head -1 | tr -d '[:space:]"' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# cleanup_one <branch> <verbose>
#   verbose=1 (invocazione mirata): stampa anche gli "skip" informativi.
#   verbose=0 (riconciliazione):     silenzioso sugli skip banali; parla solo se
#             agisce davvero o se trova un done non ancora mergiato (anomalia).
# Ritorna 0 solo se ha effettivamente rimosso/cancellato qualcosa.
cleanup_one() {
  br="$1"; verbose="${2:-1}"
  case "$br" in
    task/*) ;;
    *) [ "$verbose" = 1 ] && echo "task-cleanup: '$br' non è un branch task/* — salto." >&2; return 1 ;;
  esac
  if [ "$br" = "$current" ]; then
    [ "$verbose" = 1 ] && echo "task-cleanup: '$br' è il branch in checkout — salto." >&2; return 1
  fi
  if ! git show-ref --verify --quiet "refs/heads/$br"; then
    [ "$verbose" = 1 ] && echo "task-cleanup: branch '$br' inesistente (già pulito?)." >&2; return 1
  fi
  if ! git merge-base --is-ancestor "$br" HEAD 2>/dev/null; then
    echo "task-cleanup: '$br' NON è ancora mergiato in '$current' — non tocco nulla." >&2
    return 1
  fi
  wt="$(git worktree list --porcelain | awk -v b="refs/heads/$br" '
    $1=="worktree"{p=$2} $1=="branch" && $2==b {print p}')"
  [ -n "$wt" ] && git worktree remove --force "$wt" 2>/dev/null && echo "task-cleanup: rimosso worktree  $wt" >&2
  git branch -D "$br" >/dev/null 2>&1 && echo "task-cleanup: cancellato branch $br" >&2
  return 0
}

if [ "$#" -ge 1 ]; then
  br="$(resolve_branch "$1")"
  [ -n "$br" ] || { echo "task-cleanup: non riesco a risolvere un branch da '$1'." >&2; exit 1; }
  cleanup_one "$br" 1
else
  did=0
  for f in "$repo"/.task/[0-9][0-9][0-9]-*.md; do
    [ -e "$f" ] || continue
    [ "$(sed -n 's/^status:[[:space:]]*//p' "$f" | head -1 | tr -d '[:space:]')" = "done" ] || continue
    br="$(sed -n 's/^branch:[[:space:]]*//p' "$f" | head -1 | tr -d '[:space:]"')"
    cleanup_one "$br" 0 && did=$((did + 1))
  done
  [ "$did" -eq 0 ] && echo "task-cleanup: niente da pulire (nessun task done con worktree/branch residui)." >&2
fi
exit 0
