# ProFixIQ Legal & Compliance Document Package (DRAFT)

Status: **first-draft content, not yet reviewed by counsel.** Do not publish
any of these documents to `/legal/*` or reference them in signup flows until
a licensed attorney (ideally one familiar with SaaS, automotive-repair
regulation, and applicable state/provincial privacy law) has reviewed them.

## What's in this package

| File | Purpose | Parties |
|---|---|---|
| `terms-of-service.md` | ProFixIQ SaaS subscription agreement | ProFixIQ ↔ Shop (the subscribing business) |
| `privacy-policy.md` | How ProFixIQ collects/uses/shares personal data | ProFixIQ ↔ everyone whose data flows through the product |
| `data-processing-addendum.md` | GDPR/CCPA-style processor terms | ProFixIQ ↔ Shop, re: end-customer/employee data the Shop controls |
| `acceptable-use-policy.md` | Prohibited uses of the platform | ProFixIQ ↔ Shop |
| `subprocessor-list.md` | Vendors who touch customer data | Referenced by the DPA |
| `ai-voice-data-policy.md` | AI/voice-transcription specific disclosures | ProFixIQ ↔ Shop and end customers |

This is explicitly kept **separate** from `features/shared/components/LegalTerms.tsx`,
which is a repair-authorization consent form between a Shop and its own
vehicle-owner customer (test drives, estimate variance, parts/labor
warranty). That document stays as-is — it serves a different relationship
and a different legal purpose than the SaaS agreement here.

## Facts this draft is grounded in (verify before publishing)

- Primary production database (Supabase project `scjjkmuwadwkaaqjoigx`) is
  hosted in AWS `us-east-2` (Ohio, USA). Cross-border processing disclosure
  is required for any non-US shop or customer.
- Subprocessors identified from the codebase: **Supabase** (Postgres,
  Auth, Storage, Realtime), **Vercel** (application hosting/CDN),
  **Stripe** (subscription billing; no card data touches ProFixIQ
  servers directly), **OpenAI** (AI suggestions, embeddings, and a
  browser-to-OpenAI-Realtime-API WebSocket connection for voice
  transcription in the technician copilot).
- Data categories in the product: shop/business records, customer PII
  (name, contact info, vehicle VIN/plate), employee/payroll and
  timeclock data, inspection photos and signatures, voice audio
  (transcribed, not stored as raw audio by ProFixIQ — confirm with
  engineering before publishing the AI policy), fleet and property
  management records, and payment metadata (not full card numbers).
- Placeholders like `[Legal Entity Name]`, `[address]`, `[state/country
  of incorporation]`, and `[governing law]` must be filled in before use.

## Suggested next steps

1. Legal review and fill-in of placeholders.
2. Confirm the voice/audio retention claims in `ai-voice-data-policy.md`
   against what `features/shared/voice/useRealtimeTranscription.ts` and
   any related storage tables actually do.
3. Wire the reviewed versions into `/legal/terms`, `/legal/privacy`,
   `/legal/dpa`, `/legal/acceptable-use`, `/legal/subprocessors` routes,
   and capture acceptance (which version + timestamp) at signup instead
   of a bare checkbox.
4. Stand up a `/trust` page summarizing security posture once the P0
   hardening items are complete.
