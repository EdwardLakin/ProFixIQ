# ProFixIQ Agent Task for issue #160

**Title:** ProFixIQ feature: Parts still arent being passed from menuquick add to work order lines.

**Description (raw):**

Parts still arent being passed from menuquick add to work order lines.

---
**Normalized payload:**
```json
{
  "id": "42bcd0ed-f245-4b96-9768-82f955a60e37",
  "kind": "feature",
  "hints": [
    {
      "path": "supabase/migrations",
      "docId": "schema-core",
      "score": 3,
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes."
    },
    {
      "path": "supabase/types",
      "docId": "schema-core",
      "score": 3,
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes."
    },
    {
      "path": "features/work-orders",
      "docId": "work-orders-core",
      "score": 2,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "app/work-orders",
      "docId": "work-orders-core",
      "score": 2,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "docId": "work-orders-core",
      "score": 2,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "docId": "work-orders-core",
      "score": 2,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "features/parts",
      "docId": "parts-suppliers",
      "score": 2,
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability."
    },
    {
      "path": "features/integrations/parts",
      "docId": "parts-suppliers",
      "score": 2,
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability."
    },
    {
      "path": "app/parts",
      "docId": "parts-suppliers",
      "score": 2,
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability."
    },
    {
      "path": "app/api",
      "docId": "api-internal",
      "score": 2,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/ai/api",
      "docId": "api-internal",
      "score": 2,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/inspections/api",
      "docId": "api-internal",
      "score": 2,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/work-orders/api",
      "docId": "api-internal",
      "score": 2,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/auth/api",
      "docId": "api-internal",
      "score": 2,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/stripe/api",
      "docId": "api-internal",
      "score": 2,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "app/portal/booking",
      "docId": "booking-system",
      "score": 1,
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management."
    },
    {
      "path": "app/portal/appointments",
      "docId": "booking-system",
      "score": 1,
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management."
    },
    {
      "path": "app/portal/appointments/WeeklyCalendar.tsx",
      "docId": "booking-system",
      "score": 1,
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management."
    }
  ],
  "title": "ProFixIQ feature request",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "source": "owner",
  "createdAt": "2026-03-02T04:37:28.390Z",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "description": "Parts still arent being passed from menuquick add to work order lines."
}
```

> This file was created automatically by ProFixIQ-Agent.