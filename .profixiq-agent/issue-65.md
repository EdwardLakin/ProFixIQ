# ProFixIQ Agent Task for issue #65

**Title:** ProFixIQ bug: From focused job modal. I am able to punch on to multiple job lines at the same 

**Description (raw):**

From focused job modal. I am able to punch on to multiple job lines at the same time. This shouldn’t happen. We need to only allow one job line per user to be worked on at a time.

---
**Normalized payload:**
```json
{
  "id": "b92f910e-d3df-49ea-aa7f-a9f06d0afae6",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "From focused job modal. I am able to punch on to multiple job lines at the same time. This shouldn’t happen. We need to only allow one job line per user to be worked on at a time.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T19:16:51.143Z",
  "hints": [
    {
      "path": "features/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 11,
      "docId": "work-orders-core"
    },
    {
      "path": "app/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 11,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 11,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 11,
      "docId": "work-orders-core"
    },
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 11,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 11,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 11,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 11,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 11,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 11,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components/tabs",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 11,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 10,
      "docId": "agent-console"
    },
    {
      "path": "features/agent/agent-console/app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 10,
      "docId": "agent-console"
    },
    {
      "path": "app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 10,
      "docId": "agent-console"
    },
    {
      "path": "features/stripe",
      "reason": "Invoice payment processing, payment links, customer ledger entries.",
      "score": 10,
      "docId": "stripe-integration"
    },
    {
      "path": "features/stripe/api",
      "reason": "Invoice payment processing, payment links, customer ledger entries.",
      "score": 10,
      "docId": "stripe-integration"
    },
    {
      "path": "app/api/stripe",
      "reason": "Invoice payment processing, payment links, customer ledger entries.",
      "score": 10,
      "docId": "stripe-integration"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.