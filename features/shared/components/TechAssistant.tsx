// features/shared/components/TechAssistant.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import useVehicleInfo from "@shared/hooks/useVehicleInfo";

type Msg = { role: "user" | "assistant"; content: string };

const DTC_REGEX = /^[PBCU]\d{4}$/i;

export default function TechAssistant({
  className,
  defaultContext,
}: {
  className?: string;
  defaultContext?: string; // optional: pass WO/vehicle context
}) {
  const { vehicleInfo, updateVehicle } = useVehicleInfo();

  const validVehicle = useMemo(
    () => Boolean(vehicleInfo?.year && vehicleInfo?.make && vehicleInfo?.model),
    [vehicleInfo],
  );

  // Inputs
  const [prompt, setPrompt] = useState("");
  const [dtc, setDtc] = useState("");
  const [context, setContext] = useState(defaultContext ?? "");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState("");

  function changeVehicle(
    field: "year" | "make" | "model",
    value: string,
  ) {
    updateVehicle({
      year: vehicleInfo?.year || "",
      make: vehicleInfo?.make || "",
      model: vehicleInfo?.model || "",
      id: "",
      engine: "",
      [field]: value,
    });
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const f = e.target.files?.[0];
    if (!f) {
      setFilePreview(null);
      return;
    }
    setFilePreview(URL.createObjectURL(f));
  };

  async function fileToDataUrl(f: File): Promise<string> {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  const handleAsk = async () => {
    setError("");
    if (!validVehicle) {
      setError("Enter year, make and model first.");
      return;
    }

    setLoading(true);
    try {
      let body: any = {
        vehicle: {
          year: vehicleInfo!.year,
          make: vehicleInfo!.make,
          model: vehicleInfo!.model,
        },
        context: context || undefined,
      };

      // Priority: image > dtc > prompt
      const chosenFile = fileRef.current?.files?.[0];
      if (chosenFile) {
        body.image_data = await fileToDataUrl(chosenFile);
      } else if (dtc.trim() && DTC_REGEX.test(dtc.trim())) {
        body.dtcCode = dtc.trim().toUpperCase();
      } else if (prompt.trim()) {
        body.prompt = prompt.trim();
      } else {
        setError("Provide a prompt, a DTC code, or an image.");
        setLoading(false);
        return;
      }

      // optimistic add (for user prompt only)
      if (body.prompt) {
        setMessages((prev) => [...prev, { role: "user", content: body.prompt }]);
      } else if (body.dtcCode) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: `Analyze DTC ${body.dtcCode}` },
        ]);
      } else if (body.image_data) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: "Analyze the uploaded photo." },
        ]);
      }

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || "Request failed");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: String(data.result || "") },
      ]);

      // clear inputs except context & vehicle
      setPrompt("");
      setDtc("");
      if (fileRef.current) fileRef.current.value = "";
      setFilePreview(null);
    } catch (e) {
      setError("Assistant failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className ?? ""}>
      {/* Vehicle */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 mb-3">
        <h3 className="text-sm font-semibold text-neutral-300 mb-2">
          Vehicle
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Year"
            value={vehicleInfo?.year || ""}
            onChange={(e) => changeVehicle("year", e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-24 text-center"
          />
          <input
            placeholder="Make"
            value={vehicleInfo?.make || ""}
            onChange={(e) => changeVehicle("make", e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-36"
          />
          <input
            placeholder="Model"
            value={vehicleInfo?.model || ""}
            onChange={(e) => changeVehicle("model", e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-36"
          />
        </div>
        {!validVehicle && (
          <p className="mt-2 text-xs text-red-300">
            Enter year/make/model to enable the assistant.
          </p>
        )}
      </div>

      {/* Context (optional) */}
      <div className="mb-3">
        <label className="text-xs text-neutral-400 block mb-1">
          Context (optional)
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          placeholder="Work order details, symptoms, what was already tested…"
          className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-2 text-sm"
        />
      </div>

      {/* Inputs row: prompt + DTC + image */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <input
          placeholder="Ask a question…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2"
        />
        <input
          placeholder="DTC (e.g., P0131)"
          value={dtc}
          onChange={(e) => setDtc(e.target.value.toUpperCase())}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickFile}
          className="block text-sm text-neutral-300"
        />
      </div>

      {filePreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={filePreview}
          alt="Preview"
          className="mb-2 max-h-40 rounded border border-neutral-800"
        />
      )}

      <button
        onClick={handleAsk}
        disabled={loading || !validVehicle}
        className="w-full bg-orange-600 hover:bg-orange-700 text-black font-semibold rounded px-3 py-2 disabled:opacity-50"
      >
        {loading ? "Working…" : "Ask Assistant"}
      </button>

      {error && (
        <div className="mt-3 rounded border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Transcript */}
      <div className="mt-4 space-y-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-3 rounded ${
              m.role === "user" ? "bg-neutral-900 border border-neutral-800" : "bg-neutral-800"
            }`}
          >
            <Markdown>{m.content}</Markdown>
          </div>
        ))}
      </div>
    </div>
  );
}