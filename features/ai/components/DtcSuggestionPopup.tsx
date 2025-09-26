"use client";

import { useEffect, useState } from "react";

type Props = {
  jobId: string;
  vehicle: { year: string; make: string; model: string };
  punchedInAt: string;
};

type SuggestionResult = {
  cause: string;
  correction: string;
  estimatedLaborTime: string;
};

export default function DtcSuggestionPopup({ jobId, vehicle, punchedInAt }: Props) {
  const [show, setShow] = useState(false);
  const [dtcCode, setDtcCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [error, setError] = useState("");

  // Trigger 10 minutes after punch-in
  useEffect(() => {
    if (!punchedInAt) return;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dtcCode, vehicle, jobId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data as SuggestionResult);
      else setError((data as any)?.error || "Failed to get suggestion");
    } catch {
      setError("Error contacting AI.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    const time = parseFloat(result.estimatedLaborTime.replace(/[^\d.]/g, "")) || 0.5;

    // 🔔 Emit a client-side event instead of using a function prop
    window.dispatchEvent(
      new CustomEvent("dtc:save", {
        detail: {
          jobId,
          cause: result.cause,
          correction: result.correction,
          estimatedLaborTime: time,
        },
      })
    );

    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 text-black shadow-lg">
        <h2 className="text-xl font-bold text-orange-600">AI DTC Suggestion</h2>

        <input
          placeholder="Enter DTC code (e.g., P0131)"
          className="w-full rounded border p-2"
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Analyzing..." : "Get Suggestion"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && (
          <div className="space-y-2 rounded bg-gray-100 p-3 text-sm">
            <div>
              <strong>Cause:</strong> {result.cause}
            </div>
            <div>
              <strong>Correction:</strong> {result.correction}
            </div>
            <div>
              <strong>Est. Labor Time:</strong> {result.estimatedLaborTime}
            </div>

            <div className="mt-2 flex gap-4">
              <button
                onClick={handleConfirm}
                className="w-full rounded bg-green-600 px-4 py-2 font-bold text-white"
              >
                Save to Job
              </button>
              <button
                onClick={() => setShow(false)}
                className="w-full rounded bg-gray-400 px-4 py-2 text-black"
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