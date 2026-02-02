# ProFixIQ Agent Task for issue #61

**Title:** ProFixIQ feature: Error on scheduling page. See screen shot.

**Description (raw):**

Error on scheduling page. See screen shot.

---
**Normalized payload:**
```json
{
  "id": "4d301aa3-c130-4429-9df2-310bdf7080b1",
  "kind": "bug",
  "title": "ProFixIQ bug report",
  "description": "Error on scheduling page. See screen shot.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T17:51:36.563Z",
  "hints": [
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
    },
    {
      "path": "features/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 1,
      "docId": "work-orders-core"
    },
    {
      "path": "app/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 1,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 1,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 1,
      "docId": "work-orders-core"
    },
    {
      "path": "features/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 1,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 1,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection/ui",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 1,
      "docId": "inspections"
    },
    {
      "path": "app/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 1,
      "docId": "inspections"
    },
    {
      "path": "app/portal/booking",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 1,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 1,
      "docId": "booking-system"
    },
    {
      "path": "app/portal/appointments/WeeklyCalendar.tsx",
      "reason": "Portal-facing booking flow, shop selection, weekly calendar, appointment management.",
      "score": 1,
      "docId": "booking-system"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.