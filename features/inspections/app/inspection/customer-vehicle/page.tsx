//features/inspections/app/inspection/customer-vehicle/page

"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type CustomerState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
};

type VehicleState = {
  year: string;
  make: string;
  model: string;
  vin: string;
  license_plate: string;
  mileage: string;
  color: string;

  // ✅ added
  unit_number: string;
  engine_hours: string;
  engine: string;
  transmission: string;
  fuel_type: string;
  drivetrain: string;
};

export default function CustomerVehicleFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inspectionType = searchParams.get("inspectionType") || "maintenance50";

  const [customer, setCustomer] = useState<CustomerState>({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });

  const [vehicle, setVehicle] = useState<VehicleState>({
    year: "",
    make: "",
    model: "",
    vin: "",
    license_plate: "",
    mileage: "",
    color: "",

    unit_number: "",
    engine_hours: "",
    engine: "",
    transmission: "",
    fuel_type: "",
    drivetrain: "",
  });

  const requiredMissing = useMemo(() => {
    // Keep your original requirements, but include year if you want
    if (!customer.first_name) return "First name";
    if (!customer.last_name) return "Last name";
    if (!vehicle.make) return "Make";
    if (!vehicle.model) return "Model";
    return null;
  }, [customer.first_name, customer.last_name, vehicle.make, vehicle.model]);

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>,
    type: "customer" | "vehicle",
  ) => {
    const { name, value } = e.target;

    if (type === "customer") {
      setCustomer((prev) => ({ ...prev, [name]: value }));
    } else {
      setVehicle((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleStart = async () => {
    if (requiredMissing) {
      alert(`Please fill in all required fields. Missing: ${requiredMissing}`);
      return;
    }

    try {
      const res = await fetch("/api/inspection/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          vehicle: {
            ...vehicle,
            // normalize blanks to null-ish on server if you want; here we just send strings
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { inspectionId?: string; error?: string }
        | null;

      if (!res.ok) {
        throw new Error(data?.error || "Save failed");
      }

      if (!data?.inspectionId) {
        throw new Error("Save failed (missing inspectionId).");
      }

      // Save locally for inspection usage (includes new fields)
      localStorage.setItem("inspectionCustomer", JSON.stringify(customer));
      localStorage.setItem("inspectionVehicle", JSON.stringify(vehicle));

      // Navigate to inspection page with inspectionId
      router.push(`/inspection/${inspectionType}?id=${data.inspectionId}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to start inspection:", err);
      alert("Something went wrong while starting the inspection.");
    }
  };

  const pageShell =
    "mx-auto w-full max-w-5xl rounded-2xl border border-[var(--metal-border-soft,#334155)] " +
    "bg-[linear-gradient(180deg,rgba(6,10,18,0.94),rgba(2,6,14,0.98))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] md:p-6";
  const panel =
    "rounded-2xl border border-[var(--metal-border-soft,#334155)] " +
    "bg-[linear-gradient(180deg,rgba(8,14,24,0.88),rgba(2,6,12,0.95))] p-4";
  const inputBase =
    "w-full rounded-xl border border-[var(--metal-border-soft,#334155)] bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 " +
    "focus:outline-none focus:ring-2 focus:ring-slate-500/40";
  const selectBase =
    "w-full rounded-xl border border-[var(--metal-border-soft,#334155)] bg-slate-950/80 px-3 py-2 text-sm text-slate-100 " +
    "focus:outline-none focus:ring-2 focus:ring-slate-500/40";

  return (
    <div className="px-4 py-6 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.09),transparent_48%),radial-gradient(circle_at_bottom,rgba(3,7,18,0.96),#020617_80%)]"
      />

      <div className={pageShell}>
        <header className="mb-5 rounded-2xl border border-[var(--metal-border-soft,#334155)] bg-slate-950/60 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Inspection Intake</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-100 sm:text-2xl">
            Customer &amp; Vehicle Information
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Fill required fields to start the inspection flow.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panel}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Customer</h2>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-400">
                Required: name
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="text" name="first_name" placeholder="First Name *" value={customer.first_name} onChange={(e) => handleChange(e, "customer")} className={inputBase} />
              <input type="text" name="last_name" placeholder="Last Name *" value={customer.last_name} onChange={(e) => handleChange(e, "customer")} className={inputBase} />
              <input type="text" name="phone" placeholder="Phone" value={customer.phone} onChange={(e) => handleChange(e, "customer")} className={inputBase + " sm:col-span-2"} />
              <input type="email" name="email" placeholder="Email" value={customer.email} onChange={(e) => handleChange(e, "customer")} className={inputBase + " sm:col-span-2"} />
            </div>
          </section>

          <section className={panel}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Vehicle</h2>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-400">
                Required: make + model
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="text" name="unit_number" placeholder="Unit #" value={vehicle.unit_number} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} />
              <input type="text" name="year" placeholder="Year" value={vehicle.year} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} inputMode="numeric" />
              <input type="text" name="make" placeholder="Make *" value={vehicle.make} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} />
              <input type="text" name="model" placeholder="Model *" value={vehicle.model} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} />
              <input type="text" name="vin" placeholder="VIN" value={vehicle.vin} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} />
              <input type="text" name="license_plate" placeholder="License Plate" value={vehicle.license_plate} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} />
              <input type="text" name="mileage" placeholder="Mileage" value={vehicle.mileage} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} inputMode="numeric" />
              <input type="text" name="color" placeholder="Color" value={vehicle.color} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} />
              <input type="text" name="engine_hours" placeholder="Engine hours" value={vehicle.engine_hours} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} inputMode="numeric" />
              <input type="text" name="engine" placeholder="Engine / Trim (e.g. 3.5L EcoBoost)" value={vehicle.engine} onChange={(e) => handleChange(e, "vehicle")} className={inputBase} />
              <select name="transmission" value={vehicle.transmission} onChange={(e) => handleChange(e, "vehicle")} className={selectBase}>
                <option value="">Select transmission</option>
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
                <option value="cvt">CVT</option>
                <option value="dct">Dual-clutch</option>
                <option value="other">Other</option>
              </select>
              <select name="fuel_type" value={vehicle.fuel_type} onChange={(e) => handleChange(e, "vehicle")} className={selectBase}>
                <option value="">Select fuel type</option>
                <option value="gasoline">Gasoline</option>
                <option value="diesel">Diesel</option>
                <option value="hybrid">Hybrid</option>
                <option value="phev">Plug-in hybrid</option>
                <option value="ev">Electric (BEV)</option>
                <option value="other">Other</option>
              </select>
              <select name="drivetrain" value={vehicle.drivetrain} onChange={(e) => handleChange(e, "vehicle")} className={selectBase}>
                <option value="">Select drivetrain</option>
                <option value="fwd">FWD</option>
                <option value="rwd">RWD</option>
                <option value="awd">AWD</option>
                <option value="4x4">4x4</option>
                <option value="other">Other</option>
              </select>
            </div>
          </section>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--metal-border-soft,#334155)] bg-slate-950/60 px-4 py-3">
          <p className="text-xs text-slate-400">
            {requiredMissing ? `Missing required field: ${requiredMissing}` : "All required fields complete."}
          </p>
          <button
            type="button"
            onClick={handleStart}
            className="rounded-full bg-[linear-gradient(to_right,rgba(194,136,96,0.88),rgba(173,111,72,0.88))] px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black shadow-[0_0_18px_rgba(181,120,82,0.22)] hover:brightness-110"
          >
            Start Inspection
          </button>
        </div>
      </div>
    </div>
  );
}
