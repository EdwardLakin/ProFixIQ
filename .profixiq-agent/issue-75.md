# ProFixIQ Agent Task for issue #75

**Title:** ProFixIQ bug: In create work order page, when trying to add suggested job I get a failed to ad

**Description (raw):**

In create work order page, when trying to add suggested job I get a failed to add message from vercel. See screenshots.

---
**Normalized payload:**
```json
{
  "id": "84bada5d-103a-46cb-bf5a-e3c21a80ab37",
  "kind": "feature",
  "title": "ProFixIQ feature request",
  "description": "In create work order page, when trying to add suggested job I get a failed to add message from vercel. See screenshots.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-25T02:32:48.011Z",
  "hints": [
    {
      "path": "supabase/migrations",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 7,
      "docId": "schema-core"
    },
    {
      "path": "supabase/types",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 7,
      "docId": "schema-core"
    },
    {
      "path": "features/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 6,
      "docId": "work-orders-core"
    },
    {
      "path": "app/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 6,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 6,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 6,
      "docId": "work-orders-core"
    },
    {
      "path": "app/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 6,
      "docId": "api-internal"
    },
    {
      "path": "features/ai/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 6,
      "docId": "api-internal"
    },
    {
      "path": "features/inspections/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 6,
      "docId": "api-internal"
    },
    {
      "path": "features/work-orders/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 6,
      "docId": "api-internal"
    },
    {
      "path": "features/auth/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 6,
      "docId": "api-internal"
    },
    {
      "path": "features/stripe/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 6,
      "docId": "api-internal"
    },
    {
      "path": "app/portal/booking",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 5,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 5,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments/WeeklyCalendar.tsx",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 5,
      "docId": "booking-system"
    },
    {
      "path": "app/portal",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 5,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/history",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 5,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/profile",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 5,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/vehicles",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 5,
      "docId": "customer-portal"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.