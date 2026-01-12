# ProFixIQ Agent Task for issue #63

**Title:** ProFixIQ bug: In appointments page, in the weekly calendar section, the appointment is outside

**Description (raw):**

In appointments page, in the weekly calendar section, the appointment is outside the card. We need to adjust what it shows or change the design of the weekly calendar so appointments show up and read properly inside the card.

---
**Normalized payload:**
```json
{
  "id": "c28edc43-18ea-409c-8590-da1bfc45f2ab",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "In appointments page, in the weekly calendar section, the appointment is outside the card. We need to adjust what it shows or change the design of the weekly calendar so appointments show up and read properly inside the card.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T19:04:34.095Z",
  "hints": [
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 14,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 14,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 14,
      "docId": "auth-and-roles"
    },
    {
      "path": "app/portal/booking",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 12,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 12,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments/WeeklyCalendar.tsx",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 12,
      "docId": "booking-system"
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
    },
    {
      "path": "features/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 8,
      "docId": "agent-console"
    },
    {
      "path": "features/agent/agent-console/app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 8,
      "docId": "agent-console"
    },
    {
      "path": "app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 8,
      "docId": "agent-console"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.