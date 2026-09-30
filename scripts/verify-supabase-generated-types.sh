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

generation_error_file="$(mktemp)"

generate_types() {
  : > "$generation_error_file"
  if supabase gen types typescript --local --schema public > "$generated_file" 2>"$generation_error_file"; then
    return 0
  else
    local status=$?
    local image
    local mirror_image

    # The Supabase CLI currently hardcodes ECR for postgres-meta on this path.
    # Shared GitHub runner egress can exhaust ECR's public pull quota, so retry
    # with Supabase's same-version GHCR mirror, aliased to the name the CLI uses.
    if grep -Eqi 'toomanyrequests|rate exceeded|data limit exceeded' "$generation_error_file"; then
      image="$(sed -nE "s/.*Unable to find image '([^']+)'.*/\\1/p" "$generation_error_file" | tail -n 1)"
      if [[ "$image" =~ ^public\.ecr\.aws/supabase/postgres-meta:([^[:space:]]+)$ ]]; then
        mirror_image="ghcr.io/supabase/postgres-meta:${BASH_REMATCH[1]}"
        echo "ECR pull limit reached; retrying generated types with ${mirror_image}." >&2
        docker pull "$mirror_image"
        docker tag "$mirror_image" "$image"
        supabase gen types typescript --local --schema public > "$generated_file"
        return 0
      fi
    fi

    cat "$generation_error_file" >&2
    return "$status"
  fi
}

cleanup() {
  if [[ "$remove_generated" == "true" ]]; then
    rm -f "$generated_file"
  fi
  rm -f "$generation_error_file"
}
trap cleanup EXIT

generate_types

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
