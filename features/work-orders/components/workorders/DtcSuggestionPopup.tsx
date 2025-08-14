"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

type Props = {
  jobId: string;
  vehicle: {
    id: string;
    year: string;
    make: string;
    model: string;
  };
};

export default function DtcSuggestionPopup({ jobId, vehicle }: Props) {
    const supabase = createClientComponentClient<Database>();

  const [show, setShow] = useState(false);
  const [cause, setCause] = useState("");
  const [correction, setCorrection] = useState("");
  const [laborTime, setLaborTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setShow(true), 10 * 60 * 1000); // 10 minutes
    return () => clearTimeout(timeout);
  }, []);

  const handleSave = async () => {
    if (!cause || !correction || laborTime === null) return;

    const updates: Partial<
      Database["public"]["Tables"]["work_order_lines"]["Update"]
    > = {
      cause: cause || undefined,
      correction: correction || undefined,
      labor_time: laborTime || undefined,
    };

    const { error } = await supabase
      .from("work_order_lines")
      .update(
        updates as Database["public"]["Tables"]["work_order_lines"]["Update"],
      )
      .eq("id", jobId);

    if (error) {
      console.error("Error saving suggestion:", error);
    } else {
      setShow(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-md text-white">
        <h2 className="text-xl font-bold text-orange-400 mb-4">
          AI DTC Suggestions
        </h2>
        <p className="mb-2 text-sm text-gray-300">
          Based on {vehicle.year} {vehicle.make} {vehicle.model}
        </p>

        <label className="block mb-2 font-medium">Cause</label>
        <textarea
          className="w-full bg-gray-800 p-2 rounded mb-4"
          rows={2}
          value={cause}
          onChange={(e) => setCause(e.target.value)}
        />

        <label className="block mb-2 font-medium">Correction</label>
        <textarea
          className="w-full bg-gray-800 p-2 rounded mb-4"
          rows={2}
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
        />

        <label className="block mb-2 font-medium">Labor Time (hrs)</label>
        <input
          type="number"
          min={0}
          step={0.1}
          className="w-full bg-gray-800 p-2 rounded mb-6"
          value={laborTime ?? ""}
          onChange={(e) => setLaborTime(parseFloat(e.target.value))}
        />

        <div className="flex justify-end gap-4">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
          >
            Dismiss
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-orange-600 rounded hover:bg-orange-700 flex items-center"
            disabled={loading}
          >
            {loading ? (
              <AiOutlineLoading3Quarters className="animate-spin mr-2" />
            ) : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
