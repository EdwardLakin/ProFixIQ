"use client";

import { useState } from "react";
import useVehicleInfo from "@shared/hooks/useVehicleInfo";
import analyze from "@ai/lib/analyze";
import { Message } from "@shared/types/types/supabase";
import Markdown from "react-markdown";
import HomeButton from "@shared/components/ui/HomeButton";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

export default function DtcDecoder() {
  const { vehicleInfo, updateVehicle } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    setError("");
    if (
      !vehicleInfo ||
      !vehicleInfo.year ||
      !vehicleInfo.make ||
      !vehicleInfo.model ||
      !/^P0\d{3}$/i.test(dtcCode)
    ) {
      setError("Please select a vehicle and enter a valid DTC code.");
      return;
    }

    try {
      setLoading(true);
      const result = await analyze(dtcCode, vehicleInfo);
      setMessages((prev) => [...prev, { role: "assistant", content: result }]);
    } catch {
      setError("Failed to analyze DTC.");
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUp.trim() || !vehicleInfo) return;

    try {
      setLoading(true);
      const result = await analyze(followUp, vehicleInfo, messages);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: followUp },
        { role: "assistant", content: result },
      ]);
      setFollowUp("");
    } catch {
      setError("Failed to process follow-up.");
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleChange = (
    field: "year" | "make" | "model",
    value: string,
  ) => {
    updateVehicle({
      year: vehicleInfo?.year || "",
      make: vehicleInfo?.make || "",
      model: vehicleInfo?.model || "",
      [field]: value,
      id: "",
      engine: "",
    });
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-2xl mx-auto bg-black bg-opacity-50 p-6 rounded-xl shadow-lg backdrop-blur-md">
        <div className="flex justify-between mb-4">
          <HomeButton />
          <PreviousPageButton to="/ai" />
        </div>

        <h1 className="text-5xl font-blackOpsOne text-center text-orange-500 mb-8">
          DTC Decoder
        </h1>

        <div className="mb-6 text-center">
          <h2 className="text-xl font-semibold text-orange-300 mb-2">
            Vehicle Info
          </h2>
          <div className="flex justify-center gap-4">
            <input
              type="text"
              value={vehicleInfo?.year || ""}
              onChange={(e) => handleVehicleChange("year", e.target.value)}
              className="bg-gray-900 px-4 py-2 rounded text-white text-center w-24"
              placeholder="Year"
            />
            <input
              type="text"
              value={vehicleInfo?.make || ""}
              onChange={(e) => handleVehicleChange("make", e.target.value)}
              className="bg-gray-900 px-4 py-2 rounded text-white text-center w-32"
              placeholder="Make"
            />
            <input
              type="text"
              value={vehicleInfo?.model || ""}
              onChange={(e) => handleVehicleChange("model", e.target.value)}
              className="bg-gray-900 px-4 py-2 rounded text-white text-center w-32"
              placeholder="Model"
            />
          </div>
        </div>

        <div className="mb-4">
          <label
            htmlFor="dtc"
            className="block mb-2 font-bold text-lg text-center"
          >
            Enter DTC:
          </label>
          <input
            id="dtc"
            value={dtcCode}
            onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
            className="w-full p-2 rounded bg-gray-800 text-white text-center text-xl"
            placeholder="P0131"
          />
        </div>

        <button
          onClick={handleAnalyze}
          className="w-full bg-orange-600 text-white py-3 px-4 rounded font-blackOpsOne text-lg hover:bg-orange-700 transition"
          disabled={loading}
        >
          {loading ? "Analyzing..." : "Analyze DTC"}
        </button>

        {error && (
          <div className="mt-4 bg-red-800 text-white px-4 py-2 rounded text-center">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-4 rounded ${
                msg.role === "user" ? "bg-gray-800" : "bg-gray-700"
              }`}
            >
              <Markdown>{msg.content}</Markdown>
            </div>
          ))}
        </div>

        {messages.length > 0 && (
          <div className="mt-4 flex">
            <input
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              className="flex-grow p-2 rounded-l bg-gray-800 text-white"
              placeholder="Ask a follow-up question..."
            />
            <button
              onClick={handleFollowUp}
              className="bg-blue-600 text-white px-4 py-2 rounded-r hover:bg-blue-700 transition"
              disabled={loading}
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
