# Technician CoPilot V2 — Phase 3

## Scope

Phase 3 separates the active collaborator from the background documentation engine.

```text
Technician message
  ├─> CoPilot reasoning model ─> natural response
  └─> Silent documentation model
        ├─> strict event validation
        ├─> provenance enrichment
        ├─> semantic fingerprinting
        ├─> replay-safe deduplication
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
semantic documentationFingerprint
```

The event ledger remains authoritative. The repair note and timeline are deterministic projections and can be rebuilt from the ledger at any time. Model and prompt provenance remain attached to the source event even when the projected repair note changes later.

## Deduplication and repeatable events

A semantic fingerprint is generated from the event type and its material fields. The deduplication policy distinguishes durable facts from repeatable repair occurrences:

- A partial retry of the same `sourceTurnId` cannot append the same event twice.
- Stable narrative facts such as the same observation or diagnostic finding are deduplicated across the session.
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

## Feature flags

The existing `technician_copilot_text` capability remains the umbrella gate.

Phase 3 adds an optional override:

```text
technician_copilot_documentation
technician_copilot_documentation:<profile-id>
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

No database migration is required. The existing private Repair Session event ledger already supports additive event types.

Rollback options:

1. Disable `technician_copilot_documentation` for a technician or shop.
2. Disable `technician_copilot_text` to remove the complete preview.
3. Revert the application release; all stored events remain valid generic Repair Session events.

Existing work-order, mobile, inspection, parts, labor, and voice workflows remain unchanged.

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
