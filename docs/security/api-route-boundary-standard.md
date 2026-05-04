# API Route Boundary Standard

This standard documents the current ProFixIQ expectations for route-level trust boundaries in Next.js route handlers.

## Core boundary model

- Staff/user-facing routes should use `requireShopScopedApiAccess` as the canonical gate for shop-scoped access.
- Mutating work-order, quote, invoice, staff, and admin routes must derive effective shop context from authenticated profile context (not only request payload input).
- Customer-facing routes may use route-handler auth and customer ownership checks instead of staff capability checks where appropriate.
- Public portal or token-driven routes must enforce explicit token/trust-boundary checks.
- Internal routes must enforce signed/internal trust boundaries (for example internal shared secret headers or equivalent controls).
- Webhook routes must verify trusted signatures before processing payload side effects.
- Service-role clients should execute only after route-specific trust boundary validation has passed.

## Owner PIN scope decision

Owner PIN remains page-level lock behavior for Owner Settings and is intentionally not expanded into API-route boundary enforcement by this standard.

## Operational guidance

- Treat static inventory reports as triage aids, not security proofs.
- Prefer route-local explicit boundary checks over implicit assumptions.
- Keep `shop_id` tenant boundaries explicit in route validation and query scope.
