# Supabase recovery and schema contract

`supabase/migrations/` is the only ordered, deployable database history for
ProFixIQ. Files under `db/sql/` are historical reference material, audits, or
schema snapshots. They must not be run as an alternative migration stream.

The committed TypeScript contract at
`features/shared/types/types/supabase.ts` is generated from a clean local
replay, not directly from the linked production project. This keeps migrations,
disaster recovery, CI, and application types on the same source of truth.

## Create a migration

From the repository root:

```bash
supabase migration new descriptive_change_name
```

Never edit, reorder, or replace an existing migration. Promote required SQL
from `db/sql/` through a new forward migration after reviewing its data effects,
RLS policies, grants, function search paths, and replay behavior.

## Clean replay and type verification

```bash
supabase start
supabase db reset --local --no-seed
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -X -v ON_ERROR_STOP=1 \
  -f tests/security/p0-008-schema-reconciliation.runtime.sql
supabase gen types typescript --local --schema public \
  > generated-supabase-types.ts
diff -u features/shared/types/types/supabase.ts generated-supabase-types.ts
```

Run the existing P0 runtime SQL tests on the same clean database. The
`Supabase Clean Replay Validation` workflow performs the complete sequence and
uploads replay logs plus `generated-supabase-types.ts` when a check fails.

To intentionally refresh the committed contract, first complete a clean replay,
then run:

```bash
pnpm typegen
git diff -- features/shared/types/types/supabase.ts
```

Review the generated diff with the migration that caused it. A linked-project
type export is diagnostic only and writes to a separate file:

```bash
pnpm typegen:linked
```

Do not replace the canonical type file with linked-project output. Differences
may represent untracked production drift rather than deployable schema.

## Recovery paths

The guarded `20260705000000` baseline has two supported modes:

- Empty database: restore the baseline snapshot, then apply every later
  migration in order.
- Existing complete database: record the baseline marker without replaying the
  snapshot, then apply later forward migrations.

A partial database must fail rather than guess which baseline objects are safe
to recreate. Restore from a verified backup or a clean environment and replay
the canonical chain.

P0-008 adds forward-only recovery layers for runtime-referenced schema:

1. relation and enum shapes;
2. enum evolution for types already present in the baseline;
3. constraints and indexes;
4. functions, security-invoker views, triggers, and atomic portal booking;
5. RLS policies and explicit grants.

These migrations contain no production data backfill. Applying them to a live
project, running a production reset, or repairing migration history still
requires explicit approval and a reviewed backup/rollback plan.

## Release evidence

Before beta, retain evidence that all of the following passed on one commit:

- empty local replay;
- P0 direct-RPC and RLS runtime tests;
- generated type diff;
- `pnpm typecheck`, `pnpm lint`, and tests;
- production build;
- read-only comparison of linked migration history and schema;
- a reviewed production migration plan and backup verification.
