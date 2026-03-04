import React from "react";
import type { IntakeV1 } from "../../types";

export function ConditionsBlock(props: {
  intake: IntakeV1;
  onChange: (conditions: NonNullable<IntakeV1["duplication"]["conditions"]>) => void;
}) {
  const { intake, onChange } = props;

  if (intake.duplication.duplicable !== "yes") {
    return (
      <div style={{ opacity: 0.7 }}>
        Conditions are only needed if the concern can be duplicated.
      </div>
    );
  }

  const c = intake.duplication.conditions ?? {
    temperature: null,
    driving_state: null,
    speed_kph_min: null,
    speed_kph_max: null,
    frequency: null,
    notes: null,
  };

  const toggle = <T extends string>(arr: T[] | null | undefined, v: T) => {
    const set = new Set(arr ?? []);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    return Array.from(set);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 800 }}>Under what conditions?</label>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Optional but very helpful for diagnosis.
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Temperature / state</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["cold", "hot", "after_sitting", "during_regen"] as const).map(
            (v) => (
              <button
                key={v}
                type="button"
                onClick={() =>
                  onChange({ ...c, temperature: toggle(c.temperature, v) })
                }
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.15)",
                  opacity: (c.temperature ?? []).includes(v) ? 1 : 0.65,
                }}
              >
                {v.replace("_", " ")}
              </button>
            ),
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Driving state</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            ["idle", "accel", "decel", "cruise", "under_load", "braking", "turning"] as const
          ).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() =>
                onChange({ ...c, driving_state: toggle(c.driving_state, v) })
              }
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.15)",
                opacity: (c.driving_state ?? []).includes(v) ? 1 : 0.65,
              }}
            >
              {v.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Speed range (km/h)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            inputMode="numeric"
            placeholder="Min"
            value={c.speed_kph_min ?? ""}
            onChange={(e) =>
              onChange({
                ...c,
                speed_kph_min: e.target.value ? Number(e.target.value) : null,
              })
            }
            style={{ padding: 12, borderRadius: 10, width: "100%" }}
          />
          <input
            inputMode="numeric"
            placeholder="Max"
            value={c.speed_kph_max ?? ""}
            onChange={(e) =>
              onChange({
                ...c,
                speed_kph_max: e.target.value ? Number(e.target.value) : null,
              })
            }
            style={{ padding: 12, borderRadius: 10, width: "100%" }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Frequency</label>
        <select
          value={c.frequency ?? ""}
          onChange={(e) =>
            onChange({
              ...c,
              frequency: (e.target.value || null) as any,
            })
          }
          style={{ padding: 12, borderRadius: 10, width: "100%" }}
        >
          <option value="">Select (optional)</option>
          <option value="every_time">Every time</option>
          <option value="most_times">Most of the time</option>
          <option value="occasionally">Occasionally</option>
          <option value="once">Once only</option>
        </select>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Notes (optional)</label>
        <textarea
          rows={3}
          value={c.notes ?? ""}
          onChange={(e) => onChange({ ...c, notes: e.target.value })}
          placeholder="Anything specific the tech should try to reproduce it?"
          style={{ padding: 12, borderRadius: 10, width: "100%" }}
        />
      </div>
    </div>
  );
}
