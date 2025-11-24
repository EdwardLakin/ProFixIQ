# ProFixIQ Agent Task for issue #49

**Title:** ProFixIQ bug: Work order create page is creating blank/no lines added work orders. I open work

**Description (raw):**

Work order create page is creating blank/no lines added work orders. I open work order create page and exit the page with out adding any lines, check work orders, I have an empty work order for a walk in customer. This should not happen.

---
**Normalized payload:**
```json
{
  "id": "fd0b65be-3f16-4932-8132-f98eb6db548d",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "Work order create page is creating blank/no lines added work orders. I open work order create page and exit the page with out adding any lines, check work orders, I have an empty work order for a walk in customer. This should not happen.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T16:41:59.148Z",
  "hints": [
    {
      "path": "app/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 17,
      "docId": "api-internal"
    },
    {
      "path": "features/ai/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 17,
      "docId": "api-internal"
    },
    {
      "path": "features/inspections/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 17,
      "docId": "api-internal"
    },
    {
      "path": "features/work-orders/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 17,
      "docId": "api-internal"
    },
    {
      "path": "features/auth/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 17,
      "docId": "api-internal"
    },
    {
      "path": "features/stripe/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 17,
      "docId": "api-internal"
    },
    {
      "path": "features/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 16,
      "docId": "work-orders-core"
    },
    {
      "path": "app/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 16,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 16,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 16,
      "docId": "work-orders-core"
    },
    {
      "path": "supabase/migrations",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 14,
      "docId": "schema-core"
    },
    {
      "path": "supabase/types",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 14,
      "docId": "schema-core"
    },
    {
      "path": "features/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection/ui",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "app/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "app/portal",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 8,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/history",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 8,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/profile",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 8,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/vehicles",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 8,
      "docId": "customer-portal"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.