# ProFixIQ Agent Task for issue #17

**Title:** ProFixIQ feature: When using create work orders, I have a red error at the top of the page, I dont

**Description (raw):**

When using create work orders, I have a red error at the top of the page, I dont have the menu quick add or the add line form.

---
**Normalized payload:**
```json
{
  "id": "7ee5037b-e99b-43b2-ad54-2e5bf767c74f",
  "kind": "bug",
  "title": "ProFixIQ bug report",
  "description": "When using create work orders, I have a red error at the top of the page, I dont have the menu quick add or the add line form.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-17T19:13:34.910Z",
  "hints": [
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, and roles like owner, manager, advisor, and tech.",
      "score": 10,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/users",
      "reason": "Supabase auth, profile linking, and roles like owner, manager, advisor, and tech.",
      "score": 10,
      "docId": "auth-and-roles"
    },
    {
      "path": "supabase",
      "reason": "Supabase auth, profile linking, and roles like owner, manager, advisor, and tech.",
      "score": 10,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/work-orders",
      "reason": "Core work order create/edit flow, job lines, statuses, and pricing.",
      "score": 8,
      "docId": "work-orders-core"
    },
    {
      "path": "features/jobs",
      "reason": "Core work order create/edit flow, job lines, statuses, and pricing.",
      "score": 8,
      "docId": "work-orders-core"
    },
    {
      "path": "features/quotes",
      "reason": "Core work order create/edit flow, job lines, statuses, and pricing.",
      "score": 8,
      "docId": "work-orders-core"
    },
    {
      "path": "features/ai",
      "reason": "AI-driven inspections, suggestions, and AI helper flows in ProFixIQ.",
      "score": 8,
      "docId": "ai-integrations"
    },
    {
      "path": "features/inspections",
      "reason": "AI-driven inspections, suggestions, and AI helper flows in ProFixIQ.",
      "score": 8,
      "docId": "ai-integrations"
    },
    {
      "path": "features/work-orders",
      "reason": "AI-driven inspections, suggestions, and AI helper flows in ProFixIQ.",
      "score": 8,
      "docId": "ai-integrations"
    },
    {
      "path": "features/inspections",
      "reason": "Inspection templates, checklists, results capture, and linking inspections to work orders.",
      "score": 6,
      "docId": "inspections"
    },
    {
      "path": "features/dashboard",
      "reason": "Dashboard layouts, corner grid UI components, and keyboard navigation/tabbing logic.",
      "score": 5,
      "docId": "ui-layout-corner-grids"
    },
    {
      "path": "features/layout",
      "reason": "Dashboard layouts, corner grid UI components, and keyboard navigation/tabbing logic.",
      "score": 5,
      "docId": "ui-layout-corner-grids"
    },
    {
      "path": "features/shared/ui",
      "reason": "Dashboard layouts, corner grid UI components, and keyboard navigation/tabbing logic.",
      "score": 5,
      "docId": "ui-layout-corner-grids"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.