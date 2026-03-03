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

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Enter Customer &amp; Vehicle Info</h1>

      {/* Customer Info */}
      <div className="space-y-2">
        <input
          type="text"
          name="first_name"
          placeholder="First Name *"
          value={customer.first_name}
          onChange={(e) => handleChange(e, "customer")}
          className="input"
        />
        <input
          type="text"
          name="last_name"
          placeholder="Last Name *"
          value={customer.last_name}
          onChange={(e) => handleChange(e, "customer")}
          className="input"
        />
        <input
          type="text"
          name="phone"
          placeholder="Phone"
          value={customer.phone}
          onChange={(e) => handleChange(e, "customer")}
          className="input"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={customer.email}
          onChange={(e) => handleChange(e, "customer")}
          className="input"
        />
      </div>

      {/* Vehicle Info */}
      <div className="space-y-2">
        {/* Optional but useful for fleets */}
        <input
          type="text"
          name="unit_number"
          placeholder="Unit #"
          value={vehicle.unit_number}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        />

        <input
          type="text"
          name="year"
          placeholder="Year"
          value={vehicle.year}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
          inputMode="numeric"
        />
        <input
          type="text"
          name="make"
          placeholder="Make *"
          value={vehicle.make}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        />
        <input
          type="text"
          name="model"
          placeholder="Model *"
          value={vehicle.model}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        />
        <input
          type="text"
          name="vin"
          placeholder="VIN"
          value={vehicle.vin}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        />
        <input
          type="text"
          name="license_plate"
          placeholder="License Plate"
          value={vehicle.license_plate}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        />
        <input
          type="text"
          name="mileage"
          placeholder="Mileage"
          value={vehicle.mileage}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
          inputMode="numeric"
        />
        <input
          type="text"
          name="color"
          placeholder="Color"
          value={vehicle.color}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        />

        {/* ✅ added fields */}
        <input
          type="text"
          name="engine_hours"
          placeholder="Engine hours"
          value={vehicle.engine_hours}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
          inputMode="numeric"
        />

        <input
          type="text"
          name="engine"
          placeholder="Engine / Trim (e.g. 3.5L EcoBoost)"
          value={vehicle.engine}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        />

        <select
          name="transmission"
          value={vehicle.transmission}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        >
          <option value="">Select transmission</option>
          <option value="automatic">Automatic</option>
          <option value="manual">Manual</option>
          <option value="cvt">CVT</option>
          <option value="dct">Dual-clutch</option>
          <option value="other">Other</option>
        </select>

        <select
          name="fuel_type"
          value={vehicle.fuel_type}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        >
          <option value="">Select fuel type</option>
          <option value="gasoline">Gasoline</option>
          <option value="diesel">Diesel</option>
          <option value="hybrid">Hybrid</option>
          <option value="phev">Plug-in hybrid</option>
          <option value="ev">Electric (BEV)</option>
          <option value="other">Other</option>
        </select>

        <select
          name="drivetrain"
          value={vehicle.drivetrain}
          onChange={(e) => handleChange(e, "vehicle")}
          className="input"
        >
          <option value="">Select drivetrain</option>
          <option value="fwd">FWD</option>
          <option value="rwd">RWD</option>
          <option value="awd">AWD</option>
          <option value="4x4">4x4</option>
          <option value="other">Other</option>
        </select>
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold px-6 py-3 rounded w-full"
      >
        Start Inspection
      </button>
    </div>
  );
}