// features/work-orders/mobile/MobileCustomerVehicleForm.tsx
"use client";

import type React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { MobileCustomer, MobileVehicle } from "./types";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

type Props = {
  wo: WorkOrderRow | null;
  customer: MobileCustomer;
  vehicle: MobileVehicle;
  onCustomerChange: React.Dispatch<React.SetStateAction<MobileCustomer>>;
  onVehicleChange: React.Dispatch<React.SetStateAction<MobileVehicle>>;
  supabase: SupabaseClient<DB>; // kept for future lookups
};

export function MobileCustomerVehicleForm({
  wo,
  customer,
  vehicle,
  onCustomerChange,
  onVehicleChange,
}: Props) {
  const woLabel = wo?.custom_id ?? (wo ? wo.id.slice(0, 8) : null);

  const inputBase =
    "w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white " +
    "placeholder:text-neutral-400 focus:border-[var(--accent-copper-light)] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]";

  const inputTight =
    "w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm text-white " +
    "placeholder:text-neutral-400 focus:border-[var(--accent-copper-light)] " +
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]";

  const labelClass = "text-[11px] uppercase tracking-[0.16em] text-neutral-400";

  return (
    <div className="glass-card space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            Customer &amp; Vehicle
          </h2>
          <p className="text-[11px] text-neutral-400">
            Quick capture for the counter — you can refine later.
          </p>
        </div>
        {woLabel && (
          <span className="glass-chip font-mono text-[10px]">
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
        </div>
      </div>
    </div>
  );
}