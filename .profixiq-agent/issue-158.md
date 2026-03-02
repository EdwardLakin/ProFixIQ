# ProFixIQ Agent Task for issue #158

**Title:** ProFixIQ feature: When creating a work order and selecting a line from menu quick add, Parts are n

**Description (raw):**

When creating a work order and selecting a line from menu quick add, Parts are not passing from menu quick add to work order.

---
**Normalized payload:**
```json
{
  "id": "baa77454-871d-4197-afa6-89cc823a08b8",
  "kind": "feature",
  "hints": [
    {
      "path": "features/work-orders",
      "docId": "work-orders-core",
      "score": 7,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "app/work-orders",
      "docId": "work-orders-core",
      "score": 7,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "docId": "work-orders-core",
      "score": 7,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "docId": "work-orders-core",
      "score": 7,
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections."
    },
    {
      "path": "supabase/migrations",
      "docId": "schema-core",
      "score": 7,
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes."
    },
    {
      "path": "supabase/types",
      "docId": "schema-core",
      "score": 7,
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes."
    },
    {
      "path": "app/api",
      "docId": "api-internal",
      "score": 6,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/ai/api",
      "docId": "api-internal",
      "score": 6,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/inspections/api",
      "docId": "api-internal",
      "score": 6,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/work-orders/api",
      "docId": "api-internal",
      "score": 6,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/auth/api",
      "docId": "api-internal",
      "score": 6,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/stripe/api",
      "docId": "api-internal",
      "score": 6,
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows."
    },
    {
      "path": "features/parts",
      "docId": "parts-suppliers",
      "score": 5,
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability."
    },
    {
      "path": "features/integrations/parts",
      "docId": "parts-suppliers",
      "score": 5,
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability."
    },
    {
      "path": "app/parts",
      "docId": "parts-suppliers",
      "score": 5,
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability."
    },
    {
      "path": "features/shared/components/ui",
      "docId": "ui-components",
      "score": 5,
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements."
    },
    {
      "path": "features/shared/components",
      "docId": "ui-components",
      "score": 5,
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements."
    },
    {
      "path": "features/shared/components/ModalShell.tsx",
      "docId": "ui-components",
      "score": 5,
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements."
    }
  ],
  "title": "ProFixIQ feature request",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "source": "owner",
  "createdAt": "2026-03-02T00:50:01.237Z",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "description": "When creating a work order and selecting a line from menu quick add, Parts are not passing from menu quick add to work order."
}
```

> This file was created automatically by ProFixIQ-Agent.