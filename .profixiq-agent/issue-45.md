# ProFixIQ Agent Task for issue #45

**Title:** ProFixIQ bug: I cant tab from value to value in inspection screen. When I select LF tire press

**Description (raw):**

I cant tab from value to value in inspection screen. When I select LF tire pressure value and enter it, press tab, tab moves out of screen, rather than going to RF. Tabbing works fine in the sections below with the itemized items. tabbing doesn’t work in any of the inspections top sections/corners.

---
**Normalized payload:**
```json
{
  "id": "86dcef28-5b5a-44df-81a7-2b8b9885b5d6",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "I cant tab from value to value in inspection screen. When I select LF tire pressure value and enter it, press tab, tab moves out of screen, rather than going to RF. Tabbing works fine in the sections below with the itemized items. tabbing doesn’t work in any of the inspections top sections/corners.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-18T21:10:44.464Z",
  "hints": [
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
      "path": "supabase/migrations",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 12,
      "docId": "schema-core"
    },
    {
      "path": "supabase/types",
      "reason": "Shop, customers, vehicles, work orders, quotes, inspections, notes.",
      "score": 12,
      "docId": "schema-core"
    },
    {
      "path": "features/shared/components/ui",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 11,
      "docId": "ui-components"
    },
    {
      "path": "features/shared/components",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 11,
      "docId": "ui-components"
    },
    {
      "path": "features/shared/components/ModalShell.tsx",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 11,
      "docId": "ui-components"
    },
    {
      "path": "app/portal",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 10,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/history",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 10,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/profile",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 10,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/vehicles",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 10,
      "docId": "customer-portal"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.