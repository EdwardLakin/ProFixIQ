# Regression fixtures

`supabase/fixtures/regression.sql` creates the canonical local regression
dataset when it is explicitly selected by the recreate command. It is outside
the configured `supabase/seed.sql` path, deliberately separate from the
demo-shop seeder, and is not included by the configured linked seed path. It
does not modify production or the live reproduction work order `WO-000014`.

## Recreate and verify

```bash
pnpm fixtures:regression:recreate
pnpm fixtures:regression:check
```

The package command hard-codes `db reset --local` and overrides the seed path
with `./fixtures/regression.sql`; the reset is destructive only to the local
Supabase database. The fixture uses fixed UUIDs, timestamps, emails, and tenant
relationships, so running it repeatedly recreates the same selectors. Future
tests should import
`REGRESSION_FIXTURE` from `tests/fixtures/regression/manifest.ts`; do not query
the first row, infer the current user, or use an unscoped `.single()` lookup.

## Test identities

All fixture users use the local-only password `ProFixIQ-Regression-Only!` and
the reserved, non-deliverable domain `regression.profixiq.invalid`. The fixture
includes Pro and Starter owners plus manager, advisor, technician, lead tech,
parts, customer, Fleet manager, dispatcher, driver, Field-enabled operator, and
Field-disabled operator personas.

## Side-effect boundary

The SQL fixture disables trigger execution for its writes and restores it
before returning. It then recreates the default shop capacity and technician
scheduling resources owned by the suppressed synchronization triggers. Both
shops also disable automatic quote/completion email. The fixture does not
create supplier quote requests, payments, Stripe identifiers, email jobs, or
SMS jobs. Local SMTP remains the only configured mail receiver for local
development.
