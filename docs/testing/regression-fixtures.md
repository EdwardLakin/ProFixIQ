# Regression fixtures

`supabase/seed.sql` creates the canonical local regression dataset whenever the
local Supabase database is reset. The fixture is deliberately separate from the
demo-shop seeder and does not modify production or the live reproduction work
order `WO-000014`.

## Recreate and verify

```bash
pnpm fixtures:regression:recreate
pnpm fixtures:regression:check
```

The reset is destructive only to the local Supabase database. The seed uses
fixed UUIDs, fixed timestamps, exact emails, and exact tenant relationships, so
running it repeatedly recreates the same selectors. Never run this seed with a
linked database or `--include-seed`. Future tests should import
`REGRESSION_FIXTURE` from `tests/fixtures/regression/manifest.ts`; do not query
the first row, infer the current user, or use an unscoped `.single()` lookup.

## Test identities

All fixture users use the local-only password `ProFixIQ-Regression-Only!` and
the reserved, non-deliverable domain `regression.profixiq.invalid`. The fixture
includes Pro and Starter owners plus manager, advisor, technician, lead tech,
parts, customer, Fleet manager, dispatcher, driver, Field-enabled operator, and
Field-disabled operator personas.

## Side-effect boundary

The SQL seed disables trigger execution for the fixture writes and restores it
before returning. Both shops also disable automatic quote/completion email.
The seed does not create supplier quote requests, payments, Stripe identifiers,
email jobs, or SMS jobs. Local SMTP remains the only configured mail receiver
for local development.
