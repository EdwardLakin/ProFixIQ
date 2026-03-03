// /features/work-orders/mobile/MobileCustomerVehicleForm.tsx (FULL FILE REPLACEMENT)
// ✅ Theme alignment + add missing vehicle fields (unit/color/engine hours/engine/trans/fuel/drivetrain)
// ❗ No save logic changes; only updates local state via onVehicleChange

"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { MobileCustomer, MobileVehicle } from "./types";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

type Props = {
  wo: WorkOrderRow | null;
  customer: MobileCustomer;
  vehicle: MobileVehicle;
  onCustomerChange: Dispatch<SetStateAction<MobileCustomer>>;
  onVehicleChange: Dispatch<SetStateAction<MobileVehicle>>;
  supabase: SupabaseClient<DB>; // kept for future lookups
};

export function MobileCustomerVehicleForm({
  wo,
  customer,
  vehicle,
  onCustomerChange,
  onVehicleChange,
}: Props): JSX.Element {
  const woLabel = wo?.custom_id ?? (wo ? wo.id.slice(0, 8) : null);

  const inputBase =
    "w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white " +
    "placeholder:text-neutral-400 focus:border-[var(--accent-copper-light)] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]";

  const inputTight =
    "w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm text-white " +
    "placeholder:text-neutral-400 focus:border-[var(--accent-copper-light)] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]";

  const labelClass =
    "text-[11px] uppercase tracking-[0.16em] text-neutral-400";

  return (
    <div className="glass-card rounded-2xl border border-white/12 bg-black/40 p-4 space-y-6 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            Customer &amp; Vehicle
          </h2>
          <p className="text-[11px] text-neutral-400">
            Full customer and unit details for this work order.
          </p>
        </div>

        {woLabel && (
          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-neutral-300">
            WO&nbsp;{woLabel}
          </span>
        )}
      </div>

      {/* Customer */}
      <div className="space-y-3">
        <h3 className={labelClass}>Customer</h3>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className={labelClass}>First name</label>
              <input
                className={inputBase}
                value={customer.first_name ?? ""}
                onChange={(e) =>
                  onCustomerChange((prev) => ({
                    ...prev,
                    first_name: e.target.value || null,
                  }))
                }
                placeholder="First"
              />
            </div>

            <div className="flex-1 space-y-1">
              <label className={labelClass}>Last name</label>
              <input
                className={inputBase}
                value={customer.last_name ?? ""}
                onChange={(e) =>
                  onCustomerChange((prev) => ({
                    ...prev,
                    last_name: e.target.value || null,
                  }))
                }
                placeholder="Last"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Phone</label>
            <input
              className={inputBase}
              value={customer.phone ?? ""}
              onChange={(e) =>
                onCustomerChange((prev) => ({
                  ...prev,
                  phone: e.target.value || null,
                }))
              }
              placeholder="Mobile"
            />
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputBase}
              value={customer.email ?? ""}
              onChange={(e) =>
                onCustomerChange((prev) => ({
                  ...prev,
                  email: e.target.value || null,
                }))
              }
              placeholder="name@example.com"
            />
          </div>
        </div>
      </div>

      {/* Vehicle */}
      <div className="space-y-3">
        <h3 className={labelClass}>Vehicle</h3>

        <div className="grid grid-cols-1 gap-3">
          {/* Year/Make/Model */}
          <div className="flex gap-2">
            <div className="w-20 space-y-1">
              <label className={labelClass}>Year</label>
              <input
                inputMode="numeric"
                className={inputTight}
                value={vehicle.year ?? ""}
                onChange={(e) =>
                  onVehicleChange((prev) => ({
                    ...prev,
                    year: e.target.value || null,
                  }))
                }
                placeholder="YYYY"
              />
            </div>

            <div className="flex-1 space-y-1">
              <label className={labelClass}>Make</label>
              <input
                className={inputBase}
                value={vehicle.make ?? ""}
                onChange={(e) =>
                  onVehicleChange((prev) => ({
                    ...prev,
                    make: e.target.value || null,
                  }))
                }
                placeholder="Ford, Kenworth…"
              />
            </div>

            <div className="flex-1 space-y-1">
              <label className={labelClass}>Model</label>
              <input
                className={inputBase}
                value={vehicle.model ?? ""}
                onChange={(e) =>
                  onVehicleChange((prev) => ({
                    ...prev,
                    model: e.target.value || null,
                  }))
                }
                placeholder="F-150, T800…"
              />
            </div>
          </div>

          {/* Unit / Color */}
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className={labelClass}>Unit #</label>
              <input
                className={inputBase}
                value={vehicle.unit_number ?? ""}
                onChange={(e) =>
                  onVehicleChange((prev) => ({
                    ...prev,
                    unit_number: e.target.value || null,
                  }))
                }
                placeholder="Unit / Asset #"
              />
            </div>

            <div className="flex-1 space-y-1">
              <label className={labelClass}>Color</label>
              <input
                className={inputBase}
                value={vehicle.color ?? ""}
                onChange={(e) =>
                  onVehicleChange((prev) => ({
                    ...prev,
                    color: e.target.value || null,
                  }))
                }
                placeholder="White, Blue…"
              />
            </div>
          </div>

          {/* VIN */}
          <div className="space-y-1">
            <label className={labelClass}>VIN</label>
            <input
              className={inputBase}
              value={vehicle.vin ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  vin: e.target.value || null,
                }))
              }
              placeholder="17-character VIN"
            />
          </div>

          {/* Plate */}
          <div className="space-y-1">
            <label className={labelClass}>License plate</label>
            <input
              className={inputBase}
              value={vehicle.license_plate ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  license_plate: e.target.value || null,
                }))
              }
              placeholder="ABC 123"
            />
          </div>

          {/* Mileage */}
          <div className="space-y-1">
            <label className={labelClass}>Odometer / mileage</label>
            <input
              inputMode="numeric"
              className={inputBase}
              value={vehicle.mileage ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  mileage: e.target.value || null,
                }))
              }
              placeholder="km or mi"
            />
          </div>

          {/* Engine hours */}
          <div className="space-y-1">
            <label className={labelClass}>Engine hours</label>
            <input
              inputMode="numeric"
              className={inputBase}
              value={vehicle.engine_hours ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  engine_hours: e.target.value || null,
                }))
              }
              placeholder="Hours"
            />
          </div>

          {/* Engine / Trim */}
          <div className="space-y-1">
            <label className={labelClass}>Engine / Trim</label>
            <input
              className={inputBase}
              value={vehicle.engine ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  engine: e.target.value || null,
                }))
              }
              placeholder="e.g. 3.5L EcoBoost"
            />
          </div>

          {/* Transmission */}
          <div className="space-y-1">
            <label className={labelClass}>Transmission</label>
            <select
              className={inputBase}
              value={vehicle.transmission ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  transmission: e.target.value || null,
                }))
              }
            >
              <option value="">Select transmission</option>
              <option value="automatic">Automatic</option>
              <option value="manual">Manual</option>
              <option value="cvt">CVT</option>
              <option value="dct">Dual-clutch</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Fuel type */}
          <div className="space-y-1">
            <label className={labelClass}>Fuel type</label>
            <select
              className={inputBase}
              value={vehicle.fuel_type ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  fuel_type: e.target.value || null,
                }))
              }
            >
              <option value="">Select fuel type</option>
              <option value="gasoline">Gasoline</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="phev">Plug-in hybrid</option>
              <option value="ev">Electric (BEV)</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Drivetrain */}
          <div className="space-y-1">
            <label className={labelClass}>Drivetrain</label>
            <select
              className={inputBase}
              value={vehicle.drivetrain ?? ""}
              onChange={(e) =>
                onVehicleChange((prev) => ({
                  ...prev,
                  drivetrain: e.target.value || null,
                }))
              }
            >
              <option value="">Select drivetrain</option>
              <option value="fwd">FWD</option>
              <option value="rwd">RWD</option>
              <option value="awd">AWD</option>
              <option value="4x4">4x4</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MobileCustomerVehicleForm;