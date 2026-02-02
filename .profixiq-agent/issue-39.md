# ProFixIQ Agent Task for issue #39

**Title:** ProFixIQ bug: Error in work orders create page.

**Description (raw):**

Error in work orders create page.

---
**Normalized payload:**
```json
{
  "id": "cb1a4498-295e-461b-94a8-39bfd9396918",
  "kind": "bug",
  "title": "ProFixIQ bug report",
  "description": "Error in work orders create page.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-18T03:17:08.847Z",
  "hints": [
    {
      "path": "features/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 3,
      "docId": "work-orders-core"
    },
    {
      "path": "app/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 3,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 3,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 3,
      "docId": "work-orders-core"
    },
    {
      "path": "app/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 3,
      "docId": "api-internal"
    },
    {
      "path": "features/ai/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 3,
      "docId": "api-internal"
    },
    {
      "path": "features/inspections/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 3,
      "docId": "api-internal"
    },
    {
      "path": "features/work-orders/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 3,
      "docId": "api-internal"
    },
    {
      "path": "features/auth/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 3,
      "docId": "api-internal"
    },
    {
      "path": "features/stripe/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 3,
      "docId": "api-internal"
    },
    {
      "path": "supabase/migrations",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 3,
      "docId": "schema-core"
    },
    {
      "path": "supabase/types",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 3,
      "docId": "schema-core"
    },
    {
      "path": "features/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 2,
      "docId": "agent-console"
    },
    {
      "path": "features/agent/agent-console/app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 2,
      "docId": "agent-console"
    },
    {
      "path": "app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 2,
      "docId": "agent-console"
    },
    {
      "path": ".github",
      "reason": "Environment and infra wiring for ProFixIQ: GitHub app, Supabase, and deployment config.",
      "score": 2,
      "docId": "infra-deployment"
    },
    {
      "path": "supabase/config",
      "reason": "Environment and infra wiring for ProFixIQ: GitHub app, Supabase, and deployment config.",
      "score": 2,
      "docId": "infra-deployment"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Environment and infra wiring for ProFixIQ: GitHub app, Supabase, and deployment config.",
      "score": 2,
      "docId": "infra-deployment"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.