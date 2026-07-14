# QuickBooks Invoice Sync Audit

Parent audit: #992

## Canonical flow traced

```text
Authenticated shop user
  -> POST /api/integrations/quickbooks/invoice/[invoiceId]
  -> requireQuickBooksShopAccess()
  -> ensureActiveQuickBooksConnection()
  -> syncInvoiceToQuickBooks()
      -> load invoices row
      -> validate expected shop
      -> load customer and work order
      -> check quickbooks_invoice_links
      -> rebuild current work-order invoice snapshot
      -> create QuickBooks invoice
      -> persist local QuickBooks link
      -> log sync result
```

## Confirmed defects

### #1016 — Live work order is exported instead of immutable invoice

The sync service overlays the persisted invoice with a newly generated work-order snapshot before building the QuickBooks payload. Post-issue work-order changes can therefore alter the accounting export.

### #1017 — External success plus local failure can duplicate invoices

QuickBooks invoice creation occurs before the local external-ID link is persisted. A failure after external creation leaves retries unable to identify the existing QuickBooks invoice.

### #1018 — No finalized-state eligibility check

The service validates invoice existence and shop ownership but does not restrict export by invoice status. Draft, pending-send, voided, cancelled, or superseded rows can reach invoice creation.

## Required target architecture

```text
Immutable finalized invoice version
  -> validate export eligibility
  -> create durable outbound operation with stable identity
  -> reconcile existing external object
  -> create only when absent
  -> persist external ID and source version/hash
  -> append sync event
```

Voids, revisions, refunds, and credit memos must use explicit linked accounting commands rather than recreating an invoice from mutable work-order state.
