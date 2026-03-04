import React from "react";

type Vehicle = { vehicle_id: string; label: string };

export function VehicleSelect(props: {
  vehicles: Vehicle[];
  value: string | null;
  onChange: (vehicle_id: string) => void;
}) {
  const { vehicles, value, onChange } = props;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ fontWeight: 600 }}>Vehicle</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 12, borderRadius: 10, width: "100%" }}
      >
        <option value="" disabled>
          Select a vehicle
        </option>
        {vehicles.map((v) => (
          <option key={v.vehicle_id} value={v.vehicle_id}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}
