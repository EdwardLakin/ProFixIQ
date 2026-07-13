# Inspection to Quote Flow Audit

Parent tracker: #992

## Flow

```mermaid
sequenceDiagram
  participant Tech as Technician inspection UI
  participant Import as POST /api/work-orders/import-from-inspection
  participant Builder as insertPrioritizedJobsFromInspection
  participant Quote as createCanonicalQuoteLines
  participant DB as Supabase

  Tech->>Import: workOrderId + inspectionId
  Import->>DB: authenticate user and load profile shop
  Import->>DB: verify work order is in profile shop
  Import->>DB: load inspection and compare shop_id
  Import->>Builder: import failed/recommended findings
  Builder->>DB: load inspection.result and work order
  Builder->>Builder: classify findings, estimate labor, infer parts
  Builder->>Quote: create canonical quote items
  Quote->>DB: insert work_order_quote_lines
  loop quote lines with parts
    Quote->>DB: create/reuse part_requests
    Quote->>DB: insert part_request_items
    Quote->>DB: sync quote-line parts totals/status
  end
```

## Primary files

- `app/api/work-orders/import-from-inspection/route.ts`
- `features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts`
- `features/work-orders/lib/work-orders/canonicalQuoteLines.ts`
- `features/parts/server/syncQuoteLinePartsStatus.ts`

## Primary tables

- `inspections`
- `work_orders`
- `work_order_quote_lines`
- `part_requests`
- `part_request_items`

## Confirmed findings

- The quote/parts creation pipeline is not transactional; later failure leaves earlier inserts committed.
- Eligibility logic imports keyword-classified diagnosis/maintenance findings even when the inspection item is not failed or recommended.
- The import route checks same-shop ownership but does not prove the supplied inspection belongs to the supplied work order/vehicle.
