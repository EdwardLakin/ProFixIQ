# Operational Observability File Map

## Database
- `supabase/migrations/20260802101500_operational_observability_p0_p4.sql`
- `supabase/migrations/20260802153000_operational_observability_hardening.sql`
- `supabase/migrations/20260802154500_operational_observability_punch_identity.sql`
- `supabase/migrations/20260802160000_operational_observability_health_projection_v2.sql`

## Server and API
- `features/operations/server/getOperationalObservability.ts`
- `features/operations/server/syncOperationalObservabilityAlerts.ts`
- `app/api/dashboard/operational-observability/route.ts`
- `app/api/internal/observability/health/route.ts`

## UI
- `features/operations/components/OperationalObservabilityWorkspace.tsx`
- `features/operations/components/OperationalHealthAlertStrip.tsx`
- `features/operations/components/WorkOrderOperationalTimelineDock.tsx`
- `app/dashboard/operations/observability/page.tsx`

## Tests and documentation
- `features/operations/server/getOperationalObservability.test.ts`
- `features/operations/server/syncOperationalObservabilityAlerts.test.ts`
- `tests/dashboard-operational-observability-route.test.ts`
- `tests/operational-observability-contract.test.ts`
- `tests/operational-observability-ui-alerts.test.ts`
- `docs/ops/operational-observability.md`
