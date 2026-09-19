# ProFixIQ Data Retention & Deletion Policy (DRAFT — verify periods with the business before publishing)

**Last updated:** [date]

This policy sets retention periods by data category, supporting
Section 9 of the Terms of Service and Section 8 of the Data Processing
Addendum. Periods below are starting proposals — confirm against
accounting, tax, and warranty-claim requirements before finalizing.

| Data category | Retention while account is active | Retention after termination | Notes |
|---|---|---|---|
| Work orders, invoices, financial records | Life of account | [7 years] | Common accounting/tax retention period; confirm with counsel/accountant |
| Customer & vehicle records | Life of account | [30–90 days export window, then delete/anonymize] | Shorter than financial records unless tied to an active invoice |
| Inspection records, signatures, evidence hashes | Life of account | [Same as work orders — tied to warranty/liability exposure] | These are the legal evidence trail for completed work |
| Employee/payroll/timeclock data | Life of account | [Per applicable wage-and-hour recordkeeping law, often 3–7 years] | Jurisdiction-dependent; confirm per Shop's location |
| Inspection/vehicle photos | Life of account | [Same as inspection records] | Stored in private buckets; not publicly accessible |
| AI usage/event logs (suggestion + transcription metadata) | [90 days] | [Deleted with account, or sooner] | Shorter-lived than core business records; confirm with engineering |
| Authentication/access logs | [Rolling 90 days] | N/A | Security monitoring purpose only |
| Backups | Per backup provider's rotation (e.g., point-in-time recovery window) | Backups age out naturally | Deletion requests are honored in primary systems immediately; backups purge on their normal cycle |

## Deletion process

1. On account termination, the Shop has [30–90] days to export data
   through in-product tools or by request.
2. After the export window, ProFixIQ deletes or irreversibly
   anonymizes Shop Data other than records it must retain for legal,
   accounting, or dispute-resolution purposes (e.g., billing history).
3. Individual data-subject deletion requests (from a Shop's customer
   or employee) are routed to the Shop as controller; ProFixIQ deletes
   the specified records from primary systems within [30] days of a
   validated, authorized request from the Shop, subject to the same
   legal-retention exceptions.

---

*This document is a first draft. Retention periods must be confirmed
against applicable accounting, tax, employment, and consumer-protection
law in the jurisdictions ProFixIQ's Shops operate in before publishing.
It is not legal advice.*
