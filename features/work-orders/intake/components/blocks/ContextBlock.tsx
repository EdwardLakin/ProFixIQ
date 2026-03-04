// features/work-orders/intake/components/blocks/ContextBlock.tsx (FULL FILE REPLACEMENT)
import React from "react";
import type { IntakeV1 } from "../../types";

type Ctx = NonNullable<IntakeV1["context"]>;
type RecentEvent = NonNullable<Ctx["recent_events"]>[number];

const RECENT_EVENTS: ReadonlyArray<RecentEvent> = [
  "breakdown",
  "tow",
  "accident",
  "jump_start",
  "fuel_contamination",
  // If you want this, add it to the IntakeV1 type first:
  // "regen_event",
];

export function ContextBlock(props: {
  intake: IntakeV1;
  onChange: (patch: NonNullable<IntakeV1["context"]>) => void;
}) {
  const ctx: Ctx = props.intake.context ?? {
    recent_events: null,
    smells_smoke_sounds: null,
    parked_extended: null,
    last_service_note: null,
    previous_recommendations_declined: null,
  };

  const toggleEvent = (v: RecentEvent) => {
    const set = new Set(ctx.recent_events ?? []);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    props.onChange({ ...ctx, recent_events: Array.from(set) });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ fontWeight: 800 }}>Context (optional)</label>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Recent events</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RECENT_EVENTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toggleEvent(v)}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.15)",
                opacity: (ctx.recent_events ?? []).includes(v) ? 1 : 0.65,
              }}
            >
              {v.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Smells / smoke / sounds</label>
        <textarea
          rows={3}
          value={ctx.smells_smoke_sounds ?? ""}
          onChange={(e) => props.onChange({ ...ctx, smells_smoke_sounds: e.target.value })}
          placeholder="Optional details…"
          style={{ padding: 12, borderRadius: 10, width: "100%" }}
        />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Parked for extended time?</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => props.onChange({ ...ctx, parked_extended: true })}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              opacity: ctx.parked_extended === true ? 1 : 0.6,
            }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => props.onChange({ ...ctx, parked_extended: false })}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              opacity: ctx.parked_extended === false ? 1 : 0.6,
            }}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => props.onChange({ ...ctx, parked_extended: null })}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              opacity: ctx.parked_extended == null ? 1 : 0.6,
            }}
          >
            Unsure
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Last service note (optional)</label>
        <textarea
          rows={2}
          value={ctx.last_service_note ?? ""}
          onChange={(e) => props.onChange({ ...ctx, last_service_note: e.target.value })}
          placeholder="Optional…"
          style={{ padding: 12, borderRadius: 10, width: "100%" }}
        />
      </div>
    </div>
  );
}