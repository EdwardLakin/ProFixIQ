# ProFixIQ Agent Task for issue #71

**Title:** ProFixIQ bug: When completing the finish button is pressed in the inspection, it completes the

**Description (raw):**

When completing the finish button is pressed in the inspection, it completes the line, then I have to go back into the line to open the cause correction modal and fill out the modal. The finish button from inspection should trigger the cause correction modal. Also when pressing view inspection. Again, the form is blank, it should have saved.

---
**Normalized payload:**
```json
{
  "id": "d630cf5b-e819-44b9-9ce0-7648aac28da6",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "When completing the finish button is pressed in the inspection, it completes the line, then I have to go back into the line to open the cause correction modal and fill out the modal. The finish button from inspection should trigger the cause correction modal. Also when pressing view inspection. Again, the form is blank, it should have saved.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T19:52:30.943Z",
  "hints": [
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 16,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 16,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 16,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 15,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 15,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 15,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components/tabs",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 15,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection/ui",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "app/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 9,
      "docId": "inspections"
    },
    {
      "path": "features/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 9,
      "docId": "agent-console"
    },
    {
      "path": "features/agent/agent-console/app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 9,
      "docId": "agent-console"
    },
    {
      "path": "app/agent",
      "reason": "Internal agent console for AI tasks, GitHub issue/PR automation, and LLM reporting.",
      "score": 9,
      "docId": "agent-console"
    },
    {
      "path": "features/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 9,
      "docId": "parts-suppliers"
    },
    {
      "path": "features/integrations/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 9,
      "docId": "parts-suppliers"
    },
    {
      "path": "app/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 9,
      "docId": "parts-suppliers"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.