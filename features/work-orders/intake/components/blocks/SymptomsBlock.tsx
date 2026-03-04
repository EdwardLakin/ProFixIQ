import React from "react";
import type { IntakeV1 } from "../../types";

const systems: Array<{ v: IntakeV1["symptoms"]["primary_system"]; label: string }> =
  [
    { v: "engine", label: "Engine" },
    { v: "aftertreatment", label: "Aftertreatment/Emissions" },
    { v: "transmission", label: "Transmission" },
    { v: "drivetrain", label: "Drivetrain" },
    { v: "brakes", label: "Brakes" },
    { v: "suspension_steering", label: "Suspension/Steering" },
    { v: "electrical", label: "Electrical" },
    { v: "hvac", label: "HVAC" },
    { v: "tires_wheels", label: "Tires/Wheels" },
    { v: "body_chassis", label: "Body/Chassis" },
    { v: "pm_service", label: "PM Service" },
    { v: "inspection_only", label: "Inspection Only" },
    { v: "other", label: "Other" },
  ];

const types: Array<{ v: IntakeV1["symptoms"]["types"][number]; label: string }> = [
  { v: "warning_light", label: "Warning light" },
  { v: "fault_code", label: "Fault code" },
  { v: "noise", label: "Noise" },
  { v: "vibration", label: "Vibration" },
  { v: "leak", label: "Leak" },
  { v: "performance", label: "Performance" },
  { v: "starting", label: "Starting" },
  { v: "overheating", label: "Overheating" },
  { v: "fuel_economy", label: "Fuel economy" },
  { v: "visual_damage", label: "Visual damage" },
  { v: "other", label: "Other" },
];

export function SymptomsBlock(props: {
  intake: IntakeV1;
  onChange: (patch: Partial<IntakeV1["symptoms"]>) => void;
}) {
  const { intake, onChange } = props;

  const toggleType = (t: IntakeV1["symptoms"]["types"][number]) => {
    const set = new Set(intake.symptoms.types);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    const arr = Array.from(set);
    onChange({ types: arr.length ? arr : ["other"] });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Primary system</label>
        <select
          value={intake.symptoms.primary_system}
          onChange={(e) =>
            onChange({ primary_system: e.target.value as any })
          }
          style={{ padding: 12, borderRadius: 10, width: "100%" }}
        >
          {systems.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Symptom type(s)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {types.map((t) => {
            const active = intake.symptoms.types.includes(t.v);
            return (
              <button
                key={t.v}
                type="button"
                onClick={() => toggleType(t.v)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.15)",
                  opacity: active ? 1 : 0.7,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
