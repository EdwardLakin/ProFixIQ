import React from "react";
import type { IntakeV1 } from "../../types";
import { buildTechSummary } from "../../utils/summary";

export function ReviewSubmitBlock(props: {
  intake: IntakeV1;
  submitLabel?: string;
  onSubmit: () => void;
}) {
  const { intake, onSubmit, submitLabel } = props;
  const summary = buildTechSummary(intake);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 800 }}>Review</div>

      <div style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)" }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{summary.title}</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {summary.chips.map((c, i) => (
            <span
              key={i}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 12,
              }}
            >
              {c}
            </span>
          ))}
        </div>

        <div style={{ fontSize: 13, opacity: 0.85 }}>{summary.duplicationLine}</div>

        {!!summary.dtcs.length && (
          <div style={{ fontSize: 13, marginTop: 6 }}>DTCs: {summary.dtcs.join(", ")}</div>
        )}

        <div style={{ fontSize: 13, marginTop: 10, opacity: 0.85 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Customer words</div>
          <div>{summary.concernText}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        style={{ padding: 14, borderRadius: 12, fontWeight: 800 }}
      >
        {submitLabel ?? "Submit"}
      </button>
    </div>
  );
}
