#!/usr/bin/env bash
# Agent PR Checks validation, run concurrently where it is safe to do so.
#
#   stage 1 (parallel): typecheck, lint of changed files, full test suite
#   stage 2: production build, started as soon as typecheck passes (the build
#            rewrites .next/types, which tsconfig includes, so typecheck must
#            never overlap it) and overlapping the still-running tests
#
# Every task keeps its original command and its failure still fails the job.
# A typecheck failure stops the remaining work immediately, as it did when the
# steps ran one after another. Output is grouped per task in the Actions log.
#
# Environment:
#   CHANGED_FILES_LIST  optional file with one changed JS/TS path per line
#   PR_VALIDATION_LOGS  log directory (default: $RUNNER_TEMP/pr-validation)
set -uo pipefail
# Job control gives each background task its own process group, so a task and
# everything it spawned can be stopped together.
set -m

logs="${PR_VALIDATION_LOGS:-${RUNNER_TEMP:-/tmp}/pr-validation}"
mkdir -p "$logs"
: > "$logs/status"

now() { date +%s; }

# start NAME COMMAND... : run in the background, logging to $logs/NAME.log.
start() {
  local name="$1"; shift
  (
    started=$(now)
    "$@" > "$logs/$name.log" 2>&1
    rc=$?
    echo "$name $rc $(( $(now) - started ))" >> "$logs/status"
    exit "$rc"
  ) &
  pids[$name]=$!
}

lint_changed() {
  local list="${CHANGED_FILES_LIST:-}"
  if [[ -z "$list" || ! -s "$list" ]]; then
    echo "No changed JavaScript or TypeScript files."
    return 0
  fi
  mapfile -t files < "$list"
  pnpm exec eslint "${files[@]}"
}

declare -A pids
overall=0
began=$(now)

show() {
  local name="$1" rc elapsed
  read -r _ rc elapsed < <(grep "^$name " "$logs/status" || echo "$name 1 0")
  echo "::group::$name (exit $rc, ${elapsed}s)"
  cat "$logs/$name.log"
  echo "::endgroup::"
  [[ "$rc" == "0" ]] || overall=1
}

start typecheck pnpm typecheck
start lint lint_changed
start test pnpm test

wait "${pids[typecheck]}"; tc=$?
if (( tc != 0 )); then
  kill -- "-${pids[lint]}" "-${pids[test]}" 2>/dev/null
  wait 2>/dev/null
  show typecheck
  echo "Type-check failed; stopped remaining validation."
  exit 1
fi

start build pnpm build

wait "${pids[lint]}"; wait "${pids[test]}"; wait "${pids[build]}"

for name in typecheck lint test build; do show "$name"; done

echo "Validation wall time: $(( $(now) - began ))s"
while read -r name rc elapsed; do echo "  $name: ${elapsed}s (exit $rc)"; done < "$logs/status"
exit "$overall"
