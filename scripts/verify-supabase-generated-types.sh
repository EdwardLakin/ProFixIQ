#!/usr/bin/env bash
set -euo pipefail

mode="${1:---check}"
contract_file="features/shared/types/types/supabase.ts"
generated_file="${SUPABASE_GENERATED_TYPES_FILE:-}"
diff_file="${SUPABASE_TYPES_DIFF_FILE:-}"
remove_generated=false

case "$mode" in
  --check|--write) ;;
  *)
    echo "Usage: $0 [--check|--write]" >&2
    exit 2
    ;;
esac

if [[ -z "$generated_file" ]]; then
  generated_file="$(mktemp)"
  remove_generated=true
fi

cleanup() {
  if [[ "$remove_generated" == "true" ]]; then
    rm -f "$generated_file"
  fi
}
trap cleanup EXIT

supabase gen types typescript --local --schema public > "$generated_file"

if [[ "$mode" == "--write" ]]; then
  if cmp -s "$contract_file" "$generated_file"; then
    echo "Supabase generated types are already current."
  else
    cp "$generated_file" "$contract_file"
    echo "Updated $contract_file from the clean local schema."
  fi
  exit 0
fi

if [[ -n "$diff_file" ]]; then
  if diff -u "$contract_file" "$generated_file" > "$diff_file"; then
    echo "Supabase generated types match the migration contract."
    exit 0
  fi
  cat "$diff_file"
else
  if diff_output="$(diff -u "$contract_file" "$generated_file")"; then
    echo "Supabase generated types match the migration contract."
    exit 0
  fi
  printf '%s\n' "$diff_output"
fi

repair_command="pnpm db:schema:refresh"
echo "::error file=$contract_file::Generated Supabase types are stale. Run '$repair_command', review the diff, commit the contract, then run 'pnpm db:schema:check'."

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat >> "$GITHUB_STEP_SUMMARY" <<EOF
## Supabase schema contract is stale

The migrations applied successfully, but the committed TypeScript schema does not match them.

1. Run \`$repair_command\`.
2. Review and commit \`$contract_file\`.
3. Run \`pnpm db:schema:check\` before pushing.
EOF
fi

exit 1
