-- Performance advisor flagged payment_receipt_attachments_invoice_version_id_fkey
-- as an uncovered foreign key immediately after the parent migration landed.
create index if not exists idx_payment_receipt_attachments_invoice_version
  on public.payment_receipt_attachments (invoice_version_id)
  where invoice_version_id is not null;
