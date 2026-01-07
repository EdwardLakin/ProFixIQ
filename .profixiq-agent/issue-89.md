# ProFixIQ Agent Task for issue #89

**Title:** ProFixIQ bug: The pricing section on profixiqlanding page, the buttons arent directing to my s

**Description (raw):**

The pricing section on profixiqlanding page, the buttons arent directing to my stripe checkout any more.

---
**Normalized payload:**
```json
{
  "id": "fb00c9c7-775c-4f5f-b23d-eaf64c07a620",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "The pricing section on profixiqlanding page, the buttons arent directing to my stripe checkout any more.",
  "source": "mechanic",
  "reporterId": "38b17cb2-cf8c-4d21-b9e0-cb86ca345df1",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2026-01-07T04:47:17.760Z",
  "hints": [
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 4,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 4,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 4,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 4,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 4,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 4,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components/tabs",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 4,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/stripe",
      "reason": "Invoice payment processing, payment links, customer ledger entries.",
      "score": 3,
      "docId": "stripe-integration"
    },
    {
      "path": "features/stripe/api",
      "reason": "Invoice payment processing, payment links, customer ledger entries.",
      "score": 3,
      "docId": "stripe-integration"
    },
    {
      "path": "app/api/stripe",
      "reason": "Invoice payment processing, payment links, customer ledger entries.",
      "score": 3,
      "docId": "stripe-integration"
    },
    {
      "path": "features/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 3,
      "docId": "parts-suppliers"
    },
    {
      "path": "features/integrations/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 3,
      "docId": "parts-suppliers"
    },
    {
      "path": "app/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 3,
      "docId": "parts-suppliers"
    },
    {
      "path": "features/shared/components/ui",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 3,
      "docId": "ui-components"
    },
    {
      "path": "features/shared/components",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 3,
      "docId": "ui-components"
    },
    {
      "path": "features/shared/components/ModalShell.tsx",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 3,
      "docId": "ui-components"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.