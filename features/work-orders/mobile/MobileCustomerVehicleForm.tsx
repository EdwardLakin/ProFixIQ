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
  supabase: SupabaseClient<DB>; // passed in for future use (lookups, etc.)
};

export function MobileCustomerVehicleForm({
  wo,
  customer,
  vehicle,
  onCustomerChange,
  onVehicleChange,
}: Props) {
  const woLabel = wo?.custom_id ?? (wo ? wo.id.slice(0, 8) : null);

  return (
    <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            Customer & Vehicle
          </h2>
          <p className="text-[11px] text-neutral-500">
            Quick capture for the counter — you can refine later.
          </p>
        </div>
        {woLabel && (
          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] font-mono text-neutral-300">
            WO {woLabel}
          </span>
        )}
      </div>

      {/* Customer */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Customer
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] text-neutral-300">
                First name
              </label>
              <input
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
              <label className="text-[11px] text-neutral-300">
                Last name
              </label>
              <input
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
            <label className="text-[11px] text-neutral-300">Phone</label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
            <label className="text-[11px] text-neutral-300">Email</label>
            <input
              type="email"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Vehicle
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <div className="flex gap-2">
            <div className="w-20 space-y-1">
              <label className="text-[11px] text-neutral-300">Year</label>
              <input
                inputMode="numeric"
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
              <label className="text-[11px] text-neutral-300">Make</label>
              <input
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
              <label className="text-[11px] text-neutral-300">Model</label>
              <input
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
            <label className="text-[11px] text-neutral-300">
              License plate
            </label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
            <label className="text-[11px] text-neutral-300">
              Odometer / mileage
            </label>
            <input
              inputMode="numeric"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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