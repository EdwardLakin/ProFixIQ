# ProFixIQ Agent Task for issue #55

**Title:** ProFixIQ bug: Under management in the side bar(screenshot), when selected, navigates to a 404.

**Description (raw):**

Under management in the side bar(screenshot), when selected, navigates to a 404. It should open the appointments page.

---
**Normalized payload:**
```json
{
  "id": "58754d50-16be-424f-830b-6b6e4868161a",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "Under management in the side bar(screenshot), when selected, navigates to a 404. It should open the appointments page.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T17:18:33.619Z",
  "hints": [
    {
      "path": "features/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 6,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 6,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 6,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components/tabs",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 6,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/portal/booking",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 5,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 5,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments/WeeklyCalendar.tsx",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 5,
      "docId": "booking-system"
    },
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 5,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 5,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 5,
      "docId": "auth-and-roles"
    },
    {
      "path": "app/portal",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 4,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/history",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 4,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/profile",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 4,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/vehicles",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 4,
      "docId": "customer-portal"
    },
    {
      "path": "features/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 4,
      "docId": "agent-console"
    },
    {
      "path": "features/agent/agent-console/app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 4,
      "docId": "agent-console"
    },
    {
      "path": "app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 4,
      "docId": "agent-console"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.