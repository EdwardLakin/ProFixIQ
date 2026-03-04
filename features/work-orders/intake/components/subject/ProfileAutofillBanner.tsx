import React from "react";

export function ProfileAutofillBanner(props: {
  customerName?: string | null;
  vehicleLabel?: string | null;
  onChangeVehicle?: () => void;
}) {
  const { customerName, vehicleLabel, onChangeVehicle } = props;

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 12,
        padding: 12,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 800 }}>Auto-filled from profile</div>
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {customerName ? `Customer: ${customerName}` : "Customer: (from profile)"}
      </div>
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {vehicleLabel ? `Vehicle: ${vehicleLabel}` : "Vehicle: (from selection)"}
      </div>
      {onChangeVehicle && (
        <button
          type="button"
          onClick={onChangeVehicle}
          style={{ marginTop: 6, padding: 10, borderRadius: 10 }}
        >
          Change vehicle
        </button>
      )}
    </div>
  );
}
