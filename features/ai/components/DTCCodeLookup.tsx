"use client";

import React, { useState } from "react";
import useVehicleInfo from "@shared/hooks/useVehicleInfo";

export default function DTCCodeLookup() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { vehicleInfo } = useVehicleInfo(); // ← use the correct property

  const handleSearch = async () => {
    if (!code || !vehicleInfo?.make || !vehicleInfo?.year || !vehicleInfo?.model) {
      alert("Please enter a DTC code and select a vehicle.");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          vehicle: vehicleInfo, // ← send the selected vehicle info
        }),
      });

      if (!res.ok) throw new Error("DTC lookup failed");

      const data = await res.json();
      setResult(data.result || "No info found for this code.");
    } catch (err) {
      console.error(err);
      setResult("An error occurred while looking up the DTC code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <label className="block mb-1 text-sm font-medium">Enter a DTC code (e.g., P0131)</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="P0131"
          className="border rounded p-2 w-48"
        />
        <button
          onClick={handleSearch}
          disabled={!code || isLoading}
          className="bg-accent text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </div>

      {result && (
        <div className="mt-4 p-4 border rounded bg-muted text-sm whitespace-pre-wrap">
          {result}
        </div>
      )}
    </div>
  );
}
