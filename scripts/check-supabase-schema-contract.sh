#!/usr/bin/env bash
set -euo pipefail

mode="${1:---check}"
case "$mode" in
  --check|--write) ;;
  *)
    echo "Usage: $0 [--check|--write]" >&2
    exit 2
    ;;
esac

started_here=false
if ! supabase status >/dev/null 2>&1; then
  echo "Starting the local Supabase database..."
  supabase db start
  started_here=true
fi

cleanup() {
  if [[ "$started_here" == "true" ]]; then
    supabase stop --no-backup >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Replaying all local migrations..."
supabase db reset --local --no-seed

bash scripts/verify-supabase-generated-types.sh "$mode"
