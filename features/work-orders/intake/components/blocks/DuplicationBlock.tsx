import React from "react";
import type { IntakeV1 } from "../../types";

export function DuplicationBlock(props: {
  intake: IntakeV1;
  onChange: (patch: Partial<IntakeV1["duplication"]>) => void;
}) {
  const { intake, onChange } = props;

  const setDuplicable = (v: IntakeV1["duplication"]["duplicable"]) => {
    onChange({
      duplicable: v,
      conditions:
        v === "yes"
          ? intake.duplication.conditions ?? {
              temperature: null,
              driving_state: null,
              speed_kph_min: null,
              speed_kph_max: null,
              frequency: null,
              notes: null,
            }
          : null,
    });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ fontWeight: 800 }}>Can the concern be duplicated?</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["yes", "no", "unsure"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setDuplicable(v)}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.15)",
              opacity: intake.duplication.duplicable === v ? 1 : 0.65,
            }}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      {intake.duplication.duplicable === "no" && (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontWeight: 600 }}>
            When did it last occur? (optional)
          </label>
          <input
            value={intake.duplication.last_occurred_at ?? ""}
            onChange={(e) => onChange({ last_occurred_at: e.target.value })}
            placeholder="2026-02-24 (or approximate)"
            style={{ padding: 12, borderRadius: 10, width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
