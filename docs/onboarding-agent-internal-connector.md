# Onboarding Agent Internal Connector (ProFixIQ)

Route namespace: `/api/internal/onboarding-agent/*`

## Required env
- `ONBOARDING_AGENT_INTERNAL_SECRET` (shared with onboarding agent `PROFIXIQ_INTERNAL_SECRET`)

## Signature scheme
Required headers on every request:
- `x-onboarding-agent-signature`
- `x-onboarding-agent-timestamp` (epoch milliseconds)
- `x-shop-id`

Signature payload: `${timestamp}.${shopId}.${rawBody}` using HMAC SHA-256 hex digest.

## Route map
- `POST /api/internal/onboarding-agent/validate-shop`
- `POST /api/internal/onboarding-agent/customers/upsert`
- `POST /api/internal/onboarding-agent/vehicles/upsert`
- `POST /api/internal/onboarding-agent/customer-vehicle-links/upsert`
- `POST /api/internal/onboarding-agent/vendors/upsert` (skipped)
- `POST /api/internal/onboarding-agent/parts/upsert` (skipped)
- `POST /api/internal/onboarding-agent/history/upsert` (skipped)
- `POST /api/internal/onboarding-agent/invoice-history/upsert` (skipped)
- `POST /api/internal/onboarding-agent/review-items/create` (skipped)
- `POST /api/internal/onboarding-agent/final-summary` (skipped)

## Idempotency strategy
- Customer/vehicle upserts key by `shop_id + payload.externalId` (fallback to `idempotencyKey`).
- Customer-vehicle link updates canonical `vehicles.customer_id` idempotently.

## Agent config notes
Set in onboarding agent repo later:
- `PROFIXIQ_CONNECTOR_MODE=http`
- `PROFIXIQ_BASE_URL=<profixiq deployment URL>`
- `PROFIXIQ_INTERNAL_SECRET=<same as ONBOARDING_AGENT_INTERNAL_SECRET>`

Agent still defaults to null/dry-run until HTTP connector wiring is completed in onboarding-agent service.
