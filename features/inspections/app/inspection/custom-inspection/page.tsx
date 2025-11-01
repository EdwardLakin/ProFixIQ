// features/inspections/app/inspection/custom-inspection/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";

type VehicleType = "car" | "truck" | "bus" | "trailer";

export default function CustomBuilderPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Prefills
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");
  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");

  // Manual builder state
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [services, setServices] = useState<string[]>([]);
  const [includeAxle, setIncludeAxle] = useState(true);
  const [includeOil, setIncludeOil] = useState(true);

  // AI builder state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  /* ------------------------------- helpers ------------------------------- */
  const toggle = (section: string, item: string) =>
    setSelections((prev) => {
      const cur = new Set(prev[section] ?? []);
      cur.has(item) ? cur.delete(item) : cur.add(item);
      return { ...prev, [section]: [...cur] };
    });

  const toggleService = (item: string) =>
    setServices((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );

  function goToRunWithSections(sections: unknown, tplTitle: string) {
    // /inspection/custom-run reads these from sessionStorage
    sessionStorage.setItem("customInspection:sections", JSON.stringify(sections));
    sessionStorage.setItem("customInspection:title", tplTitle);
    sessionStorage.setItem(
      "customInspection:includeOil",
      JSON.stringify(includeOil)
    );

    // Keep any existing URL params (e.g., customer/vehicle), and add vehicleType/template
    const qs = new URLSearchParams(sp.toString());
    qs.set("vehicleType", vehicleType);
    qs.set("template", tplTitle);
    router.push(`/inspection/custom-draft?${qs.toString()}`);
  }

  /* ------------------------- Manual: Start Inspection ------------------------- */
  function startManual() {
    const built = buildInspectionFromSelections({
      selections,
      axle: includeAxle ? { vehicleType } : null,
      extraServiceItems: services,
    });
    goToRunWithSections(built, title);
  }

  /* --------------------------- AI: Build from prompt -------------------------- */
  async function buildFromPrompt() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/inspections/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, vehicleType }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Generate failed (${res.status})`);
      }
      const { sections } = (await res.json()) as { sections: unknown };
      goToRunWithSections(sections, title || "AI Inspection");
    } catch (e: any) {
      setAiError(e?.message || "Failed to generate inspection.");
    } finally {
      setAiLoading(false);
    }
  }

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="p-4 text-white">
      <h1 className="mb-3 text-2xl font-bold">Build Custom Inspection</h1>

      {/* Title + Vehicle type */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Title</span>
          <input
            className="rounded bg-neutral-800 px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Vehicle Type (axle layout)</span>
          <select
            className="rounded bg-neutral-800 px-3 py-2"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
          >
            <option value="car">Car (Hydraulic)</option>
            <option value="truck">Truck (Air)</option>
            <option value="bus">Bus (Air)</option>
            <option value="trailer">Trailer (Air)</option>
          </select>
        </label>
      </div>

      {/* Toggles */}
      <div className="mb-6 flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeAxle}
            onChange={(e) => setIncludeAxle(e.target.checked)}
          />
          <span>Include Axle Block</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeOil}
            onChange={(e) => setIncludeOil(e.target.checked)}
          />
          <span>Append Oil Change Section</span>
        </label>
      </div>

      {/* ------------------------------- AI builder ------------------------------- */}
      <div className="mb-8 rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Build with AI (optional)</div>
        <p className="mb-2 text-sm text-neutral-300">
          Describe what you want to inspect (vehicle system, depth, measurements, compliance, etc.).
          We’ll generate sections & items you can run immediately.
        </p>
        <textarea
          className="mb-3 min-h-[90px] w-full rounded bg-neutral-800 p-3"
          placeholder="e.g. CVIP pre-trip for 5-axle tractor with emphasis on air brakes, tread depth, lighting, and documentation checks."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={buildFromPrompt}
            disabled={aiLoading || !aiPrompt.trim()}
            className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {aiLoading ? "Generating…" : "Build from AI Prompt"}
          </button>
          {aiError ? <span className="text-sm text-red-400">{aiError}</span> : null}
        </div>
      </div>

      {/* ----------------------------- Manual pick list ----------------------------- */}
      <div className="mb-8 space-y-4">
        {masterInspectionList.map((sec) => (
          <div
            key={sec.title}
            className="rounded border border-neutral-800 bg-neutral-900 p-3"
          >
            <div className="mb-2 font-semibold text-orange-400">{sec.title}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sec.items.map((i) => {
                const checked = (selections[sec.title] ?? []).includes(i.item);
                return (
                  <label key={i.item} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(sec.title, i.item)}
                    />
                    <span>{i.item}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Optional service add-ons */}
      <div className="mb-8 rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Service Items</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {masterServicesList.flatMap((cat) =>
            cat.items.map((i) => (
              <label key={i.item} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={services.includes(i.item)}
                  onChange={() => toggleService(i.item)}
                />
                <span>{i.item}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={startManual}
          className="rounded bg-orange-600 px-4 py-2 font-semibold text-black hover:bg-orange-500"
        >
          Start Inspection (Manual)
        </button>
        <button
          onClick={buildFromPrompt}
          disabled={aiLoading || !aiPrompt.trim()}
          className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          title="Use AI prompt above"
        >
          {aiLoading ? "Generating…" : "Start with AI"}
        </button>
      </div>
    </div>
  );
}