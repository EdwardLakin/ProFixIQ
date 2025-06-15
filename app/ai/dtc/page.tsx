"use client";

import { useState } from "react";
import { useVehicleInfo } from "@hooks/useVehicleInfo";
import VehicleSelector from "@components/VehicleSelector";
import { diagnoseDTC } from "@lib/techBot";

export default function DTCCodeLookupPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!vehicleInfo || !dtcCode.trim()) {
      setError("Please enter a DTC code and select a vehicle.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await diagnoseDTC({
        vehicle: vehicleInfo,
        dtc: dtcCode.trim(),
      });

      setResult(response);
    } catch (err) {
      console.error(err);
      setError("Failed to retrieve diagnosis.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">DTC Code Lookup</h1>

      <VehicleSelector />

      <input
        type="text"
        placeholder="Enter DTC code (e.g., P0171)"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded"
      />

      <button
        onClick={handleSubmit}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        disabled={loading}
      >
        {loading ? "Looking up..." : "Lookup DTC"}
      </button>

      {error && <p className="text-red-500">{error}</p>}
      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded shadow">
          <h2 className="font-semibold mb-2">AI Diagnosis:</h2>
          <pre className="whitespace-pre-wrap text-sm">{result}</pre>
        </div>
      )}
    </div>
  );
}
