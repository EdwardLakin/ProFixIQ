"use client";

import type { ChangeEvent } from "react";
import useVehicleInfo from "@shared/hooks/useVehicleInfo";

export default function VehicleSelector() {
  const { vehicleInfo, updateVehicle, clearVehicle } = useVehicleInfo();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    updateVehicle({
      year: name === "year" ? value : vehicleInfo?.year || "",
      make: name === "make" ? value : vehicleInfo?.make || "",
      model: name === "model" ? value : vehicleInfo?.model || "",
      engine: name === "engine" ? value : vehicleInfo?.engine || "",
      plate: name === "plate" ? value : vehicleInfo?.plate || "",
      id: vehicleInfo?.id || "",
    });
  };

  return (
    <div className="mb-6 space-y-4 text-left">
      <h3 className="text-xl font-semibold text-[var(--accent-copper-light)]">
        Vehicle Info
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <input
          type="text"
          name="year"
          placeholder="Year"
          value={vehicleInfo?.year || ""}
          onChange={handleChange}
          className="input"
        />
        <input
          type="text"
          name="make"
          placeholder="Make"
          value={vehicleInfo?.make || ""}
          onChange={handleChange}
          className="input"
        />
        <input
          type="text"
          name="model"
          placeholder="Model"
          value={vehicleInfo?.model || ""}
          onChange={handleChange}
          className="input"
        />
        <input
          type="text"
          name="engine"
          placeholder="Engine"
          value={vehicleInfo?.engine || ""}
          onChange={handleChange}
          className="input"
        />
        <input
          type="text"
          name="plate"
          placeholder="Plate"
          value={vehicleInfo?.plate || ""}
          onChange={handleChange}
          className="input"
        />
      </div>

      {vehicleInfo && (
        <button
          onClick={clearVehicle}
          className="text-sm text-[var(--accent-copper-light)] underline underline-offset-2 transition hover:text-white"
        >
          Change Vehicle
        </button>
      )}
    </div>
  );
}
