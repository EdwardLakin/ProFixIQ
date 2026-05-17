# ProFixIQ Agent Task for issue #83

**Title:** ProFixIQ bug: When I’m working on a big fleet job things start to break in a few different pla

**Description (raw):**

When I’m working on a big fleet job things start to break in a few different places and it’s hard to tell what’s actually saved.

Example flow:
	1.	On desktop, I open a work order in the main Work Order Editor and add 6–8 jobs using the Suggested Quick Add panel (mostly maintenance + a couple of custom jobs). Sometimes the suggestions show duplicates (“Oil change” twice, or the same brake inspection twice) and I’m not sure which one is the “real” one tied to the menu.
	2.	I save the work order and then, on my phone, open the same job from the Mobile Tech Queue. The job list looks slightly different: a couple of the jobs are out of order and one of the duplicate ones is missing.
	3.	If I punch into one of the jobs on mobile and mark a few lines as done, then go back to desktop and open the Focused Job modal for that same job, the status of the lines doesn’t match what I just did on mobile until I fully refresh the page.
	4.	While that’s happening, the Parts Used list in the job modal sometimes shows old parts that I already removed on mobile, or doesn’t show the latest parts I just added until I close and reopen the modal.

It feels like the desktop editor, the focused job modal, and the mobile work order view are all caching their own versions of the job instead of staying in sync. We just need a consistent “source of truth” so that:
	•	Suggested Quick Add doesn’t show weird duplicates,
	•	Mobile and desktop always agree on which jobs are on the work order and in what order, and
	•	Punching in/out or editing parts/lines on mobile updates the desktop views without having to manually refresh everything.

---
**Normalized payload:**
```json
{
  "id": "ce835d9b-a6a5-432e-ae6c-9820834922ac",
  "kind": "feature",
  "title": "ProFixIQ feature request",
  "description": "When I’m working on a big fleet job things start to break in a few different places and it’s hard to tell what’s actually saved.\n\nExample flow:\n\t1.\tOn desktop, I open a work order in the main Work Order Editor and add 6–8 jobs using the Suggested Quick Add panel (mostly maintenance + a couple of custom jobs). Sometimes the suggestions show duplicates (“Oil change” twice, or the same brake inspection twice) and I’m not sure which one is the “real” one tied to the menu.\n\t2.\tI save the work order and then, on my phone, open the same job from the Mobile Tech Queue. The job list looks slightly different: a couple of the jobs are out of order and one of the duplicate ones is missing.\n\t3.\tIf I punch into one of the jobs on mobile and mark a few lines as done, then go back to desktop and open the Focused Job modal for that same job, the status of the lines doesn’t match what I just did on mobile until I fully refresh the page.\n\t4.\tWhile that’s happening, the Parts Used list in the job modal sometimes shows old parts that I already removed on mobile, or doesn’t show the latest parts I just added until I close and reopen the modal.\n\nIt feels like the desktop editor, the focused job modal, and the mobile work order view are all caching their own versions of the job instead of staying in sync. We just need a consistent “source of truth” so that:\n\t•\tSuggested Quick Add doesn’t show weird duplicates,\n\t•\tMobile and desktop always agree on which jobs are on the work order and in what order, and\n\t•\tPunching in/out or editing parts/lines on mobile updates the desktop views without having to manually refresh everything.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-26T01:27:08.414Z",
  "hints": [
    {
      "path": "features/auth",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 81,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/lib/supabase",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 81,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/shared/types/types/supabase.ts",
      "reason": "Supabase auth, profile linking, role assignment (owner, manager, advisor, tech, customer).",
      "score": 81,
      "docId": "auth-and-roles"
    },
    {
      "path": "features/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 78,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "app/dashboard",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 78,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 78,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/shared/components/tabs",
      "reason": "Core layout, corner grid system, sidebar navigation, top bar, and responsive theming.",
      "score": 78,
      "docId": "ui-layout-dashboard"
    },
    {
      "path": "features/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 72,
      "docId": "work-orders-core"
    },
    {
      "path": "app/work-orders",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 72,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueue.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 72,
      "docId": "work-orders-core"
    },
    {
      "path": "features/shared/components/JobQueueCard.tsx",
      "reason": "Creation, editing, diagnostics, job lines, statuses, pricing, and linking quotes/inspections.",
      "score": 72,
      "docId": "work-orders-core"
    },
    {
      "path": "app/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 65,
      "docId": "api-internal"
    },
    {
      "path": "features/ai/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 65,
      "docId": "api-internal"
    },
    {
      "path": "features/inspections/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 65,
      "docId": "api-internal"
    },
    {
      "path": "features/work-orders/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 65,
      "docId": "api-internal"
    },
    {
      "path": "features/auth/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 65,
      "docId": "api-internal"
    },
    {
      "path": "features/stripe/api",
      "reason": "Route handlers for portal, quotes, work orders, AI endpoints, inspections, and job flows.",
      "score": 65,
      "docId": "api-internal"
    },
    {
      "path": "features/shared/components/ui",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 59,
      "docId": "ui-components"
    },
    {
      "path": "features/shared/components",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 59,
      "docId": "ui-components"
    },
    {
      "path": "features/shared/components/ModalShell.tsx",
      "reason": "Buttons, inputs, modals, cards, selectors, tables, and shadcn-based design elements.",
      "score": 59,
      "docId": "ui-components"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.