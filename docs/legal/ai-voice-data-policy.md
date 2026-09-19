# ProFixIQ AI & Voice Data Policy (DRAFT — verify against engineering before publishing)

**Last updated:** [date]

This policy explains how ProFixIQ's AI-assisted features process data,
supplementing the Privacy Policy and DPA. It applies to: (1) AI
diagnostic/quote suggestion features, and (2) the technician copilot's
real-time voice transcription feature.

## 1. What the AI features do

- **Suggestion features** send relevant work-order/vehicle context
  (e.g., symptoms, vehicle make/model, prior job history) to OpenAI's
  API to generate diagnostic or quote suggestions, and use vector
  similarity search against the Shop's own historical job data to
  surface matching past jobs.
- **Voice transcription** lets a technician narrate findings; audio is
  streamed live from the technician's browser directly to OpenAI's
  real-time transcription API over an encrypted connection, using a
  short-lived, single-purpose token issued by ProFixIQ's backend. The
  resulting text transcript is returned to the browser and used to
  populate work order/inspection fields.

## 2. What ProFixIQ does — and does not — store

- **Raw audio:** based on the current implementation, microphone audio
  is streamed directly from the browser to OpenAI and is **not routed
  through or stored on ProFixIQ's own servers**. [Engineering: confirm
  this remains true and that no client-side recording/upload path
  exists before publishing this claim.]
- **Transcript text:** the text output of transcription and AI
  suggestions may be logged for quality, billing/quota, and abuse
  monitoring purposes (e.g., an AI usage/event log), and may become
  part of the work order or inspection record the Shop keeps, subject
  to the Shop's own retention choices.
- **Retention of AI logs:** [Engineering: confirm the retention period
  for the AI usage/event log and whether it is included in the
  standard Data Retention & Deletion Policy schedule or a separate,
  shorter one.]

## 3. Third-party model provider

Voice transcription and AI suggestions are powered by OpenAI. ProFixIQ's
use is governed by OpenAI's API/business terms, under which data
submitted via the API is not used by OpenAI to train its models by
default (as opposed to consumer ChatGPT products). [Confirm ProFixIQ's
OpenAI account is provisioned under API/Business terms, not a consumer
plan, before publishing this statement.]

## 4. Human oversight required

AI-generated suggestions and transcriptions are decision support only.
A qualified technician or service advisor must review AI output before
it is relied upon, presented to a customer, or billed. See the
Acceptable Use Policy, Section 2.

## 5. Shop and customer choices

Where a Shop's customer directly interacts with a voice or AI feature
(rather than a technician using it internally), the Shop is responsible
for providing any additional notice or consent required under
applicable law (e.g., two-party consent recording laws in some U.S.
states) before that interaction begins. [Confirm with counsel whether
any current or planned feature captures customer-side audio, which
would trigger call/audio-recording consent laws distinct from the
technician-side use described above.]

## 6. Opting out

[Confirm whether Shops can disable AI/voice features entirely in
account settings, and document the toggle here once confirmed.]

---

*This document is a first draft and contains claims (marked
"[Engineering: confirm...]") that must be verified against the current
implementation before publication. It is not legal advice.*
