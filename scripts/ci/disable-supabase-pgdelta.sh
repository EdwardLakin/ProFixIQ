#!/usr/bin/env bash
# CI-only: turn off the Supabase CLI's pg-delta engine in the runner's checkout.
#
# With `[experimental.pgdelta] enabled = true` the CLI exports a pg-delta schema
# catalog after every `db start` and `db reset` (a Deno container that installs
# npm packages and introspects the database). That cache only speeds up
# `db diff` / `db pull`, which CI never runs, yet it cost ~12 minutes per call.
# Migrations are still applied one by one, so replay coverage is unchanged.
#
# The committed supabase/config.toml is not modified in the repository; this
# edits the ephemeral runner copy only. The script fails loudly if the setting
# can no longer be found so a config change cannot silently reintroduce the cost.
set -euo pipefail

config="${1:-supabase/config.toml}"

if [[ ! -f "$config" ]]; then
  echo "No $config; nothing to adjust." >&2
  exit 0
fi

if ! grep -q '^\[experimental\.pgdelta\]' "$config"; then
  echo "pg-delta is not configured in $config; nothing to disable."
  exit 0
fi

sed -i '/^\[experimental\.pgdelta\]/,/^\[/ s/^enabled[[:space:]]*=[[:space:]]*true/enabled = false/' "$config"

if sed -n '/^\[experimental\.pgdelta\]/,/^\[/p' "$config" | grep -Eq '^enabled[[:space:]]*=[[:space:]]*true'; then
  echo "Failed to disable pg-delta in $config." >&2
  exit 1
fi

echo "pg-delta disabled in the CI workspace copy of $config."
