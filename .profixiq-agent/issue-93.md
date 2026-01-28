# ProFixIQ Agent Task for issue #93

**Title:** ProFixIQ bug: This si just a test to trigger discord messaging.

**Description (raw):**

This si just a test to trigger discord messaging.

---
**Normalized payload:**
```json
{
  "id": "8a3ae87a-b754-436a-8514-05d41505183e",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "This si just a test to trigger discord messaging.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2026-01-28T21:11:04.278Z",
  "hints": [
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
    },
    {
      "path": "app/portal/booking",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 2,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 2,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments/WeeklyCalendar.tsx",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 2,
      "docId": "booking-system"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.