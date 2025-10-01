import React from "react";
import {
  SessionCustomer as CustomerInfo,
  SessionVehicle as VehicleInfo,
} from "@inspections/lib/inspection/types";

interface Props {
  customer: CustomerInfo;
  vehicle: VehicleInfo;
  onCustomerChange: (field: keyof CustomerInfo, value: string | null) => void;
  onVehicleChange: (field: keyof VehicleInfo, value: string | null) => void;

  /** Optional: “Save & Continue” to create/link the WO early */
  onSave?: () => void;
  saving?: boolean;
  workOrderExists?: boolean;

  /** NEW: optional Clear action (parent resets fields/ids/state) */
  onClear?: () => void;
}

export default function CustomerVehicleForm({
  customer,
  vehicle,
  onCustomerChange,
  onVehicleChange,
  onSave,
  saving = false,
  workOrderExists = false,
  onClear,
}: Props) {
  return (
    <div className="w-full max-w-3xl mx-auto text-white space-y-8">
      {/* Customer */}
      <h2 className="font-blackops text-xl border-b border-orange-400 pb-2">
        Customer Info
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input
          className="input"
          placeholder="First Name"
          value={customer.first_name ?? ""}
          onChange={(e) => onCustomerChange("first_name", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Last Name"
          value={customer.last_name ?? ""}
          onChange={(e) => onCustomerChange("last_name", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Phone"
          value={customer.phone ?? ""}
          onChange={(e) => onCustomerChange("phone", e.target.value || null)}
        />
        <input
          type="email"
          className="input"
          placeholder="Email"
          value={customer.email ?? ""}
          onChange={(e) => onCustomerChange("email", e.target.value || null)}
        />
        <input
          className="input sm:col-span-2"
          placeholder="Address"
          value={customer.address ?? ""}
          onChange={(e) => onCustomerChange("address", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="City"
          value={customer.city ?? ""}
          onChange={(e) => onCustomerChange("city", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Province"
          value={customer.province ?? ""}
          onChange={(e) => onCustomerChange("province", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Postal Code"
          value={customer.postal_code ?? ""}
          onChange={(e) => onCustomerChange("postal_code", e.target.value || null)}
        />
      </div>

      {/* Vehicle */}
      <h2 className="font-blackops text-xl border-b border-orange-400 pb-2">
        Vehicle Info
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input
          inputMode="numeric"
          className="input"
          placeholder="Year"
          value={vehicle.year ?? ""}
          onChange={(e) => onVehicleChange("year", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Make"
          value={vehicle.make ?? ""}
          onChange={(e) => onVehicleChange("make", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Model"
          value={vehicle.model ?? ""}
          onChange={(e) => onVehicleChange("model", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="VIN"
          value={vehicle.vin ?? ""}
          onChange={(e) => onVehicleChange("vin", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="License Plate"
          value={vehicle.license_plate ?? ""}
          onChange={(e) => onVehicleChange("license_plate", e.target.value || null)}
        />
        <input
          inputMode="numeric"
          className="input"
          placeholder="Mileage"
          value={vehicle.mileage ?? ""}
          onChange={(e) => onVehicleChange("mileage", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Color"
          value={vehicle.color ?? ""}
          onChange={(e) => onVehicleChange("color", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Unit #"
          value={vehicle.unit_number ?? ""}
          onChange={(e) => onVehicleChange("unit_number", e.target.value || null)}
        />
        <input
          inputMode="numeric"
          className="input"
          placeholder="Engine Hours"
          value={vehicle.engine_hours ?? ""}
          onChange={(e) => onVehicleChange("engine_hours", e.target.value || null)}
        />
      </div>

      {/* Actions */}
      {(onSave || onClear) && (
        <div className="pt-2 flex flex-wrap items-center gap-3">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="btn btn-orange disabled:opacity-60"
              title={workOrderExists ? "Update Work Order with these details" : "Create Work Order with these details"}
            >
              {saving ? "Saving…" : workOrderExists ? "Update & Continue" : "Save & Continue"}
            </button>
          )}

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-red-500"
              title="Clear Customer & Vehicle fields (does not delete an existing Work Order)"
            >
              Clear
            </button>
          )}

          {workOrderExists ? (
            <span className="text-xs text-neutral-400">
              Work order already exists — you can add lines now.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}