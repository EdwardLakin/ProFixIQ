# ProFixIQ Agent Task for issue #67

**Title:** ProFixIQ bug: In part request modal, the quantity “1” is not deletable until another value is 

**Description (raw):**

In part request modal, the quantity “1” is not deletable until another value is input.

---
**Normalized payload:**
```json
{
  "id": "6cbe1de8-7117-4721-a036-5e876f896de7",
  "kind": "unknown",
  "title": "ProFixIQ feature request",
  "description": "In part request modal, the quantity “1” is not deletable until another value is input.",
  "source": "owner",
  "reporterId": "8764f87e-a991-4388-b233-11c47e28c3ed",
  "shopId": "e4d23a6d-9418-49a5-8a1b-6a2640615b5b",
  "createdAt": "2025-11-24T19:20:50.028Z",
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
      "path": "features/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 4,
      "docId": "parts-suppliers"
    },
    {
      "path": "features/integrations/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 4,
      "docId": "parts-suppliers"
    },
    {
      "path": "app/parts",
      "reason": "Internal parts flows plus future supplier APIs for catalogue lookups, pricing, and availability.",
      "score": 4,
      "docId": "parts-suppliers"
    },
    {
      "path": "features/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 3,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 3,
      "docId": "inspections"
    },
    {
      "path": "features/inspections/lib/inspection/ui",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 3,
      "docId": "inspections"
    },
    {
      "path": "app/inspections",
      "reason": "Inspection templates, saved lists, digital checklists, scoring, statuses, and WO links.",
      "score": 3,
      "docId": "inspections"
    },
    {
      "path": "app/portal",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 3,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/history",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 3,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/profile",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 3,
      "docId": "customer-portal"
    },
    {
      "path": "app/portal/vehicles",
      "reason": "Customer-facing dashboard for history, vehicles, documents, appointments and shop profiles.",
      "score": 3,
      "docId": "customer-portal"
    },
    {
      "path": "features/ai",
      "reason": "AI-driven suggestions, embeddings, training data ingestion, vehicle/quote learning.",
      "score": 3,
      "docId": "ai-integrations"
    },
    {
      "path": "features/ai/lib",
      "reason": "AI-driven suggestions, embeddings, training data ingestion, vehicle/quote learning.",
      "score": 3,
      "docId": "ai-integrations"
    },
    {
      "path": "features/integrations/ai",
      "reason": "AI-driven suggestions, embeddings, training data ingestion, vehicle/quote learning.",
      "score": 3,
      "docId": "ai-integrations"
    },
    {
      "path": "features/work-orders",
      "reason": "AI-driven suggestions, embeddings, training data ingestion, vehicle/quote learning.",
      "score": 3,
      "docId": "ai-integrations"
    },
    {
      "path": "features/quotes",
      "reason": "AI-driven suggestions, embeddings, training data ingestion, vehicle/quote learning.",
      "score": 3,
      "docId": "ai-integrations"
    }
  ]
}
```

> This file was created automatically by ProFixIQ-Agent.