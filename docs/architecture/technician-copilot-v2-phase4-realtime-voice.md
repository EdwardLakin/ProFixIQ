# Technician CoPilot V2 — Phase 4 Realtime Voice Bridge

## Scope

Phase 4 attaches the proven technician Repair Session collaborator to the existing OpenAI Realtime transcription transport without reintroducing the legacy voice-command architecture.

The runtime path is:

```text
Technician microphone
  -> existing OpenAI Realtime transcription transport
  -> server VAD final utterance
  -> Technician Interaction Gateway
  -> authenticated Technician CoPilot chat API
  -> existing text CoPilot turn runtime
  -> Repair Session event ledger
  -> deterministic structured repair context
  -> CoPilot reasoning + silent documentation
  -> persisted assistant reply
  -> spoken reply
  -> resume Realtime listening
```

Text and voice therefore share one collaborator, one Repair Session, one authorization boundary, and one ordered event history.

## Interaction model

This first bridge is deliberately turn-based duplex.

1. Technician explicitly starts voice mode.
2. Realtime transcription owns the microphone while the technician speaks.
3. Server VAD finalizes an utterance.
4. The gateway stops microphone capture before the CoPilot turn is executed.
5. The finalized transcript is submitted to `/api/copilot/technician/chat` with `inputMode = voice`.
6. The existing CoPilot runtime rebuilds Repair Session context, reasons, and runs silent documentation exactly as it does for text.
7. The technician utterance is persisted as `conversation.user` with event source `voice`.
8. The persisted assistant reply is spoken to the technician.
9. After speech ends, Realtime listening resumes automatically.

Pausing the microphone while the reply is spoken prevents the first implementation from transcribing its own speaker output.

## Spoken output

Phase 4 uses browser/device speech synthesis for the output bridge. The generated text is still the persisted reply produced by the existing Technician CoPilot runtime; the speech layer does not create or alter reasoning.

If speech synthesis is unavailable, the reply remains visible in the same conversation and the gateway resumes listening.

This output transport is intentionally replaceable. A later full-duplex slice may use a dedicated streamed audio output path without changing Repair Session semantics or allowing a second model to become the repair brain.

## Interruption

The preview exposes an explicit `Interrupt reply` control while the CoPilot is speaking. Interrupting cancels speech and immediately returns the gateway to listening mode.

True acoustic barge-in is not claimed in this slice. It requires simultaneous output/input echo control and dedicated interruption tests before the microphone can remain open during spoken output.

## Stale-turn protection

Every voice-mode start receives a new local generation. Stopping or restarting voice invalidates the prior generation.

If an earlier CoPilot request finishes after the technician has stopped or restarted voice, that stale reply is discarded and cannot speak into the new session. Speech completion callbacks are also generation-scoped so an old cancelled utterance cannot restart the microphone a second time.

## Turn serialization

The preview permits one interaction surface at a time:

- while voice mode is active, typed submission is disabled;
- while a typed turn is processing, voice mode cannot be started;
- while a voice turn is processing or speaking, the microphone remains controlled by the voice gateway.

This keeps client-side context progression sequential. Server-side Repair Session ordering and idempotency remain the authoritative persistence boundary.

## Rollout and authorization

Voice is a separate default-closed capability:

- `technician_copilot_voice`
- `technician_copilot_voice:<technician-profile-uuid>`

A voice turn is rejected by the authenticated chat API unless the resolved technician has the voice capability. The normal text capability remains required by the existing Technician CoPilot access boundary.

The capability schema migration only expands the existing certified CoPilot capability constraint to admit the voice flag and UUID-scoped voice overrides. It does not change work-order, labor, parts, inspection, billing, approval, evidence, or customer permissions.

The generic Realtime token endpoint remains a transport primitive used elsewhere in ProFixIQ. Possession of a transcription token does not grant Technician CoPilot authority; all Repair Session access and voice turns continue through the technician-authenticated CoPilot API.

## Existing voice systems

Phase 4 does not route through the legacy `VoiceProvider`, command phrase rewrites, wake-word command gate, or generic ops-agent planner.

The existing inspection Realtime hook is reused behind a new shared transcription seam so the CoPilot does not directly depend on inspection UI semantics. Moving the proven low-level transport into a fully shared audio package can happen later without changing this gateway contract.

## Safety and rollback

- No canonical work-order mutation behavior changes.
- No work-order, labor, parts, inspection, approval, billing, or customer-facing action is added by this slice.
- Existing text CoPilot and silent documentation behavior remains available when voice is off.
- Voice defaults disabled until its capability flag is explicitly enabled.
- Disabling `technician_copilot_voice` removes the voice surface without invalidating Repair Session data.
- Existing inspection and dictation voice consumers remain unchanged.

## Acceptance path

With voice enabled for one technician, the target smoke sequence is spoken rather than typed:

1. `Start the Ford.`
2. `Read me the complaint.`
3. `I'm checking the driveline.`
4. `Rear U-joint has play.`
5. `Carrier bearing looks okay.`
6. `What have we figured out so far?`

Expected result:

- one persistent Repair Session;
- the same assigned Ford and work-order line as the text acceptance path;
- voice-sourced user conversation events;
- the same structured task, observations, documentation, and timeline as text;
- spoken CoPilot responses derived from persisted Repair Session context;
- no legacy voice command parser involved.

## Next slice

After this bridge is proven on-device, the next voice slice is true hands-free duplex behavior:

- acoustic barge-in;
- output interruption from detected technician speech;
- robust echo/self-transcription suppression;
- connection/session resume without audible duplication;
- longer shop-floor listening sessions and device/background behavior;
- latency and transcription-quality evaluation in noisy bays.

That slice must preserve the same Technician Interaction Gateway and Repair Session contracts established here.
