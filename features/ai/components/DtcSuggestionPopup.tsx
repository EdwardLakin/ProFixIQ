"use client";

import { useEffect, useState } from "react";

type Props = {
  jobId: string;
  vehicle: { year: string; make: string; model: string };
  punchedInAt: string;
  onSave: (updates: {
    cause: string;
    correction: string;
    estimatedLaborTime: number;
  }) => void;
};

export default function DtcSuggestionPopup({
  jobId,
  vehicle,
  punchedInAt,
  onSave,
}: Props) {
  const [show, setShow] = useState(false);
  const [dtcCode, setDtcCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    cause: string;
    correction: string;
    estimatedLaborTime: string;
  }>(null);
  const [error, setError] = useState("");

  // Trigger 10 minutes after punch-in
  useEffect(() => {
    const punchTime = new Date(punchedInAt).getTime();
    const now = Date.now();
    const delay = Math.max(0, 10 * 60 * 1000 - (now - punchTime));
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [punchedInAt]);

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/ai/chat/dtc", {
        method: "POST",
        body: JSON.stringify({ dtcCode, vehicle, jobId }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || "Failed to get suggestion");
      }
    } catch (err) {
      setError("Error contacting AI.");
    }
    setLoading(false);
  };

  const handleConfirm = () => {
    if (!result) return;
    const time =
      parseFloat(result.estimatedLaborTime.replace(/[^\d.]/g, "")) || 0.5;
    onSave({
      cause: result.cause,
      correction: result.correction,
      estimatedLaborTime: time,
    });
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white text-black p-6 rounded-lg max-w-lg w-full shadow-lg space-y-4">
        <h2 className="text-xl font-bold text-orange-600">AI DTC Suggestion</h2>

        <input
          placeholder="Enter DTC code (e.g., P0131)"
          className="w-full border p-2 rounded"
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-orange-600 text-white px-4 py-2 rounded w-full font-semibold"
        >
          {loading ? "Analyzing..." : "Get Suggestion"}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {result && (
          <div className="bg-gray-100 p-3 rounded text-sm space-y-2">
            <div>
              <strong>Cause:</strong> {result.cause}
            </div>
            <div>
              <strong>Correction:</strong> {result.correction}
            </div>
            <div>
              <strong>Est. Labor Time:</strong> {result.estimatedLaborTime}
            </div>

            <div className="flex gap-4 mt-2">
              <button
                onClick={handleConfirm}
                className="bg-green-600 text-white px-4 py-2 rounded w-full font-bold"
              >
                Save to Job
              </button>
              <button
                onClick={() => setShow(false)}
                className="bg-gray-400 text-black px-4 py-2 rounded w-full"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
