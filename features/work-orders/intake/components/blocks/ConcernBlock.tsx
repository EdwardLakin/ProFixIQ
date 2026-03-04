import React from "react";
import type { IntakeV1 } from "../../types";

export function ConcernBlock(props: {
  intake: IntakeV1;
  onChange: (patch: Partial<IntakeV1["concern"]>) => void;
}) {
  const { intake, onChange } = props;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ fontWeight: 700 }}>What’s going on? (required)</label>
      <textarea
        value={intake.concern.primary_text}
        onChange={(e) => onChange({ primary_text: e.target.value })}
        placeholder="Describe the concern in your own words…"
        rows={5}
        style={{ padding: 12, borderRadius: 10, width: "100%" }}
      />
      <label style={{ fontWeight: 600, opacity: 0.85 }}>
        Anything else? (optional)
      </label>
      <textarea
        value={intake.concern.additional_text ?? ""}
        onChange={(e) => onChange({ additional_text: e.target.value })}
        placeholder="Extra details…"
        rows={3}
        style={{ padding: 12, borderRadius: 10, width: "100%" }}
      />
    </div>
  );
}
