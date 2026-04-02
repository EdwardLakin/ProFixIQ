"use client";

import useVehicleInfo from "@shared/hooks/useVehicleInfo";

export default function VehicleSelector() {
  const { vehicleInfo, updateVehicle, clearVehicle } = useVehicleInfo();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;

    updateVehicle({
      year: vehicleInfo?.year || "",
      make: vehicleInfo?.make || "",
      model: vehicleInfo?.model || "",
      engine: vehicleInfo?.engine || "",
      plate: vehicleInfo?.plate || "",
      id: value,
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
          className="w-full rounded-md border border-white/10 bg-[var(--glass-bg)] p-3 text-white placeholder:text-neutral-500"
        />
        <input
          type="text"
          name="make"
          placeholder="Make"
          value={vehicleInfo?.make || ""}
          onChange={handleChange}
          className="w-full rounded-md border border-white/10 bg-[var(--glass-bg)] p-3 text-white placeholder:text-neutral-500"
        />
        <input
          type="text"
          name="model"
          placeholder="Model"
          value={vehicleInfo?.model || ""}
          onChange={handleChange}
          className="w-full rounded-md border border-white/10 bg-[var(--glass-bg)] p-3 text-white placeholder:text-neutral-500"
        />
        <input
          type="text"
          name="engine"
          placeholder="Engine"
          value={vehicleInfo?.engine || ""}
          onChange={handleChange}
          className="w-full rounded-md border border-white/10 bg-[var(--glass-bg)] p-3 text-white placeholder:text-neutral-500"
        />
        <input
          type="text"
          name="plate"
          placeholder="Plate"
          value={vehicleInfo?.plate || ""}
          onChange={handleChange}
          className="w-full rounded-md border border-white/10 bg-[var(--glass-bg)] p-3 text-white placeholder:text-neutral-500"
        />
      </div>

      {vehicleInfo && (
        <button
          onClick={clearVehicle}
          className="mt-2 text-sm font-medium text-[var(--accent-copper-light)] underline underline-offset-2 hover:text-white"
        >
          Change Vehicle
        </button>
      )}
    </div>
  );
}
