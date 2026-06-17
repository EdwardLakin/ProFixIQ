# ProFixIQ Agent Task for issue #41

**Title:** ProFixIQ bug: Error at the top of work order create page

**Description (raw):**

Error at the top of work order create page

---
**Normalized payload:**
```json
{
  "id": "d6d6f712-e26c-417a-92bb-2c3f033f5b4f",
  "kind": "bug",
  "title": "ProFixIQ bug report",
  "description": "Error at the top of work order create page",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-18T19:17:04.282Z",
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
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 3,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 3,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 3,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 3,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 3,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 3,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components/tabs",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 3,
      "docId": "ui-layout-dashboard"
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
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.