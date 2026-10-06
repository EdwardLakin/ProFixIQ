# AI budget governance (non-voice calls)

Every non-voice AI provider call reserves an upper-bound cost against the shop's
funded budget before it is sent, then settles the real cost. This is PR 3 of the
AI cost-control plan. It runs in **shadow mode**: nothing is blocked until a shop
is explicitly switched to `enforce`.

## What is governed

| Path | How |
| --- | --- |
| Calls through `ledgerOpenAICall` (vision, OCR, inspection generation, assistant, planner, embeddings, form import, maintenance rules, shop boost, quote suggestion) | Governed inside the wrapper |
| `runOpenAIStructuredJson` (Technician CoPilot decision and documentation, shop-assistant planner, quote-history insights) | Governed inside the helper |
| `interpret` (via `withDurableAIQuota`) | Governed inside the quota wrapper |
| `dtc-suggest` (both routes), `summarize-stats`, fleet summary, suggest-lines, documentation rewrite, branding logo | `governAICall` around the provider call |

`tests/ai-governance-coverage.test.ts` fails if a new non-voice provider call
site is not governed. Exemptions are listed there with the reason.

**Not governed (by design):** voice (PR 4), the public marketing chatbot (no
shop), calls with no shop in scope, and the operator embeddings backfill script.

## Behavior per call

- **Shadow shop (default):** the call always runs. The decision is recorded in
  `private.ai_budget_reservations` with `would_deny`, and a structured
  `ai_budget_shadow_would_deny` log line is emitted.
- **Enforcing shop, out of budget:** the call is refused *before* the provider is
  contacted. Routes answer HTTP 402 with `code: "ai_budget_exceeded"`. Calls that
  already have a deterministic fallback use it. CoPilot answers its existing
  terminal 402 quota error.
- **Provider error that proves nothing was billed** (400, 401, 403, 404, 409,
  422, 429): the hold is released. **Any other error keeps the hold**, because the
  provider may have billed.
- **A timed-out or lost-settlement hold stays charged** until it is committed,
  released, or reconciled with `release_stale_ai_budget_holds` (minimum age one
  hour).

## Switches

| Environment variable | Effect |
| --- | --- |
| `AI_BUDGET_GOVERNANCE=off` | Skip governance entirely (kill switch). |
| `AI_GOVERNANCE_FAIL_CLOSED=1` | Refuse a call when the budget service is unavailable, instead of running it ungoverned. Also makes the CoPilot refuse (retryable 429) a turn whose route quota hit a transient fault. **Default off**, which keeps today's behavior. |

Per shop, in SQL (service role): `set_ai_budget_enforcement(shop, 'shadow' | 'enforce')`,
`grant_ai_budget(...)`, `set_ai_budget_pool_cap(shop, pool, cap_usd)`,
`get_ai_budget_status(shop)`.

## Rollout gates (do not skip)

1. **Shadow for at least two weeks** of normal traffic. Review, per shop, how
   often decisions would have been denied (`get_ai_budget_status(...)->>'shadowWouldDeny30d'`)
   and which pools drive it.
2. **Funding must exist before enforcing.** An enforcing shop with no funding is
   denied every call. Funding sources (subscriptions, prepaid purchases) arrive in
   PR 6/7; until then grants are manual.
3. **Commercial allowances only after the workload model passes margin review**
   (PR 9). Do not enforce on the strength of shadow data alone.
4. **Enforce one low-risk shop first**, watch denials and support contacts, then widen.
5. **Voice is not covered.** Do not describe a shop as fully budget-protected
   until PR 4 lands.

## Known gaps

- **SDK retries.** The OpenAI SDK retries 429/5xx and timeouts internally (default
  two retries). A retried attempt that the provider billed is not visible to the
  ledger; only the final response's usage is. Each governed call holds one
  attempt's upper bound.
- **Unpriced models and images** settle at the hold (`reserved_fallback`), not at a
  measured cost, until the rate card covers them.
- **Client-side timeouts on the reserve call** can leave an orphan hold; reconcile
  with `release_stale_ai_budget_holds`. Scheduled reconciliation is PR 8.
- **Calls with no shop** (for example some platform catalog work) cannot be charged
  to a shop budget and show up as unattributed in Ops.
- **Reservation history is not pruned.** Each governed call writes one row to
  `private.ai_budget_reservations`, including in shadow mode. Plan retention
  (archive or delete settled rows past the audit window) before call volume makes
  the table large; the running balance does not depend on old rows.
