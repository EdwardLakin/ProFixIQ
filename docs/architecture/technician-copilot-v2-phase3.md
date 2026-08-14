# Technician CoPilot V2 — Phase 3

## Scope

Phase 3 separates the active collaborator from the background documentation engine.

```text
Technician message
  ├─> CoPilot reasoning model ─> natural response
  └─> Silent documentation model
        ├─> strict event validation
        ├─> explicit numeric confidence gate
        ├─> provenance enrichment
        ├─> semantic fingerprinting
        ├─> turn-scoped atomic finalization
        └─> ordered Repair Session events

Repair Session events
  └─> deterministic projection
        ├─> current task
        ├─> observations
        ├─> measurements
        ├─> DTCs
        ├─> explicit diagnostic findings
        ├─> teardown / fluid state
        ├─> intelligent timeline
        └─> draft repair note
```

The collaborator no longer has to combine its spoken response with documentation extraction in one model output. This is the first architectural step toward continuous voice: the technician can keep talking while documentation is handled as a separate background responsibility.

## Factual boundary

The current technician message is the only source for new documentation events. Existing repair context may resolve references, but old facts must not be re-emitted as new facts.

The documentation engine may capture only:

- Active task changes explicitly stated by the technician.
- Direct observations.
- Explicit measurements and units.
- Explicit DTC codes.
- Explicit diagnostic conclusions, confirmed causes, ruled-out causes, or normal checks.
- Explicit component removal, installation, disconnection, and reconnection.
- Explicit fluid drain and fill state.

The engine must not convert questions, plans, hypotheses, CoPilot suggestions, workflow navigation, or unstated inferences into technician facts.

Each extracted event must include a finite numeric confidence value from `0` through `1`. Missing, string, non-finite, or out-of-range confidence is rejected. The persistence boundary independently requires confidence of at least `0.6`.

## Provenance

Every Phase-3 documentation event carries:

```text
sourceTurnId
sourceText
captureMode = silent_documentation_v1
captureModel
capturePromptVersion = technician_copilot_documentation_v1
captureProviderMode
confidence
documentationFingerprint
```

The event ledger remains authoritative. The repair note and timeline are deterministic projections and can be rebuilt from the ledger at any time. Model and prompt provenance remain attached to the source event even when the projected repair note changes later.

## Deduplication and repeatable events

A semantic fingerprint is generated from the event type and its material fields. The deduplication policy distinguishes durable facts from repeatable repair occurrences:

- A stable narrative fact such as the same observation or diagnostic finding is deduplicated across the session.
- Measurements and DTC observations are occurrence evidence and may be captured again in a later turn.
- Task, component, and fluid events represent state transitions. An identical consecutive state is suppressed, but the same state is accepted after an intervening transition. This preserves valid sequences such as `removed → installed → removed` or `driveline → brakes → driveline`.

Example:

```text
"Rear U-joint has play."
  -> observation.recorded

"That joint is definitely the vibration source."
  -> diagnostic.finding / confirmed
```

Those are related but not duplicate facts.

## Turn-scoped atomicity

Semantic fingerprints are not used as persistence operation IDs. The complete normalized result for one `sourceTurnId` is submitted through one private `documentation.append` command.

The database then:

1. Revalidates technician identity, active session ownership, and work-order assignment.
2. Reserves `(session_id, source_turn_id)` in a private receipt table.
3. Appends every normalized event in ordered, deterministic slots derived from one turn operation ID.
4. Commits the receipt and all event rows in one transaction.

Concurrent or retried requests therefore cannot persist two different model interpretations for the same technician turn. The losing request waits for the winning transaction and receives a replay result. A valid extraction that contains no events still creates a zero-event receipt, while a failed extraction or persistence attempt is not finalized.

The private session read projects finalized `sourceTurnId` receipts back to the server. When an assistant response already exists but its documentation receipt does not, a retry keeps the persisted response, reruns only the silent extraction path, and attempts finalization again. Documentation persistence failures are logged and isolated from the active collaborator response. Once the receipt exists, ordinary same-turn replay returns immediately without another model call.

## Database contract

Phase 3 includes three forward migrations:

1. The private technician append function gains `diagnostic.finding` while retaining the Phase-2 technician identity, assignment, lifecycle, origin, payload-size, and idempotency controls.
2. The existing `ai_automation_capability_settings` check constraint is expanded so the documented shop-level and technician-scoped CoPilot flags can actually be stored. Technician overrides are limited to the two known flag names followed by a UUID profile ID; this is not an unrestricted capability namespace.
3. A private source-turn receipt table and technician-authorized atomic documentation batch function are added, the private session read projects finalized turn IDs for retry recovery, and the existing service-only command bridge gains `documentation.append`.

The migrations do not:

- Add a public table or column.
- Change canonical work-order RLS policies or grants.
- Grant browser access to the `copilot` schema.
- Mutate canonical work-order records.
- Change existing event semantics.
- Broaden the separate AI automation evidence capability vocabulary.

## Feature flags

The existing `technician_copilot_text` capability remains the umbrella gate.

Phase 3 adds an optional override:

```text
technician_copilot_documentation
technician_copilot_documentation:<profile-id>
```

The capability registry also accepts the Phase-2 technician-specific text override:

```text
technician_copilot_text:<profile-id>
```

Resolution order is technician-specific setting, then shop setting, then inheritance from the text pilot. An explicit false documentation setting disables silent documentation without disabling the text collaborator.

## Canonical mutation boundary

Phase 3 does not write:

- Work-order notes
- Work-order lines
- Labor
- Parts requests
- Inspection records
- Status transitions
- Approvals
- Invoices
- Customer communications

The projected repair note is clearly labeled as a session draft. Canonical documentation publication will require a later domain command and permission policy.

## Rollback

The application remains independently rollback-safe:

1. Disable `technician_copilot_documentation` for a technician or shop.
2. Disable `technician_copilot_text` to remove the complete preview.
3. Revert the application release; existing work-order and technician screens continue unchanged.

The additive database migrations may safely remain after an application rollback. They permit a private event type, narrowly named rollout settings, and a private turn receipt/atomic append boundary. None requires the application to use it, and generic Repair Session events do not affect canonical work orders.

## Acceptance path

1. `Start the Ford.`
2. `Read me the complaint.`
3. `I'm checking the driveline.`
4. `Rear U-joint has play.`
5. `Carrier bearing looks okay.`
6. `The joint is definitely the vibration source.`
7. `What have we figured out so far?`

Expected structured state:

- Current task: driveline.
- Abnormal observation: rear U-joint play.
- Normal/ruled-out finding: carrier bearing acceptable.
- Confirmed finding: rear U-joint identified as vibration source.
- Timeline ordered by event sequence.
- Draft repair note built from the structured state.
- No canonical work-order mutation.

## Concurrency acceptance path

Submit the same `turnId` twice at the same time with different mocked extraction outputs.

Expected result:

- One `repair_session_documentation_turns` receipt.
- One coherent set of documentation events from the winning extraction.
- No mixed or contradictory event set.
- Both requests return the persisted assistant response.
