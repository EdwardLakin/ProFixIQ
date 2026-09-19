# ProFixIQ Subprocessor List (DRAFT — verify against production before publishing)

**Last updated:** [date]

ProFixIQ uses the following subprocessors to provide the Service. This
list is referenced by the Data Processing Addendum. We will provide
advance notice of new subprocessors as described there.

| Subprocessor | Purpose | Data categories | Location of processing |
|---|---|---|---|
| Supabase, Inc. | Database (Postgres), authentication, file storage, realtime messaging | All Shop Data stored in the platform: customer/vehicle records, work orders, inspections, employee/payroll data, photos, signatures | AWS us-east-2 (Ohio, USA) — confirm any secondary regions |
| Vercel Inc. | Application hosting, CDN, edge network | Request metadata, application logs; transient access to data rendered in the app | United States (global edge network) — confirm data-at-rest location |
| Stripe, Inc. | Subscription billing and payment processing | Billing contact info, subscription/plan metadata, payment instrument tokens (ProFixIQ does not receive full card numbers) | United States (Stripe is PCI-DSS certified; confirm current SAQ/attestation) |
| OpenAI, L.L.C. | AI-assisted diagnostic/quote suggestions; real-time voice transcription for the technician copilot | Text prompts and work-order/vehicle context sent to suggestion features; audio streamed for transcription (see AI & Voice Data Policy) | United States — confirm OpenAI's current data-residency and retention terms under ProFixIQ's API agreement |

## Notes to verify before publishing

- Confirm whether any additional vendors handle data in production
  (e.g., email delivery, SMS/notification providers, error-tracking, or
  analytics tools) — none were found referenced in the current codebase,
  but this list must be re-verified against `package.json` and
  production environment variables before publishing.
- Confirm Stripe's current PCI attestation level and whether any
  ProFixIQ-hosted page ever renders a raw card field (it should not —
  Stripe-hosted Elements/Checkout should be used exclusively).
- Confirm OpenAI's Business/API data-use terms (as opposed to consumer
  ChatGPT terms) are the ones governing ProFixIQ's account, since only
  the API terms disclaim training on submitted data by default.
