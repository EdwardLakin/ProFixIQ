# ProFixIQ Agent Task for issue #69

**Title:** ProFixIQ bug: Menu quick add oil change packages need parts in the package.
Eg. right now I ad

**Description (raw):**

Menu quick add oil change packages need parts in the package.
Eg. right now I add the oil change packages and anpprove the work order.   No parts show on the work order line and then I have to go through the regular parts request process. This shouldn’t happen, it should be a full package with parts built in.

---
**Normalized payload:**
```json
{
  "id": "2921255f-b6b6-48e3-a766-7eb0234e09d5",
  "kind": "feature",
  "title": "ProFixIQ feature request",
  "description": "Menu quick add oil change packages need parts in the package.\nEg. right now I add the oil change packages and anpprove the work order.   No parts show on the work order line and then I have to go through the regular parts request process. This shouldn’t happen, it should be a full package with parts built in.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T19:27:44.859Z",
  "hints": [
    {
      "path": "features/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 13,
      "docId": "work-orders-core"
    },
    {
      "path": "app/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 13,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 13,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 13,
      "docId": "work-orders-core"
    },
    {
      "path": "features/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 13,
      "docId": "parts-suppliers"
    },
    {
      "path": "features/integrations/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 13,
      "docId": "parts-suppliers"
    },
    {
      "path": "app/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 13,
      "docId": "parts-suppliers"
    },
    {
      "path": "features/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 13,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 13,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 13,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components/tabs",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 13,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 12,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 12,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 12,
      "docId": "auth-and-roles"
    },
    {
      "path": "app/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 10,
      "docId": "api-internal"
    },
    {
      "path": "features/ai/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 10,
      "docId": "api-internal"
    },
    {
      "path": "features/inspections/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 10,
      "docId": "api-internal"
    },
    {
      "path": "features/work-orders/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 10,
      "docId": "api-internal"
    },
    {
      "path": "features/auth/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 10,
      "docId": "api-internal"
    },
    {
      "path": "features/stripe/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 10,
      "docId": "api-internal"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.