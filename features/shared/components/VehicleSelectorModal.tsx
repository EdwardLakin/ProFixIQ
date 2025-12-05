"use client";

import { useState } from "react";
import useVehicleInfo from "@shared/hooks/useVehicleInfo";

const VehicleSelectorModal = () => {
  const { vehicleInfo, updateVehicle, clearVehicle } = useVehicleInfo();

  const [manualYear, setManualYear] = useState("");
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [vin, setVin] = useState("");
  const [useVin, setUseVin] = useState(false);

  const handleManualSubmit = () => {
    if (manualYear && manualMake && manualModel) {
      updateVehicle({
        id: "",
        year: manualYear,
        make: manualMake,
        model: manualModel,
        plate: "",
        engine: "",
      });
    }
  };

  const handleVinSubmit = async () => {
    if (!vin) return;
    try {
      const res = await fetch(`/api/decodeVin?vin=${vin}`);
      const data = await res.json();
      if (data && data.make && data.model && data.year) {
        updateVehicle({
          id: "",
          year: data.year,
          make: data.make,
          model: data.model,
          plate: "",
          engine: "",
        });
      }
    } catch (err) {
      console.error("VIN decoding failed:", err);
    }
  };

  return (
    <div className="bg-white/10 rounded-xl p-6 shadow-xl w-full max-w-lg mx-auto mt-8 backdrop-blur">
      <h2 className="text-2xl font-black text-white font-blackops text-center mb-4">
        Vehicle Info
      </h2>
      <div className="flex justify-center mb-4">
        <button
          onClick={() => setUseVin(false)}
          className={`px-4 py-2 mx-2 rounded ${!useVin ? "bg-white text-black" : "bg-gray-800 text-white"}`}
        >
          Manual
        </button>
        <button
          onClick={() => setUseVin(true)}
          className={`px-4 py-2 mx-2 rounded ${useVin ? "bg-white text-black" : "bg-gray-800 text-white"}`}
        >
          VIN
        </button>
      </div>

      {useVin ? (
        <>
          <input
            className="w-full p-2 rounded mb-2 text-black"
            placeholder="Enter VIN"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
          />
          <button
            onClick={handleVinSubmit}
            className="bg-blue-600 text-white w-full py-2 rounded font-blackops"
          >
            Decode VIN
          </button>
        </>
      ) : (
        <>
          <input
            className="w-full p-2 rounded mb-2 text-black"
            placeholder="Year"
            value={manualYear}
            onChange={(e) => setManualYear(e.target.value)}
          />
          <input
            className="w-full p-2 rounded mb-2 text-black"
            placeholder="Make"
            value={manualMake}
            onChange={(e) => setManualMake(e.target.value)}
          />
          <input
            className="w-full p-2 rounded mb-4 text-black"
            placeholder="Model"
            value={manualModel}
            onChange={(e) => setManualModel(e.target.value)}
          />
          <button
            onClick={handleManualSubmit}
            className="bg-blue-600 text-white w-full py-2 rounded font-blackops"
          >
            Set Vehicle
          </button>
        </>
      )}

      {vehicleInfo?.make && (
        <button
          onClick={clearVehicle}
          className="mt-4 text-sm text-red-500 underline w-full"
        >
          Clear Vehicle
        </button>
      )}
    </div>
  );
};

export default VehicleSelectorModal;
